param(
  [string]$InputFile = "c:\WebDev\fearnot.txt",
  [string]$OutputFile = "c:\WebDev\fearnot-mantra-prayer.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $InputFile)) {
  throw "Input file not found: $InputFile"
}

$lines = Get-Content -LiteralPath $InputFile -Encoding UTF8

function Is-CarryHeader([string]$line) {
  return $line -match '(?i)carry\s+this\s+with\s+you\s+today'
}

function Is-SpokenHeader([string]$line) {
  return $line -match '(?i)spoken\s+benediction'
}

function Is-StopLine([string]$line) {
  $trimmed = $line.Trim()
  if ([string]::IsNullOrWhiteSpace($trimmed)) { return $false }

  if ($trimmed -match '(?i)^amen[\.!]?$') {
    return $false
  }

  if ($trimmed -match '(?i)^\s*(daily\s+fear\s+not|scripture|overview|brief\s+analysis|old\s+covenant|new\s+covenant|short\s+prayer|pastoral\s+application|pastoral\s+word|formation\s+focus|question\s+for\s+reflection|editorial\s+sensitivity\s+rules|theological\s+tone\s+rules|operational\s+expectation)\b') {
    return $true
  }

  if ($trimmed -match '(?i)^\s*(may\s+i\s+ask|give\s+me\s+a\s+bendiction|give\s+me\s+a\s+benediction|here\s+is\s+a\s+~?70-second|that[’'']s\s+a\s+fair|rerun\s+daily\s+fear\s+not|rerun\s+todays\s+daily\s+fear\s+not|can\s+we\s+do\s+a\s+daily\s+fear\s+not|what[’'']?s\s+a\s+good\s+name\s+for\s+a\s+navigation\s+drop\s+down|this\s+is\s+worth\s+noting|you\s+are\s+reading\s+my\s+mind|can\s+we\s+look\s+at\s+implementing\s+orb\s+math)\b') {
    return $true
  }

  if ($trimmed -match '^[0-9]+️⃣') {
    return $true
  }

  if ($trimmed -match '^[\p{So}\p{Sk}]') {
    return $true
  }

  return $false
}

$carryIndexes = New-Object System.Collections.Generic.List[int]
for ($i = 0; $i -lt $lines.Count; $i++) {
  if (Is-CarryHeader $lines[$i]) {
    $carryIndexes.Add($i)
  }
}

$records = New-Object System.Collections.Generic.List[object]

for ($idx = 0; $idx -lt $carryIndexes.Count; $idx++) {
  $carryLineIndex = $carryIndexes[$idx]
  $nextCarryIndex = if ($idx + 1 -lt $carryIndexes.Count) { $carryIndexes[$idx + 1] } else { $lines.Count }

  $mantra = ''
  for ($j = $carryLineIndex + 1; $j -lt $nextCarryIndex; $j++) {
    $candidate = $lines[$j].Trim()
    if (-not [string]::IsNullOrWhiteSpace($candidate)) {
      $mantra = $candidate
      break
    }
  }

  $spokenIndex = -1
  for ($j = $carryLineIndex + 1; $j -lt $nextCarryIndex; $j++) {
    if (Is-SpokenHeader $lines[$j]) {
      $spokenIndex = $j
      break
    }
  }

  $prayer = ''
  if ($spokenIndex -ge 0) {
    $start = $spokenIndex + 1
    while ($start -lt $nextCarryIndex -and [string]::IsNullOrWhiteSpace($lines[$start])) {
      $start++
    }

    $buffer = New-Object System.Collections.Generic.List[string]
    for ($j = $start; $j -lt $nextCarryIndex; $j++) {
      $line = $lines[$j]
      $trimmed = $line.Trim()

      if ($buffer.Count -gt 0 -and $trimmed -match '(?i)^amen[\.!]?$') {
        $buffer.Add($line)
        break
      }

      if ($buffer.Count -gt 0 -and (Is-StopLine $line)) {
        break
      }

      $buffer.Add($line)
    }

    while ($buffer.Count -gt 0 -and [string]::IsNullOrWhiteSpace($buffer[$buffer.Count - 1])) {
      $buffer.RemoveAt($buffer.Count - 1)
    }

    $prayer = ($buffer -join "`n").Trim()
  }

  $records.Add([pscustomobject]@{
    mantra = $mantra
    Prayer = $prayer
  })
}

$records | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $OutputFile -Encoding UTF8

$withPrayerCount = ($records | Where-Object { -not [string]::IsNullOrWhiteSpace($_.Prayer) }).Count
Write-Host "Extracted $($records.Count) entries."
Write-Host "Entries with Prayer: $withPrayerCount"
Write-Host "Output: $OutputFile"
