# تشغيل رادار السوق في PowerShell مع فتح المتصفح بعد ثانيتين.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$node = 'C:\ps5build\node\node.exe'
if (-not (Test-Path $node)) {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) { throw 'لم يتم العثور على Node.js. ثبّت Node 20+ أو ضع node.exe في C:\ps5build\node\.' }
  $node = $cmd.Source
}

if (-not (Test-Path '.env') -and (Test-Path '.env.example')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'تم إنشاء .env من القالب.'
}

$port = 8787
if (Test-Path '.env') {
  $line = Select-String -Path '.env' -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -First 1
  if ($line -and $line.Matches.Count) { $port = [int]$line.Matches[0].Groups[1].Value }
}

Write-Host ''
Write-Host ' رادار السوق — بدء التشغيل' -ForegroundColor Cyan
Write-Host " الواجهة: http://127.0.0.1:$port/"
Write-Host ' للإيقاف: Ctrl+C'
Write-Host ''

Start-Job -ScriptBlock {
  param($url)
  Start-Sleep -Seconds 2
  Start-Process $url
} -ArgumentList "http://127.0.0.1:$port/" | Out-Null

& $node server.js
