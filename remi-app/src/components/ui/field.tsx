/** @file field
 * @description 表单字段组件，基于 Base UI Field 原语封装，提供字段容器、标签、描述、错误提示和控件等子组件。
 */

"use client";

import { Field as FieldPrimitive } from "@base-ui/react/field";

import { cn } from "~/lib/utils";

/** 字段根容器组件 */
function Field({ className, ...props }: FieldPrimitive.Root.Props) {
  return (
    <FieldPrimitive.Root
      className={cn("flex flex-col items-start gap-2", className)}
      data-slot="field"
      {...props}
    />
  );
}

/** 字段标签组件 */
function FieldLabel({ className, ...props }: FieldPrimitive.Label.Props) {
  return (
    <FieldPrimitive.Label
      className={cn(
        "inline-flex items-center gap-2 font-medium text-base/4.5 text-foreground sm:text-sm/4",
        className,
      )}
      data-slot="field-label"
      {...props}
    />
  );
}

/** 字段项组件 */
function FieldItem({ className, ...props }: FieldPrimitive.Item.Props) {
  return (
    <FieldPrimitive.Item className={cn("flex", className)} data-slot="field-item" {...props} />
  );
}

/** 字段描述文本组件 */
function FieldDescription({ className, ...props }: FieldPrimitive.Description.Props) {
  return (
    <FieldPrimitive.Description
      className={cn("text-muted-foreground text-xs", className)}
      data-slot="field-description"
      {...props}
    />
  );
}

/** 字段错误提示组件 */
function FieldError({ className, ...props }: FieldPrimitive.Error.Props) {
  return (
    <FieldPrimitive.Error
      className={cn("text-destructive-foreground text-xs", className)}
      data-slot="field-error"
      {...props}
    />
  );
}

/** 字段控件组件（直接引用原语） */
const FieldControl = FieldPrimitive.Control;
/** 字段验证状态组件（直接引用原语） */
const FieldValidity = FieldPrimitive.Validity;

export { Field, FieldLabel, FieldDescription, FieldError, FieldControl, FieldItem, FieldValidity };
