# Fix encoding corruption in web app files
function Fix-EncodingCorruption {
    param([string]$file)
    
    if (-not (Test-Path $file)) {
        Write-Host "$file : NOT FOUND"
        return
    }
    
    $bytes = [System.IO.File]::ReadAllBytes($file)
    $text = [System.Text.Encoding]::UTF8.GetString($bytes)
    
    $corruptChar = [char]0xFFFD
    $pattern = "$corruptChar`?"
    $countBefore = ([regex]::Matches($text, [regex]::Escape($pattern))).Count
    
    if ($countBefore -eq 0) {
        Write-Host "$file : no corruption found"
        return
    }
    
    Write-Host "$file : found $countBefore corrupted sequences"
    $text = $text -replace [regex]::Escape($pattern), ""
    [System.IO.File]::WriteAllText($file, $text, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "$file : fixed"
}

# Fix all web app files with corruption
$webFiles = @(
    "apps\web\src\components\chat\ComposerLocalDirectoryMenu.tsx",
    "apps\web\src\components\chat\DirectoryTreeBrowser.tsx",
    "apps\web\src\components\chat\DirectoryTreePicker.tsx",
    "apps\web\src\components\chat\ProjectPicker.tsx",
    "apps\web\src\components\Sidebar.tsx",
    "apps\web\src\components\SidebarSearchPalette.tsx",
    "apps\web\src\components\terminal\TerminalChrome.tsx",
    "apps\web\src\i18n\messages.ts"
)

foreach ($f in $webFiles) {
    Fix-EncodingCorruption $f
}
