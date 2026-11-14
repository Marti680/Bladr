# Bladr: retter PDF-filikonet i Windows' Stifinder.
# Chrome registrerer Bladr som PDF-program, men skriver et tomt ikon for filtypen (",0").
# Scriptet henter Bladrs filikon og indsætter det i de Bladr-registreringer, der mangler et ikon.
# Det ændrer kun din egen brugers indstillinger (HKCU) og kan køres igen, hvis Chrome overskriver det.

$dir = Join-Path $env:LOCALAPPDATA 'Bladr'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$ico = Join-Path $dir 'file-pdf.ico'
Invoke-WebRequest 'https://marti680.github.io/Bladr/icons/file-pdf.ico' -OutFile $ico -UseBasicParsing

$fixed = 0
$ok = 0
Get-ChildItem 'HKCU:\Software\Classes' -ErrorAction SilentlyContinue |
  Where-Object { $_.PSChildName -like 'Chrome.*' -or $_.PSChildName -like 'MSEdge*' } |
  ForEach-Object {
    $p = $_.PSPath
    $name = (Get-ItemProperty $p -ErrorAction SilentlyContinue).'(default)'
    $app = (Get-ItemProperty "$p\Application" -ErrorAction SilentlyContinue).ApplicationName
    if ("$name $app" -notmatch 'Bladr') { return }
    $icon = (Get-ItemProperty "$p\DefaultIcon" -ErrorAction SilentlyContinue).'(default)'
    $file = if ($icon) { ($icon -split ',')[0].Trim('"') } else { '' }
    if (-not $file -or -not (Test-Path $file)) {
      New-Item -Path "$p\DefaultIcon" -Force | Out-Null
      Set-ItemProperty -Path "$p\DefaultIcon" -Name '(default)' -Value "$ico,0"
      Write-Host "Ikon sat for $($_.PSChildName)"
      $fixed++
    } elseif ($file -eq $ico) { $ok++ }
  }

if ($fixed -eq 0 -and $ok -eq 0) { Write-Host 'Fandt ingen Bladr-registrering at rette. Er Bladr installeret og valgt som PDF-program?'; return }
if ($ok -gt 0) { Write-Host 'Ikonfilen er opdateret til den nyeste udgave.' }
ie4uinit.exe -show
Write-Host 'Faerdig. Genstart Stifinder eller computeren, hvis ikonerne ikke skifter med det samme.'
