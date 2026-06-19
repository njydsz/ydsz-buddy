/**
 * @file 主题逻辑模块
 * @description 负责 Codex 风格主题模型的实现,包括分享字符串解析和派生 CSS 令牌计算
 * @layer Web 外观领域逻辑层
 * @exports 主题类型、规范化辅助函数、导入/导出工具函数和 CSS 变量构建器
 */

import { THEME_SEED_CATALOG } from "./theme.seed.generated";
import { normalizeFontFamilyCssValue } from "../lib/fontFamily";

/** 主题模式类型:浅色、深色或跟随系统 */
export type ThemeMode = "light" | "dark" | "system";

/** 主题变体类型:仅浅色或深色 */
export type ThemeVariant = "light" | "dark";

/** 窗口材质类型:不透明或半透明 */
export type WindowMaterial = "opaque" | "translucent";

/**
 * 主题字体配置接口
 * @description 定义 UI 和代码编辑器使用的字体
 */
export interface ThemeFonts {
  /** UI 字体,用于界面元素 */
  ui: string | null;
  /** 代码字体,用于代码编辑器 */
  code: string | null;
}

/**
 * 主题语义颜色接口
 * @description 定义具有特定语义含义的颜色,如差异高亮和技能标识
 */
export interface ThemeSemanticColors {
  /** 新增内容的颜色(diff added) */
  diffAdded: string;
  /** 删除内容的颜色(diff removed) */
  diffRemoved: string;
  /** 技能标识颜色 */
  skill: string;
}

/**
 * Chrome 主题接口
 * @description 定义应用外壳(Chrome)的完整主题配置
 */
export interface ChromeTheme {
  /** 强调色,用于主要交互元素 */
  accent: string;
  /** 对比度,范围 0-100 */
  contrast: number;
  /** 字体配置 */
  fonts: ThemeFonts;
  /** 墨色(前景色),用于主要文本 */
  ink: string;
  /** 是否使用不透明窗口 */
  opaqueWindows: boolean;
  /** 语义颜色配置 */
  semanticColors: ThemeSemanticColors;
  /** 表面色(背景色) */
  surface: string;
}

/**
 * 主题包接口
 * @description 包含代码主题 ID 和 Chrome 主题的完整主题包
 */
export interface ThemePack {
  /** 代码主题的唯一标识符 */
  codeThemeId: string;
  /** Chrome 主题配置 */
  theme: ChromeTheme;
}

/**
 * 主题状态接口
 * @description 应用的完整主题状态,包括两种变体的主题和代码主题 ID
 */
export interface ThemeState {
  /** 浅色和深色变体的 Chrome 主题 */
  chromeThemes: Record<ThemeVariant, ChromeTheme>;
  /** 浅色和深色变体的代码主题 ID */
  codeThemeIds: Record<ThemeVariant, string>;
  /** 当前主题模式 */
  mode: ThemeMode;
}

/**
 * 代码主题选项接口
 * @description 用于主题选择器的代码主题配置
 */
export interface CodeThemeOption {
  /** 主题唯一标识符 */
  id: string;
  /** 主题显示名称 */
  label: string;
  /** 该主题支持的变体列表 */
  variants: readonly ThemeVariant[];
}

/**
 * 主题分享载荷接口
 * @description 用于主题分享字符串的数据结构
 */
export interface ThemeSharePayload {
  /** 代码主题 ID */
  codeThemeId: string;
  /** Chrome 主题配置 */
  theme: ChromeTheme;
  /** 主题变体 */
  variant: ThemeVariant;
}

/**
 * 主题 CSS 变量构建结果接口
 * @description 包含窗口材质和生成的 CSS 变量映射
 */
export interface ThemeCssVariableBuild {
  /** 窗口材质类型 */
  material: WindowMaterial;
  /** CSS 变量名值对映射 */
  variables: Record<string, string>;
}

/**
 * 主题派生令牌接口
 * @description 从基础主题计算得出的所有派生颜色令牌,用于构建完整的 CSS 变量系统
 */
export interface ThemeDerivedTokens {
  /** 强调色背景 */
  accentBackground: string;
  /** 强调色背景 - 激活状态 */
  accentBackgroundActive: string;
  /** 强调色背景 - 悬停状态 */
  accentBackgroundHover: string;
  /** 默认边框颜色 */
  border: string;
  /** 焦点边框颜色 */
  borderFocus: string;
  /** 粗边框颜色 */
  borderHeavy: string;
  /** 细边框颜色 */
  borderLight: string;
  /** 主要按钮背景 */
  buttonPrimaryBackground: string;
  /** 主要按钮背景 - 激活状态 */
  buttonPrimaryBackgroundActive: string;
  /** 主要按钮背景 - 悬停状态 */
  buttonPrimaryBackgroundHover: string;
  /** 主要按钮背景 - 非活动状态 */
  buttonPrimaryBackgroundInactive: string;
  /** 次要按钮背景 */
  buttonSecondaryBackground: string;
  /** 次要按钮背景 - 激活状态 */
  buttonSecondaryBackgroundActive: string;
  /** 次要按钮背景 - 悬停状态 */
  buttonSecondaryBackgroundHover: string;
  /** 次要按钮背景 - 非活动状态 */
  buttonSecondaryBackgroundInactive: string;
  /** 三级按钮背景 */
  buttonTertiaryBackground: string;
  /** 三级按钮背景 - 激活状态 */
  buttonTertiaryBackgroundActive: string;
  /** 三级按钮背景 - 悬停状态 */
  buttonTertiaryBackgroundHover: string;
  /** 控件背景 */
  controlBackground: string;
  /** 控件背景 - 不透明版本 */
  controlBackgroundOpaque: string;
  /** 主要提升层级背景 */
  elevatedPrimary: string;
  /** 主要提升层级背景 - 不透明版本 */
  elevatedPrimaryOpaque: string;
  /** 次要提升层级背景 */
  elevatedSecondary: string;
  /** 次要提升层级背景 - 不透明版本 */
  elevatedSecondaryOpaque: string;
  /** 强调色图标 */
  iconAccent: string;
  /** 主要图标颜色 */
  iconPrimary: string;
  /** 次要图标颜色 */
  iconSecondary: string;
  /** 三级图标颜色 */
  iconTertiary: string;
  /** 简单遮罩颜色 */
  simpleScrim: string;
  /** 强调色文本 */
  textAccent: string;
  /** 主要按钮文本 */
  textButtonPrimary: string;
  /** 次要按钮文本 */
  textButtonSecondary: string;
  /** 三级按钮文本 */
  textButtonTertiary: string;
  /** 主要前景文本 */
  textForeground: string;
  /** 次要前景文本 */
  textForegroundSecondary: string;
  /** 三级前景文本 */
  textForegroundTertiary: string;
}

/**
 * 已解析主题令牌接口
 * @description 包含所有已解析的主题令牌,包括别名、Codex 变量、计算值和派生令牌
 */
export interface ResolvedThemeTokens {
  /** 令牌别名映射 */
  aliases: Record<string, string>;
  /** Codex CSS 变量映射 */
  codexVariables: Record<string, string>;
  /** 计算得出的主题值 */
  computed: {
    /** 实际对比度值 */
    contrast: number;
    /** 编辑器背景色 */
    editorBackground: string;
    /** 面板背景色 */
    panel: string;
    /** 底层表面色 */
    surfaceUnder: string;
  };
  /** 派生令牌 */
  derived: ThemeDerivedTokens;
}

/**
 * Chrome 主题种子补丁类型
 * @description 用于从种子主题合并到当前主题的部分更新
 */
type ChromeThemeSeedPatch = Partial<
  Pick<ChromeTheme, "accent" | "contrast" | "ink" | "opaqueWindows" | "surface">
> & {
  /** 字体配置的部分更新 */
  fonts?: Partial<ThemeFonts>;
  /** 语义颜色的部分更新 */
  semanticColors?: Partial<ThemeSemanticColors>;
};

