/**
 * @file TerminalChrome.tsx
 * @description 缁堢澶栧３锛圕hrome锛夊彲澶嶇敤鐨?UI 鍘熻锛岀敤浜庢覆鏌撶粓绔爣绛炬爮銆佷晶杈规爮鍜屽伐鍏锋爮鎿嶄綔鎸夐挳銆? * 鍖呭惈缁堢鏍囩椤垫爮銆佷晶杈规爮鍒楄〃銆佹搷浣滄寜閽粍绛夋牳蹇?UI 缁勪欢銆? */

import type { ReactNode } from "react";

import type {
  ResolvedTerminalVisualIdentity,
  TerminalVisualState,
} from "~/shared/terminalThreads";

import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { XIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";

import type { ResolvedTerminalGroupLayout } from "./TerminalLayout";
import TerminalActivityIndicator from "./TerminalActivityIndicator";
import TerminalIdentityIcon from "./TerminalIdentityIcon";

/**
 * 鏍规嵁缁堢瑙嗚鐘舵€佽繑鍥炰紭鍏堢骇鏁板€硷紝鏁板€艰秺澶т紭鍏堢骇瓒婇珮銆? * 鐢ㄤ簬鍦ㄦ爣绛炬爮涓喅瀹氭樉绀哄摢涓粓绔殑鐘舵€佹寚绀哄櫒銆? *
 * @param state - 缁堢瑙嗚鐘舵€? * @returns 浼樺厛绾ф暟鍊硷紙1-4锛? */
function terminalVisualStatePriority(state: TerminalVisualState): number {
  switch (state) {
    case "attention":
      return 4;
    case "running":
      return 3;
    case "review":
      return 2;
    case "idle":
      return 1;
  }
}

/**
 * 缁堢宸ュ叿鏍忔搷浣滈」閰嶇疆锛屾弿杩颁竴涓彲鐐瑰嚮鐨勬搷浣滄寜閽€? */
export interface TerminalChromeActionItem {
  /** 鏄惁绂佺敤璇ユ搷浣?*/
  disabled?: boolean;
  /** 鎿嶄綔鐨勬枃鏈爣绛撅紝鍚屾椂浣滀负 tooltip 灞曠ず */
  label: string;
  /** 鐐瑰嚮鏃剁殑鍥炶皟鍑芥暟 */
  onClick: () => void;
  /** 鎸夐挳鍐呭锛岄€氬父涓哄浘鏍?*/
  children: ReactNode;
}

/**
 * 缁堢鎿嶄綔鎸夐挳鐨勫唴閮?props锛屽皝瑁呬簡甯?tooltip 鐨勬寜閽氦浜掋€? */
interface TerminalActionButtonProps {
  /** 鎸夐挳鐨?aria-label 鍙?tooltip 鏂囨湰 */
  label: string;
  /** 鑷畾涔夋牱寮忕被鍚?*/
  className: string;
  /** 鐐瑰嚮鍥炶皟 */
  onClick: () => void;
  /** 鎸夐挳鍐呭锛岄€氬父涓哄浘鏍?*/
  children: ReactNode;
}

/**
 * 缁堢鎿嶄綔鎸夐挳缁勪欢锛屽湪 hover 鏃跺睍绀?tooltip 鎻愮ず銆? * 鍐呴儴浣跨敤 Popover 瀹炵幇 hover 瑙﹀彂鐨?tooltip 鏁堟灉銆? */
function TerminalActionButton({ label, className, onClick, children }: TerminalActionButtonProps) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        render={<button type="button" className={className} onClick={onClick} aria-label={label} />}
      >
        {children}
      </PopoverTrigger>
      <PopoverPopup
        tooltipStyle
        side="bottom"
        sideOffset={6}
        align="center"
        className="pointer-events-none select-none"
      >
        {label}
      </PopoverPopup>
    </Popover>
  );
}

/**
 * 缁堢宸ュ叿鏍忔搷浣滄寜閽粍锛屾牴鎹笉鍚屽彉浣擄紙compact/workspace/sidebar锛夋覆鏌撴搷浣滄寜閽垪琛ㄣ€? * compact 妯″紡涓嬫寜閽箣闂翠娇鐢ㄧ珫绾垮垎闅旓紝workspace/sidebar 妯″紡涓嬩娇鐢ㄨ竟妗嗗垎闅斻€? *
 * @param props.actions - 鎿嶄綔椤瑰垪琛? * @param props.variant - 甯冨眬鍙樹綋锛屽奖鍝嶆寜閽殑闂磋窛鍜屽垎闅旀牱寮? */
