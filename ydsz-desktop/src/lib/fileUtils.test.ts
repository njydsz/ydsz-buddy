/**
 * @file fileUtils 单元测试
 *
 * 覆盖文件处理工具的核心函数:
 *
 * 1. formatFileSize - 文件大小格式化(B/KB/MB/GB/TB)
 * 2. getFileExtension - 扩展名提取
 * 3. getFileCategory - 文件分类(image/video/audio/document/archive/code/data/unknown)
 * 4. getCategoryLabel - 分类中文标签
 * 5. getMimeType - MIME 类型推断
 * 6. getFileIconName - 图标名映射
 * 7. isFileTypeSupported - 支持检测(过滤可执行/系统文件)
 * 8. extractUrls - URL 提取
 * 9. containsUrl - URL 包含检测
 * 10. extractFilesFromDataTransfer - DataTransfer 解析
 * 11. calculateTotalFileSize / hasUnsupportedFiles / getUnsupportedFiles
 */

import { describe, expect, it } from "vitest";

import {
  calculateTotalFileSize,
  containsUrl,
  expandDirectoryEntries,
  extractFilesFromDataTransfer,
  extractUrls,
  formatFileSize,
  getCategoryLabel,
  getFileCategory,
  getFileExtension,
  getFileIconName,
  getMimeType,
  getUnsupportedFiles,
  hasUnsupportedFiles,
  isFileTypeSupported,
  isLargeFileForConfirmation,
  isLikelyDirectoryEntry,
  LARGE_FILE_CONFIRMATION_THRESHOLD_BYTES,
  listLargeFilesForConfirmation,
  mergeExpandedDirectoryEntries,
  summarizeDirectoryEntries,
  summarizeFileCategoryDistribution,
  type FileInfo,
} from "./fileUtils";

