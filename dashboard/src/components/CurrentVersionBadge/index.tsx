import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Tooltip } from "antd";
import { useUpdateStatus } from "../../hooks/useUpdateStatus";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { userCan } from "../../utils/permissions";
import styles from "./index.module.less";

interface CurrentVersionBadgeProps {
  isMobile?: boolean;
  isSidebar?: boolean;
}

export default function CurrentVersionBadge({
  isMobile,
  isSidebar,
}: CurrentVersionBadgeProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const { status } = useUpdateStatus();

  const version = status?.current_version;
  if (!version) return null;

  const canUpdate = userCan(user, "update");
  const tooltip = canUpdate
    ? t("header.currentVersionAdmin", { version })
    : t("header.currentVersion", { version });
  const label = `v${version}`;

  // 侧边栏中使用无背景文字样式，与侧边栏导航项风格统一
  const sidebarStyle = isSidebar
    ? {
        fontSize: 11,
        lineHeight: 1.2,
        color: "var(--fn-sidebar-group-text)",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }
    : undefined;

  if (canUpdate) {
    return (
      <Tooltip title={tooltip} mouseEnterDelay={0.35}>
        <button
          type="button"
          className={
            isSidebar
              ? ""
              : `${styles.versionBadge} ${
                  isMobile ? styles.versionBadgeMobile : ""
                } ${styles.versionBadgeClickable}`
          }
          style={sidebarStyle}
          onClick={() => navigate("/admin/advanced?tab=updates")}
          aria-label={tooltip}
        >
          {label}
        </button>
      </Tooltip>
    );
  }

  return (
    <Tooltip title={tooltip} mouseEnterDelay={0.35}>
      <span
        className={isSidebar ? "" : styles.versionBadge}
        style={sidebarStyle}
        aria-label={tooltip}
      >
        {label}
      </span>
    </Tooltip>
  );
}
