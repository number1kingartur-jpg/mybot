# Лист по сессии со скакалкой: восемь точек на каждом клипе.
# Нужно найти момент, где прыжок реально идет, а не где Артур стоит с верёвкой
# в руках. Кадр на 35 процентах, по которому шёл первый отбор, поймал именно
# паузу между подходами, и в канал ушло видео без прыжка.

Add-Type -AssemblyName System.Drawing

$dir = "C:\Users\admin\OneDrive\Desktop\AKF-PRIMERY\_rope"
$list = Get-ChildItem $dir -Filter *.jpg | Sort-Object Name

$cols = 8
$cellW = 220
$cellH = 391
$label = 20
$rows = [math]::Ceiling($list.Count / $cols)

$bmp = New-Object System.Drawing.Bitmap ($cols * $cellW), ($rows * ($cellH + $label))
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(16, 16, 16))), 0, 0, $bmp.Width, $bmp.Height)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBilinear

$font = New-Object System.Drawing.Font("Arial", 11, [System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.Brushes]::Yellow

for ($i = 0; $i -lt $list.Count; $i++) {
  $col = $i % $cols
  $row = [math]::Floor($i / $cols)
  try {
    $img = [System.Drawing.Image]::FromFile($list[$i].FullName)
    $scale = [math]::Min($cellW / $img.Width, $cellH / $img.Height)
    $w = [int]($img.Width * $scale)
    $h = [int]($img.Height * $scale)
    $g.DrawImage($img, $col * $cellW + [int](($cellW - $w) / 2), $row * ($cellH + $label) + [int](($cellH - $h) / 2), $w, $h)
    $img.Dispose()
  } catch { }
  $g.DrawString($list[$i].BaseName, $font, $brush, [float]($col * $cellW + 3), [float]($row * ($cellH + $label) + $cellH + 2))
}

$g.Dispose()
$bmp.Save("$dir\rope.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()
Write-Host "saved $dir\rope.jpg"
