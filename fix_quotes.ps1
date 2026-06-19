# Fix missing closing quotes in messages.ts
$file = "apps\desktop\src\ui\i18n\messages.ts"
$bytes = [System.IO.File]::ReadAllBytes($file)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)

# Pattern: string value missing closing quote before comma
# e.g., `loading: "加载中,` should be `loading: "加载中",`
# Match: key: "text, (where text doesn't contain a closing quote)
$lines = $text -split "`n"
$fixed = @()

foreach ($line in $lines) {
    # Check if line has a string value missing closing quote
    # Pattern: starts with spaces, has key: "value, (no closing quote)
    if ($line -match '^(\s+[\w]+:\s+)"([^"]*),(\s*)$') {
        $prefix = $matches[1]
        $value = $matches[2]
        $suffix = $matches[3]
        $line = "${prefix}`"${value}`",${suffix}"
    }
    $fixed += $line
}

$text = $fixed -join "`n"

# Write back
[System.IO.File]::WriteAllText($file, $text, (New-Object System.Text.UTF8Encoding $false))
Write-Host "Fixed missing closing quotes"