/**
 * 代码主题种子补丁元数据类型
 * @description 描述代码主题种子中哪些字段应该被应用到当前主题
 */
type CodeThemeSeedPatchMetadata = {
  /** 是否应用对比度 */
  contrast?: true;
  /** 是否应用字体配置 */
  fonts?: Partial<Record<keyof ThemeFonts, true>>;
  /** 是否应用不透明窗口设置 */
  opaqueWindows?: true;
};

/**
 * RGB 颜色类型
 * @description 表示一个 RGB 颜色值,每个通道范围为 0-255
 */
type RgbColor = {
  /** 红色通道 */
  red: number;
  /** 绿色通道 */
  green: number;
  /** 蓝色通道 */
  blue: number;
};

/** 黑色 RGB 值 */
const BLACK: RgbColor = { blue: 0, green: 0, red: 0 };
/** 白色 RGB 值 */
const WHITE: RgbColor = { blue: 255, green: 255, red: 255 };
/** 6位十六进制颜色正则表达式 */
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
/** 主题分享字符串前缀 */
const THEME_SHARE_PREFIX = "codex-theme-v1:";
/** 对比度曲线 - 基线以下系数 */
const CONTRAST_CURVE_BELOW_BASELINE = 0.7;
/** 对比度曲线 - 基线以上系数 */
const CONTRAST_CURVE_ABOVE_BASELINE = 2;
/** 底层表面基础透明度(按变体) */
const SURFACE_UNDER_BASE_ALPHA: Record<ThemeVariant, number> = {
  dark: 0.16,
  light: 0.04,
};
/** 底层表面对比度步进系数(按变体) */
const SURFACE_UNDER_CONTRAST_STEP: Record<ThemeVariant, number> = {
  dark: 0.0015,
  light: 0.0012,
};
/** 面板基础透明度(按变体) */
const PANEL_BASE_ALPHA: Record<ThemeVariant, number> = {
  dark: 0.03,
  light: 0.18,
};
/** 面板对比度步进系数(按变体) */
const PANEL_CONTRAST_STEP: Record<ThemeVariant, number> = {
  dark: 0.03,
  light: 0.008,
};
/**
 * 代码主题种子补丁元数据
 * @description 记录每个代码主题在不同变体下需要应用的种子字段
 */
const CODE_THEME_SEED_PATCH_METADATA: Partial<
  Record<string, Partial<Record<ThemeVariant, CodeThemeSeedPatchMetadata>>>
> = {
  linear: {
    dark: { fonts: { ui: true }, opaqueWindows: true },
    light: { fonts: { ui: true }, opaqueWindows: true },
  },
  lobster: {
    dark: { fonts: { ui: true } },
  },
  matrix: {
    dark: { fonts: { code: true, ui: true }, opaqueWindows: true },
  },
  notion: {
    dark: { fonts: { code: true, ui: true }, opaqueWindows: true },
    light: { fonts: { code: true, ui: true }, opaqueWindows: true },
  },
  proof: {
    light: { fonts: { code: true, ui: true }, opaqueWindows: true },
  },
  raycast: {
    dark: { fonts: { code: true, ui: true }, opaqueWindows: true },
    light: { fonts: { code: true, ui: true }, opaqueWindows: true },
  },
  sentry: {
    dark: { fonts: { code: true, ui: true } },
  },
  vercel: {
    dark: { contrast: true, fonts: { code: true, ui: true }, opaqueWindows: true },
    light: { contrast: true, fonts: { code: true, ui: true }, opaqueWindows: true },
  },
  "dp-code": {
    dark: { contrast: true },
    light: { contrast: true },
  },
};

/**
 * 代码主题选项列表
 * @description 与打包的 Codex 目录紧密镜像,用于分享字符串验证时保留"已知主题 + 变体可用性"行为
 */
export const CODE_THEME_OPTIONS: readonly CodeThemeOption[] = [
  { id: "absolutely", label: "Absolutely", variants: ["light", "dark"] },
  { id: "ayu", label: "Ayu", variants: ["dark"] },
  { id: "catppuccin", label: "Catppuccin", variants: ["light", "dark"] },
  { id: "codex", label: "Codex", variants: ["light", "dark"] },
  { id: "dp-code", label: "Remi Code", variants: ["light", "dark"] },
  { id: "dracula", label: "Dracula", variants: ["dark"] },
  { id: "everforest", label: "Everforest", variants: ["light", "dark"] },
  { id: "github", label: "GitHub", variants: ["light", "dark"] },
  { id: "gruvbox", label: "Gruvbox", variants: ["light", "dark"] },
  { id: "linear", label: "Linear", variants: ["light", "dark"] },
  { id: "lobster", label: "Lobster", variants: ["dark"] },
  { id: "material", label: "Material", variants: ["dark"] },
  { id: "matrix", label: "Matrix", variants: ["dark"] },
  { id: "monokai", label: "Monokai", variants: ["dark"] },
  { id: "night-owl", label: "Night Owl", variants: ["dark"] },
  { id: "nord", label: "Nord", variants: ["dark"] },
  { id: "notion", label: "Notion", variants: ["light", "dark"] },
  { id: "one", label: "One", variants: ["light", "dark"] },
  { id: "oscurange", label: "Oscurange", variants: ["dark"] },
  { id: "proof", label: "Proof", variants: ["light"] },
  { id: "raycast", label: "Raycast", variants: ["light", "dark"] },
  { id: "rose-pine", label: "Rose Pine", variants: ["light", "dark"] },
  { id: "sentry", label: "Sentry", variants: ["dark"] },
  { id: "solarized", label: "Solarized", variants: ["light", "dark"] },
  { id: "temple", label: "Temple", variants: ["dark"] },
  { id: "tokyo-night", label: "Tokyo Night", variants: ["dark"] },
  { id: "vercel", label: "Vercel", variants: ["light", "dark"] },
  { id: "vscode-plus", label: "VS Code Plus", variants: ["light", "dark"] },
] as const;

/**
 * 按变体分类的默认 Chrome 主题
 * @description 当没有匹配到具体主题时使用的回退主题配置
 */
export const DEFAULT_CHROME_THEME_BY_VARIANT: Record<ThemeVariant, ChromeTheme> = {
  dark: {
    accent: "#339cff",
    contrast: 60,
    fonts: { code: null, ui: null },
    ink: "#ffffff",
    opaqueWindows: false,
    semanticColors: {
      diffAdded: "#40c977",
      diffRemoved: "#fa423e",
      skill: "#ad7bf9",
    },
    surface: "#181818",
  },
  light: {
    accent: "#339cff",
    contrast: 45,
    fonts: { code: null, ui: null },
    ink: "#1a1c1f",
    opaqueWindows: false,
    semanticColors: {
      diffAdded: "#00a240",
      diffRemoved: "#ba2623",
      skill: "#924ff7",
    },
    surface: "#ffffff",
  },
};

/**
 * 默认主题状态
 * @description 应用初始化时的默认主题配置,使用 Codex 主题作为默认值
 */
export const DEFAULT_THEME_STATE: ThemeState = {
  chromeThemes: {
    dark: getCodeThemeSeed("codex", "dark"),
    light: getCodeThemeSeed("codex", "light"),
  },
  codeThemeIds: {
    dark: "codex",
    light: "codex",
  },
  mode: "system",
};

// ─── 主题目录辅助函数 ────────────────────────────────────────────────

/**
 * 类型守卫:检查值是否为有效的主题模式
 * @param value - 待检查的值
 * @returns 如果值是有效的 ThemeMode 则返回 true
 */
export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * 类型守卫:检查值是否为有效的主题变体
 * @param value - 待检查的值
 * @returns 如果值是有效的 ThemeVariant 则返回 true
 */
export function isThemeVariant(value: unknown): value is ThemeVariant {
  return value === "light" || value === "dark";
}

