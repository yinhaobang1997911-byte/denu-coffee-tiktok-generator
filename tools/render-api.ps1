param(
  [int]$Port = 8787
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$renderer = Join-Path $root "tools\render.ps1"
$dataDir = Join-Path $root "data"
$outputRoot = Join-Path $root "output"

New-Item -ItemType Directory -Force -Path $dataDir, $outputRoot | Out-Null

function Write-JsonResponse($context, [int]$statusCode, $payload) {
  $json = $payload | ConvertTo-Json -Depth 12
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $context.Response.StatusCode = $statusCode
  $context.Response.ContentType = "application/json; charset=utf-8"
  $context.Response.Headers.Add("Access-Control-Allow-Origin", "*")
  $context.Response.Headers.Add("Access-Control-Allow-Headers", "content-type")
  $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $context.Response.OutputStream.Close()
}

function Read-Body($request) {
  $reader = New-Object System.IO.StreamReader($request.InputStream, $request.ContentEncoding)
  try { $reader.ReadToEnd() } finally { $reader.Dispose() }
}

function Test-Content($data) {
  $issues = New-Object System.Collections.Generic.List[string]
  if ($null -eq $data.day -or -not ($data.day -is [int] -or $data.day -is [long])) {
    $issues.Add("day must be a number")
  }
  if ($null -eq $data.slides -or $data.slides.Count -ne 3) {
    $issues.Add("exactly three slides are required")
  }
  if ([string]::IsNullOrWhiteSpace([string]$data.caption)) {
    $issues.Add("caption is required")
  }
  if ($data.slides) {
    for ($i = 0; $i -lt $data.slides.Count; $i++) {
      if ([string]::IsNullOrWhiteSpace([string]$data.slides[$i].title)) {
        $issues.Add("slide $($i + 1) title is required")
      }
    }
  }
  $issues
}

function Save-Utf8NoBom([string]$path, [string]$content) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $encoding)
}

function Invoke-Render($data) {
  $day = [int]$data.day
  $dataFile = Join-Path $dataDir ("day-{0}.json" -f $day)
  $outDir = Join-Path $outputRoot ("day-{0}" -f $day)
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null

  $content = $data | ConvertTo-Json -Depth 12
  Save-Utf8NoBom $dataFile $content

  $renderOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $renderer -Data $dataFile -OutDir $outDir
  if ($LASTEXITCODE -ne 0) {
    throw "Renderer failed: $renderOutput"
  }

  $checks = $renderOutput | ConvertFrom-Json
  $images = @()
  foreach ($check in $checks) {
    $bytes = [System.IO.File]::ReadAllBytes([string]$check.file)
    $images += [ordered]@{
      slide = $check.slide
      fileName = [System.IO.Path]::GetFileName([string]$check.file)
      path = [string]$check.file
      mimeType = "image/png"
      base64 = [System.Convert]::ToBase64String($bytes)
      check = $check
    }
  }

  [ordered]@{
    ok = -not ($checks | Where-Object { -not $_.ok })
    day = $day
    dataFile = $dataFile
    outputDir = $outDir
    caption = $data.caption
    images = $images
  }
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Denu Coffee render API is running at $prefix"
Write-Host "POST /render with the daily JSON. Press Ctrl+C to stop."

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      $path = $context.Request.Url.AbsolutePath

      if ($context.Request.HttpMethod -eq "OPTIONS") {
        Write-JsonResponse $context 200 @{ ok = $true }
        continue
      }

      if ($context.Request.HttpMethod -eq "GET" -and $path -eq "/health") {
        Write-JsonResponse $context 200 @{ ok = $true; service = "denu-coffee-render-api" }
        continue
      }

      if ($context.Request.HttpMethod -eq "POST" -and $path -eq "/render") {
        $body = Read-Body $context.Request
        $data = $body | ConvertFrom-Json
        $issues = Test-Content $data
        if ($issues.Count -gt 0) {
          Write-JsonResponse $context 400 @{ ok = $false; issues = $issues }
          continue
        }

        $result = Invoke-Render $data
        Write-JsonResponse $context 200 $result
        continue
      }

      Write-JsonResponse $context 404 @{ ok = $false; error = "Not found" }
    } catch {
      Write-JsonResponse $context 500 @{ ok = $false; error = $_.Exception.Message }
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
