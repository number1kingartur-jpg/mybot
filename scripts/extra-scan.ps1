# extra-scan.ps1
# Читает 6 исходных папок по отдельности, делает кадры шириной 320.
# Для видео берет кадр на 35 процентах длительности.
# Ничего не удаляет и не перемещает.

$out = "C:\Users\admin\OneDrive\Desktop\AKF-PRIMERY\_extra"
New-Item -ItemType Directory -Force -Path $out | Out-Null

$extVideo = @('.mp4', '.mov', '.m4v')
$extPhoto = @('.jpg', '.jpeg', '.png', '.heic')
$extAll = $extVideo + $extPhoto

$sources = @(
  @{ prefix = 's1'; path = 'C:\Users\admin\OneDrive\Desktop\фотки видео' },
  @{ prefix = 's2'; path = 'C:\Users\admin\OneDrive\Desktop\Фото\Camera' },
  @{ prefix = 's3'; path = 'C:\Users\admin\OneDrive\Desktop\Фото\телега' },
  @{ prefix = 's4'; path = 'C:\Users\admin\OneDrive\Desktop\Упражнения-фото' },
  @{ prefix = 's5'; path = 'C:\Users\admin\OneDrive\Desktop\тату' },
  @{ prefix = 's6'; path = 'C:\Users\admin\OneDrive\Desktop\Фото' }
)

foreach ($src in $sources) {
  $prefix = $src.prefix
  $srcPath = $src.path
  Write-Host "=== $prefix ==="

  if (-not (Test-Path -LiteralPath $srcPath)) {
    Write-Host "missing folder"
    $json = ConvertTo-Json -InputObject @() -Depth 3
    [System.IO.File]::WriteAllText((Join-Path $out "$prefix-index.json"), $json, (New-Object System.Text.UTF8Encoding($false)))
    continue
  }

  $files = Get-ChildItem -LiteralPath $srcPath -File | Where-Object {
    ($extAll -contains $_.Extension.ToLowerInvariant()) -and ($_.Length -gt 60KB)
  } | Sort-Object Name

  Write-Host "candidates: $($files.Count)"

  $index = New-Object System.Collections.Generic.List[object]
  $i = 0
  foreach ($f in $files) {
    $ext = $f.Extension.ToLowerInvariant()
    $dst = Join-Path $out ("{0}-{1:d4}.jpg" -f $prefix, $i)
    $ok = $false

    if ($extVideo -contains $ext) {
      $dur = 0.0
      try {
        $dur = [double](& ffprobe -v error -show_entries format=duration -of csv=p=0 $f.FullName)
      } catch { }
      if ($dur -le 0.3) { continue }
      $t = [math]::Round($dur * 0.35, 2)
      & ffmpeg -y -v error -ss $t -i $f.FullName -frames:v 1 -vf "scale=320:-2" -q:v 4 $dst 2>$null
      $ok = Test-Path -LiteralPath $dst
    } else {
      & ffmpeg -y -v error -i $f.FullName -vf "scale=320:-2" -q:v 4 $dst 2>$null
      $ok = Test-Path -LiteralPath $dst
    }

    if ($ok) {
      $index.Add([pscustomobject]@{ n = $i; path = $f.FullName })
      $i++
      if ($i % 50 -eq 0) { Write-Host "  $i" }
    }
  }

  $arr = @($index.ToArray())
  $json = ConvertTo-Json -InputObject $arr -Depth 3
  [System.IO.File]::WriteAllText((Join-Path $out "$prefix-index.json"), $json, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "frames: $i"
}