export function TerminalChromeActions(props: {
  actions: ReadonlyArray<TerminalChromeActionItem>;
  variant: "compact" | "workspace" | "sidebar";
}) {
  const itemClassName =
    props.variant === "workspace"
      ? "inline-flex h-full items-center bg-background px-2 text-foreground/90 transition-colors hover:bg-(--sidebar-accent)"
      : props.variant === "sidebar"
        ? "inline-flex h-full items-center bg-background px-1 text-foreground/90 transition-colors hover:bg-(--sidebar-accent)"
        : "bg-background p-1 text-foreground/90 transition-colors hover:bg-(--sidebar-accent)";

  return (
    <div
      className={cn(
        "inline-flex items-center",
        props.variant === "compact"
          ? "overflow-hidden border border-border/80 bg-background shadow-sm"
          : "h-full items-stretch border border-border/70 bg-background shadow-sm",
      )}
    >
      {props.actions.map((action, index) => {
        const shouldRenderDivider = props.variant === "compact" && index > 0;
        return (
          <div key={action.label} className={cn(props.variant === "workspace" ? "" : "contents")}>
            {shouldRenderDivider ? <div className="h-4 w-px bg-border/80" /> : null}
            <TerminalActionButton
              className={cn(
                itemClassName,
                props.variant === "workspace" && index > 0 ? "border-l border-border/70" : "",
                props.variant === "sidebar" && index > 0 ? "border-l border-border/70" : "",
                action.disabled ? "cursor-not-allowed opacity-45 hover:bg-transparent" : "",
              )}
              onClick={() => {
                if (action.disabled) return;
                action.onClick();
              }}
              label={action.label}
            >
              {action.children}
            </TerminalActionButton>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 缁堢宸ヤ綔鍖烘爣绛炬爮缁勪欢锛屼互姘村钩鏍囩椤靛舰寮忓睍绀虹粓绔垎缁勩€? * 姣忎釜鏍囩椤垫樉绀虹粓绔浘鏍囥€佹爣棰樸€佹椿鍔ㄧ姸鎬佹寚绀哄櫒鍜屽叧闂寜閽€? * 鏍囩椤典細鑷姩閫夋嫨璇ュ垎缁勪腑浼樺厛绾ф渶楂樼殑缁堢鐘舵€佷綔涓洪瑙堢姸鎬併€? *
 * @param props.terminalGroups - 宸茶В鏋愮殑缁堢鍒嗙粍甯冨眬鍒楄〃
 * @param props.activeGroupId - 褰撳墠娲昏穬鐨勫垎缁?ID
 * @param props.terminalVisualIdentityById - 缁堢 ID 鍒拌瑙夋爣璇嗙殑鏄犲皠
 * @param props.actions - 宸ュ叿鏍忔搷浣滈」鍒楄〃
 * @param props.onActiveGroupChange - 鍒囨崲娲昏穬鍒嗙粍鐨勫洖璋? * @param props.onCloseGroup - 鍏抽棴鍒嗙粍鐨勫洖璋? */
export function TerminalWorkspaceTabBar(props: {
  terminalGroups: ResolvedTerminalGroupLayout[];
  activeGroupId: string;
  terminalVisualIdentityById: ReadonlyMap<string, ResolvedTerminalVisualIdentity>;
  actions: ReadonlyArray<TerminalChromeActionItem>;
  onActiveGroupChange: (groupId: string) => void;
  onCloseGroup: (groupId: string) => void;
}) {
  return (
    <div className="flex min-w-0 items-stretch justify-between bg-background">
      <div className="flex min-w-0 items-stretch overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
        {props.terminalGroups.map((terminalGroup) => {
          const isActive = terminalGroup.id === props.activeGroupId;
          const previewTerminalId =
            terminalGroup.terminalIds.reduce<string | null>((bestTerminalId, terminalId) => {
              const bestPriority = terminalVisualStatePriority(
                props.terminalVisualIdentityById.get(
                  bestTerminalId ?? terminalGroup.activeTerminalId,
                )?.state ?? "idle",
              );
              const nextPriority = terminalVisualStatePriority(
                props.terminalVisualIdentityById.get(terminalId)?.state ?? "idle",
              );
              return nextPriority > bestPriority ? terminalId : bestTerminalId;
            }, null) ?? terminalGroup.activeTerminalId;
          const visualIdentity = props.terminalVisualIdentityById.get(previewTerminalId);
          const closeTabLabel = `Close ${visualIdentity?.title ?? "Terminal tab"}`;
          return (
            <div
              key={terminalGroup.id}
              className={cn(
                "group relative flex h-8 shrink-0 items-center gap-2 border-r border-border/70 px-2.5 transition-colors first:border-l first:border-l-border/70",
                isActive
                  ? "shadow-[inset_0_1px_0_var(--color-text-foreground)] bg-background text-foreground"
                  : "border-b border-border/70 bg-transparent text-muted-foreground hover:bg-(--sidebar-accent) hover:text-foreground",
              )}
            >
              <button
                type="button"
                className="flex min-w-0 items-center gap-2 text-left"
                onClick={() => props.onActiveGroupChange(terminalGroup.id)}
              >
                <TerminalIdentityIcon
                  className="size-3 shrink-0"
                  iconKey={visualIdentity?.iconKey ?? "terminal"}
                />
                {visualIdentity && visualIdentity.state !== "idle" ? (
                  <TerminalActivityIndicator
                    className="text-foreground/70"
                    state={visualIdentity.state}
                  />
                ) : null}
                <span className="truncate text-[12px] leading-4 text-current/90">
                  {visualIdentity?.title ?? "Terminal"}
                </span>
                {terminalGroup.terminalIds.length > 1 ? (
                  <span className="shrink-0 text-[10px] text-current/55">
                    {terminalGroup.terminalIds.length}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className={cn(
                  "inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground/80 transition hover:bg-background/55 hover:text-foreground",
                  props.terminalGroups.length <= 1 ? "hidden" : "",
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  props.onCloseGroup(terminalGroup.id);
                }}
                aria-label={closeTabLabel}
              >
                <XIcon className="size-2.75" />
              </button>
            </div>
          );
        })}
        <div className="min-w-0 flex-1 border-b border-border/70" />
      </div>
      <div className="shrink-0 border-b border-l border-border/70">
        <TerminalChromeActions actions={props.actions} variant="workspace" />
      </div>
    </div>
  );
}

/**
 * 缁堢渚ц竟鏍忕粍浠讹紝浠ュ瀭鐩村垪琛ㄥ舰寮忓睍绀虹粓绔垎缁勫拰缁堢瀹炰緥銆? * 鏀寔鍒嗙粍鏍囬鎶樺彔灞曠ず銆佺粓绔浘鏍囧拰鐘舵€佹寚绀哄櫒銆佸叧闂寜閽瓑浜や簰銆? * 閫傜敤浜庣粓绔暟閲忚緝澶氶渶瑕佸垎缁勭鐞嗙殑鍦烘櫙銆? *
 * @param props.terminalIds - 鎵€鏈夌粓绔?ID 鍒楄〃
 * @param props.terminalGroups - 宸茶В鏋愮殑缁堢鍒嗙粍甯冨眬鍒楄〃
 * @param props.activeTerminalId - 褰撳墠娲昏穬鐨勭粓绔?ID
 * @param props.activeGroupId - 褰撳墠娲昏穬鐨勫垎缁?ID
 * @param props.showGroupHeaders - 鏄惁鏄剧ず鍒嗙粍鏍囬
 * @param props.closeShortcutLabel - 鍏抽棴蹇嵎閿殑鏍囩鏂囨湰
 * @param props.terminalVisualIdentityById - 缁堢 ID 鍒拌瑙夋爣璇嗙殑鏄犲皠
 * @param props.actions - 宸ュ叿鏍忔搷浣滈」鍒楄〃
 * @param props.onActiveTerminalChange - 鍒囨崲娲昏穬缁堢鐨勫洖璋? * @param props.onCloseTerminal - 鍏抽棴缁堢鐨勫洖璋? */
export function TerminalSidebar(props: {
  terminalIds: string[];
  terminalGroups: ResolvedTerminalGroupLayout[];
  activeTerminalId: string;
  activeGroupId: string;
  showGroupHeaders: boolean;
  closeShortcutLabel?: string | undefined;
  terminalVisualIdentityById: ReadonlyMap<string, ResolvedTerminalVisualIdentity>;
  actions: ReadonlyArray<TerminalChromeActionItem>;
  onActiveTerminalChange: (terminalId: string) => void;
  onCloseTerminal: (terminalId: string) => void;
}) {
  return (
    <aside className="flex w-36 min-w-36 flex-col border border-border/70 bg-background">
      <div className="flex h-[22px] items-stretch justify-end border-b border-border/70">
        <TerminalChromeActions actions={props.actions} variant="sidebar" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
        {props.terminalGroups.map((terminalGroup, groupIndex) => {
          const isGroupActive = terminalGroup.id === props.activeGroupId;
          const groupActiveTerminalId = isGroupActive
            ? props.activeTerminalId
            : terminalGroup.activeTerminalId;
          const groupVisualIdentity = props.terminalVisualIdentityById.get(groupActiveTerminalId);

          return (
            <div key={terminalGroup.id} className="pb-0.5">
              {props.showGroupHeaders && (
                <button
                  type="button"
                  className={`flex w-full items-center px-1 py-0.5 text-[10px] uppercase tracking-[0.08em] ${
                    isGroupActive
                      ? "bg-(--sidebar-accent) text-foreground"
                      : "text-muted-foreground hover:bg-(--sidebar-accent) hover:text-foreground"
                  }`}
                  onClick={() => props.onActiveTerminalChange(groupActiveTerminalId)}
                >
                  {groupVisualIdentity?.title ?? `Terminal ${groupIndex + 1}`}
                  {terminalGroup.terminalIds.length > 1
                    ? ` (${terminalGroup.terminalIds.length})`
                    : ""}
                </button>
              )}

              <div
                className={props.showGroupHeaders ? "ml-1 border-l border-border/60 pl-1.5" : ""}
              >
                {terminalGroup.terminalIds.map((terminalId) => {
                  const isActive = terminalId === props.activeTerminalId;
                  const visualIdentity = props.terminalVisualIdentityById.get(terminalId);
                  const closeTerminalLabel = `Close ${
                    visualIdentity?.title ?? "terminal"
                  }${isActive && props.closeShortcutLabel ? ` (${props.closeShortcutLabel})` : ""}`;
                  return (
                    <div
                      key={terminalId}
                      className={`group flex items-center gap-1 px-1 py-0.5 text-[11px] ${
                        isActive
                          ? "bg-(--sidebar-accent) text-foreground"
                          : "text-muted-foreground hover:bg-(--sidebar-accent) hover:text-foreground"
                      }`}
                    >
                      {props.showGroupHeaders && (
                        <span className="text-[10px] text-muted-foreground/80">鈹?/span>
                      )}
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-1 text-left"
                        onClick={() => props.onActiveTerminalChange(terminalId)}
                      >
                        <TerminalIdentityIcon
                          className="size-3 shrink-0"
                          iconKey={visualIdentity?.iconKey ?? "terminal"}
                        />
                        {visualIdentity && visualIdentity.state !== "idle" ? (
                          <TerminalActivityIndicator
                            className="text-foreground/70"
                            state={visualIdentity.state}
                          />
                        ) : null}
                        <span className="truncate">{visualIdentity?.title ?? "Terminal"}</span>
                      </button>
                      {props.terminalIds.length > 1 && (
                        <Popover>
                          <PopoverTrigger
                            openOnHover
                            render={
                              <button
                                type="button"
                                className="inline-flex size-3.5 items-center justify-center rounded text-xs font-medium leading-none text-muted-foreground opacity-0 transition hover:bg-(--sidebar-accent) hover:text-foreground group-hover:opacity-100"
                                onClick={() => props.onCloseTerminal(terminalId)}
                                aria-label={closeTerminalLabel}
                              />
                            }
                          >
                            <XIcon className="size-2.5" />
                          </PopoverTrigger>
                          <PopoverPopup
                            tooltipStyle
                            side="bottom"
                            sideOffset={6}
                            align="center"
                            className="pointer-events-none select-none"
                          >
                            {closeTerminalLabel}
                          </PopoverPopup>
                        </Popover>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
