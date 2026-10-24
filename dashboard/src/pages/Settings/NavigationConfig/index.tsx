import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input, Popconfirm } from "antd";
import { GripVertical, Lock, Plus, Trash2 } from "lucide-react";
import { message } from "@/utils/antdMessage";
import { apiErrorMessage } from "@/utils/apiError";
import {
  preferencesApi,
  type SidebarNavLayoutPref,
  type UserPreferences,
} from "../../../api/modules/preferences";
import {
  ALL_NAV_ITEMS,
  MOVABLE_PLACEMENT_ITEMS,
  type NavPlacementItem,
  type NavZone,
  type SettingsGroup,
} from "./placement";

// ── Editor state (for the settings zone) ───────────────────────────────────

export interface ZoneEditorState {
  groups: { id: string; name?: string | null }[];
  itemsByGroup: Record<string, string[]>;
  ungrouped: string[];
}

type DragPayload =
  | { type: "item"; key: string; fromZone: NavZone }
  | { type: "group"; id: string };

const SETTINGS_GROUP_LABELS: Record<SettingsGroup, string> = {
  settings: "nav.groupSettings",
  control: "nav.groupControl",
  admin: "nav.groupAdmin",
};

const BUILTIN_GROUP_IDS = new Set(Object.keys(SETTINGS_GROUP_LABELS));

function newNavGroupId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const body = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `c_${body}`;
}

