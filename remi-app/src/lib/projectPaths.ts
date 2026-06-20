/**
 * @file projectPaths.ts
 * @description 项目路径处理工具集，提供跨平台（Unix/Windows）的路径规范化、
 * 浏览导航、目录推断等功能，支持文件系统浏览器的路径操作场景。
 */

import {
  isExplicitRelativePath,
  isUncPath,
  isWindowsAbsolutePath,
  isWindowsDrivePath,
} from "@remi-code/shared/path";
import { isWindowsPlatform } from "./utils";

/** 判断路径是否为文件系统根路径（"/"、"\"或 Windows 盘符根目录） */
function isRootPath(value: string): boolean {
  return value === "/" || value === "\\" || /^[a-zA-Z]:[/\\]?$/.test(value);
}

/** 获取绝对路径的平台类型 */
function getAbsolutePathKind(value: string): "unix" | "windows" | null {
  if (isWindowsDrivePath(value) || isUncPath(value)) {
    return "windows";
  }

  if (value.startsWith("/")) {
    return "unix";
  }

  return null;
}

/** 去除路径末尾的分隔符，保留根路径的末尾分隔符 */
function trimTrailingPathSeparators(value: string): string {
  if (value.length === 0 || isRootPath(value)) {
    return value;
  }

  const trimmed =
    getAbsolutePathKind(value) === "unix"
      ? value.replace(/\/+$/g, "")
      : value.replace(/[\\/]+$/g, "");
  if (trimmed.length === 0) {
    return value;
  }

  return /^[a-zA-Z]:$/.test(trimmed) ? `${trimmed}\\` : trimmed;
}

/** 根据路径格式推断首选路径分隔符 */
function preferredPathSeparator(value: string): "/" | "\\" {
  const absolutePathKind = getAbsolutePathKind(value);
  if (absolutePathKind === "windows") {
    return "\\";
  }
  if (absolutePathKind === "unix") {
    return "/";
  }

  return value.includes("\\") ? "\\" : "/";
}

/**
 * 判断路径是否以路径分隔符结尾
 *
 * @param value - 待检测的路径字符串
 * @returns 是否以路径分隔符结尾
 */
export function hasTrailingPathSeparator(value: string): boolean {
  return (getAbsolutePathKind(value) === "unix" ? /\/$/ : /[\\/]$/).test(value);
}

/** 判断路径是否为显式相对路径（以 "./" 或 "../" 开头） */
export { isExplicitRelativePath as isExplicitRelativeProjectPath };

/** 按分隔符拆分路径段 */
function splitPathSegments(value: string, separator: "/" | "\\"): string[] {
  return value.split(separator === "/" ? /\/+/ : /[\\/]+/).filter(Boolean);
}

/** 获取路径中最后一个路径分隔符的索引 */
function getLastPathSeparatorIndex(value: string): number {
  if (getAbsolutePathKind(value) === "unix") {
    return value.lastIndexOf("/");
  }

  return Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
}

/** 将绝对路径拆分为根路径、分隔符和路径段 */
function splitAbsolutePath(value: string): {
  root: string;
  separator: "/" | "\\";
  segments: string[];
} | null {
  if (isWindowsDrivePath(value)) {
    const root = `${value.slice(0, 2)}\\`;
    const segments = splitPathSegments(value.slice(root.length), "\\");
    return { root, separator: "\\", segments };
  }
  if (isUncPath(value)) {
    const segments = splitPathSegments(value, "\\");
    const [server, share, ...rest] = segments;
    if (!server || !share) {
      return null;
    }
    return {
      root: `\\\\${server}\\${share}\\`,
      separator: "\\",
      segments: rest,
    };
  }
  if (value.startsWith("/")) {
    return {
      root: "/",
      separator: "/",
      segments: splitPathSegments(value.slice(1), "/"),
    };
  }
  return null;
}

/**
 * 判断输入值是否为文件系统浏览查询路径
 *
 * @param value - 待检测的字符串
 * @param platform - 运行平台标识，默认取 navigator.platform
 * @returns 是否为文件系统浏览查询（相对路径、绝对路径或用户主目录路径）
 */
export function isFilesystemBrowseQuery(
  value: string,
  platform = typeof navigator === "undefined" ? "" : navigator.platform,
): boolean {
  const allowWindowsPaths = isWindowsPlatform(platform);
  return (
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith(".\\") ||
    value.startsWith("..\\") ||
    value.startsWith("/") ||
    value.startsWith("~/") ||
    (allowWindowsPaths && isWindowsAbsolutePath(value))
  );
}

