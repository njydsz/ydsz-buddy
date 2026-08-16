/**
 * @file 向量存储与语义检索
 * @description 基于 IndexedDB 的文件分块向量存储,支持余弦相似度检索。
 *   用于语义代码搜索:将代码文件分块后向量化,查询时通过相似度排序返回最相关的代码片段。
 * @module lib/vectorStore
 */

import { cosineSimilarity } from "./embeddingClient";

/** 数据库名称 */
const DB_NAME = "2. 环境变量 YDSZ_BOOTSTRAP_TOKEN-vector-store";
/** 数据库版本 */
const DB_VERSION = 1;
/** 存储分块的 object store 名称 */
const CHUNK_STORE = "chunks";
/** 存储查询缓存的 object store 名称 */
const QUERY_CACHE_STORE = "query-cache";
/** 最大的代码分块字符数 */
const MAX_CHUNK_SIZE = 1500;
/** 分块重叠字符数(避免在函数边界截断) */
const CHUNK_OVERLAP = 200;

/** 文件分块的向量记录 */
export interface VectorChunk {
  /** 唯一 ID */
  id: string;
  /** 工作区根目录 */
  workspaceRoot: string;
  /** 文件路径(相对于 workspaceRoot) */
  filePath: string;
  /** 分块在文件中的起始行号(0-based) */
  startLine: number;
  /** 分块在文件中的结束行号(0-based,exclusive) */
  endLine: number;
  /** 分块的原始文本 */
  text: string;
  /** 分块的 embedding 向量 */
  vector: number[];
  /** embedding 模型名 */
  model: string;
  /** 创建时间戳 */
  createdAt: number;
}

/** 语义搜索结果 */
export interface SemanticSearchResult {
  /** 文件路径 */
  filePath: string;
  /** 起始行号 */
  startLine: number;
  /** 结束行号 */
  endLine: number;
  /** 匹配的代码片段 */
  snippet: string;
  /** 相似度分数 [0, 1] */
  score: number;
}

/** 查询缓存记录 */
interface QueryCacheEntry {
  /** 缓存键: hash(query + model) */
  key: string;
  /** 缓存的查询向量 */
  vector: number[];
  /** 创建时间 */
  createdAt: number;
}

/** IndexedDB 连接缓存 */
let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * 获取 IndexedDB 连接(单例)
 */
function getDB(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error(`Failed to open vector store: ${request.error}`));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        const chunkStore = db.createObjectStore(CHUNK_STORE, { keyPath: "id" });
        chunkStore.createIndex("by_workspace", "workspaceRoot", { unique: false });
        chunkStore.createIndex("by_file", ["workspaceRoot", "filePath"], { unique: false });
      }

      if (!db.objectStoreNames.contains(QUERY_CACHE_STORE)) {
        db.createObjectStore(QUERY_CACHE_STORE, { keyPath: "key" });
      }
    };
  });

  return dbPromise;
}

/**
 * 将代码文本按行分块
 *
 * @param text - 代码文本
 * @returns 分块数组,每块包含 text / startLine / endLine
 */
export function chunkCode(
  text: string,
): ReadonlyArray<{ text: string; startLine: number; endLine: number }> {
  const lines = text.split("\n");
  const chunks: { text: string; startLine: number; endLine: number }[] = [];

  let currentChunk: string[] = [];
  let currentSize = 0;
  let startLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineLength = line.length + 1; // +1 for newline

    if (currentSize + lineLength > MAX_CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.join("\n"),
        startLine,
        endLine: i,
      });

      // 保留重叠部分
      const overlapLines = currentChunk.slice(-Math.ceil(CHUNK_OVERLAP / 80));
      currentChunk = [...overlapLines, line];
      currentSize = currentChunk.reduce((sum, l) => sum + l.length + 1, 0);
      startLine = i - overlapLines.length;
    } else {
      currentChunk.push(line);
      currentSize += lineLength;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push({
      text: currentChunk.join("\n"),
      startLine,
      endLine: lines.length,
    });
  }

  return chunks;
}

/**
 * 生成唯一 ID
 */
function generateId(workspaceRoot: string, filePath: string, startLine: number): string {
  return `${workspaceRoot}::${filePath}::${startLine}`;
}

/**
 * 存储文件的分块向量
 *
 * @param workspaceRoot - 工作区根目录
 * @param filePath - 文件路径
 * @param text - 文件文本内容
 * @param vectors - 与分块对应的向量数组(顺序与 chunkCode 返回一致)
 * @param model - embedding 模型名
 */
