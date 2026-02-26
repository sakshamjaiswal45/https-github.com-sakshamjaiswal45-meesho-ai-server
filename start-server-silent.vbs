' Meesho AI Server - Silent Background Starter
' This runs node server.js silently in the background (no window)
Dim scriptDir
Dim WshShell

scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = scriptDir
WshShell.Run "node server.js", 0, False

Set WshShell = Nothing