/**
 * 获取主题分享字符串前缀
 * @returns 主题分享字符串的前缀标识
 */
export function getThemeSharePrefix(): string {
  return THEME_SHARE_PREFIX;
}

/**
 * 获取指定变体下可用的代码主题列表
 * @param variant - 主题变体(浅色或深色)
 * @returns 该变体下可用的代码主题选项数组
 */
export function getAvailableCodeThemes(variant: ThemeVariant): readonly CodeThemeOption[] {
  return CODE_THEME_OPTIONS.filter((option) => option.variants.includes(variant));
}

/**
 * 检查代码主题在指定变体下是否可用
 * @param codeThemeId - 代码主题 ID
 * @param variant - 主题变体
 * @returns 如果该主题在该变体下可用则返回 true
 */
export function isCodeThemeAvailable(codeThemeId: string, variant: ThemeVariant): boolean {
  const normalizedCodeThemeId = codeThemeId.trim().toLowerCase();
  return CODE_THEME_OPTIONS.some(
    (option) => option.id === normalizedCodeThemeId && option.variants.includes(variant),
  );
}

/**
 * 规范化代码主题 ID
 * @param codeThemeId - 待规范化的代码主题 ID
 * @param variant - 主题变体
 * @param fallback - 当 ID 无效时使用的回退值,默认为该变体的默认主题 ID
 * @returns 规范化后的代码主题 ID,如果无效则返回回退值
 */
export function normalizeCodeThemeId(
  codeThemeId: unknown,
  variant: ThemeVariant,
  fallback = DEFAULT_THEME_STATE.codeThemeIds[variant],
): string {
  const normalizedCodeThemeId =
    typeof codeThemeId === "string" ? codeThemeId.trim().toLowerCase() : "";
  return isCodeThemeAvailable(normalizedCodeThemeId, variant) ? normalizedCodeThemeId : fallback;
}

// ─── 主题规范化 ──────────────────────────────────────────────────────

/**
 * 规范化主题字体配置
 * @param value - 待规范化的字体配置值
 * @returns 规范化后的字体配置对象
 */
export function normalizeThemeFonts(value: unknown): ThemeFonts {
  const fonts = isRecord(value) ? value : {};
  return {
    code: normalizeFontSelection(fonts.code),
    ui: normalizeFontSelection(fonts.ui),
  };
}

/**
 * 规范化语义颜色配置
 * @param value - 待规范化的语义颜色值
 * @param fallback - 当值无效时使用的回退颜色配置
 * @returns 规范化后的语义颜色配置对象
 */
export function normalizeSemanticColors(
  value: unknown,
  fallback: ThemeSemanticColors,
): ThemeSemanticColors {
  const semanticColors = isRecord(value) ? value : {};
  return {
    diffAdded: normalizeHexColor(semanticColors.diffAdded) ?? fallback.diffAdded,
    diffRemoved: normalizeHexColor(semanticColors.diffRemoved) ?? fallback.diffRemoved,
    skill: normalizeHexColor(semanticColors.skill) ?? fallback.skill,
  };
}

/**
 * 规范化 Chrome 主题配置
 * @param value - 待规范化的主题值
 * @param variant - 主题变体,用于获取默认回退值
 * @returns 规范化后的完整 Chrome 主题对象
 */
export function normalizeChromeTheme(value: unknown, variant: ThemeVariant): ChromeTheme {
  const fallback = DEFAULT_CHROME_THEME_BY_VARIANT[variant];
  const theme = isRecord(value) ? value : {};

  return {
    accent: normalizeHexColor(theme.accent) ?? fallback.accent,
    contrast: normalizeStoredContrast(theme.contrast, fallback.contrast),
    fonts: normalizeThemeFonts(theme.fonts),
    ink: normalizeHexColor(theme.ink) ?? fallback.ink,
    opaqueWindows:
      theme.opaqueWindows === true || theme.opaqueWindows === false
        ? theme.opaqueWindows
        : fallback.opaqueWindows,
    semanticColors: normalizeSemanticColors(theme.semanticColors, fallback.semanticColors),
    surface: normalizeHexColor(theme.surface) ?? fallback.surface,
  };
}

/**
 * 规范化主题包
 * @param value - 待规范化的主题包值
 * @param variant - 主题变体
 * @returns 规范化后的主题包对象
 */
export function normalizeThemePack(value: unknown, variant: ThemeVariant): ThemePack {
  const pack = isRecord(value) ? value : {};
  return {
    codeThemeId: normalizeCodeThemeId(pack.codeThemeId, variant),
    theme: normalizeChromeTheme(pack.theme, variant),
  };
}

/**
 * 规范化主题状态
 * @description 支持从旧版 packs 格式迁移,兼容 chromeThemes 和 packs 两种存储结构
 * @param value - 待规范化的主题状态值
 * @returns 规范化后的完整主题状态对象
 */
export function normalizeThemeState(value: unknown): ThemeState {
  const state = isRecord(value) ? value : {};
  const codeThemeIds = isRecord(state.codeThemeIds) ? state.codeThemeIds : {};
  const chromeThemes = isRecord(state.chromeThemes) ? state.chromeThemes : {};
  // 兼容旧版 packs 格式(已废弃,但需要支持数据迁移)
  const packs = isRecord(state.packs) ? state.packs : {};
  const legacyDarkPack = normalizeThemePack(packs.dark, "dark");
  const legacyLightPack = normalizeThemePack(packs.light, "light");
  return {
    chromeThemes: {
      // 优先使用 chromeThemes,其次使用旧版 packs,最后使用默认值
      dark: isRecord(chromeThemes.dark)
        ? normalizeChromeTheme(chromeThemes.dark, "dark")
        : isRecord(packs.dark)
          ? legacyDarkPack.theme
          : DEFAULT_THEME_STATE.chromeThemes.dark,
      light: isRecord(chromeThemes.light)
        ? normalizeChromeTheme(chromeThemes.light, "light")
        : isRecord(packs.light)
          ? legacyLightPack.theme
          : DEFAULT_THEME_STATE.chromeThemes.light,
    },
    codeThemeIds: {
      dark: normalizeCodeThemeId(codeThemeIds.dark ?? legacyDarkPack.codeThemeId, "dark"),
      light: normalizeCodeThemeId(codeThemeIds.light ?? legacyLightPack.codeThemeId, "light"),
    },
    mode: isThemeMode(state.mode) ? state.mode : DEFAULT_THEME_STATE.mode,
  };
}

/**
 * 解析存储的主题状态字符串
 * @description 支持三种格式:空值、旧版主题模式字符串、新版 JSON 格式
 * @param rawValue - 原始存储字符串
 * @returns 解析后的主题状态对象,解析失败时返回默认状态
 */
export function parseStoredThemeState(rawValue: string | null | undefined): ThemeState {
  if (!rawValue) {
    return DEFAULT_THEME_STATE;
  }
  // 兼容旧版仅存储主题模式的格式
  if (isThemeMode(rawValue)) {
    return {
      ...DEFAULT_THEME_STATE,
      mode: rawValue,
    };
  }

  try {
    return normalizeThemeState(JSON.parse(rawValue));
  } catch {
    return DEFAULT_THEME_STATE;
  }
}

/**
 * 序列化主题状态为 JSON 字符串
 * @param state - 要序列化的主题状态
 * @returns JSON 字符串
 */
export function serializeThemeState(state: ThemeState): string {
  return JSON.stringify(state);
}

// ─── 分享字符串导入/导出 ────────────────────────────────────────────────

/**
 * 创建主题分享字符串
 * @param variant - 主题变体
 * @param pack - 要分享的主题包
 * @returns 格式化的分享字符串,包含前缀和 JSON 数据
 */
export function createThemeShareString(variant: ThemeVariant, pack: ThemePack): string {
  return `${THEME_SHARE_PREFIX}${JSON.stringify({
    codeThemeId: pack.codeThemeId,
    theme: pack.theme,
    variant,
  })}`;
}

