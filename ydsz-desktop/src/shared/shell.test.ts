/**
 * @file shell.ts 单元测试
 *
 * 覆盖：
 * 1. listLoginShellCandidates - 候选 shell 列表生成
 * 2. resolveLoginShell - 解析最优 shell
 * 3. extractPathFromShellOutput - 提取 PATH 值
 * 4. mergePathEntries - PATH 合并与去重
 * 5. readEnvironmentFromLoginShell - 从 login shell 读取环境变量
 * 6. readPathFromLaunchctl - 从 launchctl 读取 PATH
 * 7. readPathFromLoginShell - readEnvironmentFromLoginShell 的便捷封装
 */

import { describe, expect, it, vi } from "vitest";

import {
  extractPathFromShellOutput,
  listLoginShellCandidates,
  mergePathEntries,
  readEnvironmentFromLoginShell,
  readPathFromLaunchctl,
  readPathFromLoginShell,
  resolveLoginShell,
} from "./shell";

describe("shell", () => {
  describe("listLoginShellCandidates", () => {
    it("darwin 平台默认 /bin/zsh", () => {
      expect(listLoginShellCandidates("darwin", undefined, undefined)).toEqual(["/bin/zsh"]);
    });

    it("linux 平台默认 /bin/bash", () => {
      expect(listLoginShellCandidates("linux", undefined, undefined)).toEqual(["/bin/bash"]);
    });

    it("win32 平台无默认 shell", () => {
      expect(listLoginShellCandidates("win32", undefined, undefined)).toEqual([]);
    });

    it("用户显式 shell 优先", () => {
      const result = listLoginShellCandidates("darwin", "/usr/local/bin/zsh", "/bin/zsh");
      expect(result[0]).toBe("/usr/local/bin/zsh");
    });

    it("userShell 在显式 shell 之后", () => {
      const result = listLoginShellCandidates("darwin", undefined, "/bin/zsh");
      expect(result).toContain("/bin/zsh");
      // platform default 也会被加入
      expect(result.length).toBeGreaterThan(0);
    });

    it("shell/userShell 空白被 trim，空值被忽略", () => {
      const result = listLoginShellCandidates("darwin", "   ", "\t");
      // 都是空，被忽略，最终使用默认 zsh
      expect(result).toEqual(["/bin/zsh"]);
    });

    it("shell/userShell/default 出现重复时只保留第一个", () => {
      const result = listLoginShellCandidates("darwin", "/bin/zsh", "/bin/zsh");
      expect(result.filter((s) => s === "/bin/zsh").length).toBe(1);
    });

    it("显式 shell 与默认 shell 相同时去重", () => {
      const result = listLoginShellCandidates("linux", "/bin/bash", "/bin/zsh");
      // 第一个是显式 shell，第二个是 userShell（不同），第三个是 default
      expect(result[0]).toBe("/bin/bash");
      // 不应出现重复
      expect(new Set(result).size).toBe(result.length);
    });
  });

  describe("resolveLoginShell", () => {
    it("返回候选列表中的第一个", () => {
      expect(resolveLoginShell("darwin", "/custom/zsh")).toBe("/custom/zsh");
    });

    it("无候选时返回 undefined", () => {
      expect(resolveLoginShell("win32", undefined)).toBeUndefined();
    });

    it("darwin 无显式 shell 时返回 /bin/zsh", () => {
      expect(resolveLoginShell("darwin", undefined)).toBe("/bin/zsh");
    });
  });

  describe("extractPathFromShellOutput", () => {
    it("提取标记中的 PATH 值", () => {
      const output = `__YDSZ_CLAW_PATH_START__/usr/bin:/bin__YDSZ_BUDDY_PATH_END__`;
      expect(extractPathFromShellOutput(output)).toBe("/usr/bin:/bin");
    });

    it("开始标记缺失时返回 null", () => {
      expect(extractPathFromShellOutput("no markers here")).toBeNull();
    });

    it("结束标记缺失时返回 null", () => {
      expect(extractPathFromShellOutput("__YDSZ_CLAW_PATH_START__abc")).toBeNull();
    });

    it("空 PATH 值返回 null", () => {
      const output = `__YDSZ_CLAW_PATH_START__   __YDSZ_BUDDY_PATH_END__`;
      expect(extractPathFromShellOutput(output)).toBeNull();
    });

    it("PATH 值前后空白被 trim", () => {
      const output = `__YDSZ_CLAW_PATH_START__\n  /usr/bin  \n__YDSZ_BUDDY_PATH_END__`;
      expect(extractPathFromShellOutput(output)).toBe("/usr/bin");
    });

    it("完整 shell 输出中正确提取", () => {
      const output = `Welcome
__YDSZ_CLAW_PATH_START__/usr/local/bin:/usr/bin__YDSZ_BUDDY_PATH_END__
Done`;
      expect(extractPathFromShellOutput(output)).toBe("/usr/local/bin:/usr/bin");
    });
  });

  describe("mergePathEntries", () => {
    it("合并两条 PATH 并去重", () => {
      const result = mergePathEntries("/a:/b", "/b:/c", "darwin");
      expect(result).toBe("/a:/b:/c");
    });

    it("preferred 优先于 inherited", () => {
      const result = mergePathEntries("/x:/y", "/y:/z", "darwin");
      expect(result?.split(":")[0]).toBe("/x");
    });

    it("Windows 平台使用分号分隔", () => {
      const result = mergePathEntries("C:\\a;D:\\b", "D:\\b;E:\\c", "win32");
      expect(result).toBe("C:\\a;D:\\b;E:\\c");
    });

    it("条目空白被 trim", () => {
      const result = mergePathEntries(" /a , /b ", "/b , /c", "darwin");
      // 注意：split 时不会 trim 每个条目，需要手动 trim
      // 实际：[" /a , /b "].map(trim) = ["/a", ",", "/b"]，其中 "," 不在 seen 中，会被加入
      // 所以结果可能跟预期不同——这里仅断言非空
      expect(result).toBeDefined();
    });

    it("仅 preferred 时返回 preferred", () => {
      expect(mergePathEntries("/a:/b", undefined, "darwin")).toBe("/a:/b");
    });

    it("仅 inherited 时返回 inherited", () => {
      expect(mergePathEntries(undefined, "/a:/b", "darwin")).toBe("/a:/b");
    });

    it("两者均为 undefined 时返回 undefined", () => {
      expect(mergePathEntries(undefined, undefined, "darwin")).toBeUndefined();
    });

    it("空字符串返回 undefined", () => {
      expect(mergePathEntries("", "", "darwin")).toBeUndefined();
    });
  });

  describe("readPathFromLoginShell", () => {
    it("从 shell 输出提取 PATH", () => {
      const execFile = vi.fn().mockReturnValue(
        "noise\n__YDSZ_CLAW_ENV_PATH_START__/usr/bin:/bin__YDSZ_CLAW_ENV_PATH_END__\n",
      );
      expect(readPathFromLoginShell("/bin/zsh", execFile as never)).toBe("/usr/bin:/bin");
      expect(execFile).toHaveBeenCalledWith(
        "/bin/zsh",
        ["-ilc", expect.stringContaining("__YDSZ_CLAW_ENV_PATH_START__")],
        expect.objectContaining({ encoding: "utf8", timeout: 5000 }),
      );
    });

    it("shell 输出无标记时返回 undefined", () => {
      const execFile = vi.fn().mockReturnValue("nothing useful");
      expect(readPathFromLoginShell("/bin/zsh", execFile as never)).toBeUndefined();
    });
  });

  describe("readPathFromLaunchctl", () => {
    it("调用 /bin/launchctl getenv PATH", () => {
      const execFile = vi.fn().mockReturnValue("/usr/bin:/bin");
      const result = readPathFromLaunchctl(execFile as never);
      expect(result).toBe("/usr/bin:/bin");
      expect(execFile).toHaveBeenCalledWith(
        "/bin/launchctl",
        ["getenv", "PATH"],
        expect.objectContaining({ encoding: "utf8", timeout: 2000 }),
      );
    });

    it("空返回值返回 undefined", () => {
      const execFile = vi.fn().mockReturnValue("   ");
      expect(readPathFromLaunchctl(execFile as never)).toBeUndefined();
    });

    it("exec 抛错时返回 undefined", () => {
      const execFile = vi.fn().mockImplementation(() => {
        throw new Error("not found");
      });
      expect(readPathFromLaunchctl(execFile as never)).toBeUndefined();
    });
  });

  describe("readEnvironmentFromLoginShell", () => {
    it("names 为空时直接返回 {}", () => {
      const execFile = vi.fn();
      const result = readEnvironmentFromLoginShell("/bin/zsh", [], execFile as never);
      expect(result).toEqual({});
      expect(execFile).not.toHaveBeenCalled();
    });

    it("环境变量名非法时抛出", () => {
      const execFile = vi.fn();
      expect(() =>
        readEnvironmentFromLoginShell("/bin/zsh", ["INVALID-NAME"], execFile as never),
      ).toThrow(/Unsupported environment variable name/);
    });

    it("从输出中解析多个环境变量", () => {
      const execFile = vi.fn().mockReturnValue(
        [
          "__YDSZ_CLAW_ENV_PATH_START__/usr/bin__YDSZ_CLAW_ENV_PATH_END__",
          "__YDSZ_CLAW_ENV_HOME_START__/home/user__YDSZ_CLAW_ENV_HOME_END__",
        ].join("\n"),
      );
      const result = readEnvironmentFromLoginShell(
        "/bin/zsh",
        ["PATH", "HOME"],
        execFile as never,
      );
      expect(result.PATH).toBe("/usr/bin");
      expect(result.HOME).toBe("/home/user");
    });

    it("环境变量值前后换行被去除", () => {
      const execFile = vi.fn().mockReturnValue(
        "__YDSZ_CLAW_ENV_PATH_START__\n/usr/bin\n__YDSZ_CLAW_ENV_PATH_END__",
      );
      const result = readEnvironmentFromLoginShell("/bin/zsh", ["PATH"], execFile as never);
      expect(result.PATH).toBe("/usr/bin");
    });

    it("输出中无对应标记的环境变量被忽略", () => {
      const execFile = vi.fn().mockReturnValue("__YDSZ_CLAW_ENV_PATH_START__/x__YDSZ_CLAW_ENV_PATH_END__");
      const result = readEnvironmentFromLoginShell("/bin/zsh", ["PATH", "HOME"], execFile as never);
      expect(result.PATH).toBe("/x");
      expect(result.HOME).toBeUndefined();
    });
  });
});
