# Tests #98 across two Windows accounts. Run from an elevated PowerShell, signed in as the
# normal Islet user, after Islet has run once. It creates a temporary standard account, tries
# to read the hook secret as that account, then always deletes the account and its profile.
# It only reports what happened; it doesn't start an agent or change any hooks.
$ErrorActionPreference = "Stop"
$token = Join-Path $env:USERPROFILE ".islet-hook-token"
if (-not (Test-Path $token)) { throw "No $token. Start Islet once first." }

$name = "isletcheck"
$password = "Aa1!" + [guid]::NewGuid().ToString("N")
$secure = ConvertTo-SecureString $password -AsPlainText -Force
New-LocalUser -Name $name -Password $secure -AccountNeverExpires -Description "Temporary Islet test" | Out-Null
$out = Join-Path $env:PUBLIC "islet-boundary.txt"
Remove-Item $out -Force -ErrorAction SilentlyContinue
New-Item $out -ItemType File | Out-Null
icacls $out /grant "${name}:M" | Out-Null
try {
  $cred = New-Object System.Management.Automation.PSCredential("$env:COMPUTERNAME\$name", $secure)
  $probe = "`$r = try { [IO.File]::ReadAllText('$token') | Out-Null; 'READABLE' } catch [UnauthorizedAccessException] { 'DENIED' } catch { 'ERROR ' + `$_.Exception.Message }; Set-Content '$out' `$r"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($probe))
  Start-Process powershell.exe -Credential $cred -WorkingDirectory $env:WINDIR -WindowStyle Hidden -Wait -ArgumentList "-NoProfile", "-EncodedCommand", $encoded
  $result = (Get-Content $out -Raw).Trim()
  "Other account reading the hook secret: $result"
  if ($result -ne "DENIED") { throw "Expected DENIED. The hook secret isn't protected from this account." }
  "PASS: another standard account can't read the secret, so it can't sign a proof or decision."
} finally {
  Remove-LocalUser -Name $name
  Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -like "*\$name" } | Remove-CimInstance
  Remove-Item $out -Force -ErrorAction SilentlyContinue
}
