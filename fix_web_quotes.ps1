# Comprehensive fix for web messages.ts - fix all unclosed Chinese strings
$file = "apps\web\src\i18n\messages.ts"
$bytes = [System.IO.File]::ReadAllBytes($file)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)

# Pattern: a Chinese string that ends with comma but missing closing quote
# The corruption removed the last char + closing quote, leaving: "text,
# We need to find lines matching: key: "text,  and change to: key: "text",

# Fix pattern: find lines where a double-quoted string is missing its closing quote
# These lines end with: Chinese_text,  (no closing " before the comma)
# The regex matches: (:\s+)"([^"]*[\x{4e00}-\x{9fff}]),(\s*$)
# Meaning: after ": ", capture Chinese text ending with comma at EOL, missing closing "

$lines = $text -split "`n"
$fixed = @()
$fixCount = 0

foreach ($line in $lines) {
    # Match pattern: property: "chinese_text,  (missing closing quote)
    # This is a line where the value string starts with " but doesn't have a closing " before the trailing comma
    if ($line -match '^(\s+[\w]+:\s+)"([^"]*[\u4e00-\u9fff]+),(\s*)$') {
        $prefix = $Matches[1]
        $value = $Matches[2]
        $suffix = $Matches[3]
        $line = "${prefix}`"${value}`",${suffix}"
        $fixCount++
    }
    $fixed += $line
}

$text = $fixed -join "`n"

# Write back
[System.IO.File]::WriteAllText($file, $text, (New-Object System.Text.UTF8Encoding $false))
Write-Host "Fixed $fixCount unclosed strings in web messages.ts"
