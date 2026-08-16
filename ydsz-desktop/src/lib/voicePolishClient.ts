/**
 * @file 语音文本润色客户端
 * @description 在客户端封装 `voice_polish.text` RPC 调用，提供：
 *  - 自动 fallback：润色失败时静默回退到原文，不打断用户输入
 *  - 智能语言检测：auto 模式下根据文本特征判断中文/英文
 *  - 空文本快速路径：空字符串不发起网络请求
 *  - AbortSignal 支持：与 useComposerVoiceController 的请求 ID 机制配合
 *
 * @see ydsz-server/src/rpc_methods/handlers/voice_polish.rs 后端实装
 */

import { readNativeApi } from "../nativeApi";
import type { ServerVoicePolishResult } from "~/contracts";

/** 润色客户端配置 */
export interface PolishVoiceTranscriptOptions {
  /** 是否启用润色（master switch） */
  enabled: boolean;
  /** 是否去除口语化表达 */
  removeFillerWords: boolean;
  /** 是否修正语法 */
  fixGrammar: boolean;
  /** 是否添加结构化提示词 */
  addStructure: boolean;
  /** 目标语言：auto | zh | en */
  targetLanguage: "auto" | "zh" | "en";
  /** AbortSignal：用于取消正在进行的润色请求 */
  signal?: AbortSignal;
}

/** 润色客户端返回值 */
export interface PolishVoiceTranscriptResult {
  /** 润色后文本（失败时返回原文） */
  text: string;
  /** 是否真正调用了后端润色 */
  applied: boolean;
  /** 后端返回的应用规则数（0 表示已跳过） */
  appliedRulesCount: number;
  /** 原始文本长度 */
  originalLength: number;
  /** 润色后文本长度 */
  polishedLength: number;
}

/**
 * 探测文本主要语言（auto 模式用）
 *
 * - 含 CJK 字符则视为中文
 * - 否则视为英文
 * - 同时包含时按 CJK 比例判定
 */
export function detectTranscriptLanguage(text: string): "zh" | "en" {
  if (text.length === 0) {
    return "en";
  }

  const cjkRegex = /[\u3400-\u9fff\uf900-\ufaff]/g;
  const cjkMatches = text.match(cjkRegex);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;

  // 阈值：CJK 字符占比 >= 20% 视为中文
  return cjkCount / text.length >= 0.2 ? "zh" : "en";
}

/**
 * 对语音转写文本执行智能润色。
 *
 * 行为契约：
 * 1. 文本为空 / 仅空白 / 禁用润色 → 立即返回原文，applied=false
 * 2. 后端调用失败 → 返回原文 + applied=false（**绝不**抛出错误打断用户）
 * 3. 成功 → 返回润色文本 + applied=true + appliedRulesCount
 * 4. targetLanguage=auto → 自动探测主语言
 */
export async function polishVoiceTranscript(
  text: string,
  options: PolishVoiceTranscriptOptions,
): Promise<PolishVoiceTranscriptResult> {
  const trimmed = text.trim();
  const originalLength = text.length;

  if (!options.enabled || trimmed.length === 0) {
    return {
      text,
      applied: false,
      appliedRulesCount: 0,
      originalLength,
      polishedLength: originalLength,
    };
  }

  if (options.signal?.aborted) {
    return {
      text,
      applied: false,
      appliedRulesCount: 0,
      originalLength,
      polishedLength: originalLength,
    };
  }

  const targetLanguage =
    options.targetLanguage === "auto" ? detectTranscriptLanguage(text) : options.targetLanguage;

  const api = readNativeApi();
  if (!api?.server?.voicePolishText) {
    return {
      text,
      applied: false,
      appliedRulesCount: 0,
      originalLength,
      polishedLength: originalLength,
    };
  }

  try {
    const result: ServerVoicePolishResult = await api.server.voicePolishText({
      text,
      enabled: true,
      removeFillerWords: options.removeFillerWords,
      fixGrammar: options.fixGrammar,
      addStructure: options.addStructure,
      targetLanguage,
    });

    // 防御：后端返回空文本时回退原文
    const polished = result.text?.trim().length > 0 ? result.text : text;
    const applied = polished !== text;

    return {
      text: polished,
      applied,
      appliedRulesCount: result.appliedRules?.length ?? 0,
      originalLength,
      polishedLength: polished.length,
    };
  } catch (error) {
    // 静默回退：润色失败不应阻塞用户输入
    if (import.meta.env.DEV) {
      console.warn("[voicePolish] failed, falling back to original transcript", error);
    }
    return {
      text,
      applied: false,
      appliedRulesCount: 0,
      originalLength,
      polishedLength: originalLength,
    };
  }
}
