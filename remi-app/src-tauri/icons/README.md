# Icons

This directory holds the platform-native icon assets used by
`tauri build` to produce installers. The committed files are
1×1 placeholders so the Rust toolchain can find a complete icon set
during development. Replace them with the final branded icon set
(generated from `apps/desktop/resources/icon.png` in the original
Peak Code repo) before cutting a release.

Expected filenames (per `tauri.conf.json`):
- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.icns`     (macOS)
- `icon.ico`      (Windows)
