import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Modal, Spin, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import type { YdszUser } from "../../api/modules/auth";
import type { NavZone } from "../../api/modules/preferences";
import { buildSettingsNavGroups, type SettingsWindowKey } from "./navConfig";
import {
  SettingsHeaderProvider,
  type LiftedHeader,
} from "./SettingsHeaderContext";
import styles from "./SettingsWindow.module.less";

/* -------------------------------------------------------------------------- */
/*  Lazy page imports                                                         */
/* -------------------------------------------------------------------------- */

const ModelsPage = lazy(() => import("../../pages/Settings/Models"));
const TokenUsagePage = lazy(() => import("../../pages/Control/TokenUsage"));
const AdminUsersPage = lazy(() => import("../../pages/Admin/Users"));
const AdminStoragePage = lazy(() => import("../../pages/Admin/Storage"));
const AdminPluginsPage = lazy(() => import("../../pages/Admin/Plugins"));
const PersonalizationPage = lazy(
  () => import("../../pages/Agent/Personalization"),
);
const BridgePage = lazy(() => import("../../pages/Settings/Bridge"));
const SecurityPagePage = lazy(() => import("../../pages/Settings/Security"));
const AdvancedSettingsPage = lazy(
  () => import("../../pages/Settings/AdvancedSettings"),
);
const RemoteDesktopPage = lazy(
  () => import("../../pages/Control/RemoteDesktop"),
);
const ConnectorsPage = lazy(() => import("../../pages/Agent/Connectors"));
const SkillPackagesPage = lazy(() => import("../../pages/SkillPackages"));
const KnowledgeBasesPage = lazy(() => import("../../pages/KnowledgeBases"));
const WorkbenchPage = lazy(() => import("../../pages/Control/Workbench"));
const AcpPage = lazy(() => import("../../pages/Agent/ACP"));

