import { YDSZ_EMPTY_MASCOT_SRC } from "../../assets/mascot";
import styles from "./EmptyState.module.less";

interface YdEmptyMascotProps {
  className?: string;
  /** Square edge in px; default 160. */
  size?: number;
}

/**
 * Ydsz Worker empty-state mascot image with shared sizing.
 * Use inside custom empty UIs or pass as ``EmptyState`` icon /
 * antd ``Empty`` ``image``.
 */
export function YdEmptyMascot({
  className,
  size = 160,
}: YdEmptyMascotProps) {
  return (
    <img
      src={YDSZ_EMPTY_MASCOT_SRC}
      alt=""
      draggable={false}
      className={className ? `${styles.mascot} ${className}` : styles.mascot}
      style={size === 160 ? undefined : { width: size, height: size }}
    />
  );
}
