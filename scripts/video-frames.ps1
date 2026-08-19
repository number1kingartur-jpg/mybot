# Pull candidate stills out of Arthur's exercise clips.
# Four frames per clip at 20/40/60/80% of duration, so a usable phase of the
# movement is always among them. Output name carries the clip name and the
# percent, so a picked frame maps straight back to its source.

$src = "C:\Users\admin\OneDrive\Desktop\CURSOR\public\video\artur\exercises"
$out = "C:\Users\admin\OneDrive\Desktop\AKF-PRIMERY\_video"
New-Item -ItemType Directory -Force -Path $out | Out-Null

$clips = Get-ChildItem $src -Filter *.mp4 | Sort-Object Name
Write-Host "clips: $($clips.Count)"

foreach ($c in $clips) {
  $dur = [double](ffprobe -v error -select_streams v:0 -show_entries format=duration -of csv=p=0 $c.FullName)
  if ($dur -le 0) { Write-Host "skip $($c.Name): no duration"; continue }
  $base = $c.BaseName
  foreach ($pct in 20, 40, 60, 80) {
    $t = [math]::Round($dur * $pct / 100, 2)
    $dst = Join-Path $out ("{0}--{1}.jpg" -f $base, $pct)
    ffmpeg -y -v error -ss $t -i $c.FullName -frames:v 1 -q:v 2 $dst
  }
  Write-Host "$base  $([math]::Round($dur,1))s"
}

Write-Host "frames: $((Get-ChildItem $out -Filter *.jpg).Count)"