export async function storeFileVectors(
  workspaceRoot: string,
  filePath: string,
  text: string,
  vectors: readonly (readonly number[])[],
  model: string,
): Promise<void> {
  const chunks = chunkCode(text);
  if (chunks.length !== vectors.length) {
    throw new Error(
      `Vector count ${vectors.length} does not match chunk count ${chunks.length}`,
    );
  }

  const db = await getDB();
  const tx = db.transaction(CHUNK_STORE, "readwrite");
  const store = tx.objectStore(CHUNK_STORE);

  // 先删除该文件的旧分块
  const fileIndex = store.index("by_file");
  const range = IDBKeyRange.only([workspaceRoot, filePath]);
  await new Promise<void>((resolve, reject) => {
    const deleteRequest = fileIndex.openCursor(range);
    deleteRequest.onsuccess = () => {
      const cursor = deleteRequest.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    deleteRequest.onerror = () => reject(deleteRequest.error);
  });

  const now = Date.now();
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const vector = vectors[i]!;
    const record: VectorChunk = {
      id: generateId(workspaceRoot, filePath, chunk.startLine),
      workspaceRoot,
      filePath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      text: chunk.text,
      vector: [...vector],
      model,
      createdAt: now,
    };
    store.put(record);
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 语义搜索:根据查询向量返回最相似的代码分块
 *
 * @param queryVector - 查询的 embedding 向量
 * @param workspaceRoot - 限定搜索的工作区
 * @param topK - 返回的最大结果数(默认 20)
 * @param minScore - 最低相似度阈值(默认 0.3)
 * @returns 按相似度降序排列的搜索结果
 */
export async function semanticSearch(
  queryVector: readonly number[],
  workspaceRoot: string,
  topK = 20,
  minScore = 0.3,
): Promise<SemanticSearchResult[]> {
  const db = await getDB();
  const tx = db.transaction(CHUNK_STORE, "readonly");
  const store = tx.objectStore(CHUNK_STORE);
  const index = store.index("by_workspace");
  const range = IDBKeyRange.only(workspaceRoot);

  const chunks: VectorChunk[] = [];
  await new Promise<void>((resolve, reject) => {
    const cursorRequest = index.openCursor(range);
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        chunks.push(cursor.value as VectorChunk);
        cursor.continue();
      } else {
        resolve();
      }
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });

  const scored = chunks
    .map((chunk) => ({
      filePath: chunk.filePath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      snippet: chunk.text.slice(0, 500),
      score: cosineSimilarity(queryVector, chunk.vector),
    }))
    .filter((result) => result.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}

/**
 * 获取工作区中已索引的文件列表
 *
 * @param workspaceRoot - 工作区根目录
 * @returns 文件路径数组
 */
export async function getIndexedFiles(
  workspaceRoot: string,
): Promise<readonly string[]> {
  const db = await getDB();
  const tx = db.transaction(CHUNK_STORE, "readonly");
  const store = tx.objectStore(CHUNK_STORE);
  const index = store.index("by_workspace");
  const range = IDBKeyRange.only(workspaceRoot);

  const files = new Set<string>();
  await new Promise<void>((resolve, reject) => {
    const cursorRequest = index.openCursor(range);
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        const chunk = cursor.value as VectorChunk;
        files.add(chunk.filePath);
        cursor.continue();
      } else {
        resolve();
      }
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });

  return [...files];
}

/**
 * 清除工作区的所有向量数据
 *
 * @param workspaceRoot - 工作区根目录
 */
export async function clearWorkspaceVectors(workspaceRoot: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(CHUNK_STORE, "readwrite");
  const store = tx.objectStore(CHUNK_STORE);
  const index = store.index("by_workspace");
  const range = IDBKeyRange.only(workspaceRoot);

  await new Promise<void>((resolve, reject) => {
    const cursorRequest = index.openCursor(range);
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });
}

/**
 * 简单的字符串哈希(用于查询缓存键)
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

/**
 * 缓存查询向量
 */
export async function cacheQueryVector(
  query: string,
  model: string,
  vector: readonly number[],
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(QUERY_CACHE_STORE, "readwrite");
  const store = tx.objectStore(QUERY_CACHE_STORE);
  const entry: QueryCacheEntry = {
    key: hashString(`${query}::${model}`),
    vector: [...vector],
    createdAt: Date.now(),
  };
  store.put(entry);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 获取缓存的查询向量
 */
export async function getCachedQueryVector(
  query: string,
  model: string,
): Promise<number[] | null> {
  const db = await getDB();
  const tx = db.transaction(QUERY_CACHE_STORE, "readonly");
  const store = tx.objectStore(QUERY_CACHE_STORE);
  const key = hashString(`${query}::${model}`);

  return new Promise<number[] | null>((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => {
      const entry = request.result as QueryCacheEntry | undefined;
      resolve(entry?.vector ?? null);
    };
    request.onerror = () => reject(request.error);
  });
}
