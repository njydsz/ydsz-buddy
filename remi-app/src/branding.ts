/**
 * @file 品牌标识常量
 * @description 定义应用的品牌名称、版本号及阶段标签等标识信息，
 * 供全局 UI 展示和窗口标题等场景使用。
 */

/** 应用基础名称 */
export const APP_BASE_NAME = "Remi Claw";

/** 应用阶段标签，开发环境显示 "Dev"，生产环境显示 "Alpha" */
export const APP_STAGE_LABEL = import.meta.env.DEV ? "Dev" : "Alpha";

/** 应用完整展示名称，格式为 "基础名称 (阶段标签)" */
export const APP_DISPLAY_NAME = `${APP_BASE_NAME} (${APP_STAGE_LABEL})`;

/** 应用版本号，取自构建环境变量，回退为 "0.0.0" */
export const APP_VERSION = import.meta.env.APP_VERSION || "0.0.0";
