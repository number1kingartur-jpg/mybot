# Retry deploy until the new version is actually served.
#
# Reason: Railway incident on 2026-08-19 (deployments hang in INITIALIZING and fail
# by timeout, all regions, confirmed on status.railway.com). The code is fine, so the
# only cure is retrying.
#
# Success is checked by the served file, not by deployment status: a SUCCESS status
# without the new code has already happened here, so status alone is not trusted.
#
# ASCII only on purpose: Windows PowerShell 5.1 reads .ps1 as ANSI and breaks on UTF-8.

param(
  [string]$Marker = "prof_tab",
  [string]$Url = "https://mybot-production-e7a5.up.railway.app",
  [int]$MaxTries = 24,
  [int]$WaitSeconds = 240
)

$log = Join-Path $PSScriptRoot "..\deploy-watch.log"

function Note($text) {
  $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $text
  $line | Tee-Object -FilePath $log -Append
}

function LiveHasMarker {
  try {
    $js = [string](Invoke-RestMethod -Uri "$Url/js/app.js" -TimeoutSec 25)
    return $js.Contains($Marker)
  } catch {
    return $false
  }
}

Note "start: waiting for marker '$Marker' at $Url/js/app.js"

for ($i = 1; $i -le $MaxTries; $i++) {
  if (LiveHasMarker) {
    Note "DONE: new version is live (try $i)"
    exit 0
  }

  $last = (railway deployment list 2>&1 | Select-Object -Skip 1 -First 1)
  Note "try $i, last deployment: $last"

  # Do not stack deployments while one is still alive: during the incident a queue
  # only makes the wait longer.
  if ($last -notmatch "INITIALIZING|BUILDING|DEPLOYING") {
    railway up --detach 2>&1 | Select-String -Pattern "Build Logs|rror" | ForEach-Object { Note $_.ToString().Trim() }
  }

  Start-Sleep -Seconds $WaitSeconds
}

Note "GIVE UP after $MaxTries tries - Railway incident still open"
exit 1
