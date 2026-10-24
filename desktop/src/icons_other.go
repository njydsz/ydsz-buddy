//go:build !darwin

package main

import (
	_ "embed"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed assets/tray-icon.png
var trayIcon []byte

func applyTrayIcon(tray *application.SystemTray) {
	tray.SetIcon(trayIcon)
}

func applyAppIcon(app *application.App) {
	app.SetIcon(trayIcon)
}

// appIcon returns the platform icon bytes for use in application.Options.Icon.
// SetIcon is a no-op on Windows, but the window reads Options.Icon during
// creation and falls back to the embedded PNG when no .exe resource exists
// (e.g. in the dev runner that has no .syso linked in).
func appIcon() []byte {
	return trayIcon
}
