# تحضير البيئة والتحقق من الجاهزية (لا يثبّت أي حزم خارجية).
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$node = 'C:\ps5build\node\node.exe'
if (-not (Test-Path $node)) {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) { throw 'Node.js غير موجود. ثبّت Node 20+ أو ضع node.exe في C:\ps5build\node\.' }
  $node = $cmd.Source
}

$version = & $node --version
$major = [int](($version -replace '^v', '') -split '\.')[0]
Write-Host "Node: $version ($node)"
if ($major -lt 20) { throw 'يتطلب Node.js 20 أو أحدث.' }

New-Item -ItemType Directory -Force -Path 'data' | Out-Null
if (-not (Test-Path '.env') -and (Test-Path '.env.example')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'تم إنشاء .env — عدّله لإضافة X أو Telegram.'
}

Write-Host ''
Write-Host 'تشغيل الاختبارات...' -ForegroundColor Cyan
& $node --test tests/
if ($LASTEXITCODE -ne 0) { throw 'فشلت الاختبارات.' }

Write-Host ''
Write-Host 'فحص المصادر الحية (قد يستغرق 30-60 ثانية)...' -ForegroundColor Cyan
& $node scripts/check-sources.js

Write-Host ''
Write-Host 'جاهز. شغّل run.bat أو start.ps1 ثم افتح http://127.0.0.1:8787/' -ForegroundColor Green
