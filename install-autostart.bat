@echo off
title Install Meesho AI Server - Auto Start
echo.
echo  ====================================
echo   MEESHO AI SERVER - AUTO START SETUP
echo  ====================================
echo.
echo  This will make the server start automatically
echo  every time Windows starts.
echo.

set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SOURCE=%~dp0start-server-silent.vbs

echo  Copying startup file...
copy "%SOURCE%" "%STARTUP%\meesho-ai-server.vbs" /Y

if %errorlevel% == 0 (
    echo.
    echo  ====================================
    echo   SUCCESS! Setup Complete!
    echo  ====================================
    echo.
    echo  The Meesho AI Server will now start
    echo  automatically every time you turn on
    echo  this PC. No need to do anything!
    echo.
    echo  Starting server now for first time...
    echo.
    start "" wscript.exe "%STARTUP%\meesho-ai-server.vbs"
    echo  Server started! You can now use the extension.
) else (
    echo.
    echo  ERROR: Could not install. Try running as Administrator.
    echo  Right-click this file and select "Run as administrator"
)

echo.
echo  Press any key to close this window.
pause > nul