function nextGroupName(state: ZoneEditorState, t: (k: string) => string): string {
  const base = t("nav.newGroupDefault");
  const names = new Set(state.groups.map((g) => (g.name ?? "").trim()).filter(Boolean));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

function createGroup(state: ZoneEditorState, id: string, name: string): ZoneEditorState {
  return {
    ...state,
    groups: [...state.groups, { id, name }],
    itemsByGroup: { ...state.itemsByGroup, [id]: [] },
  };
}

function renameGroup(state: ZoneEditorState, id: string, name: string | null): ZoneEditorState {
  return {
    ...state,
    groups: state.groups.map((g) => (g.id === id ? { ...g, name } : g)),
  };
}

function deleteGroup(state: ZoneEditorState, groupId: string): ZoneEditorState {
  const released = state.itemsByGroup[groupId] ?? [];
  const itemsByGroup = { ...state.itemsByGroup };
  delete itemsByGroup[groupId];
  return {
    ...state,
    groups: state.groups.filter((g) => g.id !== groupId),
    ungrouped: [...released, ...state.ungrouped],
    itemsByGroup,
  };
}

function moveGroup(state: ZoneEditorState, groupId: string, beforeId: string | null): ZoneEditorState {
  if (beforeId === groupId) return state;
  const moving = state.groups.find((g) => g.id === groupId);
  if (!moving) return state;
  const groups = state.groups.filter((g) => g.id !== groupId);
  const index = beforeId ? groups.findIndex((g) => g.id === beforeId) : groups.length;
  groups.splice(index < 0 ? groups.length : index, 0, moving);
  return { ...state, groups };
}

function placeItem(state: ZoneEditorState, key: string, groupId: string | null, beforeKey: string | null): ZoneEditorState {
  if (beforeKey === key) return state;
  const stripped = stripKey(state, key);
  const list = groupId === null ? stripped.ungrouped : (stripped.itemsByGroup[groupId] ?? []);
  const next = [...list];
  const index = beforeKey ? next.indexOf(beforeKey) : next.length;
  next.splice(index < 0 ? next.length : index, 0, key);
  if (groupId === null) return { ...stripped, ungrouped: next };
  return { ...stripped, itemsByGroup: { ...stripped.itemsByGroup, [groupId]: next } };
}

function stripKey(state: ZoneEditorState, key: string): ZoneEditorState {
  const itemsByGroup: Record<string, string[]> = {};
  for (const [id, keys] of Object.entries(state.itemsByGroup)) {
    itemsByGroup[id] = keys.filter((k) => k !== key);
  }
  return { ...state, ungrouped: state.ungrouped.filter((k) => k !== key), itemsByGroup };
}

function groupNameMissing(state: ZoneEditorState): boolean {
  return state.groups.some((g) => {
    if (BUILTIN_GROUP_IDS.has(g.id)) return false;
    return !(g.name ?? "").trim();
  });
}

// ── Settings-zone initialisation ────────────────────────────────────────────

/** Build the settings-zone editor with default groups from placement.ts. */
function defaultSettingsEditor(settingsItems: NavPlacementItem[]): ZoneEditorState {
  const groupIds: SettingsGroup[] = ["settings", "control", "admin"];
  const groups = groupIds.map((id) => ({ id }));
  const itemsByGroup: Record<string, string[]> = {};
  for (const id of groupIds) itemsByGroup[id] = [];
  const ungrouped: string[] = [];

  for (const it of settingsItems) {
    if (it.defaultGroup && itemsByGroup[it.defaultGroup]) {
      itemsByGroup[it.defaultGroup].push(it.key);
    } else {
      ungrouped.push(it.key);
    }
  }
  return { groups, itemsByGroup, ungrouped };
}

/** Merge user-saved settings layout onto default state. */
function mergeSettingsEditor(
  base: ZoneEditorState,
  layout: SidebarNavLayoutPref | null,
  zoneItemKeys: Set<string>,
): ZoneEditorState {
  if (!layout) return base;

  const groups = base.groups.map((g) => ({ ...g }));
  const itemsByGroup: Record<string, string[]> = {};
  for (const g of groups) itemsByGroup[g.id] = [];
  const ungrouped: string[] = [];
  const seen = new Set<string>();

  for (const raw of layout.items) {
    if (!zoneItemKeys.has(raw.key) || seen.has(raw.key)) continue;
    seen.add(raw.key);
    const group = raw.group ?? null;
    if (group && itemsByGroup[group]) {
      itemsByGroup[group].push(raw.key);
    } else {
      ungrouped.push(raw.key);
    }
  }

  for (const raw of layout.groups) {
    const match = groups.find((g) => g.id === raw.id);
    if (match && raw.name) match.name = raw.name;
  }

  return { groups, itemsByGroup, ungrouped };
}

function serializeZone(state: ZoneEditorState): SidebarNavLayoutPref {
  return {
    groups: state.groups.map((g) => {
      const name = g.name?.trim() ?? "";
      return name ? { id: g.id, name } : { id: g.id };
    }) as SidebarNavLayoutPref["groups"],
    items: [
      ...state.ungrouped.map((key) => ({ key })),
      ...state.groups.flatMap((g) =>
        (state.itemsByGroup[g.id] ?? []).map((key) => ({ key, group: g.id })),
      ),
    ],
  };
}

// ── Component ───────────────────────────────────────────────────────────────

export default function NavigationConfigPage() {
  const { t } = useTranslation();
  const [navZones, setNavZones] = useState<Record<string, NavZone>>({});
  const [settingsNav, setSettingsNav] = useState<SidebarNavLayoutPref | null>(null);
  const [baseline, setBaseline] = useState<{
    navZones: Record<string, NavZone>;
    settingsNav: SidebarNavLayoutPref | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const dragRef = useRef<DragPayload | null>(null);

  // ── Item label lookup ──────────────────────────────────────────────────
  const itemLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of ALL_NAV_ITEMS) map.set(it.key, t(it.labelKey));
    return map;
  }, [t]);

  // ── Load ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void preferencesApi
      .get()
      .then((prefs: UserPreferences) => {
        if (cancelled) return;
        const zones = (prefs.nav_zones ?? {}) as Record<string, NavZone>;
        setNavZones(zones);
        setSettingsNav(prefs.settings_nav ?? null);
        setBaseline({ navZones: zones, settingsNav: prefs.settings_nav ?? null });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // ── Sidebar / settings item sets ───────────────────────────────────────
  // The sidebar zone includes fixed items (chat/experts/tasks) plus every
  // movable item whose current zone is "sidebar".
  const sidebarMovable = useMemo(
    () => MOVABLE_PLACEMENT_ITEMS.filter((it) => (navZones[it.key] ?? it.defaultZone) === "sidebar"),
    [navZones],
  );
  const settingsMovable = useMemo(
    () => MOVABLE_PLACEMENT_ITEMS.filter((it) => (navZones[it.key] ?? it.defaultZone) === "settings"),
    [navZones],
  );

  // Fixed items always render at the top of the sidebar zone.
  const fixedItems = useMemo(
    () => ALL_NAV_ITEMS.filter((it) => it.fixed),
    [],
  );

  const [settingsDraft, setSettingsDraft] = useState<ZoneEditorState>({
    groups: [],
    itemsByGroup: {},
    ungrouped: [],
  });

  const settingsKeyRef = useRef("");
  const settingsNavRef = useRef("");

  useEffect(() => {
    const keys = settingsMovable.map((i) => i.key).join(",");
    const nav = JSON.stringify(settingsNav);
    if (keys === settingsKeyRef.current && nav === settingsNavRef.current) return;
    settingsKeyRef.current = keys;
    settingsNavRef.current = nav;

    const base = defaultSettingsEditor(settingsMovable);
    setSettingsDraft(mergeSettingsEditor(base, settingsNav, new Set(settingsMovable.map((i) => i.key))));
  }, [settingsMovable, settingsNav]);

  // ── Sidebar order ──────────────────────────────────────────────────────
  // Store the user's custom sort for movable sidebar items. Fixed items
  // always come first in their hardcoded order.
  const [sidebarOrder, setSidebarOrder] = useState<string[]>([]);
  const sidebarOrderRef = useRef("");

  useEffect(() => {
    const next = sidebarMovable.map((i) => i.key).join(",");
    if (next !== sidebarOrderRef.current) {
      sidebarOrderRef.current = next;
      setSidebarOrder(sidebarMovable.map((i) => i.key));
    }
  }, [sidebarMovable]);

  // ── Drag handlers ──────────────────────────────────────────────────────
  const onDragStart = (event: DragEvent, payload: DragPayload) => {
    dragRef.current = payload;
    event.dataTransfer.effectAllowed = "move";
    try { event.dataTransfer.setData("text/plain", ""); } catch {}
  };

  const allowDrop = (event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  /**
   * Drop an item into the settings zone.
   * `groupId` null = ungrouped; `beforeKey` = insert before this key.
   */
  const dropIntoSettings = (groupId: string | null, beforeKey: string | null) => {
    const payload = dragRef.current;
    dragRef.current = null;
    if (!payload || payload.type !== "item") return;

    if (payload.fromZone === "settings") {
      setSettingsDraft((prev) => placeItem(prev, payload.key, groupId, beforeKey));
    } else {
      // Moving from sidebar → settings: remove from sidebar, add to settings.
      setSidebarOrder((prev) => prev.filter((k) => k !== payload.key));
      setSettingsDraft((prev) => placeItem(prev, payload.key, groupId, null));
      setNavZones((prev) => ({ ...prev, [payload.key]: "settings" }));
    }
  };

  /** Drop a sidebar item onto another sidebar item to reorder. */
  const sidebarReorder = (beforeKey: string | null) => {
    const payload = dragRef.current;
    dragRef.current = null;
    if (!payload || payload.type !== "item" || payload.fromZone !== "sidebar") return;
    setSidebarOrder((prev) => {
      const stripped = prev.filter((k) => k !== payload.key);
      const index = beforeKey ? stripped.indexOf(beforeKey) : stripped.length;
      stripped.splice(index < 0 ? stripped.length : index, 0, payload.key);
      return stripped;
    });
  };

  /** Drop a settings-zone item into the sidebar background (cross-zone move). */
  const moveToSidebar = () => {
    const payload = dragRef.current;
    dragRef.current = null;
    if (!payload || payload.type !== "item" || payload.fromZone === "sidebar") return;
    setSidebarOrder((prev) => [...prev, payload.key]);
    setNavZones((prev) => ({ ...prev, [payload.key]: "sidebar" }));
  };

  const dropSettingsGroup = (beforeId: string | null) => {
    const payload = dragRef.current;
    dragRef.current = null;
    if (!payload || payload.type !== "group") return;
    setSettingsDraft((prev) => moveGroup(prev, payload.id, beforeId));
  };

  // Group CRUD
  const addSettingsGroup = () => {
    setSettingsDraft((prev) => createGroup(prev, newNavGroupId(), nextGroupName(prev, t)));
  };

  const confirmDeleteGroup = (groupId: string) => {
    setSettingsDraft((prev) => deleteGroup(prev, groupId));
  };

  const updateGroupName = (groupId: string, name: string) => {
    setSettingsDraft((prev) => renameGroup(prev, groupId, name || null));
  };

  // ── Dirty check ────────────────────────────────────────────────────────
  const dirty = useMemo(() => {
    if (!baseline) return false;
    const zonesChanged = MOVABLE_PLACEMENT_ITEMS.some(
      (it: NavPlacementItem) =>
        (navZones[it.key] ?? it.defaultZone) !== (baseline.navZones[it.key] ?? it.defaultZone),
    );
    const settingsChanged =
      JSON.stringify(serializeZone(settingsDraft)) !== JSON.stringify(baseline.settingsNav);
    // Sidebar order change: compare current session order against the movable items' default sequence.
    const sidebarChanged = sidebarMovable.some(
      (it: NavPlacementItem, idx: number) => sidebarOrder[idx] !== it.key,
    );
    return zonesChanged || settingsChanged || sidebarChanged;
  }, [navZones, settingsDraft, sidebarOrder, sidebarMovable, baseline]);

  // ── Save / reset ───────────────────────────────────────────────────────
  const save = async () => {
    setSaving(true);
    try {
      const settingsPayload = groupNameMissing(settingsDraft) ? null : serializeZone(settingsDraft);
      // Build a sidebar layout: fixed items first (unchanging order), then movable items in current session order.
      const sidebarItems = [
        ...fixedItems.map((it) => it.key),
        ...sidebarOrder,
      ];
      const sidebarPayload: SidebarNavLayoutPref = {
        groups: [],
        items: sidebarItems.map((key) => ({ key })),
      };
      const prefs = await preferencesApi.patch({
        nav_zones: { ...navZones },
        sidebar_nav: sidebarPayload,
        settings_nav: settingsPayload,
      });
      setBaseline({
        navZones: (prefs.nav_zones ?? {}) as Record<string, NavZone>,
        settingsNav: prefs.settings_nav ?? null,
      });
      message.success(t("common.saveSuccess"));
    } catch (error) {
      message.error(apiErrorMessage(error, t("common.saveFailed"), t));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!baseline) return;
    setNavZones(baseline.navZones);
  };

  if (loading) {
    return <div style={{ padding: 24, color: "var(--fn-text-tertiary)" }}>{t("common.loading")}</div>;
  }

  // ── Render ─────────────────────────────────────────────────────────────
  const renderSidebarZone = () => (
    <div
      style={{
        marginBottom: 24,
        padding: 16,
        borderRadius: 12,
        border: "1px solid var(--fn-border, rgba(0,0,0,0.08))",
        background: "var(--fn-bg-elevated, rgba(0,0,0,0.02))",
      }}
      onDragOver={allowDrop}
      onDrop={(event) => {
        event.preventDefault();
        moveToSidebar();
      }}
    >
      <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--fn-text-primary)", margin: "0 0 4px" }}>
        {t("nav.placement.zone.sidebar")}
      </h3>
      <p style={{ fontSize: 12, color: "var(--fn-text-tertiary)", margin: "0 0 12px" }}>
        {t("nav.placement.zoneSidebarDesc")}
      </p>

      {/* Fixed sidebar items */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
        {fixedItems.map((it) => (
          <div
            key={it.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minHeight: 36,
              padding: "4px 8px",
              borderRadius: 8,
              background: "var(--fn-sidebar-bg, transparent)",
              cursor: "default",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 22,
                height: 22,
                color: "var(--fn-text-tertiary)",
                flexShrink: 0,
              }}
              title={t("nav.fixedItemTooltip")}
            >
              <Lock size={13} />
            </span>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 13,
                color: "var(--fn-text-primary)",
              }}
            >
              {itemLabel.get(it.key) ?? t(it.labelKey)}
            </span>
          </div>
        ))}
      </div>

      {/* Divider */}
      {sidebarOrder.length > 0 && (
        <div style={{ height: 1, background: "var(--fn-border, rgba(0,0,0,0.08))", margin: "4px 0" }} />
      )}

      {/* Movable sidebar items */}
      <div
        style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 28 }}
        onDragOver={allowDrop}
        onDrop={(event) => {
          event.preventDefault();
          sidebarReorder(null);
        }}
      >
        {sidebarOrder.map((key) => (
          <ItemRow
            key={key}
            itemKey={key}
            label={itemLabel.get(key) ?? key}
            zone="sidebar"
            onDragStart={onDragStart}
            onDropBefore={(beforeKey) => sidebarReorder(beforeKey)}
          />
        ))}
      </div>
    </div>
  );

  const renderSettingsZone = () => (
    <div
      style={{
        marginBottom: 24,
        padding: 16,
        borderRadius: 12,
        border: "1px solid var(--fn-border, rgba(0,0,0,0.08))",
        background: "transparent",
      }}
      onDragOver={allowDrop}
      onDrop={(event) => {
        event.preventDefault();
        dropIntoSettings(null, null);
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--fn-text-primary)", margin: 0 }}>
          {t("nav.placement.zone.settings")}
        </h3>
        <Button type="text" size="small" icon={<Plus size={14} />} onClick={addSettingsGroup}>
          {t("nav.newGroup")}
        </Button>
      </div>
      <p style={{ fontSize: 12, color: "var(--fn-text-tertiary)", margin: "0 0 12px" }}>
        {t("nav.placement.zoneSettingsDesc")}
      </p>

      {/* Ungrouped settings items */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          minHeight: 36,
          padding: 4,
          marginBottom: 8,
          border: "1px dashed var(--fn-border, rgba(0, 0, 0, 0.12))",
          borderRadius: 8,
        }}
        onDragOver={allowDrop}
        onDrop={(event) => {
          event.preventDefault();
          dropIntoSettings(null, null);
        }}
      >
        {settingsDraft.ungrouped.length === 0 ? (
          <div style={{ padding: 8, color: "var(--fn-text-tertiary)", fontSize: 12, textAlign: "center" }}>
            {t("nav.dropHere")}
          </div>
        ) : null}
        {settingsDraft.ungrouped.map((key) => (
          <ItemRow
            key={key}
            itemKey={key}
            label={itemLabel.get(key) ?? key}
            zone="settings"
            onDragStart={onDragStart}
            onDropBefore={(beforeKey) => dropIntoSettings(null, beforeKey)}
          />
        ))}
      </div>

      {/* Settings-zone groups */}
      {settingsDraft.groups.map((group) => {
        const items = (settingsDraft.itemsByGroup[group.id] ?? []).filter((k) =>
          settingsMovable.some((m) => m.key === k),
        );
        return (
          <div
            key={group.id}
            style={{
              marginBottom: 8,
              padding: 8,
              border: "1px solid var(--fn-border, rgba(0,0,0,0.08))",
              borderRadius: 8,
            }}
            onDragOver={allowDrop}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const payload = dragRef.current;
              if (payload?.type === "group") {
                dropSettingsGroup(group.id);
              } else if (payload?.type === "item") {
                dropIntoSettings(group.id, items[0] ?? null);
              }
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 22,
                  height: 22,
                  color: "var(--fn-text-tertiary)",
                  cursor: "grab",
                }}
                draggable
                title={t("nav.dragToReorder")}
                onDragStart={(event) =>
                  onDragStart(event, { type: "group", id: group.id })
                }
              >
                <GripVertical size={14} />
              </span>
              <Input
                size="small"
                style={{ flex: 1, minWidth: 0 }}
                maxLength={40}
                value={group.name ?? ""}
                placeholder={t(SETTINGS_GROUP_LABELS[group.id as SettingsGroup] ?? "nav.groupNamePlaceholder")}
                onChange={(e) => updateGroupName(group.id, e.target.value)}
              />
              <Popconfirm
                title={t("nav.deleteGroupConfirm")}
                onConfirm={() => confirmDeleteGroup(group.id)}
                okText={t("common.confirm")}
                cancelText={t("common.cancel")}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<Trash2 size={14} />}
                  aria-label={t("nav.deleteGroup")}
                />
              </Popconfirm>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 28 }}
              onDragOver={allowDrop}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                dropIntoSettings(group.id, null);
              }}
            >
              {items.length === 0 ? (
                <div style={{ padding: 4, color: "var(--fn-text-tertiary)", fontSize: 12, textAlign: "center" }}>
                  {t("nav.dropHere")}
                </div>
              ) : null}
              {items.map((key) => (
                <ItemRow
                  key={key}
                  itemKey={key}
                  label={itemLabel.get(key) ?? key}
                  zone="settings"
                  onDragStart={onDragStart}
                  onDropBefore={(beforeKey) => dropIntoSettings(group.id, beforeKey)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ padding: "24px 32px", maxWidth: 560 }}>
      <p
        style={{
          fontSize: 13,
          color: "var(--fn-text-secondary)",
          marginTop: 0,
          marginBottom: 20,
          lineHeight: 1.5,
        }}
      >
        {t("nav.placement.crossZoneHint")}
      </p>

      {renderSidebarZone()}

      <div style={{ height: 16 }} />

      {renderSettingsZone()}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          marginTop: 16,
          paddingTop: 16,
          borderTop: "1px solid var(--fn-border, rgba(0,0,0,0.08))",
        }}
      >
        <Button disabled={!dirty} onClick={reset}>
          {t("common.reset")}
        </Button>
        <Button type="primary" loading={saving} disabled={!dirty} onClick={() => void save()}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

// ── Item row ────────────────────────────────────────────────────────────────

function ItemRow({
  itemKey,
  label,
  zone,
  onDragStart,
  onDropBefore,
}: {
  itemKey: string;
  label: string;
  zone: NavZone;
  onDragStart: (event: DragEvent, payload: DragPayload) => void;
  onDropBefore: (beforeKey: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        minHeight: 36,
        padding: "4px 8px",
        borderRadius: 8,
        background: "var(--fn-sidebar-bg, transparent)",
        cursor: "default",
      }}
      draggable
      onDragStart={(event) =>
        onDragStart(event, { type: "item", key: itemKey, fromZone: zone })
      }
      onDragOver={allowDropStatic}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDropBefore(itemKey);
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          height: 22,
          color: "var(--fn-text-tertiary)",
          cursor: "grab",
          flexShrink: 0,
        }}
      >
        <GripVertical size={14} />
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: 13,
          color: "var(--fn-text-primary)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function allowDropStatic(event: DragEvent) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}
