@echo off
chcp 65001 >nul
title إنستينكت تشارتس
cd /d "%~dp0"

echo.
echo   جارٍ تشغيل إنستينكت تشارتس...
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo   [!] برنامج Node.js غير مثبّت على هذا الجهاز.
    echo.
    echo       سيفتح الآن موقع التحميل. نزّل النسخة المكتوب عليها LTS
    echo       وثبّتها بالضغط على Next حتى النهاية، ثم شغّل هذا الملف مرة أخرى.
    echo.
    start "" https://nodejs.org/
    pause
    exit /b 1
)

node server.js --open

echo.
echo   توقّف التطبيق.
pause
