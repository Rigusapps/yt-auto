Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File """ & WshShell.CurrentDirectory & "\gui.ps1""", 0, False