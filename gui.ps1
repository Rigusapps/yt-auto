Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Buat Form Utama
$form = New-Object System.Windows.Forms.Form
$form.Text = "YT Auto Control"
$form.Size = New-Object System.Drawing.Size(320, 310)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.TopMost = $true

# Label Indicator Status Server
$lblStatus = New-Object System.Windows.Forms.Label
$lblStatus.Location = New-Object System.Drawing.Point(30, 20)
$lblStatus.Size = New-Object System.Drawing.Size(240, 30)
$lblStatus.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$lblStatus.Font = New-Object System.Drawing.Font("Arial", 10, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($lblStatus)

# Fungsi Cek Status
function Update-ServerStatus {
    $nodeProcess = Get-Process -Name "node" -ErrorAction SilentlyContinue
    if ($nodeProcess) {
        $lblStatus.Text = "STATUS: SERVER AKTIF"
        $lblStatus.ForeColor = [System.Drawing.Color]::DarkGreen
        $lblStatus.BackColor = [System.Drawing.Color]::LightGreen
    } else {
        $lblStatus.Text = "STATUS: SERVER OFF"
        $lblStatus.ForeColor = [System.Drawing.Color]::DarkRed
        $lblStatus.BackColor = [System.Drawing.Color]::MistyRose
    }
}

# Tombol START
$btnStart = New-Object System.Windows.Forms.Button
$btnStart.Location = New-Object System.Drawing.Point(30, 65)
$btnStart.Size = New-Object System.Drawing.Size(240, 45)
$btnStart.Text = "[>] START SERVER"
$btnStart.Font = New-Object System.Drawing.Font("Arial", 10, [System.Drawing.FontStyle]::Bold)
$btnStart.BackColor = [System.Drawing.Color]::LightBlue
$btnStart.Add_Click({
    if (Test-Path "$PSScriptRoot\start-server.vbs") {
        Start-Process "wscript.exe" -ArgumentList "`"$PSScriptRoot\start-server.vbs`""
    } else {
        Start-Process "node" -ArgumentList "server.js" -WindowStyle Hidden
    }
    Start-Sleep -Seconds 1
    Update-ServerStatus
})
$form.Controls.Add($btnStart)

# Tombol STOP
$btnStop = New-Object System.Windows.Forms.Button
$btnStop.Location = New-Object System.Drawing.Point(30, 120)
$btnStop.Size = New-Object System.Drawing.Size(240, 45)
$btnStop.Text = "[X] STOP SERVER"
$btnStop.Font = New-Object System.Drawing.Font("Arial", 10, [System.Drawing.FontStyle]::Bold)
$btnStop.BackColor = [System.Drawing.Color]::LightPink
$btnStop.Add_Click({
    Stop-Process -Name "node" -ErrorAction SilentlyContinue -Force
    Start-Sleep -Milliseconds 500
    Update-ServerStatus
})
$form.Controls.Add($btnStop)

# Tombol BUKA DASHBOARD (WEB)
$btnOpenWeb = New-Object System.Windows.Forms.Button
$btnOpenWeb.Location = New-Object System.Drawing.Point(30, 175)
$btnOpenWeb.Size = New-Object System.Drawing.Size(240, 45)
$btnOpenWeb.Text = "BUKA DASHBOARD"
$btnOpenWeb.Font = New-Object System.Drawing.Font("Arial", 9, [System.Drawing.FontStyle]::Bold)
$btnOpenWeb.BackColor = [System.Drawing.Color]::LightYellow
$btnOpenWeb.Add_Click({
    Start-Process "http://localhost:3000"
})
$form.Controls.Add($btnOpenWeb)

# Timer Auto-Refresh Status
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.Add_Tick({ Update-ServerStatus })
$timer.Start()

Update-ServerStatus

$form.ShowDialog() | Out-Null