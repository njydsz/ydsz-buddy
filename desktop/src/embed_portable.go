//go:build !production || darwin

package main

// Development builds look for YdszWorker-<plat>.zip or YdszWorker-portable-<plat>-*.zip
// beside the executable. macOS production copies the zip into Resources as
// YdszWorker-<plat>.zip.
var embeddedPortable []byte
