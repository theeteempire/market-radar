@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE=C:\ps5build\node\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"

if not exist ".env" if exist ".env.example" copy /Y ".env.example" ".env" >nul

echo.
echo  رادار السوق - بدء التشغيل
echo  -----------------------------------------
echo  Node: %NODE_EXE%
echo  الواجهة: http://127.0.0.1:8787/
echo  للإيقاف: Ctrl+C
echo.

start "" cmd /c "timeout /t 2 >nul & start "" http://127.0.0.1:8787/"
"%NODE_EXE%" server.js
echo.
echo  توقف الخادم.
pause