/**
 * 解析主题分享字符串
 * @description 支持 JSON 和 URL 编码两种格式,验证主题可用性
 * @param rawValue - 原始分享字符串
 * @returns 解析后的主题分享载荷
 * @throws 当字符串格式无效或主题不可用时抛出错误
 */
export function parseThemeShareString(rawValue: string): ThemeSharePayload {
  const value = rawValue.trim();
  if (!value.startsWith(THEME_SHARE_PREFIX)) {
    throw new Error("Theme share string must start with codex-theme-v1:");
  }

  const payloadText = value.slice(THEME_SHARE_PREFIX.length);
  // 支持两种格式:直接 JSON 或 URL 编码的 JSON
  const jsonText = payloadText.startsWith("{") ? payloadText : decodeURIComponent(payloadText);
  let payload: unknown;
  try {
    payload = JSON.parse(jsonText);
  } catch {
    throw new Error("Theme share string does not contain valid JSON.");
  }

  const themeShare = parseThemeSharePayload(payload);
  if (!isCodeThemeAvailable(themeShare.codeThemeId, themeShare.variant)) {
    throw new Error(
      `Code theme "${themeShare.codeThemeId}" is not available for ${themeShare.variant}.`,
    );
  }

  return {
    codeThemeId: themeShare.codeThemeId,
    theme: normalizeChromeTheme(themeShare.theme, themeShare.variant),
    variant: themeShare.variant,
  };
}

/**
 * 检查是否可以解析主题分享字符串
 * @param value - 待检查的分享字符串
 * @param targetVariant - 可选的目标变体,如果提供则验证变体匹配
 * @returns 如果可以成功解析则返回 true,否则返回 false
 */
export function canParseThemeShareString(value: string, targetVariant?: ThemeVariant): boolean {
  try {
    parseThemeShareStringForVariant(value, targetVariant);
    return true;
  } catch {
    return false;
  }
}

/**
 * 为指定变体解析主题分享字符串
 * @param value - 原始分享字符串
 * @param targetVariant - 目标变体,如果提供则验证变体匹配
 * @returns 解析后的主题分享载荷
 * @throws 当变体不匹配时抛出错误
 */
export function parseThemeShareStringForVariant(
  value: string,
  targetVariant?: ThemeVariant,
): ThemeSharePayload {
  const payload = parseThemeShareString(value);
  if (targetVariant && payload.variant !== targetVariant) {
    throw new Error(
      `Theme variant mismatch. Expected ${targetVariant}, received ${payload.variant}.`,
    );
  }
  return payload;
}

/**
 * 从分享字符串更新主题包
 * @param state - 当前主题状态
 * @param value - 分享字符串
 * @param targetVariant - 目标变体
 * @returns 更新后的主题状态
 */
export function updateThemePackFromShareString(
  state: ThemeState,
  value: string,
  targetVariant: ThemeVariant,
): ThemeState {
  const payload = parseThemeShareStringForVariant(value, targetVariant);
  return {
    ...state,
    chromeThemes: {
      ...state.chromeThemes,
      [targetVariant]: payload.theme,
    },
    codeThemeIds: {
      ...state.codeThemeIds,
      [targetVariant]: payload.codeThemeId,
    },
  };
}

// ─── 细粒度主题包修改器 ───────────────────────────────────────────────

/**
 * 更新 Chrome 主题
 * @param state - 当前主题状态
 * @param variant - 要更新的变体
 * @param patch - 主题补丁
 * @returns 更新后的主题状态
 */
export function updateChromeTheme(
  state: ThemeState,
  variant: ThemeVariant,
  patch: Partial<ChromeTheme>,
): ThemeState {
  const previousTheme = state.chromeThemes[variant];
  const nextPatch: ChromeThemeSeedPatch = { ...patch };
  if (patch.fonts) {
    nextPatch.fonts = patch.fonts;
  }
  if (patch.semanticColors) {
    nextPatch.semanticColors = patch.semanticColors;
  }
  return {
    ...state,
    chromeThemes: {
      ...state.chromeThemes,
      [variant]: normalizeChromeTheme(mergeThemeSeedPatch(previousTheme, nextPatch), variant),
    },
  };
}

/**
 * 设置代码主题 ID
 * @description 切换代码主题时调用,会同时应用新主题的种子补丁
 * @param state - 当前主题状态
 * @param variant - 目标变体
 * @param codeThemeId - 新的代码主题 ID
 * @returns 更新后的主题状态
 */
export function setThemeCodeThemeId(
  state: ThemeState,
  variant: ThemeVariant,
  codeThemeId: string,
): ThemeState {
  const normalized = normalizeCodeThemeId(codeThemeId, variant);
  const previousTheme = resolveThemePack(state, variant).theme;
  const nextTheme = normalizeChromeTheme(
    mergeThemeSeedPatch(previousTheme, getCodeThemeSeedPatch(normalized, variant)),
    variant,
  );
  return {
    ...state,
    chromeThemes: {
      ...state.chromeThemes,
      [variant]: nextTheme,
    },
    codeThemeIds: {
      ...state.codeThemeIds,
      [variant]: normalized,
    },
  };
}

/**
 * 获取代码主题种子
 * @param codeThemeId - 代码主题 ID
 * @param variant - 主题变体
 * @returns 规范化后的 Chrome 主题,如果不存在则返回默认主题
 */
export function getCodeThemeSeed(codeThemeId: string, variant: ThemeVariant): ChromeTheme {
  const fallback = DEFAULT_CHROME_THEME_BY_VARIANT[variant];
  const themeSeed = THEME_SEED_CATALOG[codeThemeId]?.[variant];
  return themeSeed ? normalizeChromeTheme(themeSeed, variant) : fallback;
}

/**
 * 获取代码主题种子补丁
 * @description 根据元数据决定哪些字段应该从种子应用到当前主题
 * @param codeThemeId - 代码主题 ID
 * @param variant - 主题变体
 * @returns 主题种子补丁对象
 */
export function getCodeThemeSeedPatch(
  codeThemeId: string,
  variant: ThemeVariant,
): ChromeThemeSeedPatch {
  const themeSeed = THEME_SEED_CATALOG[codeThemeId]?.[variant];
  if (!themeSeed) {
    return {};
  }

  const normalizedSeed = normalizeChromeTheme(themeSeed, variant);
  const metadata = CODE_THEME_SEED_PATCH_METADATA[codeThemeId]?.[variant];
  const patch: ChromeThemeSeedPatch = {
    accent: normalizedSeed.accent,
    ink: normalizedSeed.ink,
    semanticColors: normalizedSeed.semanticColors,
    surface: normalizedSeed.surface,
  };

  // 根据元数据决定是否应用对比度、不透明窗口和字体配置
  if (metadata?.contrast) {
    patch.contrast = normalizedSeed.contrast;
  }

  if (metadata?.opaqueWindows) {
    patch.opaqueWindows = normalizedSeed.opaqueWindows;
  }

  if (metadata?.fonts) {
    const fontPatch: Partial<ThemeFonts> = {};
    if (metadata.fonts.code) {
      fontPatch.code = normalizedSeed.fonts.code;
    }
    if (metadata.fonts.ui) {
      fontPatch.ui = normalizedSeed.fonts.ui;
    }
    if (Object.keys(fontPatch).length > 0) {
      patch.fonts = fontPatch;
    }
  }

  return patch;
}

/**
 * 合并主题种子补丁
 * @param currentTheme - 当前主题
 * @param seedPatch - 种子补丁
 * @returns 合并后的补丁对象
 */
