# Battery levels of connected Bluetooth devices (headphones, mice, keyboards), as one JSON
# array on stdout. Windows keeps them in the DEVPKEY_Bluetooth_Battery device property.
$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$key = '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2'
$list = @(Get-PnpDevice -Class Bluetooth -PresentOnly | Where-Object Status -eq 'OK' | ForEach-Object {
  $b = (Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName $key).Data
  if ($null -ne $b) { [ordered]@{ name = $_.FriendlyName; battery = [int]$b } }
})
ConvertTo-Json -InputObject $list -Compress
