/**
 * @file DiagnosticsPanel 组件单元测试
 *
 * 覆盖目标：
 * - 加载日志（diagnostics_get_logs）
 * - 过滤日志（按级别）
 * - 搜索日志
 * - 清除日志（diagnostics_clear_logs）
 * - 导出诊断包（diagnostics_export_zip）
 * - 打开文件夹（diagnostics_reveal_in_folder）
 * - 复制日志
 * - 报告问题（diagnostics_report_issue）
 *
 * 注意：通过 mock @tauri-apps/api/core 的 invoke 实现 Tauri 命令模拟
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// 模拟 Tauri invoke（与 @tauri-apps/api/core 行为一致：args 未传时不进入 spy 参数）
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) =>
    args === undefined ? mockInvoke(cmd) : mockInvoke(cmd, args),
}));

// 模拟 toast
const mockToastAdd = vi.fn();
vi.mock("./ui/toast", () => ({
  toastManager: {
    add: (toast: unknown) => mockToastAdd(toast),
  },
}));

import { DiagnosticsPanel } from "./DiagnosticsPanel";

const MOCK_LOGS = [
  {
    timestamp: "2024-01-15T10:30:00.000Z",
    level: "INFO",
    line: "Application started",
  },
  {
    timestamp: "2024-01-15T10:30:01.000Z",
    level: "ERROR",
    line: "Failed to connect",
  },
  {
    timestamp: "2024-01-15T10:30:02.000Z",
    level: "WARN",
    line: "Slow response detected",
  },
];

describe("DiagnosticsPanel", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockToastAdd.mockReset();
    document.body.innerHTML = "";
    // 模拟 navigator.clipboard
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("初始加载时调用 diagnostics_get_logs", async () => {
    mockInvoke.mockResolvedValueOnce(MOCK_LOGS);
    render(<DiagnosticsPanel />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("diagnostics_get_logs");
    });
  });

  it("加载后渲染日志列表", async () => {
    mockInvoke.mockResolvedValue(MOCK_LOGS);
    render(<DiagnosticsPanel />);
    await waitFor(() => {
      expect(screen.getByText("Application started")).toBeDefined();
      expect(screen.getByText("Failed to connect")).toBeDefined();
      expect(screen.getByText("Slow response detected")).toBeDefined();
    });
  });

  it("无日志时显示占位", async () => {
    mockInvoke.mockResolvedValue([]);
    render(<DiagnosticsPanel />);
    await waitFor(() => {
      expect(screen.getByText("暂无日志")).toBeDefined();
    });
  });

  it("清除按钮调用 diagnostics_clear_logs", async () => {
    mockInvoke.mockResolvedValueOnce(MOCK_LOGS);
    mockInvoke.mockResolvedValueOnce(undefined); // clear

    render(<DiagnosticsPanel />);
    await waitFor(() => {
      expect(screen.getByText("Application started")).toBeDefined();
    });

    const clearButton = screen.getByLabelText("清除日志");
    fireEvent.click(clearButton);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("diagnostics_clear_logs");
    });
  });

  it("导出按钮调用 diagnostics_export_zip 并显示打开文件夹", async () => {
    const exportPath = "/tmp/diagnostics-20240115";
    mockInvoke.mockResolvedValueOnce(MOCK_LOGS);
    mockInvoke.mockResolvedValueOnce(exportPath);

    render(<DiagnosticsPanel />);
    await waitFor(() => {
      expect(screen.getByText("Application started")).toBeDefined();
    });

    const exportButton = screen.getByText("导出");
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("diagnostics_export_zip");
    });

    await waitFor(() => {
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "success",
          title: "导出成功",
          actionProps: expect.objectContaining({
            children: "打开文件夹",
          }),
        }),
      );
    });

    // "打开文件夹" 按钮出现在工具栏
    await waitFor(() => {
      expect(screen.getByTestId("diagnostics-reveal-in-folder")).toBeDefined();
    });
  });

  it("导出失败时显示错误 toast", async () => {
    mockInvoke.mockResolvedValueOnce(MOCK_LOGS);
    mockInvoke.mockRejectedValueOnce(new Error("导出失败原因"));

    render(<DiagnosticsPanel />);
    await waitFor(() => {
      expect(screen.getByText("Application started")).toBeDefined();
    });

    const exportButton = screen.getByText("导出");
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          title: "导出失败",
        }),
      );
    });
  });

  it("打开文件夹按钮调用 diagnostics_reveal_in_folder", async () => {
    const exportPath = "/tmp/diagnostics-20240115";
    mockInvoke.mockResolvedValueOnce(MOCK_LOGS);
    mockInvoke.mockResolvedValueOnce(exportPath);
    mockInvoke.mockResolvedValueOnce(undefined); // reveal

    render(<DiagnosticsPanel />);
    await waitFor(() => {
      expect(screen.getByText("Application started")).toBeDefined();
    });

    // 先点击导出
    const exportButton = screen.getByText("导出");
    fireEvent.click(exportButton);

    // 等待打开文件夹按钮出现
    const revealButton = await screen.findByTestId("diagnostics-reveal-in-folder");
    fireEvent.click(revealButton);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("diagnostics_reveal_in_folder", {
        path: exportPath,
      });
    });
  });

  it("打开文件夹失败时显示错误 toast", async () => {
    const exportPath = "/tmp/diagnostics-20240115";
    mockInvoke.mockResolvedValueOnce(MOCK_LOGS);
    mockInvoke.mockResolvedValueOnce(exportPath);
    mockInvoke.mockRejectedValueOnce(new Error("文件管理器启动失败"));

    render(<DiagnosticsPanel />);
    await waitFor(() => {
      expect(screen.getByText("Application started")).toBeDefined();
    });

    // 先点击导出
    const exportButton = screen.getByText("导出");
    fireEvent.click(exportButton);

    // 点击打开文件夹
    const revealButton = await screen.findByTestId("diagnostics-reveal-in-folder");
    fireEvent.click(revealButton);

    await waitFor(() => {
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          title: "打开文件夹失败",
        }),
      );
    });
  });

  it("报告问题按钮调用 diagnostics_report_issue 并打开浏览器", async () => {
    const issueUrl = "https://github.com/example/repo/issues/new?title=test";
    mockInvoke.mockResolvedValueOnce(MOCK_LOGS);
    mockInvoke.mockResolvedValueOnce(issueUrl);

    // 模拟 window.open
    const mockOpen = vi.fn();
    Object.defineProperty(window, "open", {
      value: mockOpen,
      writable: true,
      configurable: true,
    });

    render(<DiagnosticsPanel />);
    await waitFor(() => {
      expect(screen.getByText("Application started")).toBeDefined();
    });

    const reportButton = screen.getByText("报告问题");
    fireEvent.click(reportButton);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("diagnostics_report_issue");
    });

    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalledWith(issueUrl, "_blank");
    });
  });

  it("报告问题失败时显示错误 toast", async () => {
    mockInvoke.mockResolvedValueOnce(MOCK_LOGS);
    mockInvoke.mockRejectedValueOnce(new Error("生成 URL 失败"));

    render(<DiagnosticsPanel />);
    await waitFor(() => {
      expect(screen.getByText("Application started")).toBeDefined();
    });

    const reportButton = screen.getByText("报告问题");
    fireEvent.click(reportButton);

    await waitFor(() => {
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          title: "生成报告失败",
        }),
      );
    });
  });

  it("导出失败时不应显示打开文件夹按钮", async () => {
    mockInvoke.mockResolvedValueOnce(MOCK_LOGS);
    mockInvoke.mockRejectedValueOnce(new Error("导出失败"));

    render(<DiagnosticsPanel />);
    await waitFor(() => {
      expect(screen.getByText("Application started")).toBeDefined();
    });

    const exportButton = screen.getByText("导出");
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error" }),
      );
    });

    // 打开文件夹按钮不应出现
    expect(screen.queryByTestId("diagnostics-reveal-in-folder")).toBeNull();
  });

  it("日志底部展示总数和自动刷新提示", async () => {
    mockInvoke.mockResolvedValue(MOCK_LOGS);
    render(<DiagnosticsPanel />);
    await waitFor(() => {
      expect(screen.getByText("共 3 条日志")).toBeDefined();
      expect(screen.getByText("自动刷新: 2s")).toBeDefined();
    });
  });
});
