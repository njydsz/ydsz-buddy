/** @file form
 * @description 表单组件，基于 Base UI Form 原语封装，提供表单容器及表单验证能力。
 */

"use client";

import { Form as FormPrimitive } from "@base-ui/react/form";

import { cn } from "~/lib/utils";

/** 表单容器组件 */
function Form({ className, ...props }: FormPrimitive.Props) {
  return (
    <FormPrimitive
      className={cn("flex w-full flex-col gap-4", className)}
      data-slot="form"
      {...props}
    />
  );
}

export { Form };