function mergeThemeSeedPatch(
  currentTheme: ChromeTheme,
  seedPatch: ChromeThemeSeedPatch,
): ChromeThemeSeedPatch {
  return {
    ...currentTheme,
    ...seedPatch,
    fonts: seedPatch.fonts ? { ...currentTheme.fonts, ...seedPatch.fonts } : currentTheme.fonts,
    semanticColors: seedPatch.semanticColors
      ? { ...currentTheme.semanticColors, ...seedPatch.semanticColors }
      : currentTheme.semanticColors,
  };
}

export function setThemeFonts(
  state: ThemeState,
  variant: ThemeVariant,
  patch: Partial<ThemeFonts>,
): ThemeState {
  const previousTheme = state.chromeThemes[variant];
  return {
    ...state,
    chromeThemes: {
      ...state.chromeThemes,
      [variant]: normalizeChromeTheme(
        {
          ...previousTheme,
          fonts: { ...previousTheme.fonts, ...patch },
        },
        variant,
      ),
    },
  };
}

export function resetThemeVariant(state: ThemeState, variant: ThemeVariant): ThemeState {
  return {
    ...state,
    chromeThemes: {
      ...state.chromeThemes,
      [variant]: DEFAULT_THEME_STATE.chromeThemes[variant],
    },
    codeThemeIds: {
      ...state.codeThemeIds,
      [variant]: DEFAULT_THEME_STATE.codeThemeIds[variant],
    },
  };
}

export function resolveThemePack(state: ThemeState, variant: ThemeVariant): ThemePack {
  return {
    codeThemeId: normalizeCodeThemeId(state.codeThemeIds[variant], variant),
    theme: normalizeChromeTheme(state.chromeThemes[variant], variant),
  };
}

export function areThemePacksEqual(left: ThemePack, right: ThemePack): boolean {
  return (
    left.codeThemeId === right.codeThemeId &&
    left.theme.accent === right.theme.accent &&
    left.theme.contrast === right.theme.contrast &&
    left.theme.fonts.code === right.theme.fonts.code &&
    left.theme.fonts.ui === right.theme.fonts.ui &&
    left.theme.ink === right.theme.ink &&
    left.theme.opaqueWindows === right.theme.opaqueWindows &&
    left.theme.semanticColors.diffAdded === right.theme.semanticColors.diffAdded &&
    left.theme.semanticColors.diffRemoved === right.theme.semanticColors.diffRemoved &&
    left.theme.semanticColors.skill === right.theme.semanticColors.skill &&
    left.theme.surface === right.theme.surface
  );
}

// ─── Theme derivation ─────────────────────────────────────────────────────

export function resolveThemeVariant(mode: ThemeMode, systemDark: boolean): ThemeVariant {
  if (mode === "system") {
    return systemDark ? "dark" : "light";
  }
  return mode;
}

export function buildThemeCssVariables(
  pack: ThemePack,
  variant: ThemeVariant,
  options?: { desktop?: boolean },
): ThemeCssVariableBuild {
  const resolvedTokens = buildResolvedThemeTokens(pack, variant);
  const codexVariables = resolvedTokens.codexVariables;
  const readCodexVariable = (name: string) => getRequiredVariable(codexVariables, name);
  const material: WindowMaterial =
    options?.desktop === true && !pack.theme.opaqueWindows ? "translucent" : "opaque";
  const warningColor = variant === "dark" ? "#f5b44a" : "#d97706";
  const sidebarSurfaceUnder = readCodexVariable("--color-background-surface-under");
  const sidebarRaisedSurface = readCodexVariable("--color-background-elevated-primary");
  const composerFocusBorder = buildComposerFocusBorder(
    pack,
    variant,
    resolvedTokens.computed.panel,
  );
  const appVariables: Record<string, string> = {
    "--accent": readCodexVariable("--color-background-accent"),
    "--accent-foreground": readCodexVariable("--color-text-foreground"),
    "--app-shell-background":
      material === "translucent"
        ? "transparent"
        : readCodexVariable("--color-background-surface-under"),
    "--app-composer-focus-border": composerFocusBorder,
    "--app-sidebar-backdrop-filter":
      material === "translucent" ? "blur(8px) saturate(135%)" : "none",
    "--app-sidebar-shadow":
      material === "translucent"
        ? variant === "dark"
          ? "inset 0 1px 0 rgba(255,255,255,0.024)"
          : "inset 0 1px 0 rgba(0,0,0,0.025)"
        : variant === "dark"
          ? "inset 0 1px 0 rgba(255,255,255,0.025)"
          : "inset 0 1px 0 rgba(0,0,0,0.03)",
    "--app-sidebar-surface":
      material === "translucent"
        ? variant === "dark"
          ? `color-mix(in srgb, ${sidebarSurfaceUnder} 72%, transparent)`
          : `color-mix(in srgb, ${sidebarSurfaceUnder} 64%, transparent)`
        : sidebarSurfaceUnder,
    "--background": readCodexVariable("--color-background-surface-under"),
    "--border": readCodexVariable("--color-border"),
    "--card": readCodexVariable("--color-background-panel"),
    "--card-foreground": readCodexVariable("--color-text-foreground"),
    "--destructive": pack.theme.semanticColors.diffRemoved,
    "--destructive-foreground": pack.theme.surface,
    "--foreground": readCodexVariable("--color-text-foreground"),
    "--info": pack.theme.accent,
    // Keep legacy app-level "info" consumers on Codex's accent-text path so
    // links, file labels, and similar affordances inherit the real light/dark logic.
    "--info-foreground": readCodexVariable("--color-text-accent"),
    "--input": readCodexVariable("--color-background-control-opaque"),
    "--muted": readCodexVariable("--color-background-elevated-secondary"),
    "--muted-foreground": readCodexVariable("--color-text-foreground-secondary"),
    "--popover": readCodexVariable("--color-background-elevated-primary-opaque"),
    "--popover-foreground": readCodexVariable("--color-text-foreground"),
    "--primary": readCodexVariable("--color-background-button-primary"),
    "--primary-foreground": readCodexVariable("--color-text-button-primary"),
    "--ring": readCodexVariable("--color-border-focus"),
    "--secondary": readCodexVariable("--color-background-button-secondary"),
    "--secondary-foreground": readCodexVariable("--color-text-button-secondary"),
    "--sidebar": readCodexVariable("--color-background-surface-under"),
    "--sidebar-accent": readCodexVariable("--color-background-button-secondary"),
    "--sidebar-accent-active": readCodexVariable("--color-background-button-secondary"),
    "--sidebar-accent-foreground": readCodexVariable("--color-text-foreground"),
    "--sidebar-border": readCodexVariable("--color-border"),
    "--sidebar-foreground": readCodexVariable("--color-text-foreground"),
    "--success": pack.theme.semanticColors.diffAdded,
    "--success-foreground": pack.theme.surface,
    "--theme-font-code-family": normalizeFontFamilyCssValue(pack.theme.fonts.code) ?? "",
    "--theme-font-ui-family": normalizeFontFamilyCssValue(pack.theme.fonts.ui) ?? "",
    "--warning": warningColor,
    "--warning-foreground": pack.theme.surface,
  };

  return {
    material,
    variables: {
      ...codexVariables,
      ...resolvedTokens.aliases,
      ...appVariables,
    },
  };
}

export function buildResolvedThemeTokens(
  pack: ThemePack,
  variant: ThemeVariant,
): ResolvedThemeTokens {
  const computedTheme = buildComputedTheme(pack.theme, variant);
  const derived =
    variant === "light"
      ? buildLightDerivedTokens(computedTheme)
      : buildDarkDerivedTokens(computedTheme);
  const panel = buildPanelBackground(computedTheme);
  const codexVariables = buildCodexCssVariables(computedTheme, derived, panel);

  return {
    aliases: buildThemeTokenAliases(codexVariables),
    codexVariables,
    computed: {
      contrast: computedTheme.contrast,
      editorBackground: formatOpaqueRgb(computedTheme.editorBackground),
      panel,
      surfaceUnder: computedTheme.surfaceUnder,
    },
    derived,
  };
}

