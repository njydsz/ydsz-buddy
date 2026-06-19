// Stub — actual implementation will call `nativeApi.setWindowTheme`.
// For now this keeps the React side decoupled from the IPC call so
// unit tests can run without a Tauri runtime.
export async function setWindowTheme(args: {
  theme: "light" | "dark" | "system";
}): Promise<void> {
  const { nativeApi } = await import("./nativeApi");
  if (!nativeApi) return;
  await nativeApi.setWindowTheme(args);
}
