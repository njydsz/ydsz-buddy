// Stub — kept for backwards compatibility. The real implementation
// is inlined into `useTheme.tsx` so we don't import the native
// bridge (which can fail in unit tests) from a leaf module.
export async function setWindowTheme(args: {
  theme: "light" | "dark" | "system";
}): Promise<void> {
  if (typeof window === "undefined") return;
  const { nativeApi } = await import("./nativeApi");
  if (!nativeApi) return;
  await nativeApi.setWindowTheme(args);
}
