# Contact sheets from candidates.json: 96 thumbnails per sheet, numbered.
# The number under each thumbnail is the global index in candidates.json,
# so a picked cell maps back to a file path.

Add-Type -AssemblyName System.Drawing

$out  = "C:\Users\admin\OneDrive\Desktop\AKF-PRIMERY\_scan"
$list = Get-Content "$out\candidates.json" -Raw -Encoding UTF8 | ConvertFrom-Json

$cols = 12
$rows = 8
$per  = $cols * $rows
$cell = 150
$label = 16
$sheetW = $cols * $cell
$sheetH = $rows * ($cell + $label)

$font  = New-Object System.Drawing.Font("Arial", 9)
$brush = [System.Drawing.Brushes]::White
$bg    = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(20,20,20))

$sheets = [math]::Ceiling($list.Count / $per)
Write-Host "items: $($list.Count), sheets: $sheets"

for ($s = 0; $s -lt $sheets; $s++) {
  $bmp = New-Object System.Drawing.Bitmap $sheetW, $sheetH
  $g   = [System.Drawing.Graphics]::FromImage($bmp)
  $g.FillRectangle($bg, 0, 0, $sheetW, $sheetH)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBilinear

  for ($i = 0; $i -lt $per; $i++) {
    $idx = $s * $per + $i
    if ($idx -ge $list.Count) { break }
    $item = $list[$idx]
    try {
      $img = [System.Drawing.Image]::FromFile($item.path)
      $scale = [math]::Min($cell / $img.Width, $cell / $img.Height)
      $w = [int]($img.Width * $scale)
      $h = [int]($img.Height * $scale)
      $cx = ($i % $cols) * $cell + [int](($cell - $w) / 2)
      $cy = [math]::Floor($i / $cols) * ($cell + $label) + [int](($cell - $h) / 2)
      $g.DrawImage($img, $cx, $cy, $w, $h)
      $img.Dispose()
    } catch { }
    $tx = ($i % $cols) * $cell + 4
    $ty = [math]::Floor($i / $cols) * ($cell + $label) + $cell
    $g.DrawString("$idx", $font, $brush, $tx, $ty)
  }

  $g.Dispose()
  $name = "{0}\sheet-{1:d2}.jpg" -f $out, $s
  $bmp.Save($name, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  $bmp.Dispose()
  Write-Host "saved $name"
}
