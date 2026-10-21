import styles from "./YdSpinner.module.less";

interface YdSpinnerProps {
  /** antd appends `${prefixCls}-dot` when this is the ConfigProvider indicator. */
  className?: string;
}

/**
 * Loading indicator wired globally as the antd Spin indicator: a plain
 * brand-colored ring at every size. The logo splash is reserved for the
 * first-paint boot screen in index.html.
 */
export default function YdSpinner({ className }: YdSpinnerProps) {
  return (
    <span className={[styles.host, className].filter(Boolean).join(" ")}>
      <span className={styles.ring} />
    </span>
  );
}
