$lines = Get-Content 'D:\Code\open\ydsz-buddy\src\ydsz\i18n\en.json'
for ($i = 943; $i -le 950; $i++) { Write-Host "$($i+1): $($lines[$i])" }
Write-Host "---"
for ($i = 989; $i -le 995; $i++) { Write-Host "$($i+1): $($lines[$i])" }