function PageFallback() {
  return (
    <div className={styles.pageLoading}>
      <Spin size="large" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Props                                                                     */
/* -------------------------------------------------------------------------- */

interface SettingsWindowProps {
  open: boolean;
  onClose: () => void;
  user: YdszUser | null;
  navZones?: Record<string, NavZone>;
  /** Initial page key to focus when the window opens. */
  initialKey?: SettingsWindowKey;
}

/* -------------------------------------------------------------------------- */
/*  Component map                                                             */
/* -------------------------------------------------------------------------- */

function renderPage(key: SettingsWindowKey) {
  switch (key) {
    case "models":
      return <ModelsPage />;
    case "admin-users":
      return <AdminUsersPage />;
    case "admin-storage":
      return <AdminStoragePage />;
    case "channels":
      return <PersonalizationPage />;
    case "admin-plugins":
      return <AdminPluginsPage />;
    case "personalization":
      return <PersonalizationPage />;
    case "bridge":
      return <BridgePage />;
    case "admin-security":
      return <SecurityPagePage />;
    case "admin-advanced":
      return <AdvancedSettingsPage />;
    case "updates":
      return <AdvancedSettingsPage />;
    case "environments":
      return <AdvancedSettingsPage />;
    case "remote-desktop":
      return <RemoteDesktopPage />;
    case "token-usage":
      return <TokenUsagePage />;
    case "connectors":
      return <ConnectorsPage />;
    case "skill-packages":
      return <SkillPackagesPage />;
    case "knowledge-bases":
      return <KnowledgeBasesPage />;
    case "workbench":
      return <WorkbenchPage />;
    case "acp":
      return <AcpPage />;
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Window header — renders lifted page header or falls back to default       */
/* -------------------------------------------------------------------------- */

const { Text } = Typography;

function SettingsWindowHeader({
  lifted,
  defaultTitle,
  onClose,
}: {
  lifted: LiftedHeader | null;
  defaultTitle: string;
  onClose: () => void;
}) {
  // Lifted header controls the whole row: its title/subtitle/actions. The
  // close button is always appended on the right.
  return (
    <div className={styles.contentHeader}>
      {lifted ? (
        <>
          <div className={styles.liftedTitleBlock}>
            <Text className={styles.contentTitle} strong>
              {lifted.title}
            </Text>
            {lifted.subtitle && (
              <Text type="secondary" className={styles.liftedSubtitle}>
                {lifted.subtitle}
              </Text>
            )}
          </div>
          <div className={styles.liftedActions}>
            {lifted.actions}
            <button
              type="button"
              className={styles.closeBtn}
              aria-label="Close"
              onClick={onClose}
            >
              <X size={18} strokeWidth={1.8} />
            </button>
          </div>
        </>
      ) : (
        <>
          <Text className={styles.contentTitle} strong>
            {defaultTitle}
          </Text>
          <button
            type="button"
            className={styles.closeBtn}
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main window                                                               */
/* -------------------------------------------------------------------------- */

export default function SettingsWindow({
  open,
  onClose,
  user,
  navZones,
  initialKey,
}: SettingsWindowProps) {
  const { t } = useTranslation();
  const groups = useMemo(
    () => buildSettingsNavGroups(user, navZones),
    [user, navZones],
  );

  // First available key (across all groups) — fallback when no initialKey given.
  const firstKey = useMemo<SettingsWindowKey | null>(() => {
    for (const group of groups) {
      if (group.items.length > 0) return group.items[0].key;
    }
    return null;
  }, [groups]);

  const [activeKey, setActiveKey] = useState<SettingsWindowKey | null>(null);
  const [searchText, setSearchText] = useState("");
  const [liftedHeader, setLiftedHeader] = useState<LiftedHeader | null>(null);

  // Sync activeKey when window opens.
  useEffect(() => {
    if (open) {
      setActiveKey(initialKey ?? firstKey);
      setSearchText("");
    }
  }, [open, initialKey, firstKey]);

  // Discard lifted header whenever the active page changes.
  useEffect(() => {
    setLiftedHeader(null);
  }, [activeKey]);

  const handleSetLiftedHeader = useCallback((header: LiftedHeader | null) => {
    setLiftedHeader(header);
  }, []);

  // Filter groups by search text (match against translated labels + group name).
  const filteredGroups = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const label = t(item.labelKey).toLowerCase();
          const groupLabel = t(group.groupKey).toLowerCase();
          return label.includes(query) || groupLabel.includes(query);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, searchText, t]);

  // Active nav item info.
  const activeItem = useMemo(() => {
    for (const group of groups) {
      for (const item of group.items) {
        if (item.key === activeKey) return item;
      }
    }
    return null;
  }, [groups, activeKey]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      destroyOnHidden
      width="100vw"
      className={styles.modalReset}
      style={{ top: 0, maxWidth: "100vw", margin: 0, paddingBottom: 0 }}
      styles={{
        content: {
          padding: 0,
          borderRadius: 0,
          height: "100vh",
          overflow: "hidden",
        },
      }}
    >
      <div className={styles.window}>
        {/* ------------ Left nav panel ------------ */}
        <nav className={styles.navPanel}>
          <div className={styles.navSearch}>
            <Search size={14} className={styles.navSearchIcon} />
            <input
              className={styles.navSearchInput}
              placeholder={t("settingsWindow.searchPlaceholder")}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              spellCheck={false}
            />
          </div>

          <div className={styles.navGroups}>
            {filteredGroups.map((group) => (
              <div key={group.groupKey} className={styles.navGroup}>
                <div className={styles.navGroupTitle}>{t(group.groupKey)}</div>
                {group.items.map((item) => {
                  const isActive = item.key === activeKey;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`${styles.navItem} ${
                        isActive ? styles.navItemActive : ""
                      }`}
                      onClick={() => setActiveKey(item.key)}
                    >
                      <span className={styles.navItemIcon}>{item.icon}</span>
                      <span className={styles.navItemLabel}>
                        {t(item.labelKey)}
                      </span>
                      {item.badge ? (
                        <span className={styles.navItemBadge}>
                          {item.badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}

            {filteredGroups.length === 0 && searchText && (
              <div className={styles.navNoResults}>
                {t("common.noSearchResults", { defaultValue: "无匹配项" })}
              </div>
            )}
          </div>
        </nav>

        {/* ------------ Right content panel ------------ */}
        <div className={styles.contentPanel}>
          {/* Header — uses page-lifted content when available */}
          <SettingsWindowHeader
            lifted={liftedHeader}
            defaultTitle={
              activeItem ? t(activeItem.labelKey) : t("settingsWindow.title")
            }
            onClose={onClose}
          />

          {/* Body */}
          <div className={styles.contentBody}>
            {activeKey ? (
              <SettingsHeaderProvider
                value={{ setLiftedHeader: handleSetLiftedHeader }}
              >
                <Suspense key={activeKey} fallback={<PageFallback />}>
                  {renderPage(activeKey)}
                </Suspense>
              </SettingsHeaderProvider>
            ) : (
              <div className={styles.emptyContent}>
                {t("settingsWindow.title")}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
