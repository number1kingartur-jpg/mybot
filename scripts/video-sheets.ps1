# Contact sheets over the extracted video frames.
# Cells are tall because the clips are vertical; the caption under each cell is
# the frame file name, which already encodes clip and timestamp percent.

Add-Type -AssemblyName System.Drawing

$dir = "C:\Users\admin\OneDrive\Desktop\AKF-PRIMERY\_video"
$list = Get-ChildItem $dir -Filter *.jpg | Sort-Object Name

$cols = 8
$rows = 4
$per = $cols * $rows
$cellW = 170
$cellH = 260
$label = 26
$sheetW = $cols * $cellW
$sheetH = $rows * ($cellH + $label)

$font = New-Object System.Drawing.Font("Arial", 8)
$brush = [System.Drawing.Brushes]::White
$bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(18, 18, 18))

$sheets = [math]::Ceiling($list.Count / $per)
Write-Host "frames: $($list.Count), sheets: $sheets"

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
    $name = $item.BaseName
    $tx = $col * $cellW + 3
    $ty = $row * ($cellH + $label) + $cellH + 2
    $g.DrawString($name, $font, $brush, [float]$tx, [float]$ty)
  }

  $g.Dispose()
  $path = "{0}\vsheet-{1:d2}.jpg" -f $dir, $s
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  $bmp.Dispose()
  Write-Host "saved $path"
}
