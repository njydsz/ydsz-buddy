/**
 * @file providerDiscovery 单元测试
 *
 * 覆盖 Provider 发现工具函数：CWD 解析、搜索文本归一化、技能/插件/命令搜索文本块构建。
 *
 * 关键覆盖：
 *
 * 1. resolveProviderDiscoveryCwd - 工作目录优先级（thread worktree > project > server）
 * 2. normalizeProviderDiscoveryText - 大小写、分隔符、多余空白归一化
 * 3. buildSkillSearchBlob - 技能名称/描述合并
 * 4. isInstalledProviderPlugin - 已安装判定（含默认安装策略）
 * 5. buildPluginSearchBlob - 插件多字段合并
 * 6. buildCommandSearchBlob - 命令搜索文本
 * 7. formatSkillScope - 作用域首字母大写
 */

import { describe, expect, it } from "vitest";

import {
  buildCommandSearchBlob,
  buildPluginSearchBlob,
  buildSkillSearchBlob,
  formatSkillScope,
  isInstalledProviderPlugin,
  normalizeProviderDiscoveryText,
  resolveProviderDiscoveryCwd,
} from "./providerDiscovery";

describe("providerDiscovery", () => {
  describe("resolveProviderDiscoveryCwd", () => {
    it("activeThreadWorktreePath 优先于其他", () => {
      expect(
        resolveProviderDiscoveryCwd({
          activeThreadWorktreePath: "/repo/.worktrees/feature",
          activeProjectCwd: "/repo",
          serverCwd: "/server",
        }),
      ).toBe("/repo/.worktrees/feature");
    });

    it("无 worktree 时使用 activeProjectCwd", () => {
      expect(
        resolveProviderDiscoveryCwd({
          activeThreadWorktreePath: null,
          activeProjectCwd: "/repo",
          serverCwd: "/server",
        }),
      ).toBe("/repo");
    });

    it("worktree 和 projectCwd 都为空时回退到 serverCwd", () => {
      expect(
        resolveProviderDiscoveryCwd({
          activeThreadWorktreePath: null,
          activeProjectCwd: null,
          serverCwd: "/server",
        }),
      ).toBe("/server");
    });

    it("全部为 null 时返回 null", () => {
      expect(
        resolveProviderDiscoveryCwd({
          activeThreadWorktreePath: null,
          activeProjectCwd: null,
          serverCwd: null,
        }),
      ).toBeNull();
    });

    it("serverCwd 为 null 但有其他 cwd 时返回其他", () => {
      expect(
        resolveProviderDiscoveryCwd({
          activeThreadWorktreePath: null,
          activeProjectCwd: "/repo",
          serverCwd: null,
        }),
      ).toBe("/repo");
    });
  });

  describe("normalizeProviderDiscoveryText", () => {
    it("undefined / 空字符串返回空字符串", () => {
      expect(normalizeProviderDiscoveryText(undefined)).toBe("");
      expect(normalizeProviderDiscoveryText("")).toBe("");
    });

    it("转小写", () => {
      expect(normalizeProviderDiscoveryText("HelloWorld")).toBe("helloworld");
    });

    it("替换 / : _ - 为空格", () => {
      expect(normalizeProviderDiscoveryText("foo/bar")).toBe("foo bar");
      expect(normalizeProviderDiscoveryText("foo:bar")).toBe("foo bar");
      expect(normalizeProviderDiscoveryText("foo_bar")).toBe("foo bar");
      expect(normalizeProviderDiscoveryText("foo-bar")).toBe("foo bar");
    });

    it("合并连续空白为单个空格", () => {
      expect(normalizeProviderDiscoveryText("foo   bar")).toBe("foo bar");
      expect(normalizeProviderDiscoveryText("foo\tbar")).toBe("foo bar");
      expect(normalizeProviderDiscoveryText("foo\nbar")).toBe("foo bar");
    });

    it("去除首尾空白", () => {
      expect(normalizeProviderDiscoveryText("  foo bar  ")).toBe("foo bar");
    });

    it("混合分隔符 + 多余空白", () => {
      expect(normalizeProviderDiscoveryText("  Foo/Bar__Baz-qux  ")).toBe("foo bar baz qux");
    });

    it("保留字母、数字、点(只归一化分隔符)", () => {
      expect(normalizeProviderDiscoveryText("Plugin-v2.0")).toBe("plugin v2.0");
    });
  });

  describe("buildSkillSearchBlob", () => {
    it("只读 name 字段", () => {
      expect(buildSkillSearchBlob({ name: "code-review" })).toBe("code review");
    });

    it("合并 name + interface.displayName + description", () => {
      expect(
        buildSkillSearchBlob({
          name: "code-review",
          description: "Reviews pull requests",
          interface: {
            displayName: "Code Review",
            shortDescription: "Review PRs quickly",
          },
        }),
      ).toBe("code review code review review prs quickly reviews pull requests");
    });

    it("空 interface 字段不会污染文本", () => {
      const result = buildSkillSearchBlob({
        name: "skill",
        description: "desc",
        interface: {
          displayName: undefined,
          shortDescription: undefined,
        },
      });
      expect(result).toBe("skill desc");
    });

    it("全部为空时返回空字符串", () => {
      const result = buildSkillSearchBlob({
        name: "",
        description: undefined,
        interface: {},
      });
      expect(result).toBe("");
    });
  });

  describe("isInstalledProviderPlugin", () => {
    it("installed=true 直接视为已安装", () => {
      expect(isInstalledProviderPlugin({ installed: true })).toBe(true);
    });

    it("enabled=true 视为已安装", () => {
      expect(isInstalledProviderPlugin({ installed: false, enabled: true })).toBe(true);
    });

    it("installPolicy=INSTALLED_BY_DEFAULT 视为已安装", () => {
      expect(
        isInstalledProviderPlugin({
          installed: false,
          enabled: false,
          installPolicy: "INSTALLED_BY_DEFAULT",
        }),
      ).toBe(true);
    });

    it("未安装且策略为 USER_INSTALLABLE 返回 false", () => {
      expect(
        isInstalledProviderPlugin({
          installed: false,
          enabled: false,
          installPolicy: "USER_INSTALLABLE",
        }),
      ).toBe(false);
    });

    it("未安装且无策略返回 false", () => {
      expect(isInstalledProviderPlugin({ installed: false })).toBe(false);
    });
  });

  describe("buildPluginSearchBlob", () => {
    it("只读 name 字段", () => {
      expect(buildPluginSearchBlob({ name: "git-integration" })).toBe("git integration");
    });

    it("合并多个 interface 字段", () => {
      expect(
        buildPluginSearchBlob({
          name: "git-integration",
          interface: {
            displayName: "Git Integration",
            shortDescription: "Git workflow support",
            category: "VCS",
            developerName: "Acme",
          },
        }),
      ).toBe(
        "git integration git integration git workflow support vcs acme",
      );
    });

    it("interface 为空对象时只取 name", () => {
      const result = buildPluginSearchBlob({
        name: "plugin",
        interface: {},
      });
      expect(result).toBe("plugin");
    });

    it("全部字段为空时返回空字符串", () => {
      expect(
        buildPluginSearchBlob({
          name: "",
          interface: {
            displayName: undefined,
            shortDescription: undefined,
            category: undefined,
            developerName: undefined,
          },
        }),
      ).toBe("");
    });
  });

  describe("buildCommandSearchBlob", () => {
    it("只读 name", () => {
      expect(buildCommandSearchBlob({ name: "init" })).toBe("init");
    });

    it("合并 name + description", () => {
      expect(
        buildCommandSearchBlob({
          name: "init",
          description: "Initialize a new project",
        }),
      ).toBe("init initialize a new project");
    });

    it("name 缺失 description 时只取 description", () => {
      // buildCommandSearchBlob 的实现只取 name + description
      // 测试 description 缺失时的行为
      const result = buildCommandSearchBlob({
        name: "ls",
        description: undefined,
      });
      expect(result).toBe("ls");
    });
  });

  describe("formatSkillScope", () => {
    it("undefined 返回 Personal", () => {
      expect(formatSkillScope(undefined)).toBe("Personal");
    });

    it("空字符串返回 Personal", () => {
      expect(formatSkillScope("")).toBe("Personal");
    });

    it("纯空白返回 Personal", () => {
      expect(formatSkillScope("   ")).toBe("Personal");
    });

    it("首字母大写其余不变", () => {
      expect(formatSkillScope("global")).toBe("Global");
      expect(formatSkillScope("project")).toBe("Project");
    });

    it("已大写首字母保持不变", () => {
      expect(formatSkillScope("Global")).toBe("Global");
    });

    it("trim 后才首字母大写", () => {
      expect(formatSkillScope("  global  ")).toBe("Global");
    });

    it("单字符也正常工作", () => {
      expect(formatSkillScope("a")).toBe("A");
    });
  });
});
