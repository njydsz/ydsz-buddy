/**
 * @file "新增内容"功能纯逻辑模块
 * @description 提供"新增内容"功能的无状态、纯函数辅助方法。
 * 包括版本号解析、比较、排序，以及根据当前版本和已读版本决定是否展示更新日志的决策逻辑。
 * 本模块不依赖 React、存储或更新日志数据，便于独立进行单元测试。
 * @layer 共享 UI 逻辑（可被 hook、组件和测试导入）
 */

/**
 * 单个功能亮点。参照 IndieDevs "feature card" 格式建模，
 * 每个条目可携带截图和更长的技术说明，而不仅仅是标题。
 *
 * `image`、`imageAlt` 和 `details` 为可选项——在没有视觉素材时，
 * 发布说明仍可以纯文本形式展示。
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
 * 单个发布版本条目。`version` 为 semver 格式的 `MAJOR.MINOR.PATCH` 字符串，
 * 需与 `apps/web/package.json` 中的 `version` 字段一致（通过 `import.meta.env.APP_VERSION` 镜像）。
 * `date` 为人类可读的标签，原样渲染（如 `"Apr 18"`），由作者控制格式。
 *
 * `heroImage` / `heroImageAlt` 为可选的宣传图，展示在更新后弹出的浮窗卡片上。
 * 省略时，卡片回退为渐变背景 + 图标——即使没有截图也能获得精致的入口。
 */
export interface WhatsNewEntry {
  readonly version: string;
  readonly date: string;
  readonly features: readonly WhatsNewFeature[];
  readonly heroImage?: string;
  readonly heroImageAlt?: string;
}

/**
 * 将 `MAJOR.MINOR.PATCH` 字符串解析为数值元组。
 * 非数字或缺失的段默认为 0，确保格式错误的版本号不会导致弹窗崩溃——
 * 只是排在最低可能值。
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
 * 三路版本比较。当 `a < b` 时返回负数，相等时返回零，`a > b` 时返回正数。
 * 可直接用于 `Array.sort`。
 */
export function compareVersions(a: string, b: string): number {
  const [majorA, minorA, patchA] = parseVersion(a);
  const [majorB, minorB, patchB] = parseVersion(b);
  if (majorA !== majorB) return majorA - majorB;
  if (minorA !== minorB) return minorA - minorB;
  return patchA - patchB;
}

/**
 * 按版本号降序排列（最新优先）返回条目列表。
 * 这是所有向用户展示发布列表的"展示顺序"标准——更新后弹窗和设置页面
 * 均通过此函数排序，避免两个视图出现顺序不一致。
 */
export function sortEntriesByVersionDesc(
  entries: readonly WhatsNewEntry[],
): readonly WhatsNewEntry[] {
  return entries.toSorted((left, right) => compareVersions(right.version, left.version));
}

/**
 * `resolveWhatsNewState` 的输入参数。保持为普通对象，
 * 便于 hook 直接传入已有的数据结构，无需额外参数拼接。
 */
export interface WhatsNewInputs {
  /** 构建时已知的所有更新日志条目，顺序不限 */
  readonly entries: readonly WhatsNewEntry[];
  /** 当前安装的应用版本（`import.meta.env.APP_VERSION`） */
  readonly currentVersion: string;
  /**
   * 用户上次确认的版本。`null` 表示"从未关闭过新增内容弹窗"，
   * 首次启动时视为全新安装——静默标记当前版本为已读，
   * 而不是展示完整的历史更新日志。
   */
  readonly lastSeenVersion: string | null;
}

/**
 * `resolveWhatsNewState` 返回的决策结果：
 *
 * - `show`：当前版本有对应的发布日志条目。`currentEntry` 驱动默认的"新增内容"视图；
 *   `allEntries` 为完整历史，用于"完整更新日志"二级视图。关闭时持久化 `nextLastSeenVersion`。
 * - `silent-bootstrap`：首次启动或本次升级没有对应的日志条目——不弹窗，
 *   仅记录 `nextLastSeenVersion`，避免向用户堆砌历史或每次启动重复判断。
 * - `noop`：无需操作。用户已是最新版本，或当前版本比已读版本更旧（如降级）。
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
 * 根据当前版本、用户已读版本和已知的更新日志条目，计算弹窗应执行的操作。
 * 这是规则唯一的定义位置，hook 和测试均通过此函数执行。
 *
 * IndieDevs 风格的弹窗始终锚定在当前版本的发布条目上，
 * 然后提供完整更新日志作为二级视图。因此不会尝试将"所有跳过的版本"
 * 合并到主视图中——仅确认当前版本有日志条目并展示，
 * 由手风琴组件处理历史记录。
 */
export function resolveWhatsNewState(inputs: WhatsNewInputs): WhatsNewState {
  const { entries, currentVersion, lastSeenVersion } = inputs;

  // 首次启动：记录当前版本并保持静默。向全新用户展示"新增内容"弹窗
  // 会让人感觉像营销垃圾。
  if (lastSeenVersion === null) {
    return { kind: "silent-bootstrap", nextLastSeenVersion: currentVersion };
  }

  // 已是最新版本，或用户降级了。无论哪种情况，都不展示任何内容——
  // 标记只向前移动，不回退。
  if (compareVersions(currentVersion, lastSeenVersion) <= 0) {
    return { kind: "noop" };
  }

  const currentEntry = entries.find(
    (entry) => compareVersions(entry.version, currentVersion) === 0,
  );
  if (!currentEntry) {
    // 当前安装版本没有对应的日志条目——静默推进标记，
    // 避免每次启动重复判断。
    return { kind: "silent-bootstrap", nextLastSeenVersion: currentVersion };
  }

  return {
    kind: "show",
    currentEntry,
    allEntries: sortEntriesByVersionDesc(entries),
    nextLastSeenVersion: currentVersion,
  };
}
