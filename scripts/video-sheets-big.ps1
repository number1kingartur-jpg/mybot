# One large cell per clip, so the actual movement is readable.
# File names on the site lie in places (assault-bike is landscape B-roll,
# bulgarian-split-squat is an incline dumbbell press), so every clip has to be
# judged by what is in the frame, not by its name.

Add-Type -AssemblyName System.Drawing

$dir = "C:\Users\admin\OneDrive\Desktop\AKF-PRIMERY\_video"
$list = Get-ChildItem $dir -Filter "*--60.jpg" | Sort-Object Name

$cols = 5
$rows = 3
$per = $cols * $rows
$cellW = 300
$cellH = 470
$label = 30
$sheetW = $cols * $cellW
$sheetH = $rows * ($cellH + $label)

$font = New-Object System.Drawing.Font("Arial", 11, [System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.Brushes]::Yellow
$bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(18, 18, 18))

$sheets = [math]::Ceiling($list.Count / $per)
Write-Host "clips: $($list.Count), sheets: $sheets"

for ($s = 0; $s -lt $sheets; $s++) {
  $bmp = New-Object System.Drawing.Bitmap $sheetW, $sheetH
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.FillRectangle($bg, 0, 0, $sheetW, $sheetH)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBilinear

  for ($i = 0; $i -lt $per; $i++) {
    $idx = $s * $per + $i
    if ($idx -ge $list.Count) { break }
    $item = $list[$idx]
    $col = $i % $cols
    $row = [math]::Floor($i / $cols)
    try {
      $img = [System.Drawing.Image]::FromFile($item.FullName)
      $scale = [math]::Min($cellW / $img.Width, $cellH / $img.Height)
      $w = [int]($img.Width * $scale)
      $h = [int]($img.Height * $scale)
      $cx = $col * $cellW + [int](($cellW - $w) / 2)
      $cy = $row * ($cellH + $label) + [int](($cellH - $h) / 2)
      $g.DrawImage($img, $cx, $cy, $w, $h)
      $img.Dispose()
    } catch { }
    $name = $item.BaseName -replace "--60$", ""
    $tx = $col * $cellW + 4
    $ty = $row * ($cellH + $label) + $cellH + 4
    $g.DrawString($name, $font, $brush, [float]$tx, [float]$ty)
  }

  $g.Dispose()
  $path = "{0}\big-{1:d2}.jpg" -f $dir, $s
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  $bmp.Dispose()
  Write-Host "saved $path"
}
