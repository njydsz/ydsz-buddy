$peakBase = 'D:\Code\github\PeakCode\apps\web\src'
$remiBase = 'd:\Code\remi\org\modules\remi-code\remi-app\src'

$peak = Get-ChildItem -Path $peakBase -Recurse -File | Where-Object { $_.Name -notmatch '\.test\.' } | ForEach-Object { $_.FullName.Substring($peakBase.Length + 1) }
$remi = Get-ChildItem -Path $remiBase -Recurse -File | Where-Object { $_.Name -notmatch '\.test\.' } | ForEach-Object { $_.FullName.Substring($remiBase.Length + 1) }

Write-Host "=== PeakCode has but remi-app missing ==="
$missing = $peak | Where-Object { $remi -notcontains $_ }
if ($missing) { $missing | Sort-Object } else { Write-Host "None" }

Write-Host ""
Write-Host "=== remi-app has but PeakCode does not ==="
$extra = $remi | Where-Object { $peak -notcontains $_ }
if ($extra) { $extra | Sort-Object } else { Write-Host "None" }