function buildComputedTheme(theme: ChromeTheme, variant: ThemeVariant) {
  const contrast = normalizeContrastStrength(theme.contrast, variant);
  const surface = parseHexColor(theme.surface);
  const ink = parseHexColor(theme.ink);

  return {
    accent: parseHexColor(theme.accent),
    contrast,
    editorBackground:
      variant === "light" ? mixRgb(surface, WHITE, 0.12) : mixRgb(surface, ink, 0.07),
    ink,
    surface,
    surfaceUnder: buildSurfaceUnder(theme, surface, ink, variant),
    theme,
    variant,
  };
}

function buildCodexCssVariables(
  theme: ReturnType<typeof buildComputedTheme>,
  derivedTokens:
    | ReturnType<typeof buildLightDerivedTokens>
    | ReturnType<typeof buildDarkDerivedTokens>,
  panelBackground: string,
) {
  return {
    "--codex-base-accent": theme.theme.accent,
    "--codex-base-contrast": String(theme.theme.contrast),
    "--codex-base-ink": theme.theme.ink,
    "--codex-base-surface": theme.theme.surface,
    "--color-accent-blue": theme.theme.accent,
    "--color-accent-purple": theme.theme.semanticColors.skill,
    "--color-background-accent": derivedTokens.accentBackground,
    "--color-background-accent-active": derivedTokens.accentBackgroundActive,
    "--color-background-accent-hover": derivedTokens.accentBackgroundHover,
    "--color-background-button-primary": derivedTokens.buttonPrimaryBackground,
    "--color-background-button-primary-active": derivedTokens.buttonPrimaryBackgroundActive,
    "--color-background-button-primary-hover": derivedTokens.buttonPrimaryBackgroundHover,
    "--color-background-button-primary-inactive": derivedTokens.buttonPrimaryBackgroundInactive,
    "--color-background-button-secondary": derivedTokens.buttonSecondaryBackground,
    "--color-background-button-secondary-active": derivedTokens.buttonSecondaryBackgroundActive,
    "--color-background-button-secondary-hover": derivedTokens.buttonSecondaryBackgroundHover,
    "--color-background-button-secondary-inactive": derivedTokens.buttonSecondaryBackgroundInactive,
    "--color-background-button-tertiary": derivedTokens.buttonTertiaryBackground,
    "--color-background-button-tertiary-active": derivedTokens.buttonTertiaryBackgroundActive,
    "--color-background-button-tertiary-hover": derivedTokens.buttonTertiaryBackgroundHover,
    "--color-background-control": derivedTokens.controlBackground,
    "--color-background-control-opaque": derivedTokens.controlBackgroundOpaque,
    "--color-background-editor-opaque": formatOpaqueRgb(theme.editorBackground),
    "--color-background-elevated-primary": derivedTokens.elevatedPrimary,
    "--color-background-elevated-primary-opaque": derivedTokens.elevatedPrimaryOpaque,
    "--color-background-elevated-secondary": derivedTokens.elevatedSecondary,
    "--color-background-elevated-secondary-opaque": derivedTokens.elevatedSecondaryOpaque,
    "--color-background-panel": panelBackground,
    "--color-background-surface": theme.theme.surface,
    "--color-background-surface-under": theme.surfaceUnder,
    "--color-border": derivedTokens.border,
    "--color-border-focus": derivedTokens.borderFocus,
    "--color-border-heavy": derivedTokens.borderHeavy,
    "--color-border-light": derivedTokens.borderLight,
    "--color-decoration-added": theme.theme.semanticColors.diffAdded,
    "--color-decoration-deleted": theme.theme.semanticColors.diffRemoved,
    "--color-editor-added": formatRgba(
      parseHexColor(theme.theme.semanticColors.diffAdded),
      theme.variant === "light" ? 0.15 : 0.23,
    ),
    "--color-editor-deleted": formatRgba(
      parseHexColor(theme.theme.semanticColors.diffRemoved),
      theme.variant === "light" ? 0.15 : 0.23,
    ),
    "--color-icon-accent": derivedTokens.iconAccent,
    "--color-icon-primary": derivedTokens.iconPrimary,
    "--color-icon-secondary": derivedTokens.iconSecondary,
    "--color-icon-tertiary": derivedTokens.iconTertiary,
    "--color-simple-scrim": derivedTokens.simpleScrim,
    "--color-text-accent": derivedTokens.textAccent,
    "--color-text-button-primary": derivedTokens.textButtonPrimary,
    "--color-text-button-secondary": derivedTokens.textButtonSecondary,
    "--color-text-button-tertiary": derivedTokens.textButtonTertiary,
    "--color-text-foreground": derivedTokens.textForeground,
    "--color-text-foreground-secondary": derivedTokens.textForegroundSecondary,
    "--color-text-foreground-tertiary": derivedTokens.textForegroundTertiary,
  };
}

function buildThemeTokenAliases(codexVariables: Record<string, string>): Record<string, string> {
  const readCodexVariable = (name: string) => getRequiredVariable(codexVariables, name);

  return {
    "--color-token-badge-background": readCodexVariable("--color-background-accent"),
    "--color-token-badge-foreground": readCodexVariable("--color-text-foreground"),
    "--color-token-border": readCodexVariable("--color-border"),
    "--color-token-border-default": readCodexVariable("--color-border"),
    "--color-token-border-heavy": readCodexVariable("--color-border-heavy"),
    "--color-token-border-light": readCodexVariable("--color-border-light"),
    "--color-token-button-background": readCodexVariable("--color-background-button-primary"),
    "--color-token-button-border": readCodexVariable("--color-border"),
    "--color-token-button-foreground": readCodexVariable("--color-text-button-primary"),
    "--color-token-button-secondary-hover-background": readCodexVariable(
      "--color-background-button-secondary-hover",
    ),
    "--color-token-checkbox-active-background": readCodexVariable(
      "--color-background-accent-hover",
    ),
    "--color-token-checkbox-active-foreground": readCodexVariable("--color-text-foreground"),
    "--color-token-description-foreground": readCodexVariable("--color-text-foreground-secondary"),
    "--color-token-disabled-foreground": readCodexVariable("--color-text-foreground-tertiary"),
    "--color-token-dropdown-background": readCodexVariable(
      "--color-background-elevated-primary-opaque",
    ),
    "--color-token-focus-border": readCodexVariable("--color-border-focus"),
    "--color-token-foreground": readCodexVariable("--color-text-foreground"),
    "--color-token-input-background": readCodexVariable("--color-background-control"),
    "--color-token-input-border": readCodexVariable("--color-border"),
    "--color-token-input-foreground": readCodexVariable("--color-text-foreground"),
    "--color-token-input-placeholder-foreground": readCodexVariable(
      "--color-text-foreground-tertiary",
    ),
    "--color-token-link": readCodexVariable("--color-text-accent"),
    "--color-token-list-active-selection-background": readCodexVariable(
      "--color-background-button-secondary",
    ),
    "--color-token-list-active-selection-foreground": readCodexVariable("--color-text-foreground"),
    "--color-token-list-active-selection-icon-foreground":
      readCodexVariable("--color-icon-primary"),
    "--color-token-list-hover-background": readCodexVariable("--color-background-button-secondary"),
    "--color-token-main-surface-primary": readCodexVariable("--color-background-surface-under"),
    "--color-token-menu-background": readCodexVariable("--color-background-elevated-primary"),
    "--color-token-menu-border": readCodexVariable("--color-border"),
    "--color-token-progress-bar-background": readCodexVariable("--color-background-accent"),
    "--color-token-radio-active-foreground": readCodexVariable("--color-icon-accent"),
    "--color-token-scrollbar-slider-active-background": readCodexVariable("--color-border-heavy"),
    "--color-token-scrollbar-slider-background": readCodexVariable("--color-border-light"),
    "--color-token-scrollbar-slider-hover-background": readCodexVariable("--color-border"),
    "--color-token-side-bar-background": readCodexVariable("--color-background-surface-under"),
    "--color-token-text-code-block-background": readCodexVariable(
      "--color-background-elevated-secondary-opaque",
    ),
    "--color-token-text-link-active-foreground": readCodexVariable("--color-text-accent"),
    "--color-token-text-link-foreground": readCodexVariable("--color-text-accent"),
    "--color-token-text-primary": readCodexVariable("--color-text-foreground"),
    "--color-token-text-secondary": readCodexVariable("--color-text-foreground-secondary"),
    "--color-token-text-tertiary": readCodexVariable("--color-text-foreground-tertiary"),
    "--color-token-toolbar-hover-background": readCodexVariable(
      "--color-background-button-tertiary-hover",
    ),
    "--color-token-editor-background": readCodexVariable("--color-background-editor-opaque"),
    "--color-token-editor-foreground": readCodexVariable("--color-text-foreground"),
  };
}

