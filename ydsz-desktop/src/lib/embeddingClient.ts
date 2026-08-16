/**
 * @file Embedding API 客户端
 * @description 调用 OpenAI 兼容的 /embeddings 端点生成文本向量,
 *   用于语义代码检索。支持任意 OpenAI 兼容端点(含 OneAPI / Ollama 等)。
 * @module lib/embeddingClient
 */

/** Embedding 请求配置 */
export interface EmbeddingConfig {
  /** API base URL,如 https://api.openai.com/v1 */
  baseUrl: string;
  /** API Key */
  apiKey: string;
  /** embedding 模型名,如 text-embedding-3-small */
  model: string;
}

/** 单次 embedding 请求结果 */
export interface EmbeddingResult {
  /** 生成的向量 */
  vector: number[];
  /** 消耗的 token 数(如果 API 返回) */
  tokenCount?: number;
}

/** 默认 embedding 模型 */
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
/** 默认向量维度(用于校验) */
export const EXPECTED_VECTOR_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
};
/** 最大批量文本数(避免单次请求过大) */
const MAX_BATCH_SIZE = 64;
/** 最大单文本长度(超出截断) */
const MAX_INPUT_LENGTH = 8000;

/**
 * 标准化 base URL,移除尾部斜杠
 */
function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  // 确保以 /v1 或类似版本前缀结尾;如果没有,不自动添加(兼容 Ollama /v1)
  return trimmed;
}

/**
 * 对单个文本生成 embedding 向量
 *
 * @param text - 待向量化的文本
 * @param config - embedding 配置
 * @returns 向量结果
 * @throws 网络错误或 API 返回错误时抛出
 */
export async function embedText(
  text: string,
  config: EmbeddingConfig,
): Promise<EmbeddingResult> {
  const results = await embedBatch([text], config);
  return results[0]!;
}

/**
 * 对多个文本批量生成 embedding 向量
 *
 * @param texts - 待向量化的文本数组(最多 64 条)
 * @param config - embedding 配置
 * @returns 向量结果数组(与输入顺序一致)
 * @throws 网络错误或 API 返回错误时抛出
 */
export async function embedBatch(
  texts: readonly string[],
  config: EmbeddingConfig,
): Promise<EmbeddingResult[]> {
  if (texts.length === 0) {
    return [];
  }

  if (texts.length > MAX_BATCH_SIZE) {
    const first = await embedBatch(texts.slice(0, MAX_BATCH_SIZE), config);
    const rest = await embedBatch(texts.slice(MAX_BATCH_SIZE), config);
    return [...first, ...rest];
  }

  const truncatedTexts = texts.map((t) =>
    t.length > MAX_INPUT_LENGTH ? t.slice(0, MAX_INPUT_LENGTH) : t,
  );

  const url = `${normalizeBaseUrl(config.baseUrl)}/embeddings`;
  const body = JSON.stringify({
    model: config.model,
    input: truncatedTexts,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Embedding API error ${response.status}: ${errorBody.slice(0, 200)}`,
    );
  }

  const data = (await response.json()) as {
    data: ReadonlyArray<{ embedding: number[] }>;
    usage?: { total_tokens?: number };
  };

  if (!data.data || data.data.length !== truncatedTexts.length) {
    throw new Error(
      `Embedding API returned ${data.data?.length ?? 0} vectors, expected ${truncatedTexts.length}`,
    );
  }

  const tokenCount = data.usage?.total_tokens;

  return data.data.map((entry) => ({
    vector: entry.embedding,
    tokenCount,
  }));
}

/**
 * 计算两个向量的余弦相似度
 *
 * @param a - 向量 A
 * @param b - 向量 B
 * @returns 相似度 [-1, 1],越接近 1 越相似
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}
