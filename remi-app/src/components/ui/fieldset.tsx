/** @file fieldset
 * @description 字段集组件，基于 Base UI Fieldset 原语封装，用于将相关表单字段分组。
 */

"use client";

import { Fieldset as FieldsetPrimitive } from "@base-ui/react/fieldset";

import { cn } from "~/lib/utils";

/** 字段集容器组件 */
function Fieldset({ className, ...props }: FieldsetPrimitive.Root.Props) {
  return (
    <FieldsetPrimitive.Root
      className={cn("flex w-full max-w-64 flex-col gap-6", className)}
      data-slot="fieldset"
      {...props}
    />
  );
}
/** 字段集标题组件 */
function FieldsetLegend({ className, ...props }: FieldsetPrimitive.Legend.Props) {
  return (
    <FieldsetPrimitive.Legend
      className={cn("font-semibold text-foreground", className)}
      data-slot="fieldset-legend"
      {...props}
    />
  );
}

export { Fieldset, FieldsetLegend };