/**
 * 判断是否为当前平台不支持的 Windows 项目路径
 *
 * @param value - 路径字符串
 * @param platform - 运行平台标识
 * @returns 是否为不支持的 Windows 绝对路径（即 Windows 路径但运行在非 Windows 平台）
 */
export function isUnsupportedWindowsProjectPath(value: string, platform: string): boolean {
  return isWindowsAbsolutePath(value) && !isWindowsPlatform(platform);
}

/**
 * 规范化项目路径用于分发（去除首尾空白及末尾分隔符）
 *
 * @param value - 原始路径字符串
 * @returns 规范化后的路径
 */
export function normalizeProjectPathForDispatch(value: string): string {
  return trimTrailingPathSeparators(value.trim());
}

/**
 * 从项目路径推断项目标题（取路径最后一段目录名）
 *
 * @param value - 项目路径
 * @returns 推断出的项目标题
 */
export function inferProjectTitleFromPath(value: string): string {
  const normalized = normalizeProjectPathForDispatch(value);
  const absolutePath = splitAbsolutePath(normalized);
  if (absolutePath) {
    return absolutePath.segments.findLast(Boolean) ?? normalized;
  }

  const segments = normalized.split(/[/\\]/);
  return segments.findLast(Boolean) ?? normalized;
}

/**
 * 在当前浏览路径后追加一个路径段
 *
 * @param currentPath - 当前浏览路径
 * @param segment - 要追加的路径段
 * @returns 追加后的完整路径（以分隔符结尾）
 */
export function appendBrowsePathSegment(currentPath: string, segment: string): string {
  const separator = preferredPathSeparator(currentPath);
  return `${getBrowseDirectoryPath(currentPath)}${segment}${separator}`;
}

/**
 * 获取当前浏览路径的末段名称（即最后一个路径分隔符之后的部分）
 *
 * @param currentPath - 当前浏览路径
 * @returns 末段路径名称
 */
export function getBrowseLeafPathSegment(currentPath: string): string {
  const lastSeparatorIndex = getLastPathSeparatorIndex(currentPath);
  return currentPath.slice(lastSeparatorIndex + 1);
}

/**
 * 获取当前浏览路径的目录部分（若路径以分隔符结尾则直接返回，否则截取到最后一个分隔符）
 *
 * @param currentPath - 当前浏览路径
 * @returns 目录路径（以分隔符结尾）
 */
export function getBrowseDirectoryPath(currentPath: string): string {
  if (hasTrailingPathSeparator(currentPath)) {
    return currentPath;
  }

  const lastSeparatorIndex = getLastPathSeparatorIndex(currentPath);
  if (lastSeparatorIndex < 0) {
    return currentPath;
  }

  return currentPath.slice(0, lastSeparatorIndex + 1);
}

/**
 * 获取当前浏览路径的父级路径
 *
 * @param currentPath - 当前浏览路径
 * @returns 父级路径，若已处于根目录则返回 null
 */
export function getBrowseParentPath(currentPath: string): string | null {
  const trimmed = trimTrailingPathSeparators(currentPath);
  const absolutePath = splitAbsolutePath(trimmed);
  if (absolutePath) {
    if (absolutePath.segments.length === 0) {
      return null;
    }

    if (absolutePath.segments.length === 1) {
      return absolutePath.root;
    }

    const parentSegments = absolutePath.segments.slice(0, -1).join(absolutePath.separator);
    return `${absolutePath.root}${parentSegments}${absolutePath.separator}`;
  }

  const separator = preferredPathSeparator(currentPath);
  const lastSeparatorIndex = getLastPathSeparatorIndex(trimmed);

  if (lastSeparatorIndex < 0) {
    return null;
  }

  if (lastSeparatorIndex === 2 && /^[a-zA-Z]:/.test(trimmed)) {
    return `${trimmed.slice(0, 2)}${separator}`;
  }

  return trimmed.slice(0, lastSeparatorIndex + 1);
}

/**
 * 判断当前路径是否可以向上导航
 *
 * @param currentPath - 当前浏览路径
 * @returns 是否存在父级路径可导航
 */
export function canNavigateUp(currentPath: string): boolean {
  return hasTrailingPathSeparator(currentPath) && getBrowseParentPath(currentPath) !== null;
}

/**
 * 获取初始浏览查询路径（基于用户主目录）
 *
 * @param homeDir - 用户主目录路径，若为 null 则默认使用 "~/"
 * @returns 初始浏览路径（以分隔符结尾）
 */
export function getInitialBrowseQuery(homeDir: string | null): string {
  if (!homeDir) return "~/";
  const separator = homeDir.includes("\\") && !homeDir.startsWith("/") ? "\\" : "/";
  return homeDir.endsWith(separator) ? homeDir : `${homeDir}${separator}`;
}