function getRequiredVariable(variables: Record<string, string>, name: string): string {
  const value = variables[name];
  if (typeof value !== "string") {
    throw new Error(`Missing required theme variable: ${name}`);
  }
  return value;
}

function buildLightDerivedTokens(theme: ReturnType<typeof buildComputedTheme>) {
  const controlBase = mixRgb(theme.surface, theme.ink, 0.06 + theme.contrast * 0.05);
  const focusBase = mixRgb(theme.accent, WHITE, 0.3 + theme.contrast * 0.15);
  const elevatedPrimaryBase = mixRgb(theme.surface, theme.ink, 0.08 + theme.contrast * 0.08);

  return {
    accentBackground: mixHex("#000000", theme.theme.accent, 0.2 + theme.contrast * 0.08),
    accentBackgroundActive: mixHex("#000000", theme.theme.accent, 0.22 + theme.contrast * 0.12),
    accentBackgroundHover: mixHex("#000000", theme.theme.accent, 0.21 + theme.contrast * 0.1),
    border: formatRgba(theme.ink, 0.06 + theme.contrast * 0.04),
    borderFocus: formatRgba(focusBase, 0.7 + theme.contrast * 0.1),
    borderHeavy: formatRgba(theme.ink, 0.12 + theme.contrast * 0.06),
    borderLight: formatRgba(theme.ink, 0.03 + theme.contrast * 0.02),
    buttonPrimaryBackground: theme.theme.ink,
    buttonPrimaryBackgroundActive: formatRgba(theme.ink, 0.07 + theme.contrast * 0.05),
    buttonPrimaryBackgroundHover: formatRgba(theme.ink, 0.04 + theme.contrast * 0.03),
    buttonPrimaryBackgroundInactive: formatRgba(theme.ink, 0.02 + theme.contrast * 0.02),
    buttonSecondaryBackground: formatRgba(theme.ink, 0.04 + theme.contrast * 0.02),
    buttonSecondaryBackgroundActive: formatRgba(theme.ink, 0.14 + theme.contrast * 0.06),
    buttonSecondaryBackgroundHover: formatRgba(theme.ink, 0.1 + theme.contrast * 0.05),
    buttonSecondaryBackgroundInactive: formatRgba(theme.ink, 0.02 + theme.contrast * 0.03),
    buttonTertiaryBackground: formatRgba(theme.ink, 0.02 + theme.contrast * 0.015),
    buttonTertiaryBackgroundActive: formatRgba(theme.ink, 0.07 + theme.contrast * 0.05),
    buttonTertiaryBackgroundHover: formatRgba(theme.ink, 0.05 + theme.contrast * 0.03),
    controlBackground: formatRgba(controlBase, 0.96),
    controlBackgroundOpaque: formatOpaqueRgb(controlBase),
    elevatedPrimary: formatRgba(elevatedPrimaryBase, 0.96),
    elevatedPrimaryOpaque: formatOpaqueRgb(elevatedPrimaryBase),
    elevatedSecondary: formatRgba(theme.ink, 0.02 + theme.contrast * 0.02),
    elevatedSecondaryOpaque: mixHex(
      theme.theme.surface,
      theme.theme.ink,
      0.04 + theme.contrast * 0.05,
    ),
    iconAccent: theme.theme.accent,
    iconPrimary: formatRgba(theme.ink, 0.82 + theme.contrast * 0.14),
    iconSecondary: formatRgba(theme.ink, 0.65 + theme.contrast * 0.1),
    iconTertiary: formatRgba(theme.ink, 0.45 + theme.contrast * 0.1),
    simpleScrim: formatRgba(theme.ink, 0.08 + theme.contrast * 0.04),
    // Keep light-mode affordances on the real accent so links and file labels
    // match the active theme color instead of a softened focus-only variant.
    textAccent: theme.theme.accent,
    textButtonPrimary: theme.theme.surface,
    textButtonSecondary: mixHex(theme.theme.ink, theme.theme.surface, 0.7 + theme.contrast * 0.1),
    textButtonTertiary: formatRgba(theme.ink, 0.45 + theme.contrast * 0.1),
    textForeground: theme.theme.ink,
    textForegroundSecondary: formatRgba(theme.ink, 0.65 + theme.contrast * 0.1),
    textForegroundTertiary: formatRgba(theme.ink, 0.42 + theme.contrast * 0.13),
  };
}

function buildDarkDerivedTokens(theme: ReturnType<typeof buildComputedTheme>) {
  const controlBase = mixRgb(theme.surface, WHITE, 0.09 + theme.contrast * 0.04);
  const elevatedSecondaryBase = mixRgb(theme.surface, WHITE, 0.08 + theme.contrast * 0.08);
  const elevatedPrimaryBase = mixRgb(theme.surface, WHITE, 0.16 + theme.contrast * 0.12);

  return {
    accentBackground: mixHex(theme.theme.surface, theme.theme.accent, 0.11 + theme.contrast * 0.04),
    accentBackgroundActive: mixHex(
      theme.theme.surface,
      theme.theme.accent,
      0.13 + theme.contrast * 0.05,
    ),
    accentBackgroundHover: mixHex(
      theme.theme.surface,
      theme.theme.accent,
      0.12 + theme.contrast * 0.045,
    ),
    border: formatRgba(theme.ink, 0.06 + theme.contrast * 0.04),
    borderFocus: theme.theme.accent,
    borderHeavy: formatRgba(theme.ink, 0.09 + theme.contrast * 0.06),
    borderLight: formatRgba(theme.ink, 0.04 + theme.contrast * 0.02),
    buttonPrimaryBackground: theme.theme.ink,
    buttonPrimaryBackgroundActive: formatRgba(theme.ink, 0.1 + theme.contrast * 0.12),
    buttonPrimaryBackgroundHover: formatRgba(theme.ink, 0.05 + theme.contrast * 0.06),
    buttonPrimaryBackgroundInactive: formatRgba(theme.ink, 0.18 + theme.contrast * 0.14),
    buttonSecondaryBackground: formatRgba(theme.ink, 0.04 + theme.contrast * 0.02),
    buttonSecondaryBackgroundActive: formatRgba(theme.ink, 0.1 + theme.contrast * 0.06),
    buttonSecondaryBackgroundHover: formatRgba(theme.ink, 0.08 + theme.contrast * 0.05),
    buttonSecondaryBackgroundInactive: formatRgba(theme.ink, 0.01 + theme.contrast * 0.02),
    buttonTertiaryBackground: formatRgba(theme.ink, 0),
    buttonTertiaryBackgroundActive: formatRgba(theme.ink, 0.16 + theme.contrast * 0.08),
    buttonTertiaryBackgroundHover: formatRgba(theme.ink, 0.08 + theme.contrast * 0.04),
    controlBackground: formatRgba(controlBase, 0.96),
    controlBackgroundOpaque: formatOpaqueRgb(controlBase),
    elevatedPrimary: formatRgba(elevatedPrimaryBase, 0.96),
    elevatedPrimaryOpaque: formatOpaqueRgb(elevatedPrimaryBase),
    elevatedSecondary: formatRgba(elevatedSecondaryBase, 0.96),
    elevatedSecondaryOpaque: formatOpaqueRgb(elevatedSecondaryBase),
    iconAccent: theme.theme.accent,
    iconPrimary: theme.theme.ink,
    iconSecondary: formatRgba(theme.ink, 0.65 + theme.contrast * 0.1),
    iconTertiary: formatRgba(theme.ink, 0.45 + theme.contrast * 0.1),
    simpleScrim: formatRgba(BLACK, 0.08 + theme.contrast * 0.04),
    textAccent: theme.theme.accent,
    textButtonPrimary: theme.theme.surface,
    textButtonSecondary: theme.theme.ink,
    textButtonTertiary: formatRgba(theme.ink, 0.45 + theme.contrast * 0.1),
    textForeground: theme.theme.ink,
    textForegroundSecondary: formatRgba(theme.ink, 0.65 + theme.contrast * 0.1),
    textForegroundTertiary: formatRgba(theme.ink, 0.45 + theme.contrast * 0.1),
  };
}

