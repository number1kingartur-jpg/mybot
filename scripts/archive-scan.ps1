# Один кадр с каждого видео мастер-архива, чтобы найти виды Пхукета и локации.
# Кадр берется на 35 процентах длительности: начало часто смазано движением
# камеры, конец нередко обрезан.
#
# Имя кадра это порядковый номер, а карта номер -> путь пишется в index.json,
# чтобы выбранная ячейка листа однозначно вернулась к исходному файлу.

$src = "C:\Users\admin\OneDrive\Desktop\CONTENT\brand\media-archive\master\videos"
$out = "C:\Users\admin\OneDrive\Desktop\AKF-PRIMERY\_arch"
New-Item -ItemType Directory -Force -Path $out | Out-Null

$clips = Get-ChildItem $src -File | Where-Object { $_.Extension -match '^\.(mp4|mov|m4v)$' } | Sort-Object Name
Write-Host "clips: $($clips.Count)"

$index = @()
$i = 0
foreach ($c in $clips) {
  $dur = 0.0
  try { $dur = [double](ffprobe -v error -show_entries format=duration -of csv=p=0 $c.FullName) } catch { }
  if ($dur -le 0.3) { continue }
  $t = [math]::Round($dur * 0.35, 2)
  $dst = Join-Path $out ("{0:d4}.jpg" -f $i)
  ffmpeg -y -v error -ss $t -i $c.FullName -frames:v 1 -vf "scale=320:-2" -q:v 4 $dst 2>$null
  if (Test-Path $dst) {
    $index += [pscustomobject]@{ n = $i; path = $c.FullName; sec = $dur }
    $i++
    if ($i % 100 -eq 0) { Write-Host "  $i" }
  }
}

$json = $index | ConvertTo-Json -Depth 3
[System.IO.File]::WriteAllText("$out\index.json", $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "frames: $i"
