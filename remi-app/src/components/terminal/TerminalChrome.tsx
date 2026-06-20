/**
 * @file TerminalChrome.tsx
 * @description 缂佸牏顏径鏍э紦閿涘湑hrome閿涘褰叉径宥囨暏閻?UI 閸樼喕顕㈤敍宀€鏁ゆ禍搴㈣閺屾挾绮撶粩顖涚垼缁涚偓鐖妴浣锋櫠鏉堣鐖崪灞戒紣閸忛攱鐖幙宥勭稊閹稿鎸抽妴? * 閸栧懎鎯堢紒鍫㈩伂閺嶅洨顒锋い鍨埉閵嗕椒鏅舵潏瑙勭埉閸掓銆冮妴浣规惙娴ｆ粍瀵滈柦顔剧矋缁涘鐗宠箛?UI 缂佸嫪娆㈤妴? */

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
 * 閺嶈宓佺紒鍫㈩伂鐟欏棜顫庨悩鑸碘偓浣界箲閸ョ偘绱崗鍫㈤獓閺佹澘鈧》绱濋弫鏉库偓鑹扮Ш婢堆傜喘閸忓牏楠囩搾濠囩彯閵? * 閻劋绨崷銊︾垼缁涚偓鐖稉顓炲枀鐎规碍妯夌粈鍝勬憿娑擃亞绮撶粩顖滄畱閻樿埖鈧焦瀵氱粈鍝勬珤閵? *
 * @param state - 缂佸牏顏憴鍡氼潕閻樿埖鈧? * @returns 娴兼ê鍘涚痪褎鏆熼崐纭风礄1-4閿? */
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
 * 缂佸牏顏銉ュ徔閺嶅繑鎼锋担婊堛€嶉柊宥囩枂閿涘本寮挎潻棰佺娑擃亜褰查悙鐟板毊閻ㄥ嫭鎼锋担婊勫瘻闁筋喓鈧? */
export interface TerminalChromeActionItem {
  /** 閺勵垰鎯佺粋浣烘暏鐠囥儲鎼锋担?*/
  disabled?: boolean;
  /** 閹垮秳缍旈惃鍕瀮閺堫剚鐖ｇ粵鎾呯礉閸氬本妞傛担婊€璐?tooltip 鐏炴洜銇?*/
  label: string;
  /** 閻愮懓鍤弮鍓佹畱閸ョ偠鐨熼崙鑺ユ殶 */
  onClick: () => void;
  /** 閹稿鎸抽崘鍛啇閿涘矂鈧艾鐖舵稉鍝勬禈閺?*/
  children: ReactNode;
}

/**
 * 缂佸牏顏幙宥勭稊閹稿鎸抽惃鍕敶闁?props閿涘苯鐨濈憗鍛啊鐢?tooltip 閻ㄥ嫭瀵滈柦顔绘唉娴滄帇鈧? */
interface TerminalActionButtonProps {
  /** 閹稿鎸抽惃?aria-label 閸?tooltip 閺傚洦婀?*/
  label: string;
  /** 閼奉亜鐣炬稊澶嬬壉瀵繒琚崥?*/
  className: string;
  /** 閻愮懓鍤崶鐐剁殶 */
  onClick: () => void;
  /** 閹稿鎸抽崘鍛啇閿涘矂鈧艾鐖舵稉鍝勬禈閺?*/
  children: ReactNode;
}

