/**
 * @fileoverview "What's New" 纯逻辑模块
 * @description "What's New" 界面的纯、无状态辅助函数。
 * @layer 共享 UI 逻辑层(可被 Hook、组件和测试导入)。
 * @depends 仅依赖下方的类型,不依赖任何运行时依赖。
 *
 * @remarks
 * 此处逻辑故意避免使用 React、存储和更新日志数据。
 * 这使得我们可以在隔离环境中对版本计算和选择规则进行单元测试,
 * 并保持 Hook 层轻薄。
 */

/**
 * 版本更新中的一个功能亮点。模仿 IndieDevs 的"功能卡片"格式,
 * 以便每个要点都可以携带截图和更长的技术说明,而不只是一个标题。
 *
 * `image`、`imageAlt` 和 `details` 都是可选的……
 * 当视觉资源尚未准备好时,版本仍然可以只有文本说明。
 */
export interface WhatsNewFeature {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly image?: string;
  readonly imageAlt?: string;
  readonly details?: string;
}

/**
 * 单个版本更新条目。`version` 是类似 semver 的 `MAJOR.MINOR.PATCH` 字符串,
 * 与 `apps/web/package.json` 中的 `version` 字段匹配(镜像到 `import.meta.env.APP_VERSION`)。
 * `date` 是人类可读的标签,原样渲染(如 `"Apr 18"`),所以作者控制格式。
 *
 * `heroImage` / `heroImageAlt` 是可选的插图,显示在更新后弹出卡片上
 * (左下角的"新: ..."小标签)。当省略时,卡片回退到渐变 + 图标……
 * 所以没有截图的版本仍然有一个精美的入口。
 */
export interface WhatsNewEntry {
  readonly version: string;
  readonly date: string;
  readonly features: readonly WhatsNewFeature[];
  readonly heroImage?: string;
  readonly heroImageAlt?: string;
}

/**
 * 将 `MAJOR.MINOR.PATCH` 字符串解析为数字元组。非数字或缺失的段回退到 0,
 * 以便格式错误的版本永远不会导致对话框崩溃……它只是排序为可能的最低值。
 */
export function parseVersion(version: string): readonly [number, number, number] {
  const [rawMajor = "0", rawMinor = "0", rawPatch = "0"] = version.split(".");
  const major = Number.parseInt(rawMajor, 10);
  const minor = Number.parseInt(rawMinor, 10);
  const patch = Number.parseInt(rawPatch, 10);
  return [
    Number.isFinite(major) ? major : 0,
    Number.isFinite(minor) ? minor : 0,
    Number.isFinite(patch) ? patch : 0,
  ] as const;
}

/**
 * Three-way version comparison. Returns a negative number when `a < b`, zero
 * when equal, and a positive number when `a > b`. Suitable for `Array.sort`.
 */
export function compareVersions(a: string, b: string): number {
  const [majorA, minorA, patchA] = parseVersion(a);
  const [majorB, minorB, patchB] = parseVersion(b);
  if (majorA !== majorB) return majorA - majorB;
  if (minorA !== minorB) return minorA - minorB;
  return patchA - patchB;
}

/**
 * Return the given entries sorted by version in descending order (newest
 * first). This is the canonical "display order" used everywhere we present a
 * list of releases to the user …both the post-update dialog and the
 * settings surface go through here to avoid drift between the two views.
 */
export function sortEntriesByVersionDesc(
  entries: readonly WhatsNewEntry[],
): readonly WhatsNewEntry[] {
  return entries.toSorted((left, right) => compareVersions(right.version, left.version));
}

/**
 * `resolveWhatsNewState` 的输入。保持为普通对象,
 * 以便 Hook 可以传递它已有的相同形状……无需参数 juggling。
 */
/**
 * `WhatsNewInputs` 对象的类型定义
 */
export interface WhatsNewInputs {
  /** 构建时已知的所有更新日志条目。顺序不假设。 */
  readonly entries: readonly WhatsNewEntry[];
  /** 当前安装的应用版本 (`import.meta.env.APP_VERSION`)。 */
  readonly currentVersion: string;
  /**
   * 用户上次确认的版本。`null` 表示"从未关闭过 What's New 对话框",
   * 这在首次启动时被视为全新安装……
   * 我们静默将当前版本标记为已读,而不是显示整个历史更新日志。
   */
  readonly lastSeenVersion: string | null;
}

/**
 * `resolveWhatsNewState` 返回的决策:
 *
 * - `show`: 有匹配当前版本的精选版本条目。
 *   `currentEntry` 驱动默认的"What's new?"视图; `allEntries` 是
 *   "完整更新日志"次级视图的全部历史。关闭时,持久化 `nextLastSeenVersion`。
 * - `silent-bootstrap`: 首次启动或此升级没有精选条目 ——
 *   不显示对话框,只记录 `nextLastSeenVersion`,这样我们就不会向用户
 *   倾倒积压的更新日志,也不会在每次启动时重新评估。
 * - `noop`: 什么都不做。要么用户已是最新版本,要么当前版本比他们已看到的更旧
 *   (例如降级)。
 */
export type WhatsNewState =
  | {
      readonly kind: "show";
      readonly currentEntry: WhatsNewEntry;
      readonly allEntries: readonly WhatsNewEntry[];
      readonly nextLastSeenVersion: string;
    }
  | {
      readonly kind: "silent-bootstrap";
      readonly nextLastSeenVersion: string;
    }
  | { readonly kind: "noop" };

/**
 * 根据当前版本、用户上次看到的版本和已知的更新日志条目,
 * 计算对话框应该做什么。这是规则所在单一位置;
 * Hook 和测试都经过这里。
 *
 * IndieDevs 风格的对话框总是锚定在*当前*版本条目
 * (匹配 `currentVersion` 的那个),然后提供完整更新日志作为次级视图。
 * 所以这里我们不尝试将"所有跳过的版本"批量放入主视图……
 * 我们只是确认当前版本有精选说明并显示它们,
 * 让手风琴处理历史记录。
 */
export function resolveWhatsNewState(inputs: WhatsNewInputs): WhatsNewState {
  const { entries, currentVersion, lastSeenVersion } = inputs;

  // First-ever launch: record the current version and stay quiet. Showing a
  // "What's new" dialog to a brand-new user on their first boot would feel
  // like marketing spam.
  if (lastSeenVersion === null) {
    return { kind: "silent-bootstrap", nextLastSeenVersion: currentVersion };
  }

  // Already up to date, or the user somehow downgraded. Either way, don't
  // surface anything …we only move the marker forward, never backward.
  if (compareVersions(currentVersion, lastSeenVersion) <= 0) {
    return { kind: "noop" };
  }

  const currentEntry = entries.find(
    (entry) => compareVersions(entry.version, currentVersion) === 0,
  );
  if (!currentEntry) {
    // No curated notes for the installed build …silently advance so we
    // don't re-evaluate on every launch.
    return { kind: "silent-bootstrap", nextLastSeenVersion: currentVersion };
  }

  return {
    kind: "show",
    currentEntry,
    allEntries: sortEntriesByVersionDesc(entries),
    nextLastSeenVersion: currentVersion,
  };
}
