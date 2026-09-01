# extra-sheets.ps1
# Собирает контактные листы из кадров extra-scan.
# Сетка 10 колонок, 8 рядов, ячейка 150 на 150.

Add-Type -AssemblyName System.Drawing

$dir = "C:\Users\admin\OneDrive\Desktop\AKF-PRIMERY\_extra"
$prefixes = @('s1', 's2', 's3', 's4', 's5', 's6')

$cols = 10
$rows = 8
$per = $cols * $rows
$cell = 150
$labelH = 15
$sheetW = $cols * $cell
$sheetH = $rows * ($cell + $labelH)

$font = New-Object System.Drawing.Font("Arial", 8)
$brush = [System.Drawing.Brushes]::Yellow
$bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(16, 16, 16))

foreach ($prefix in $prefixes) {
  $rx = '^' + [regex]::Escape($prefix) + '-\d{4}\.jpg$'
  $list = Get-ChildItem -LiteralPath $dir -File | Where-Object { $_.Name -match $rx } | Sort-Object Name

  $sheetCount = 0
  if ($list.Count -gt 0) {
    $sheetCount = [int][math]::Ceiling($list.Count / $per)
  }
  Write-Host "$prefix frames: $($list.Count), sheets: $sheetCount"

  for ($s = 0; $s -lt $sheetCount; $s++) {
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
        $cy = $row * ($cell + $labelH) + [int](($cell - $h) / 2)
        $g.DrawImage($img, $cx, $cy, $w, $h)
        $img.Dispose()
      } catch { }
      $tx = $col * $cell + 3
      $ty = $row * ($cell + $labelH) + $cell
      $num = $item.BaseName.Substring($prefix.Length + 1)
      $g.DrawString($num, $font, $brush, [float]$tx, [float]$ty)
    }

    $g.Dispose()
    $path = "{0}\{1}-sheet-{2:d2}.jpg" -f $dir, $prefix, $s
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $bmp.Dispose()
  }
}

$font.Dispose()
$bg.Dispose()
Write-Host "done"