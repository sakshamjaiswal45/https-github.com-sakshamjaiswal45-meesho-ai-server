@echo off
title Meesho AI Server
echo.
echo  ====================================
echo   MEESHO AI LISTING SERVER
echo  ====================================
echo.
echo  Starting server... Please wait...
echo.

cd /d "%~dp0"

if not exist "node_modules" (
    echo  Installing dependencies for first time...
    echo  This will take 1-2 minutes. Please wait...
    echo.
    npm install
    echo.
)

echo  Server is starting at http://localhost:5001
echo.
echo  DO NOT CLOSE THIS WINDOW while using the extension!
echo  To stop the server, close this window.
echo.

node server.js

echo.
echo  Server stopped. Press any key to exit.
pause > nul
