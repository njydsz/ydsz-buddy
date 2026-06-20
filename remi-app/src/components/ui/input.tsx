/**
 * @file input
 * @description 输入框组件，基于 Base UI Input 原语封装，
 * 支持多种尺寸、无样式模式和原生 input 模式。
 */
"use client";

import { Input as InputPrimitive } from "@base-ui/react/input";
import { forwardRef, type ComponentPropsWithoutRef, type CSSProperties } from "react";

import { cn } from "~/lib/utils";

/** 输入框属性类型 */
type InputProps = Omit<ComponentPropsWithoutRef<typeof InputPrimitive>, "size" | "style"> & {
  size?: "sm" | "default" | "lg" | number;
  unstyled?: boolean;
  nativeInput?: boolean;
  style?: CSSProperties;
};

/** 输入框组件，支持转发 ref 以便浏览器地址栏自动聚焦和选中 */
const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, size = "default", unstyled = false, nativeInput = false, ...props },
  ref,
) {
  const inputClassName = cn(
    "font-system-ui h-8.5 w-full min-w-0 rounded-[inherit] px-[calc(--spacing(3)-1px)] leading-8.5 outline-none placeholder:text-muted-foreground/72 sm:h-7.5 sm:leading-7.5 [transition:background-color_5000000s_ease-in-out_0s]",
    size === "sm" && "h-7.5 px-[calc(--spacing(2.5)-1px)] leading-7.5 sm:h-6.5 sm:leading-6.5",
    size === "lg" && "h-9.5 leading-9.5 sm:h-8.5 sm:leading-8.5",
    props.type === "search" &&
      "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none",
    props.type === "file" &&
      "text-muted-foreground file:me-3 file:bg-transparent file:font-medium file:text-[length:var(--app-font-size-ui-sm,11px)] file:text-foreground",
  );

  return (
    <span
      className={
        cn(
          !unstyled &&
            "relative inline-flex w-full rounded-md border border-input bg-background not-dark:bg-clip-padding text-(length:--app-font-size-ui,12px) text-foreground ring-ring/16 transition-shadow before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-md)-1px)] not-has-disabled:not-has-focus-visible:not-has-aria-invalid:before:shadow-[0_1px_--theme(--color-black/2%)] has-focus-visible:has-aria-invalid:border-destructive/50 has-focus-visible:has-aria-invalid:ring-destructive/12 has-aria-invalid:border-destructive/30 has-focus-visible:border-ring/70 has-autofill:bg-foreground/4 has-disabled:opacity-64 has-focus-visible:ring-2 sm:text-(length:--app-font-size-ui,12px) dark:bg-input/32 dark:has-autofill:bg-foreground/8 dark:has-aria-invalid:ring-destructive/24 dark:not-has-disabled:not-has-focus-visible:not-has-aria-invalid:before:shadow-[0_-1px_--theme(--color-white/3%)]",
          className,
        ) || undefined
      }
      data-size={size}
      data-slot="input-control"
    >
      {nativeInput ? (
        <input
          className={inputClassName}
          data-slot="input"
          size={typeof size === "number" ? size : undefined}
          ref={ref}
          {...props}
        />
      ) : (
        <InputPrimitive
          className={inputClassName}
          data-slot="input"
          size={typeof size === "number" ? size : undefined}
          ref={ref}
          {...props}
        />
      )}
    </span>
  );
});

export { Input, type InputProps };