describe("fileUtils", () => {
  describe("formatFileSize", () => {
    it("0 字节返回 '0 B'", () => {
      expect(formatFileSize(0)).toBe("0 B");
    });

    it("负数和 NaN 返回 '0 B'", () => {
      expect(formatFileSize(-100)).toBe("0 B");
      expect(formatFileSize(NaN)).toBe("0 B");
      expect(formatFileSize(Infinity)).toBe("0 B");
    });

    it("小于 1KB 显示 B 单位", () => {
      expect(formatFileSize(500)).toBe("500 B");
      expect(formatFileSize(1023)).toBe("1023 B");
    });

    it("KB 范围", () => {
      expect(formatFileSize(1024)).toBe("1.00 KB");
      expect(formatFileSize(1536)).toBe("1.50 KB");
      // 1KB+100B
      expect(formatFileSize(1024 + 100)).toBe("1.10 KB");
    });

    it("MB 范围", () => {
      expect(formatFileSize(1024 * 1024)).toBe("1.00 MB");
      expect(formatFileSize(1024 * 1024 * 5)).toBe("5.00 MB");
    });

    it("GB 范围", () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe("1.00 GB");
    });

    it("TB 范围", () => {
      const tb = 1024 * 1024 * 1024 * 1024;
      expect(formatFileSize(tb)).toBe("1.00 TB");
      expect(formatFileSize(tb * 1.5)).toBe("1.50 TB");
    });

    it("decimals 参数", () => {
      expect(formatFileSize(1536, 0)).toBe("2 KB");
      expect(formatFileSize(1536, 1)).toBe("1.5 KB");
      expect(formatFileSize(1536, 3)).toBe("1.500 KB");
    });

    it("负数 decimals 视为 0", () => {
      expect(formatFileSize(1536, -1)).toBe("2 KB");
    });
  });

  describe("getFileExtension", () => {
    it("常规文件名", () => {
      expect(getFileExtension("photo.jpg")).toBe("jpg");
      expect(getFileExtension("archive.tar.gz")).toBe("gz");
    });

    it("无扩展名返回空字符串", () => {
      expect(getFileExtension("Makefile")).toBe("");
      expect(getFileExtension("")).toBe("");
    });

    it("末尾点号返回空字符串", () => {
      expect(getFileExtension("file.")).toBe("");
    });

    it("大写扩展名归一为小写", () => {
      expect(getFileExtension("PHOTO.JPG")).toBe("jpg");
      expect(getFileExtension("Archive.TAR.GZ")).toBe("gz");
    });
  });

  describe("getFileCategory", () => {
    it("图片分类", () => {
      expect(getFileCategory("photo.png")).toBe("image");
      expect(getFileCategory("photo.JPG")).toBe("image");
      expect(getFileCategory("anim.gif")).toBe("image");
      expect(getFileCategory("logo.svg")).toBe("image");
    });

    it("视频分类", () => {
      expect(getFileCategory("movie.mp4")).toBe("video");
      expect(getFileCategory("clip.webm")).toBe("video");
    });

    it("音频分类", () => {
      expect(getFileCategory("song.mp3")).toBe("audio");
      expect(getFileCategory("sound.wav")).toBe("audio");
    });

    it("文档分类", () => {
      expect(getFileCategory("report.pdf")).toBe("document");
      expect(getFileCategory("data.xlsx")).toBe("document");
      expect(getFileCategory("notes.md")).toBe("document");
    });

    it("压缩包分类", () => {
      expect(getFileCategory("archive.zip")).toBe("archive");
      expect(getFileCategory("bundle.tar.gz")).toBe("archive");
    });

    it("代码分类", () => {
      expect(getFileCategory("index.ts")).toBe("code");
      expect(getFileCategory("App.tsx")).toBe("code");
      expect(getFileCategory("script.py")).toBe("code");
      expect(getFileCategory("config.json")).toBe("code");
    });

    it("数据分类", () => {
      expect(getFileCategory("export.csv")).toBe("data");
      expect(getFileCategory("db.sqlite")).toBe("data");
    });

    it("未知分类", () => {
      expect(getFileCategory("unknown.xyz")).toBe("unknown");
      expect(getFileCategory("file")).toBe("unknown");
    });
  });

  describe("getCategoryLabel", () => {
    it("返回中文标签", () => {
      expect(getCategoryLabel("image")).toBe("图片");
      expect(getCategoryLabel("video")).toBe("视频");
      expect(getCategoryLabel("audio")).toBe("音频");
      expect(getCategoryLabel("document")).toBe("文档");
      expect(getCategoryLabel("archive")).toBe("压缩包");
      expect(getCategoryLabel("code")).toBe("代码");
      expect(getCategoryLabel("data")).toBe("数据");
      expect(getCategoryLabel("unknown")).toBe("未知");
    });
  });

  describe("getMimeType", () => {
    it("图片 MIME", () => {
      expect(getMimeType("photo.png")).toBe("image/png");
      expect(getMimeType("photo.jpg")).toBe("image/jpeg");
      expect(getMimeType("photo.jpeg")).toBe("image/jpeg");
      expect(getMimeType("anim.gif")).toBe("image/gif");
    });

    it("文档 MIME", () => {
      expect(getMimeType("report.pdf")).toBe("application/pdf");
      expect(getMimeType("data.xlsx")).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
    });

    it("代码 MIME", () => {
      expect(getMimeType("index.ts")).toBe("text/typescript");
      expect(getMimeType("App.tsx")).toBe("text/typescript");
      expect(getMimeType("config.json")).toBe("application/json");
    });

    it("未知扩展名返回 application/octet-stream", () => {
      expect(getMimeType("unknown.xyz")).toBe("application/octet-stream");
    });

    it("无扩展名返回 application/octet-stream", () => {
      expect(getMimeType("Makefile")).toBe("application/octet-stream");
      expect(getMimeType("")).toBe("application/octet-stream");
    });
  });

  describe("getFileIconName", () => {
    it("各分类对应 lucide-react 图标名", () => {
      expect(getFileIconName("photo.png")).toBe("image");
      expect(getFileIconName("video.mp4")).toBe("video");
      expect(getFileIconName("song.mp3")).toBe("music");
      expect(getFileIconName("doc.pdf")).toBe("file-text");
      expect(getFileIconName("archive.zip")).toBe("archive");
      expect(getFileIconName("index.ts")).toBe("code");
      expect(getFileIconName("data.csv")).toBe("database");
      expect(getFileIconName("unknown.xyz")).toBe("file");
    });
  });

  describe("isFileTypeSupported", () => {
    it("可执行文件不被支持", () => {
      expect(isFileTypeSupported("setup.exe")).toBe(false);
      expect(isFileTypeSupported("installer.msi")).toBe(false);
      expect(isFileTypeSupported("app.dmg")).toBe(false);
    });

    it("脚本文件不被支持", () => {
      expect(isFileTypeSupported("script.sh")).toBe(false);
      expect(isFileTypeSupported("script.bat")).toBe(false);
      expect(isFileTypeSupported("script.ps1")).toBe(false);
    });

    it("系统动态库不被支持", () => {
      expect(isFileTypeSupported("lib.dll")).toBe(false);
      expect(isFileTypeSupported("lib.so")).toBe(false);
      expect(isFileTypeSupported("lib.dylib")).toBe(false);
    });

    it("常规文件被支持", () => {
      expect(isFileTypeSupported("doc.pdf")).toBe(true);
      expect(isFileTypeSupported("image.png")).toBe(true);
      expect(isFileTypeSupported("code.ts")).toBe(true);
    });

    it("无扩展名被支持", () => {
      expect(isFileTypeSupported("Makefile")).toBe(true);
      expect(isFileTypeSupported("README")).toBe(true);
    });

    it("大小写不敏感", () => {
      expect(isFileTypeSupported("Setup.EXE")).toBe(false);
      expect(isFileTypeSupported("Script.BAT")).toBe(false);
    });
  });

  describe("extractUrls", () => {
    it("提取 https URL", () => {
      expect(extractUrls("Check https://example.com for info")).toEqual([
        "https://example.com",
      ]);
    });

    it("提取 http URL", () => {
      expect(extractUrls("Visit http://test.com/path")).toEqual(["http://test.com/path"]);
    });

    it("多个 URL", () => {
      const text = "https://a.com and http://b.com and https://c.com/x";
      expect(extractUrls(text)).toEqual([
        "https://a.com",
        "http://b.com",
        "https://c.com/x",
      ]);
    });

    it("非字符串返回空数组", () => {
      expect(extractUrls(null as unknown as string)).toEqual([]);
      expect(extractUrls(undefined as unknown as string)).toEqual([]);
      expect(extractUrls("" as string)).toEqual([]);
    });

    it("无 URL 文本返回空数组", () => {
      expect(extractUrls("hello world")).toEqual([]);
    });

    it("URL 中包含查询参数和片段", () => {
      expect(extractUrls("see https://api.com/v1?x=1&y=2#anchor")).toEqual([
        "https://api.com/v1?x=1&y=2#anchor",
      ]);
    });
  });

  describe("containsUrl", () => {
    it("包含 URL 返回 true", () => {
      expect(containsUrl("check https://x.com")).toBe(true);
    });

    it("不包含 URL 返回 false", () => {
      expect(containsUrl("hello world")).toBe(false);
    });

    it("非字符串返回 false", () => {
      expect(containsUrl(null as unknown as string)).toBe(false);
      expect(containsUrl(undefined as unknown as string)).toBe(false);
    });
  });

  describe("extractFilesFromDataTransfer", () => {
    function createMockFile(name: string, size: number, type: string = ""): File {
      // happy-dom 不一定支持完整 File 构造,使用最小 mock
      const blob = new Blob([new ArrayBuffer(size)], { type });
      return new File([blob], name, { type });
    }

    function createMockDataTransfer(files: File[]): DataTransfer {
      const dataTransfer = new DataTransfer();
      for (const file of files) {
        dataTransfer.items.add(file);
      }
      return dataTransfer;
    }

    it("空 DataTransfer 返回空数组", () => {
      const dt = createMockDataTransfer([]);
      expect(extractFilesFromDataTransfer(dt)).toEqual([]);
    });

    it("提取单个文件信息", () => {
      const file = createMockFile("photo.png", 1024, "image/png");
      const dt = createMockDataTransfer([file]);
      const result = extractFilesFromDataTransfer(dt);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: "photo.png",
        size: 1024,
        type: "image/png",
        category: "image",
        icon: "image",
        supported: true,
      });
    });

    it("MIME 缺失时回退到扩展名推断", () => {
      const file = createMockFile("doc.pdf", 2048, "");
      const dt = createMockDataTransfer([file]);
      const result = extractFilesFromDataTransfer(dt);
      expect(result[0].type).toBe("application/pdf");
    });

    it("不支持的文件标记 supported=false", () => {
      const file = createMockFile("setup.exe", 1024, "");
      const dt = createMockDataTransfer([file]);
      const result = extractFilesFromDataTransfer(dt);
      expect(result[0].supported).toBe(false);
    });
  });

  describe("calculateTotalFileSize", () => {
    it("空数组返回 0", () => {
      expect(calculateTotalFileSize([])).toBe(0);
    });

    it("累加所有文件大小", () => {
      const files: FileInfo[] = [
        { name: "a.txt", size: 100, type: "text/plain", category: "document", icon: "file-text", supported: true },
        { name: "b.txt", size: 200, type: "text/plain", category: "document", icon: "file-text", supported: true },
        { name: "c.txt", size: 300, type: "text/plain", category: "document", icon: "file-text", supported: true },
      ];
      expect(calculateTotalFileSize(files)).toBe(600);
    });
  });

  describe("hasUnsupportedFiles", () => {
    it("全部支持返回 false", () => {
      const files: FileInfo[] = [
        { name: "a.txt", size: 100, type: "text/plain", category: "document", icon: "file-text", supported: true },
      ];
      expect(hasUnsupportedFiles(files)).toBe(false);
    });

    it("有任一不支持返回 true", () => {
      const files: FileInfo[] = [
        { name: "a.txt", size: 100, type: "text/plain", category: "document", icon: "file-text", supported: true },
        { name: "b.exe", size: 200, type: "application/octet-stream", category: "unknown", icon: "file", supported: false },
      ];
      expect(hasUnsupportedFiles(files)).toBe(true);
    });

    it("空数组返回 false", () => {
      expect(hasUnsupportedFiles([])).toBe(false);
    });
  });

  describe("getUnsupportedFiles", () => {
    it("过滤掉所有支持的文件", () => {
      const files: FileInfo[] = [
        { name: "a.txt", size: 100, type: "text/plain", category: "document", icon: "file-text", supported: true },
      ];
      expect(getUnsupportedFiles(files)).toEqual([]);
    });

    it("返回不支持的文件", () => {
      const supported: FileInfo = {
        name: "a.txt",
        size: 100,
        type: "text/plain",
        category: "document",
        icon: "file-text",
        supported: true,
      };
      const unsupported: FileInfo = {
        name: "b.exe",
        size: 200,
        type: "application/octet-stream",
        category: "unknown",
        icon: "file",
        supported: false,
      };
      const result = getUnsupportedFiles([supported, unsupported]);
      expect(result).toEqual([unsupported]);
    });
  });

  // ---------------------------------------------------------------------------
  // C-6 拖拽体验增强：summarizeFileCategoryDistribution
  // ---------------------------------------------------------------------------

  describe("summarizeFileCategoryDistribution", () => {
    function makeFile(category: FileInfo["category"], size: number, name: string): FileInfo {
      return {
        name,
        size,
        type: "application/octet-stream",
        category,
        icon: "file",
        supported: true,
      };
    }

    it("空文件数组返回空分布", () => {
      expect(summarizeFileCategoryDistribution([])).toEqual([]);
    });

    it("单类别文件只返回一个分布条目", () => {
      const files = [
        makeFile("image", 100, "a.png"),
        makeFile("image", 200, "b.png"),
      ];
      const result = summarizeFileCategoryDistribution(files);
      expect(result).toEqual([
        { category: "image", count: 2, totalSize: 300 },
      ]);
    });

    it("多类别按 count 降序排序", () => {
      const files = [
        makeFile("image", 100, "a.png"),
        makeFile("document", 200, "b.pdf"),
        makeFile("document", 300, "c.pdf"),
        makeFile("image", 400, "d.png"),
        makeFile("video", 500, "e.mp4"),
      ];
      const result = summarizeFileCategoryDistribution(files);
      expect(result.map((entry) => entry.category)).toEqual([
        "image",
        "document",
        "video",
      ]);
      // image 出现 2 次 → 优先；document 也是 2 次 → 排第二；video 1 次
      expect(result[0]).toEqual({ category: "image", count: 2, totalSize: 500 });
      expect(result[1]).toEqual({ category: "document", count: 2, totalSize: 500 });
      expect(result[2]).toEqual({ category: "video", count: 1, totalSize: 500 });
    });

    it("count 相同时按 totalSize 降序", () => {
      const files = [
        makeFile("image", 100, "a.png"),
        makeFile("document", 1000, "b.pdf"),
      ];
      const result = summarizeFileCategoryDistribution(files);
      expect(result[0].category).toBe("document"); // totalSize=1000 更大
      expect(result[1].category).toBe("image");
    });

    it("汇总 totalSize 正确", () => {
      const files = [
        makeFile("image", 100, "a.png"),
        makeFile("image", 200, "b.png"),
        makeFile("image", 300, "c.png"),
      ];
      const result = summarizeFileCategoryDistribution(files);
      expect(result[0].totalSize).toBe(600);
    });

    it("混合 7 大类不丢失", () => {
      const categories: FileInfo["category"][] = [
        "image",
        "video",
        "audio",
        "document",
        "archive",
        "code",
        "data",
        "unknown",
      ];
      const files = categories.map((cat, i) => makeFile(cat, i * 100, `f${i}`));
      const result = summarizeFileCategoryDistribution(files);
      expect(result).toHaveLength(8);
      expect(new Set(result.map((entry) => entry.category))).toEqual(new Set(categories));
    });
  });

  // ---------------------------------------------------------------------------
  // C-6 拖拽体验增强：isLargeFileForConfirmation
  // ---------------------------------------------------------------------------

  describe("isLargeFileForConfirmation", () => {
    function makeFile(size: number): FileInfo {
      return {
        name: "f.bin",
        size,
        type: "application/octet-stream",
        category: "data",
        icon: "database",
        supported: true,
      };
    }

    it("空数组返回 false", () => {
      expect(isLargeFileForConfirmation([])).toBe(false);
    });

    it("所有文件 < 50MB 时返回 false", () => {
      const files = [makeFile(1024), makeFile(10 * 1024 * 1024), makeFile(0)];
      expect(isLargeFileForConfirmation(files)).toBe(false);
    });

    it("任意文件 > 50MB 时返回 true", () => {
      const files = [makeFile(1024), makeFile(60 * 1024 * 1024)];
      expect(isLargeFileForConfirmation(files)).toBe(true);
    });

    it("正好 50MB 时返回 false（严格大于）", () => {
      const files = [makeFile(LARGE_FILE_CONFIRMATION_THRESHOLD_BYTES)];
      expect(isLargeFileForConfirmation(files)).toBe(false);
    });

    it("接受自定义 threshold", () => {
      const files = [makeFile(1500)];
      expect(isLargeFileForConfirmation(files, 1000)).toBe(true);
      expect(isLargeFileForConfirmation(files, 2000)).toBe(false);
    });

    it("threshold=0 时所有 size > 0 的文件都算 large", () => {
      const files = [makeFile(1)];
      expect(isLargeFileForConfirmation(files, 0)).toBe(true);
    });

    it("threshold=0 且 size=0 的文件不算 large", () => {
      const files = [makeFile(0)];
      expect(isLargeFileForConfirmation(files, 0)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // C-6 拖拽体验增强：listLargeFilesForConfirmation
  // ---------------------------------------------------------------------------

  describe("listLargeFilesForConfirmation", () => {
    function makeFile(name: string, size: number): FileInfo {
      return {
        name,
        size,
        type: "application/octet-stream",
        category: "data",
        icon: "database",
        supported: true,
      };
    }

    it("空数组返回空列表", () => {
      expect(listLargeFilesForConfirmation([])).toEqual([]);
    });

    it("过滤掉所有 < 50MB 的文件", () => {
      const files = [
        makeFile("small.bin", 1024),
        makeFile("medium.bin", 10 * 1024 * 1024),
      ];
      expect(listLargeFilesForConfirmation(files)).toEqual([]);
    });

    it("返回所有 > 50MB 的文件", () => {
      const files = [
        makeFile("small.bin", 1024),
        makeFile("big1.bin", 60 * 1024 * 1024),
        makeFile("big2.bin", 80 * 1024 * 1024),
      ];
      const result = listLargeFilesForConfirmation(files);
      expect(result).toHaveLength(2);
      expect(result.map((f) => f.name)).toEqual(["big2.bin", "big1.bin"]);
    });

    it("结果按 size 降序排序", () => {
      const files = [
        makeFile("a.bin", 100 * 1024 * 1024),
        makeFile("b.bin", 200 * 1024 * 1024),
        makeFile("c.bin", 60 * 1024 * 1024),
      ];
      const result = listLargeFilesForConfirmation(files);
      expect(result.map((f) => f.name)).toEqual(["b.bin", "a.bin", "c.bin"]);
    });

    it("接受自定义 threshold", () => {
      const files = [makeFile("a.bin", 1500), makeFile("b.bin", 500)];
      const result = listLargeFilesForConfirmation(files, 1000);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("a.bin");
    });

    it("threshold=0 时所有 size > 0 的文件都被包含并降序", () => {
      const files = [makeFile("a.bin", 1), makeFile("b.bin", 100)];
      const result = listLargeFilesForConfirmation(files, 0);
      expect(result.map((f) => f.name)).toEqual(["b.bin", "a.bin"]);
    });
  });

  // ---------------------------------------------------------------------------
  // C-6 文件夹拖入支持:isLikelyDirectoryEntry
  // ---------------------------------------------------------------------------

  describe("isLikelyDirectoryEntry", () => {
    it("size=0 + type='' 识别为目录(Chromium webview 行为)", () => {
      expect(isLikelyDirectoryEntry({ name: "my-folder", size: 0, type: "" })).toBe(true);
    });

    it("size=0 + type='' 即使无扩展名也识别为目录", () => {
      expect(isLikelyDirectoryEntry({ name: "no-ext-name", size: 0, type: "" })).toBe(true);
    });

    it("size > 0 不是目录", () => {
      expect(isLikelyDirectoryEntry({ name: "file.txt", size: 100, type: "text/plain" })).toBe(false);
    });

    it("size=0 但有 MIME type 不是目录", () => {
      expect(isLikelyDirectoryEntry({ name: "empty.txt", size: 0, type: "text/plain" })).toBe(false);
    });

    it("name 为空不是目录", () => {
      expect(isLikelyDirectoryEntry({ name: "", size: 0, type: "" })).toBe(false);
    });

    it("null/undefined 输入安全处理", () => {
      expect(isLikelyDirectoryEntry(null as unknown as { name: string; size: number; type: string })).toBe(false);
      expect(isLikelyDirectoryEntry(undefined as unknown as { name: string; size: number; type: string })).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // C-6 文件夹拖入支持:summarizeDirectoryEntries
  // ---------------------------------------------------------------------------

  describe("summarizeDirectoryEntries", () => {
    it("空数组返回 count=0", () => {
      expect(summarizeDirectoryEntries([])).toEqual({ count: 0, names: [] });
    });

    it("无目录时返回 count=0", () => {
      const files = [
        { name: "a.png", size: 100, type: "image/png" },
        { name: "b.txt", size: 50, type: "text/plain" },
      ];
      expect(summarizeDirectoryEntries(files)).toEqual({ count: 0, names: [] });
    });

    it("识别出所有目录条目", () => {
      const files = [
        { name: "docs", size: 0, type: "" },
        { name: "images", size: 0, type: "" },
        { name: "a.png", size: 100, type: "image/png" },
      ];
      const result = summarizeDirectoryEntries(files);
      expect(result.count).toBe(2);
      expect(result.names).toEqual(["docs", "images"]);
    });

    it("保持出现顺序", () => {
      const files = [
        { name: "z-dir", size: 0, type: "" },
        { name: "a-file.txt", size: 50, type: "text/plain" },
        { name: "a-dir", size: 0, type: "" },
        { name: "m-file.png", size: 100, type: "image/png" },
      ];
      const result = summarizeDirectoryEntries(files);
      expect(result.names).toEqual(["z-dir", "a-dir"]);
    });
  });

  // ---------------------------------------------------------------------------
  // C-6 文件夹拖入支持:expandDirectoryEntries
  // ---------------------------------------------------------------------------

  describe("expandDirectoryEntries", () => {
    function makeReader(map: Record<string, Array<{ name: string; isDirectory: boolean }>>) {
      return async (path: string) => {
        if (path in map) return map[path]!;
        throw new Error(`ENOENT: ${path}`);
      };
    }

    it("空路径列表返回空结果", async () => {
      const reader = makeReader({});
      const result = await expandDirectoryEntries([], reader);
      expect(result.files).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it("单层目录展开为子文件", async () => {
      const reader = makeReader({
        "/project": [
          { name: "src", isDirectory: true },
          { name: "README.md", isDirectory: false },
          { name: "package.json", isDirectory: false },
        ],
      });
      const result = await expandDirectoryEntries(["/project"], reader);
      expect(result.errors).toEqual([]);
      // 子目录作为 unknown 类别条目保留(超过 depth=1)
      expect(result.files.length).toBe(3);
      expect(result.files.map((f) => f.name).sort()).toEqual([
        "README.md",
        "package.json",
        "src",
      ]);
    });

    it("maxDepth=2 时递归展开一层", async () => {
      const reader = makeReader({
        "/project": [
          { name: "src", isDirectory: true },
          { name: "README.md", isDirectory: false },
        ],
        "/project/src": [
          { name: "index.ts", isDirectory: false },
          { name: "util.ts", isDirectory: false },
        ],
      });
      const result = await expandDirectoryEntries(["/project"], reader, { maxDepth: 2 });
      expect(result.errors).toEqual([]);
      // README.md + src/index.ts + src/util.ts
      const names = result.files.map((f) => f.name).sort();
      expect(names).toEqual(["README.md", "src/index.ts", "src/util.ts"]);
    });

    it("展开后保留扩展名推断(MIME / 分类 / 图标)", async () => {
      const reader = makeReader({
        "/project": [{ name: "photo.png", isDirectory: false }],
      });
      const result = await expandDirectoryEntries(["/project"], reader);
      expect(result.files[0]).toMatchObject({
        name: "photo.png",
        type: "image/png",
        category: "image",
        icon: "image",
        supported: true,
      });
    });

    it("不支持的扩展名 marked supported=false", async () => {
      const reader = makeReader({
        "/project": [{ name: "setup.exe", isDirectory: false }],
      });
      const result = await expandDirectoryEntries(["/project"], reader);
      expect(result.files[0]?.supported).toBe(false);
    });

    it("读目录失败时,errors 字段记录错误但不抛", async () => {
      const reader = async () => {
        throw new Error("permission denied");
      };
      const result = await expandDirectoryEntries(["/private"], reader);
      expect(result.files).toEqual([]);
      expect(result.errors).toEqual([
        { path: "/private", message: "permission denied" },
      ]);
    });

    it("部分失败:成功的目录正常展开,失败的目录进 errors", async () => {
      const reader = makeReader({
        "/ok": [{ name: "a.txt", isDirectory: false }],
      });
      const result = await expandDirectoryEntries(["/ok", "/fail"], reader);
      expect(result.files.map((f) => f.name)).toEqual(["a.txt"]);
      expect(result.errors).toEqual([
        { path: "/fail", message: expect.stringContaining("ENOENT") },
      ]);
    });

    it("Windows 反斜杠路径拼接", async () => {
      const reader = makeReader({
        "C:\\project": [
          { name: "src", isDirectory: true },
          { name: "a.txt", isDirectory: false },
        ],
      });
      const result = await expandDirectoryEntries(["C:\\project"], reader, { maxDepth: 1 });
      // 顶层子目录作为 unknown 保留
      const names = result.files.map((f) => f.name).sort();
      expect(names).toEqual(["a.txt", "src"]);
    });
  });

  // ---------------------------------------------------------------------------
  // C-6 文件夹拖入支持:mergeExpandedDirectoryEntries
  // ---------------------------------------------------------------------------

  describe("mergeExpandedDirectoryEntries", () => {
    function makeFile(name: string, size = 0): FileInfo {
      return {
        name,
        size,
        type: "application/octet-stream",
        category: "data",
        icon: "database",
        supported: true,
      };
    }
    function makeDir(name: string): FileInfo {
      return {
        name,
        size: 0,
        type: "",
        category: "unknown",
        icon: "file",
        supported: false,
      };
    }

    it("无目录时直接返回原始列表", () => {
      const original = [makeFile("a.png"), makeFile("b.txt")];
      const expanded = [makeFile("a.png"), makeFile("b.txt")];
      const result = mergeExpandedDirectoryEntries(original, expanded);
      expect(result).toEqual(original);
    });

    it("目录被展开为子文件,目录条目本身被移除", () => {
      const original = [makeDir("docs"), makeFile("a.png")];
      const expanded = [
        makeFile("docs/intro.md"),
        makeFile("docs/spec.md"),
      ];
      const result = mergeExpandedDirectoryEntries(original, expanded);
      expect(result).toEqual([
        makeFile("docs/intro.md"),
        makeFile("docs/spec.md"),
        makeFile("a.png"),
      ]);
    });

    it("保持原始顺序(目录在前,文件在后)", () => {
      const original = [makeFile("a.png"), makeDir("docs"), makeFile("b.txt")];
      const expanded = [
        makeFile("docs/intro.md"),
        makeFile("docs/spec.md"),
      ];
      const result = mergeExpandedDirectoryEntries(original, expanded);
      expect(result.map((f) => f.name)).toEqual([
        "a.png",
        "docs/intro.md",
        "docs/spec.md",
        "b.txt",
      ]);
    });

    it("展开结果为空时,目录被移除不留占位", () => {
      const original = [makeDir("empty-dir"), makeFile("a.png")];
      const expanded: FileInfo[] = [];
      const result = mergeExpandedDirectoryEntries(original, expanded);
      expect(result).toEqual([makeFile("a.png")]);
    });

    it("多个目录各自展开并保持各自位置", () => {
      const original = [
        makeDir("dir-a"),
        makeDir("dir-b"),
        makeFile("standalone.txt"),
      ];
      const expanded = [
        makeFile("dir-a/1.md"),
        makeFile("dir-b/1.md"),
        makeFile("dir-b/2.md"),
      ];
      const result = mergeExpandedDirectoryEntries(original, expanded);
      expect(result.map((f) => f.name)).toEqual([
        "dir-a/1.md",
        "dir-b/1.md",
        "dir-b/2.md",
        "standalone.txt",
      ]);
    });
  });
});
