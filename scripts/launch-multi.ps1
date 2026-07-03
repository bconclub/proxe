# Launch all five brand production servers from their .multi clones.
# MUST run from a foreground shell: servers started inside a background job
# get killed with the job's process tree.
$multi = 'C:\GO PROXe\.multi'
$pairs = @(@('windchasers',4002),@('pop',4003),@('lokazen',4004),@('proxe',4005),@('bcon',4006))

foreach ($pair in $pairs) {
  $b = $pair[0]; $p = $pair[1]
  Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -Confirm:$false -ErrorAction SilentlyContinue }
  Start-Process -WindowStyle Hidden cmd -ArgumentList '/c', "$multi\$b\start-prod.cmd"
}

$deadline = (Get-Date).AddSeconds(90)
do {
  $up = @()
  foreach ($p in 4002..4006) {
    try { $r = Invoke-WebRequest -Uri ('http://localhost:{0}/api/health' -f $p) -UseBasicParsing -TimeoutSec 4; if ($r.StatusCode -eq 200) { $up += $p } } catch {}
  }
  if ($up.Count -eq 5) { break }
  Start-Sleep -Seconds 5
} while ((Get-Date) -lt $deadline)
Write-Host ('healthy: {0}' -f ($up -join ', '))
