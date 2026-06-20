# Create a minimal valid 16x16 ICO file
Add-Type -AssemblyName System.Drawing

$bitmap = New-Object System.Drawing.Bitmap(16, 16)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::FromArgb(59, 130, 246))
$graphics.Dispose()

$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$fileStream = [System.IO.File]::Create("d:\Code\remi\org\modules\remi-code\remi-app\src-tauri\icons\icon.ico")
$icon.Save($fileStream)
$fileStream.Close()
$icon.Dispose()
$bitmap.Dispose()

Write-Host "Valid ICO file created successfully"