/**
 * 缂佸牏顏幙宥勭稊閹稿鎸崇紒鍕閿涘苯婀?hover 閺冭泛鐫嶇粈?tooltip 閹绘劗銇氶妴? * 閸愬懘鍎存担璺ㄦ暏 Popover 鐎圭偟骞?hover 鐟欙箑褰傞惃?tooltip 閺佸牊鐏夐妴? */
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
 * 缂佸牏顏銉ュ徔閺嶅繑鎼锋担婊勫瘻闁筋喚绮嶉敍灞剧壌閹诡喕绗夐崥灞藉綁娴ｆ搫绱檆ompact/workspace/sidebar閿涘瑕嗛弻鎾存惙娴ｆ粍瀵滈柦顔煎灙鐞涖劊鈧? * compact 濡€崇础娑撳瀵滈柦顔荤闂傜繝濞囬悽銊х彨缁惧灝鍨庨梾鏃撶礉workspace/sidebar 濡€崇础娑撳濞囬悽銊ㄧ珶濡楀棗鍨庨梾鏂烩偓? *
 * @param props.actions - 閹垮秳缍旀い鐟板灙鐞? * @param props.variant - 鐢啫鐪崣妯圭秼閿涘苯濂栭崫宥嗗瘻闁筋喚娈戦梻纾嬬獩閸滃苯鍨庨梾鏃€鐗卞? */
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
 * 缂佸牏顏銉ょ稊閸栫儤鐖ｇ粵鐐埉缂佸嫪娆㈤敍灞间簰濮樻潙閽╅弽鍥╊劮妞ら潧鑸板蹇撶潔缁€铏圭矒缁旑垰鍨庣紒鍕┾偓? * 濮ｅ繋閲滈弽鍥╊劮妞ゅ灚妯夌粈铏圭矒缁旑垰娴橀弽鍥モ偓浣圭垼妫版ǜ鈧焦妞块崝銊уЦ閹焦瀵氱粈鍝勬珤閸滃苯鍙ч梻顓熷瘻闁筋喓鈧? * 閺嶅洨顒锋い鍏哥窗閼奉亜濮╅柅澶嬪鐠囥儱鍨庣紒鍕厬娴兼ê鍘涚痪褎娓舵妯兼畱缂佸牏顏悩鑸碘偓浣风稊娑撴椽顣╃憴鍫㈠Ц閹降鈧? *
 * @param props.terminalGroups - 瀹歌尪袙閺嬫劗娈戠紒鍫㈩伂閸掑棛绮嶇敮鍐ㄧ湰閸掓銆? * @param props.activeGroupId - 瑜版挸澧犲ú鏄忕┈閻ㄥ嫬鍨庣紒?ID
 * @param props.terminalVisualIdentityById - 缂佸牏顏?ID 閸掓媽顫嬬憴澶嬬垼鐠囧棛娈戦弰鐘茬殸
 * @param props.actions - 瀹搞儱鍙块弽蹇旀惙娴ｆ粓銆嶉崚妤勩€? * @param props.onActiveGroupChange - 閸掑洦宕插ú鏄忕┈閸掑棛绮嶉惃鍕礀鐠? * @param props.onCloseGroup - 閸忔娊妫撮崚鍡欑矋閻ㄥ嫬娲栫拫? */
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
 * 缂佸牏顏笟褑绔熼弽蹇曠矋娴犺绱濇禒銉ョ€惄鏉戝灙鐞涖劌鑸板蹇撶潔缁€铏圭矒缁旑垰鍨庣紒鍕嫲缂佸牏顏€圭偘绶ラ妴? * 閺€顖涘瘮閸掑棛绮嶉弽鍥暯閹舵ê褰旂仦鏇犮仛閵嗕胶绮撶粩顖氭禈閺嶅洤鎷伴悩鑸碘偓浣瑰瘹缁€鍝勬珤閵嗕礁鍙ч梻顓熷瘻闁筋喚鐡戞禍銈勭鞍閵? * 闁倻鏁ゆ禍搴ｇ矒缁旑垱鏆熼柌蹇氱窛婢舵岸娓剁憰浣稿瀻缂佸嫮顓搁悶鍡欐畱閸︾儤娅欓妴? *
 * @param props.terminalIds - 閹碘偓閺堝绮撶粩?ID 閸掓銆? * @param props.terminalGroups - 瀹歌尪袙閺嬫劗娈戠紒鍫㈩伂閸掑棛绮嶇敮鍐ㄧ湰閸掓銆? * @param props.activeTerminalId - 瑜版挸澧犲ú鏄忕┈閻ㄥ嫮绮撶粩?ID
 * @param props.activeGroupId - 瑜版挸澧犲ú鏄忕┈閻ㄥ嫬鍨庣紒?ID
 * @param props.showGroupHeaders - 閺勵垰鎯侀弰鍓с仛閸掑棛绮嶉弽鍥暯
 * @param props.closeShortcutLabel - 閸忔娊妫磋箛顐ｅ祹闁款喚娈戦弽鍥╊劮閺傚洦婀? * @param props.terminalVisualIdentityById - 缂佸牏顏?ID 閸掓媽顫嬬憴澶嬬垼鐠囧棛娈戦弰鐘茬殸
 * @param props.actions - 瀹搞儱鍙块弽蹇旀惙娴ｆ粓銆嶉崚妤勩€? * @param props.onActiveTerminalChange - 閸掑洦宕插ú鏄忕┈缂佸牏顏惃鍕礀鐠? * @param props.onCloseTerminal - 閸忔娊妫寸紒鍫㈩伂閻ㄥ嫬娲栫拫? */
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
                        <span className="text-[10px] text-muted-foreground/80">閳?/span>
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
