param(
  [string]$Data = "data/day-28.json",
  [string]$OutDir = "output"
)

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$dataPath = if ([System.IO.Path]::IsPathRooted($Data)) { $Data } else { Join-Path $root $Data }
$outputPath = if ([System.IO.Path]::IsPathRooted($OutDir)) { $OutDir } else { Join-Path $root $OutDir }
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$json = Get-Content -LiteralPath $dataPath -Raw -Encoding UTF8 | ConvertFrom-Json
$fontMyanmar = "Myanmar Text"
$fontLatin = "Arial"

function Normalize-MyanmarText([string]$text) {
  if ($null -eq $text) { return "" }
  $normalized = $text.Normalize([System.Text.NormalizationForm]::FormC)
  $normalized = $normalized -replace ([string][char]0x1037 + [string][char]0x103A), ([string][char]0x103A + [string][char]0x1037)
  $normalized
}

function New-Rect([float]$x, [float]$y, [float]$w, [float]$h) {
  New-Object System.Drawing.RectangleF($x, $y, $w, $h)
}

function New-RoundPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $path
}

function Fill-RoundRect($g, $brush, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-RoundPath $x $y $w $h $r
  $g.FillPath($brush, $path)
  $path.Dispose()
}

function Stroke-RoundRect($g, $pen, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-RoundPath $x $y $w $h $r
  $g.DrawPath($pen, $path)
  $path.Dispose()
}

function Draw-FitText($g, [string]$text, [string]$family, [float]$size, [int]$style, $brush, $rect, $format, [float]$minSize = 20) {
  $text = Normalize-MyanmarText $text
  $font = $null
  while ($size -ge $minSize) {
    if ($font) { $font.Dispose() }
    $font = New-Object System.Drawing.Font($family, $size, $style, [System.Drawing.GraphicsUnit]::Pixel)
    $measured = $g.MeasureString($text, $font, [int]$rect.Width, $format)
    if ($measured.Height -le ($rect.Height + 3) -and $measured.Width -le ($rect.Width + 8)) { break }
    $size -= 2
  }
  $g.DrawString($text, $font, $brush, $rect, $format)
  $ok = $true
  $finalMeasure = $g.MeasureString($text, $font, [int]$rect.Width, $format)
  if ($finalMeasure.Height -gt ($rect.Height + 6) -or $finalMeasure.Width -gt ($rect.Width + 12)) { $ok = $false }
  $font.Dispose()
  @{ ok = $ok; size = $size; height = [math]::Round($finalMeasure.Height, 2); width = [math]::Round($finalMeasure.Width, 2) }
}

function Draw-Logo($g) {
  $dark = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(36, 23, 15))
  $gold = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(217, 164, 95))
  $cream = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(248, 239, 227))
  Fill-RoundRect $g $dark 64 54 280 86 16
  $g.FillEllipse($gold, 82, 75, 44, 44)
  $brandFont = New-Object System.Drawing.Font($fontLatin, 30, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $subFont = New-Object System.Drawing.Font($fontLatin, 18, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $g.DrawString("NeoRoast", $brandFont, $cream, 140, 72)
  $g.DrawString("DENU COFFEE", $subFont, $gold, 142, 106)
  $brandFont.Dispose(); $subFont.Dispose(); $dark.Dispose(); $gold.Dispose(); $cream.Dispose()
}

function Draw-Day($g, [int]$day) {
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(150, 36, 23, 15))
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(160, 255, 244, 228), 2)
  $cream = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 244, 228))
  Fill-RoundRect $g $brush 846 64 170 64 32
  Stroke-RoundRect $g $pen 846 64 170 64 32
  $font = New-Object System.Drawing.Font($fontLatin, 31, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $g.DrawString("Day $day", $font, $cream, (New-Rect 846 64 170 64), $fmt)
  $font.Dispose(); $fmt.Dispose(); $brush.Dispose(); $pen.Dispose(); $cream.Dispose()
}

function Draw-Background($g) {
  $rect = New-Object System.Drawing.Rectangle(0, 0, 1080, 1350)
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(43, 26, 17), [System.Drawing.Color]::FromArgb(28, 18, 13), 150)
  $g.FillRectangle($bg, $rect)
  $bg.Dispose()
  $gold = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(54, 217, 154, 78))
  $berry = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(48, 196, 79, 104))
  $creamPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(24, 255, 244, 228), 1)
  for ($x = 0; $x -le 1080; $x += 54) { $g.DrawLine($creamPen, $x, 0, $x, 1350) }
  for ($y = 0; $y -le 1350; $y += 54) { $g.DrawLine($creamPen, 0, $y, 1080, $y) }
  $g.FillEllipse($gold, 730, 925, 520, 520)
  $g.FillEllipse($berry, 770, 120, 360, 360)
  $gold.Dispose(); $berry.Dispose(); $creamPen.Dispose()
}

