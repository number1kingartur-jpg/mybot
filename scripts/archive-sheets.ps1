# Контактные листы по кадрам мастер-архива.
# Номер под ячейкой это n из index.json, по нему кадр возвращается к исходному
# видеофайлу. Ячейки мелкие: задача не разглядеть детали, а найти на листе
# локации (море, смотровая, город, стадион, дорога) для дальнейшего просмотра.

Add-Type -AssemblyName System.Drawing

$dir = "C:\Users\admin\OneDrive\Desktop\AKF-PRIMERY\_arch"
$list = Get-ChildItem $dir -Filter "????.jpg" | Sort-Object Name

$cols = 12
$rows = 8
$per = $cols * $rows
$cell = 150
$label = 15
$sheetW = $cols * $cell
$sheetH = $rows * ($cell + $label)

$font = New-Object System.Drawing.Font("Arial", 8)
$brush = [System.Drawing.Brushes]::Yellow
$bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(16, 16, 16))

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
      $scale = [math]::Min($cell / $img.Width, $cell / $img.Height)
      $w = [int]($img.Width * $scale)
      $h = [int]($img.Height * $scale)
      $cx = $col * $cell + [int](($cell - $w) / 2)
      $cy = $row * ($cell + $label) + [int](($cell - $h) / 2)
      $g.DrawImage($img, $cx, $cy, $w, $h)
      $img.Dispose()
    } catch { }
    $tx = $col * $cell + 3
    $ty = $row * ($cell + $label) + $cell
    $g.DrawString($item.BaseName, $font, $brush, [float]$tx, [float]$ty)
  }

  $g.Dispose()
  $path = "{0}\asheet-{1:d2}.jpg" -f $dir, $s
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  $bmp.Dispose()
}
Write-Host "done"
