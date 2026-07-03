# Build every brand in /core and serve each from its .multi clone with `next start`.
# Production servers avoid the dev-mode junction/dual-react issue entirely and
# match what Vercel runs. ASCII only - PowerShell 5.1 parses this file as ANSI.
$ErrorActionPreference = 'Stop'
$root = 'C:\GO PROXe'
$multi = "$root\.multi"
$pairs = @(@('windchasers',4002),@('pop',4003),@('lokazen',4004),@('proxe',4005),@('bcon',4006))

foreach ($pair in $pairs) {
  $b = $pair[0]; $p = $pair[1]
  Write-Host ('=== {0} (port {1}) ===' -f $b, $p)

  Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -Confirm:$false -ErrorAction SilentlyContinue }

  cmd /c ('cd /d "{0}\core" && npm run build:{1} > "{2}\build-{1}.log" 2>&1' -f $root, $b, $multi)
  if ($LASTEXITCODE -ne 0) { Write-Host ('BUILD FAILED for {0} - see {1}\build-{0}.log' -f $b, $multi); continue }

  cmd /c ('rmdir /s /q "{0}\{1}\.next"' -f $multi, $b) 2>$null
  robocopy "$root\core\.next" "$multi\$b\.next" /E /NFL /NDL /NJH /NJS /NP | Out-Null
  cmd /c ('rmdir /s /q "{0}\{1}\public"' -f $multi, $b) 2>$null
  robocopy "$root\core\public" "$multi\$b\public" /E /NFL /NDL /NJH /NJS /NP | Out-Null
  Copy-Item "$root\core\.env.local" "$multi\$b\.env.local" -Force
  Copy-Item "$root\core\next.config.js" "$multi\$b\next.config.js" -Force

  # launcher .cmd for scripts\launch-multi.ps1 (run THAT from a foreground
  # shell - servers started inside a background job die with its process tree)
  $launcher = "$multi\$b\start-prod.cmd"
  $lines = @(
    ('cd /d "{0}\{1}"' -f $multi, $b),
    ('set BRAND_ID={0}' -f $b),
    ('set PORT={0}' -f $p),
    ('npx next start -p {0} >> dev-{1}.log 2>&1' -f $p, $b)
  )
  Set-Content -Path $launcher -Value $lines -Encoding ascii
  Write-Host ('{0} built and shipped (launch via launch-multi.ps1)' -f $b)
}
Write-Host 'ALL DONE'