function buildSurfaceUnder(
  theme: ChromeTheme,
  surface: RgbColor,
  ink: RgbColor,
  variant: ThemeVariant,
): string {
  const baseline = DEFAULT_CHROME_THEME_BY_VARIANT[variant].contrast;
  const mixAmount =
    SURFACE_UNDER_BASE_ALPHA[variant] +
    (theme.contrast - baseline) * SURFACE_UNDER_CONTRAST_STEP[variant];
  return variant === "light"
    ? mixHex(formatHex(surface), formatHex(ink), mixAmount)
    : mixHex(formatHex(surface), "#000000", mixAmount);
}

function buildPanelBackground(theme: ReturnType<typeof buildComputedTheme>): string {
  const anchor = theme.variant === "light" ? WHITE : theme.ink;
  return mixHex(
    theme.theme.surface,
    formatHex(anchor),
    PANEL_BASE_ALPHA[theme.variant] + theme.contrast * PANEL_CONTRAST_STEP[theme.variant],
  );
}

function buildComposerFocusBorder(
  pack: ThemePack,
  variant: ThemeVariant,
  panelBackground: string,
): string {
  const panel = parseHexColor(panelBackground);
  const anchor = variant === "dark" ? WHITE : parseHexColor(pack.theme.ink);
  const contrast = normalizeContrastStrength(pack.theme.contrast, variant);
  const mixAmount = variant === "dark" ? 0.12 + contrast * 0.06 : 0.1 + contrast * 0.05;
  return mixHex(formatHex(panel), formatHex(anchor), mixAmount);
}

function normalizeContrastStrength(value: number, variant: ThemeVariant): number {
  const baseline = DEFAULT_CHROME_THEME_BY_VARIANT[variant].contrast;
  const baselineRatio = baseline / 100;
  const curvedValue = value / 100 + ((value - baseline) / 60) * CONTRAST_CURVE_BELOW_BASELINE;

  if (value <= baseline) {
    return curvedValue;
  }

  return baselineRatio + (curvedValue - baselineRatio) * CONTRAST_CURVE_ABOVE_BASELINE;
}

// ─── Parsing helpers ──────────────────────────────────────────────────────

function parseThemeSharePayload(value: unknown): ThemeSharePayload {
  if (!isRecord(value)) {
    throw new Error("Theme share payload must be an object.");
  }

  const codeThemeId = normalizeRequiredString(value.codeThemeId, "Theme share codeThemeId");
  const variant = value.variant;
  if (!isThemeVariant(variant)) {
    throw new Error("Theme share variant must be either light or dark.");
  }

  const theme = parseStrictChromeTheme(value.theme);
  return {
    codeThemeId: codeThemeId.toLowerCase(),
    theme,
    variant,
  };
}

function parseStrictChromeTheme(value: unknown): ChromeTheme {
  if (!isRecord(value)) {
    throw new Error("Theme share theme must be an object.");
  }

  return {
    accent: parseRequiredHexColor(value.accent, "Theme accent"),
    contrast: parseRequiredContrast(value.contrast),
    fonts: parseStrictThemeFonts(value.fonts),
    ink: parseRequiredHexColor(value.ink, "Theme ink"),
    opaqueWindows: parseRequiredBoolean(value.opaqueWindows, "Theme opaqueWindows"),
    semanticColors: parseStrictSemanticColors(value.semanticColors),
    surface: parseRequiredHexColor(value.surface, "Theme surface"),
  };
}

function parseStrictThemeFonts(value: unknown): ThemeFonts {
  if (!isRecord(value)) {
    throw new Error("Theme fonts must be an object.");
  }

  return {
    code: parseNullableString(value.code, "Theme code font"),
    ui: parseNullableString(value.ui, "Theme UI font"),
  };
}

function parseStrictSemanticColors(value: unknown): ThemeSemanticColors {
  if (!isRecord(value)) {
    throw new Error("Theme semanticColors must be an object.");
  }

  return {
    diffAdded: parseRequiredHexColor(value.diffAdded, "Theme diffAdded"),
    diffRemoved: parseRequiredHexColor(value.diffRemoved, "Theme diffRemoved"),
    skill: parseRequiredHexColor(value.skill, "Theme skill"),
  };
}

function parseRequiredContrast(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error("Theme contrast must be an integer between 0 and 100.");
  }
  return value;
}

function parseRequiredBoolean(value: unknown, label: string): boolean {
  if (value !== true && value !== false) {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

function parseNullableString(value: unknown, label: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string or null.`);
  }
  return normalizeFontSelection(value);
}

function normalizeRequiredString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
  return trimmedValue;
}

function parseRequiredHexColor(value: unknown, label: string): string {
  const normalizedColor = normalizeHexColor(value);
  if (!normalizedColor) {
    throw new Error(`${label} must be a 6-digit hex color.`);
  }
  return normalizedColor;
}

function normalizeStoredContrast(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : fallback;
}

function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmedValue = value.trim();
  return HEX_COLOR_RE.test(trimmedValue) ? trimmedValue.toLowerCase() : null;
}

function normalizeFontSelection(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ─── Color math ───────────────────────────────────────────────────────────

function parseHexColor(value: string): RgbColor {
  const hexValue = value.slice(1);
  return {
    blue: Number.parseInt(hexValue.slice(4, 6), 16),
    green: Number.parseInt(hexValue.slice(2, 4), 16),
    red: Number.parseInt(hexValue.slice(0, 2), 16),
  };
}

function mixHex(from: string, to: string, amount: number): string {
  return formatHex(mixRgb(parseHexColor(from), parseHexColor(to), amount));
}

function mixRgb(from: RgbColor, to: RgbColor, amount: number): RgbColor {
  const clampedAmount = Math.min(1, Math.max(0, amount));
  return {
    blue: mixChannel(from.blue, to.blue, clampedAmount),
    green: mixChannel(from.green, to.green, clampedAmount),
    red: mixChannel(from.red, to.red, clampedAmount),
  };
}

function mixChannel(from: number, to: number, amount: number): number {
  return Math.round(from + (to - from) * amount);
}

function formatHex(color: RgbColor): string {
  return `#${formatHexChannel(color.red)}${formatHexChannel(color.green)}${formatHexChannel(color.blue)}`;
}

function formatOpaqueRgb(color: RgbColor): string {
  return `rgb(${color.red}, ${color.green}, ${color.blue})`;
}

function formatRgba(color: RgbColor, opacity: number): string {
  return `rgba(${color.red}, ${color.green}, ${color.blue}, ${formatAlpha(opacity)})`;
}

function formatHexChannel(value: number): string {
  return value.toString(16).padStart(2, "0");
}

function formatAlpha(value: number): string {
  return Math.min(1, Math.max(0, value)).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}
