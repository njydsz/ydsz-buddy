/**
 * @file 桌面端使用条款 + 隐私政策文档内容
 * @description App 内展示的"使用条款 / 隐私政策"文案。
 *              在 TermsAcceptanceGate 与 Settings → Advanced → Legal 中复用。
 *
 * 文案以模块化常量形式硬编码,后续可改为从 markdown 资源加载。
 * 对齐移动端 `ydsz-mobile/src/routes/LegalPage.tsx` 的文档结构,
 * 但内容针对桌面端数据流(本地工作区 / Provider API Key / 本地向量库)调整。
 */

export type LegalDocKind = "privacy" | "terms";

export interface LegalSection {
  /** 小节标题 */
  h: string;
  /** 小节正文 */
  p: string;
}

export interface LegalDocument {
  /** 文档标题 */
  title: string;
  /** 引言 */
  intro: string;
  /** 小节列表 */
  sections: LegalSection[];
}

/** 文档最后更新日期 */
export const LEGAL_LAST_UPDATED = "2026-07-09";

/** 隐私政策 - 中文 */
const PRIVACY_ZH: LegalSection[] = [
  {
    h: "我们收集什么",
    p: "ydsz-buddy 桌面端在你本机存储工作区路径、对话历史、Provider 配置与界面偏好。对话内容、代码、文件路径均保存在本地 SQLite 数据库,不上传到我们的服务器。",
  },
  {
    h: "Provider API Key",
    p: "你配置的 Provider API Key(OpenAI / Anthropic / 自定义兼容端点)默认存于 sessionStorage,关闭应用即清除;若你主动选择长期保留,会以 XOR 混淆形态写入 localStorage。Key 仅在调用对应 Provider 时发往其官方端点,不经过我们。",
  },
  {
    h: "语义搜索向量库",
    p: "为提供语义搜索能力,ydsz-buddy 会将你工作区内的代码分块并向量化,向量与原文均存于浏览器 IndexedDB,仅在本地;不会上传任何代码片段到外部。",
  },
  {
    h: "崩溃与使用统计",
    p: "我们不向第三方出售或分享任何用户数据。崩溃与匿名使用统计仅在你在设置中显式开启「发送匿名使用数据」后才会上报,且不携带消息内容或文件路径。",
  },
  {
    h: "你的权利",
    p: "你可以随时通过设置页清除本地数据,或卸载应用彻底擦除。Provider API Key 可在设置 → Providers 中随时清除。",
  },
];

/** 使用条款 - 中文 */
const TERMS_ZH: LegalSection[] = [
  {
    h: "服务范围",
    p: "ydsz-buddy 桌面端是 AI 原生工作台,提供 Work 模式(办公文档 / 浏览器自动化 / 定时任务)与 Code 模式(Provider 对话 / 终端 / Git 工作树)双域能力。",
  },
  {
    h: "使用条件",
    p: "你需自行配置 Provider API Key 才能使用 AI 对话能力;Provider 服务由第三方提供,其可用性、计费与合规由对应厂商负责。",
  },
  {
    h: "免责",
    p: "ydsz-buddy 按「现状」提供;我们不对因 Provider 故障、网络中断、自动化执行结果等导致的任何损失承担责任。敏感能力(浏览器自动化 / 定时任务)默认关闭,需你主动开启。",
  },
  {
    h: "变更",
    p: "我们可能更新本协议,变更将在 App 内或本页面公布。",
  },
];

/** 隐私政策 - 英文 */
const PRIVACY_EN: LegalSection[] = [
  {
    h: "What we collect",
    p: "ydsz-buddy Desktop stores your workspace paths, conversation history, provider configuration, and UI preferences locally. Conversations, code, and file paths are kept in a local SQLite database and are never uploaded to our servers.",
  },
  {
    h: "Provider API Keys",
    p: "Provider API keys you configure (OpenAI / Anthropic / custom compatible endpoints) are stored in sessionStorage by default and cleared when the app closes. If you opt into long-term retention, they are obfuscated with XOR and written to localStorage. Keys are only sent to the respective provider's official endpoints when calling that provider, never through us.",
  },
  {
    h: "Semantic search vector store",
    p: "To power semantic search, ydsz-buddy chunks and embeds code in your workspace. Vectors and original text are kept in the browser's IndexedDB locally; no code snippets are uploaded externally.",
  },
  {
    h: "Crash and usage statistics",
    p: "We do not sell or share any user data with third parties. Anonymous crash and usage statistics are only reported after you opt in via Settings, and they never include message content or file paths.",
  },
  {
    h: "Your rights",
    p: "You can clear local data at any time via Settings, or by uninstalling the app. Provider API keys can be removed at any time in Settings → Providers.",
  },
];

/** 使用条款 - 英文 */
const TERMS_EN: LegalSection[] = [
  {
    h: "Scope of service",
    p: "ydsz-buddy Desktop is an AI-native workbench providing Work mode (office documents, browser automation, scheduled tasks) and Code mode (provider chat, terminal, git worktrees).",
  },
  {
    h: "Usage conditions",
    p: "You must configure your own provider API keys to use AI chat. Provider services are operated by third parties; their availability, billing, and compliance are the responsibility of the respective vendors.",
  },
  {
    h: "Disclaimer",
    p: "ydsz-buddy is provided as-is. We are not responsible for any losses caused by provider failures, network interruptions, or automation execution results. Sensitive capabilities (browser automation, scheduled tasks) are disabled by default and require explicit opt-in.",
  },
  {
    h: "Changes",
    p: "We may update these terms; changes will be announced in-app or on this page.",
  },
];

/** 双语文档集合 */
const DOCS: Record<"zh" | "en", Record<LegalDocKind, LegalDocument>> = {
  zh: {
    privacy: {
      title: "隐私政策",
      intro: "本政策说明 ydsz-buddy 桌面端如何处理你的数据。",
      sections: PRIVACY_ZH,
    },
    terms: {
      title: "使用条款",
      intro: "使用本应用前,请阅读以下条款。",
      sections: TERMS_ZH,
    },
  },
  en: {
    privacy: {
      title: "Privacy Policy",
      intro: "This policy explains how ydsz-buddy Desktop handles your data.",
      sections: PRIVACY_EN,
    },
    terms: {
      title: "Terms of Service",
      intro: "Please read the following terms before using the app.",
      sections: TERMS_EN,
    },
  },
};

/**
 * 获取指定语言 + 类型的法律文档。
 * 语言不在 DOCS 中时回退到中文。
 */
export function getLegalDocument(
  language: "zh" | "en",
  kind: LegalDocKind,
): LegalDocument {
  const lang = language in DOCS ? language : "zh";
  return DOCS[lang][kind];
}
