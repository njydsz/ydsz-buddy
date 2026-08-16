/**
 * @file vitest 全局 setup
 *
 * 在所有测试运行前设置 React act 环境,使 @testing-library/react 16 的
 * `act()` 与 vitest 协同工作,避免出现:
 *   "Warning: The current testing environment is not configured to support act(...)"
 *
 * 同时为 happy-dom 补齐 Web Animations API 的最小桩,
 * 解决 base-ui ScrollArea viewport 内部 useTimeout 调
 * viewport.getAnimations() 抛 TypeError 的问题。
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof Element !== "undefined" && typeof Element.prototype.getAnimations !== "function") {
  // eslint-disable-next-line no-extend-native
  Element.prototype.getAnimations = function getAnimations(): Animation[] {
    return [];
  };
}