function Draw-HookVisual($g) {
  $plate = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(246, 223, 189))
  $coffee = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(48, 27, 18))
  $cup = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 244, 228))
  $berry = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(196, 79, 104))
  $orange = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(243, 182, 66))
  $leaf = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(63, 122, 85))
  $g.FillEllipse($plate, 90, 842, 340, 340)
  $g.FillEllipse($cup, 137, 887, 245, 245)
  $g.FillEllipse($coffee, 162, 912, 195, 195)
  $g.FillEllipse($berry, 70, 1060, 82, 82)
  $g.FillEllipse($orange, 370, 842, 112, 112)
  Fill-RoundRect $g $leaf 360 1080 104 50 24
  $plate.Dispose(); $coffee.Dispose(); $cup.Dispose(); $berry.Dispose(); $orange.Dispose(); $leaf.Dispose()
}

function Draw-Tag($g, [string]$text, [float]$x, [float]$y) {
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(38, 255, 244, 228))
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 255, 244, 228), 1)
  $cream = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 244, 228))
  Fill-RoundRect $g $brush $x $y 430 72 8
  Stroke-RoundRect $g $pen $x $y 430 72 8
  $font = New-Object System.Drawing.Font($fontLatin, 31, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $g.DrawString($text, $font, $cream, (New-Rect ($x + 26) ($y + 21) 380 40))
  $font.Dispose(); $brush.Dispose(); $pen.Dispose(); $cream.Dispose()
}

function Render-Slide($slide, [int]$index) {
  $bmp = New-Object System.Drawing.Bitmap(1080, 1350)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  Draw-Background $g
  Draw-Logo $g
  Draw-Day $g $json.day

  $cream = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 244, 228))
  $warm = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 225, 179))
  $ink = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(33, 24, 15))
  $heading = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(143, 79, 35))
  $card = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(238, 255, 244, 228))
  $darkCard = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(178, 36, 23, 15))
  $gold = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(217, 154, 78))
  $berry = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(196, 79, 104))
  $leaf = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(63, 122, 85))
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Near
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Near
  $fmt.Trimming = [System.Drawing.StringTrimming]::Word
  $fmt.FormatFlags = 0

  $checks = @()

  if ($slide.kind -eq "hook") {
    $checks += Draw-FitText $g $slide.title $fontMyanmar 78 ([System.Drawing.FontStyle]::Bold) $cream (New-Rect 64 206 920 250) $fmt 46
    $checks += Draw-FitText $g $slide.body $fontMyanmar 38 ([System.Drawing.FontStyle]::Bold) $warm (New-Rect 70 492 790 145) $fmt 26
    Draw-HookVisual $g
    Draw-Tag $g "No added fruit" 560 900
    Draw-Tag $g "Natural aroma" 560 996
    Draw-Tag $g "Specialty Coffee" 560 1092
  } else {
    $checks += Draw-FitText $g $slide.title $fontMyanmar 62 ([System.Drawing.FontStyle]::Bold) $cream (New-Rect 64 202 920 175) $fmt 40
    $y = 420
    $i = 0
    foreach ($section in $slide.sections) {
      Fill-RoundRect $g $card 64 $y 952 190 8
      $barBrush = @($gold, $berry, $leaf)[$i % 3]
      $g.FillRectangle($barBrush, 64, $y, 13, 190)
      $latinFont = New-Object System.Drawing.Font($fontLatin, 35, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
      $g.DrawString($section.heading, $latinFont, $heading, (New-Rect 95 ($y + 25) 880 44), $fmt)
      $latinFont.Dispose()
      $checks += Draw-FitText $g $section.text $fontMyanmar 31 ([System.Drawing.FontStyle]::Regular) $ink (New-Rect 95 ($y + 77) 870 92) $fmt 23
      $y += 214
      $i += 1
    }
    Fill-RoundRect $g $darkCard 64 1138 952 146 8
    $checks += Draw-FitText $g $slide.footer $fontMyanmar 33 ([System.Drawing.FontStyle]::Bold) $warm (New-Rect 94 1162 890 98) $fmt 23
  }

  $file = Join-Path $outputPath ("day-{0}-slide-{1}.png" -f $json.day, ($index + 1))
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  $cream.Dispose(); $warm.Dispose(); $ink.Dispose(); $heading.Dispose(); $card.Dispose(); $darkCard.Dispose(); $gold.Dispose(); $berry.Dispose(); $leaf.Dispose(); $fmt.Dispose()

  @{
    slide = $index + 1
    file = $file
    ok = -not ($checks | Where-Object { -not $_.ok })
    checks = $checks
  }
}

$results = @()
for ($i = 0; $i -lt $json.slides.Count; $i++) {
  $results += Render-Slide $json.slides[$i] $i
}

$results | ConvertTo-Json -Depth 6
