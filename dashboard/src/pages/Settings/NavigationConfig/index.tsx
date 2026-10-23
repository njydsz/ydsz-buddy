import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Switch, Tooltip } from "antd";
import {
  PanelRight,
  Settings as SettingsIcon,
  Info,
} from "lucide-react";
import { message } from "@/utils/antdMessage";
import { apiErrorMessage } from "@/utils/apiError";
import {
  preferencesApi,
  type NavZone,
  type UserPreferences,
} from "../../../api/modules/preferences";

interface NavPlacementItem {
  key: string;
  labelKey: string;
  group: "primary" | "settings" | "control" | "admin";
}

const MOVABLE_PLACEMENT_ITEMS: NavPlacementItem[] = [
  { key: "token-usage", labelKey: "nav.tokenUsage", group: "primary" },
  { key: "personalization", labelKey: "nav.personalization", group: "settings" },
  { key: "channels", labelKey: "nav.channels", group: "settings" },
  { key: "connectors", labelKey: "nav.connectors", group: "settings" },
  { key: "skill-packages", labelKey: "nav.skillPackages", group: "settings" },
  { key: "knowledge-bases", labelKey: "nav.knowledgeBases", group: "settings" },
  { key: "bridge", labelKey: "nav.bridge", group: "settings" },
  { key: "workbench", labelKey: "nav.workbench", group: "control" },
  { key: "remote-desktop", labelKey: "nav.remoteDesktop", group: "control" },
  { key: "acp", labelKey: "nav.acp", group: "control" },
  { key: "admin-users", labelKey: "nav.adminUsers", group: "admin" },
  { key: "models", labelKey: "nav.models", group: "admin" },
  { key: "admin-storage", labelKey: "nav.adminStorage", group: "admin" },
  { key: "admin-plugins", labelKey: "nav.adminPlugins", group: "admin" },
  { key: "admin-security", labelKey: "nav.security", group: "admin" },
  { key: "admin-advanced", labelKey: "nav.adminAdvanced", group: "admin" },
];

const GROUP_ORDER: NavPlacementItem["group"][] = [
  "primary",
  "settings",
  "control",
  "admin",
];

export default function NavigationConfigPage() {
  const { t } = useTranslation();
  const [places, setPlaces] = useState<Record<string, NavZone>>({});
  const [baseline, setBaseline] = useState<Record<string, NavZone>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void preferencesApi
      .get()
      .then((prefs: UserPreferences) => {
        if (!cancelled) {
          setPlaces(prefs.nav_zones ?? {});
          setBaseline(prefs.nav_zones ?? {});
        }
      })
      .catch(() => {
        /* surface nothing; controls fall back to defaults */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const out: Record<string, NavPlacementItem[]> = {};
    for (const item of MOVABLE_PLACEMENT_ITEMS) {
      (out[item.group] ??= []).push(item);
    }
    return out;
  }, []);

  const dirty = useMemo(
    () =>
      MOVABLE_PLACEMENT_ITEMS.some(
        (item) =>
          (places[item.key] ?? "sidebar") !== (baseline[item.key] ?? "sidebar"),
      ),
    [places, baseline],
  );

  const setZone = (key: string, zone: NavZone) => {
    setPlaces((prev) => ({ ...prev, [key]: zone }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const prefs = await preferencesApi.patch({ nav_zones: { ...places } });
      setBaseline(prefs.nav_zones ?? {});
      message.success(t("common.saveSuccess"));
    } catch (error) {
      message.error(apiErrorMessage(error, t("common.saveFailed"), t));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setPlaces(baseline);
  };

  return (
    <div style={{ padding: "32px 40px", maxWidth: 680 }}>
      <h2
        style={{
          fontSize: 20,
          fontWeight: 600,
          color: "var(--fn-text-primary)",
          marginBottom: 8,
        }}
      >
        {t("nav.placement.title")}
      </h2>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          fontSize: 14,
          color: "var(--fn-text-tertiary)",
          marginBottom: 24,
        }}
      >
        <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>{t("nav.placement.description")}</span>
      </div>

      {loading ? (
        <div style={{ padding: 24, color: "var(--fn-text-tertiary)" }}>
          {t("common.loading")}
        </div>
      ) : (
        <>
          {GROUP_ORDER.map((group) => {
            const items = grouped[group];
            if (!items || items.length === 0) return null;
            return (
              <section key={group} style={{ marginBottom: 24 }}>
                <h3
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--fn-text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: 10,
                    paddingBottom: 6,
                    borderBottom: "1px solid var(--fn-border, rgba(0,0,0,0.08))",
                  }}
                >
                  {t(`nav.placement.group.${group}`)}
                </h3>
                {items.map((item) => {
                  const zone = places[item.key] ?? "sidebar";
                  return (
                    <div
                      key={item.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: "var(--fn-bg-elevated, transparent)",
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          color: "var(--fn-text-primary)",
                        }}
                      >
                        {t(item.labelKey)}
                      </span>
                      <Tooltip
                        title={
                          zone === "sidebar"
                            ? t("nav.placement.sidebar")
                            : t("nav.placement.settings")
                        }
                      >
                        <Switch
                          checked={zone === "sidebar"}
                          checkedChildren={
                            <PanelRight size={12} strokeWidth={2} />
                          }
                          unCheckedChildren={
                            <SettingsIcon size={12} strokeWidth={2} />
                          }
                          onChange={(checked) =>
                            setZone(item.key, checked ? "sidebar" : "settings")
                          }
                        />
                      </Tooltip>
                    </div>
                  );
                })}
              </section>
            );
          })}

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
        </>
      )}
    </div>
  );
}
