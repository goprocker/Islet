# Shelf image actions (#253), run as their own process so a large image never stalls Islet's
# main process. Paths and options come in through the environment, so file names need no quoting:
#   ISLET_SRC   the image to read
#   ISLET_OUT   the new file; created with CreateNew, so an existing file is never overwritten
#   ISLET_MODE  half | fit1920 | none   (the size rule, same as targetSize in file-actions.js)
#   ISLET_FMT   png | jpg
#   ISLET_Q     JPEG quality, 1..100
# Prints the output size as "WxH" and exits 0, or writes a reason to stderr and exits 1.
# A failed write removes the partial file.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$src = $env:ISLET_SRC; $out = $env:ISLET_OUT; $mode = $env:ISLET_MODE; $fmt = $env:ISLET_FMT
$q = [int]$env:ISLET_Q; if ($q -lt 1 -or $q -gt 100) { $q = 90 }
$img = $null; $bmp = $null; $g = $null; $fs = $null; $created = $false
try {
  try { $img = [System.Drawing.Image]::FromFile($src) } catch { [Console]::Error.WriteLine("couldn't read the image"); exit 1 }
  $w = $img.Width; $h = $img.Height
  if ($mode -eq "half") { $w = [Math]::Max(1, [int][Math]::Round($w / 2, [MidpointRounding]::AwayFromZero)); $h = [Math]::Max(1, [int][Math]::Round($h / 2, [MidpointRounding]::AwayFromZero)) }
  elseif ($mode -eq "fit1920") {
    $k = [Math]::Min(1.0, 1920.0 / [Math]::Max($w, $h))
    $w = [Math]::Max(1, [int][Math]::Round($w * $k, [MidpointRounding]::AwayFromZero)); $h = [Math]::Max(1, [int][Math]::Round($h * $k, [MidpointRounding]::AwayFromZero))
  }
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  # JPG has no transparency: put transparent areas on white instead of black
  if ($fmt -eq "jpg") { $g.Clear([System.Drawing.Color]::White) }
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $attr = New-Object System.Drawing.Imaging.ImageAttributes
  $attr.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $w, $h)), 0, 0, $img.Width, $img.Height, [System.Drawing.GraphicsUnit]::Pixel, $attr)
  try { $fs = [System.IO.File]::Open($out, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write) }
  catch { [Console]::Error.WriteLine("couldn't create the new file"); exit 1 }
  $created = $true
  if ($fmt -eq "jpg") {
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
    $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$q)
    $bmp.Save($fs, $codec, $params)
  } else { $bmp.Save($fs, [System.Drawing.Imaging.ImageFormat]::Png) }
  $fs.Close(); $fs = $null; $created = $false
  Write-Output "${w}x${h}"
  exit 0
} catch {
  [Console]::Error.WriteLine("couldn't write the new image")
  exit 1
} finally {
  if ($fs) { $fs.Close() }
  if ($created) { Remove-Item -LiteralPath $out -Force -ErrorAction SilentlyContinue }
  if ($g) { $g.Dispose() }; if ($bmp) { $bmp.Dispose() }; if ($img) { $img.Dispose() }
}
