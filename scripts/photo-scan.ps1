# Photo archive inventory: image sizes, screenshot filtering.
# A phone screenshot is useless as a source frame for location transfer - a camera shot is required.

Add-Type -AssemblyName System.Drawing

$root = "C:\Users\admin\OneDrive\Desktop\CONTENT\brand\media-archive"
$out  = "C:\Users\admin\OneDrive\Desktop\AKF-PRIMERY\_scan"
New-Item -ItemType Directory -Force -Path $out | Out-Null

$screenSizes = @(
  "1170x2532","2532x1170","1284x2778","2778x1284","1179x2556","2556x1179",
  "750x1334","1334x750","828x1792","1792x828","1125x2436","2436x1125",
  "1242x2688","2688x1242","1080x1920","1920x1080","640x1136","1290x2796","2796x1290"
)

$rows = @()
$files = Get-ChildItem $root -Recurse -File -Include *.jpg,*.jpeg,*.png,*.JPG,*.JPEG,*.PNG
Write-Host "total files: $($files.Count)"

foreach ($f in $files) {
  try {
    $img = [System.Drawing.Image]::FromFile($f.FullName)
    $dim = "$($img.Width)x$($img.Height)"
    $rows += [pscustomobject]@{
      path   = $f.FullName
      name   = $f.Name
      w      = $img.Width
      h      = $img.Height
      kb     = [int]($f.Length / 1KB)
      screen = $screenSizes -contains $dim
    }
    $img.Dispose()
  } catch { }
}

$real = $rows | Where-Object { -not $_.screen -and $_.kb -gt 400 -and $_.w -ge 900 -and $_.h -ge 900 }
Write-Host "camera shots (not screenshots, large): $($real.Count)"

$real | Select-Object path,name,w,h,kb | ConvertTo-Json -Depth 2 |
  Set-Content "$out\candidates.json" -Encoding UTF8
Write-Host "list saved: $out\candidates.json"
