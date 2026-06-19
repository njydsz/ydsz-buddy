# Fix encoding corruption in all remaining files
# Pattern: EF BF BD 3F (U+FFFD + '?') corrupts closing quotes/tags

function Fix-EncodingCorruption {
    param([string]$file)
    
    $bytes = [System.IO.File]::ReadAllBytes($file)
    $text = [System.Text.Encoding]::UTF8.GetString($bytes)
    
    # Count corruption before
    $corruptChar = [char]0xFFFD
    $pattern = "$corruptChar`?"
    $countBefore = ([regex]::Matches($text, [regex]::Escape($pattern))).Count
    
    if ($countBefore -eq 0) {
        Write-Host "$file : no corruption found"
        return
    }
    
    Write-Host "$file : found $countBefore corrupted sequences"
    
    # Remove all U+FFFD + '?' sequences
    $text = $text -replace [regex]::Escape($pattern), ""
    
    # Write back
    [System.IO.File]::WriteAllText($file, $text, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "$file : fixed"
}

$files = @(
    "apps\desktop\src\ui\components\chat\DirectoryTreeBrowser.tsx",
    "apps\desktop\src\ui\components\chat\ProjectPicker.tsx",
    "apps\desktop\src\ui\routes\_chat.settings.tsx"
)

foreach ($f in $files) {
    Fix-EncodingCorruption $f
}
