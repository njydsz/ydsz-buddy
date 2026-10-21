/**
 * BrandLogo — 启动/登录页品牌标识：SVG 图标 + 本地化文字。
 *
 * 替代原有的 PNG 水平 logo（PNG 中烘焙了 "Octop" 文字），改为组件化渲染，
 * 品牌文字根据当前 i18n 语言环境动态切换：
 *   - zh → 云顶数字工作台
 *   - en → Ydsz Worker
 */

import { useTranslation } from "react-i18next";
import { useTheme } from "../../context/ThemeContext";

interface BrandLogoProps {
  /** Logo 高度（图标等比缩放），默认 48 */
  height?: number;
  /** 图标与文字间距，默认 12 */
  gap?: number;
  /** 品牌文字字号（px），继承默认浏览器值 */
  fontSize?: number;
  /** 追加到外层容器的 CSS class */
  className?: string;
}

export default function BrandLogo({
  height = 48,
  gap = 12,
  fontSize,
  className,
}: BrandLogoProps) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const brandName = t("app.brandName");

  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap,
        height,
        flexShrink: 0,
      }}
    >
      <img
        src={isDark ? "/logo_vertical_white.svg" : "/logo_vertical_dark.svg"}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{
          height,
          width: "auto",
          display: "block",
        }}
      />
      <span
        style={{
          fontSize: fontSize ?? Math.round(height * 0.42),
          fontWeight: 600,
          color: "var(--fn-text-primary)",
          lineHeight: 1,
          whiteSpace: "nowrap",
          letterSpacing: "0.02em",
        }}
      >
        {brandName}
      </span>
    </div>
  );
}
