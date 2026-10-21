$files = @(
    "D:\Code\open\ydsz-buddy\src\ydsz\i18n\en.json",
    "D:\Code\open\ydsz-buddy\src\ydsz\i18n\zh.json",
    "D:\Code\open\ydsz-buddy\desktop\src\assets\index.html"
)
$excludes = @("octop-harness", "octop-gateway", "octop-memory", "octop-browser", "octop-mascot")

foreach ($f in $files) {
    Write-Host "=== $f ==="
    $lines = Get-Content $f
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        if ($line -match "octop") {
            $lower = $line.ToLower()
            $skip = $false
            foreach ($ex in $excludes) {
                if ($lower.Contains($ex)) { $skip = $true; break }
            }
            if (-not $skip) {
                Write-Host ("  Line {0}: {1}" -f ($i+1), $line.Trim())
            }
        }
    }
}
