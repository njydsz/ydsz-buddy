# Fix encoding corruption in messages.ts
# Pattern: EF BF BD 3F (U+FFFD + '?') at end of Chinese strings before closing quote
$file = "apps\desktop\src\ui\i18n\messages.ts"
$bytes = [System.IO.File]::ReadAllBytes($file)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)

# The corruption pattern is: Chinese text followed by EF BF BD 3F 22 2C
# which renders as: 中文?, (broken char + ? + closing quote + comma)
# We need to remove the EF BF BD 3F sequence (the corrupted trailing char)

# Remove all occurrences of the replacement character followed by '?'
$corruptChar = [char]0xFFFD
$pattern1 = "$corruptChar`?"  # U+FFFD followed by ?

$count = ([regex]::Matches($text, [regex]::Escape($pattern1))).Count
Write-Host "Found $count corrupted sequences"

# Replace all corrupted sequences - the pattern is always at end of string before closing quote
$text = $text -replace [regex]::Escape($pattern1), ""

# Write back
[System.IO.File]::WriteAllText($file, $text, (New-Object System.Text.UTF8Encoding $false))
Write-Host "Fixed messages.ts"
