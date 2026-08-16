/**
 * @file vitest-shim.d.ts
 * @description 本地 vitest 类型 shim —— 解决 vitest 2.1.9 dist/index.d.ts
 *  在 tsc --moduleResolution=bundler 下 named import 解析失败的问题。
 *
 * 原因：vitest 2.1.9 的 dist/index.d.ts 通过 `export { ... } from '@vitest/runner'`
 * re-export describe/it/test 等，但 tsc 在解析跨包 re-export + 内部 chunks
 * 引用时偶发地判定整个模块导出为空（named import 报 TS2305）。
 * namespace import (`import * as v from 'vitest'`) 走的是另一条路径，
 * 因此可以拿到所有命名导出。
 *
 * 策略：用 `declare module "vitest"` 显式声明 vitest 命名空间，
 * 把所有常用命名符号重新导出。这样所有现有 .test.ts 文件中的
 * `import { describe, it, expect, ... } from 'vitest'` 都能正常解析，
 * 且不会改变运行时行为（shim 不会被 vite/vitest 加载，仅在 tsc 类型检查时生效）。
 *
 * 此 shim 通过 tsconfig.json 的 `include: ["src"]` 自动加载。
 */

declare module "vitest" {
  // describe/it/test/suite —— 来自 @vitest/runner 的 named export
  export {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    it,
    onTestFailed,
    onTestFinished,
    suite,
    test,
  } from "@vitest/runner";

  // 常用类型
  export type {
    Assertion,
    AsymmetricMatchersContaining,
    ExpectPollOptions,
    ExpectStatic,
    ExtendedContext,
    HookCleanupCallback,
    HookListener,
    InferFixturesTypes,
    JestAssertion,
    Mock,
    Mocked,
    MockedClass,
    MockedFunction,
    MockedObject,
    MockInstance,
    OnTestFailedHandler,
    OnTestFinishedHandler,
    PromisifyAssertion,
    RunMode,
    SuiteAPI,
    SuiteCollector,
    SuiteFactory,
    TaskContext,
    TaskCustomOptions,
    TaskMeta,
    TestAPI,
    TestContext,
    TestFunction,
    TestOptions,
  } from "@vitest/runner";

  // expect/vi/spyOn/fn 等通过 ambient const 提供（与 @vitest/runner/vitest 兼容）
  declare const expect: import("@vitest/expect").ExpectStatic;
  declare const expectTypeOf: import("expect-type").ExpectTypeOf;
  declare const vi: typeof import("@vitest/runner").vitest;
  declare const spyOn: typeof import("@vitest/spy").spyOn;
  declare const fn: typeof import("@vitest/spy").fn;

  // 上面 declare const 默认不会作为 named export 出现，需要用 export {} 强制
  export {
    expect,
    expectTypeOf,
    vi,
    spyOn,
    fn,
  };

  // bench API
  export const bench: {
    (name: string, fn: (...args: unknown[]) => unknown): void;
    (name: string, options: Record<string, unknown>, fn: (...args: unknown[]) => unknown): void;
  };

  export {};
}

export {};
