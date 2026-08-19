# Полоса из пяти кадров на каждый клип: движение видно целиком, а не по одному кадру.
#
# Прошлый разбор шел по одному кадру на клип, и этого не хватило: под «Гирей»
# оказалась стойка со штангой, под «Коленями» человек, идущий к зеркалу.
# Имена файлов на сайте не совпадают с содержимым, поэтому судить можно только
# по последовательности кадров.

Add-Type -AssemblyName System.Drawing

$src = "C:\Users\admin\OneDrive\Desktop\CURSOR\public\video\artur\exercises"
$tmp = "C:\Users\admin\OneDrive\Desktop\AKF-PRIMERY\_strips\f"
$out = "C:\Users\admin\OneDrive\Desktop\AKF-PRIMERY\_strips"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$clips = Get-ChildItem $src -Filter *.mp4 | Where-Object { $_.Length -gt 0 } | Sort-Object Name
Write-Host "clips: $($clips.Count)"

$pcts = 10, 30, 50, 70, 90
foreach ($c in $clips) {
  $dur = [double](ffprobe -v error -show_entries format=duration -of csv=p=0 $c.FullName)
  foreach ($p in $pcts) {
    $t = [math]::Round($dur * $p / 100, 2)
    $d = Join-Path $tmp ("{0}--{1}.jpg" -f $c.BaseName, $p)
    ffmpeg -y -v error -ss $t -i $c.FullName -frames:v 1 -vf "scale=200:-2" -q:v 3 $d 2>$null
  }
}

$cellW = 200
$cellH = 356
$label = 24
$rows = 4
$sheetW = $cellW * 5
$sheetH = ($cellH + $label) * $rows

$font = New-Object System.Drawing.Font("Arial", 12, [System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.Brushes]::Yellow
$bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(16, 16, 16))

$sheets = [math]::Ceiling($clips.Count / $rows)
for ($s = 0; $s -lt $sheets; $s++) {
  $bmp = New-Object System.Drawing.Bitmap $sheetW, $sheetH
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.FillRectangle($bg, 0, 0, $sheetW, $sheetH)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBilinear

  for ($r = 0; $r -lt $rows; $r++) {
    $idx = $s * $rows + $r
    if ($idx -ge $clips.Count) { break }
    $name = $clips[$idx].BaseName
    $y = $r * ($cellH + $label)
    for ($k = 0; $k -lt 5; $k++) {
      $p = $pcts[$k]
      $file = Join-Path $tmp ("{0}--{1}.jpg" -f $name, $p)
      if (-not (Test-Path $file)) { continue }
      try {
        $img = [System.Drawing.Image]::FromFile($file)
        $scale = [math]::Min($cellW / $img.Width, $cellH / $img.Height)
        $w = [int]($img.Width * $scale)
        $h = [int]($img.Height * $scale)
        $g.DrawImage($img, $k * $cellW + [int](($cellW - $w) / 2), $y + [int](($cellH - $h) / 2), $w, $h)
        $img.Dispose()
      } catch { }
    }
    $g.DrawString($name, $font, $brush, 4.0, [float]($y + $cellH + 2))
  }

  $g.Dispose()
  $path = "{0}\strip-{1:d2}.jpg" -f $out, $s
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  $bmp.Dispose()
}
Write-Host "sheets: $sheets"
