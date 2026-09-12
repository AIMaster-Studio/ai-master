<#
.SYNOPSIS
  AI Master 后端一键启动 + 探活（本机服务 + 樱花隧道）

.DESCRIPTION
  1) 本机 8787 未监听时，后台启动 node server/index.js
  2) 轮询 http://127.0.0.1:8787/api/status 直到 200（后端真源）
  3) 检查樱花隧道进程（frpc.exe / SakuraFrpService.exe）是否存活
  4) 轮询公网隧道端点 /api/status 直到 200（隧道出口，自签证书走 curl -sk）

  任一必过环节失败 → 退出码非 0（0 成功 / 1 本机未就绪 / 2 隧道未就绪 / 3 隧道端点未配置）。
  说明：`/api/status` 200 只代表服务在跑，不代表 AI 链路可用。
  真正的 AI 链路判定请接着跑：node scripts/check-connectivity.mjs --insecure

  公网隧道端点按以下优先级解析（R-202：公开仓库不硬编码真实入口）：
    1) -PublicStatusUrl 显式传参
    2) 环境变量 AIMASTER_TUNNEL_URL
    3) .local/tunnel-url.txt（gitignored）
  三者都没有 → 退出码 3 并给出设置指引（真实入口见 COLLAB.md §6，内部文档不随公开仓库分发）。

.PARAMETER Port
  本机后端端口，默认 8787。

.PARAMETER PublicStatusUrl
  公网隧道端点，显式传入时优先级最高；未传时从 AIMASTER_TUNNEL_URL 或 .local/tunnel-url.txt 解析。

.PARAMETER TimeoutSeconds
  等待公网隧道端点就绪的最长秒数，默认 90。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/start-backend.ps1
#>
[CmdletBinding()]
param(
  [int]$Port = 8787,
  [string]$PublicStatusUrl = '',
  [int]$TimeoutSeconds = 90
)

$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectPath

# R-202：真实隧道入口不进公开仓库。优先级：显式传参 > AIMASTER_TUNNEL_URL > .local/tunnel-url.txt；缺值快速失败。
if (-not $PublicStatusUrl) {
  $tunnelBase = $env:AIMASTER_TUNNEL_URL
  if (-not $tunnelBase) {
    $tunnelFile = Join-Path $projectPath '.local\tunnel-url.txt'
    if (Test-Path -LiteralPath $tunnelFile) { $tunnelBase = Get-Content -LiteralPath $tunnelFile -Raw }
  }
  if ($tunnelBase -and $tunnelBase.Trim()) {
    $tunnelBase = $tunnelBase.Trim().TrimEnd('/')
    if ($tunnelBase -match '/api/status$') { $tunnelBase = $tunnelBase -replace '/api/status$', '' }
    $PublicStatusUrl = "$tunnelBase/api/status"
  } else {
    [Console]::Error.WriteLine(@'
未配置隧道端点（R-202：脚本不再硬编码真实入口，真实入口见 COLLAB.md §6 —— 内部文档，不随公开仓库分发）。
设置方式（优先级从高到低）：
  1) 显式传参：  powershell -ExecutionPolicy Bypass -File scripts/start-backend.ps1 -PublicStatusUrl https://<隧道入口>:<端口>/api/status
  2) 环境变量：  set AIMASTER_TUNNEL_URL=https://<隧道入口>:<端口>
  3) 本地文件：  echo https://<隧道入口>:<端口> > .local/tunnel-url.txt   （.local/ 已在 .gitignore）
取值可写基础地址，也可直接写完整 /api/status 地址。
'@)
    exit 3
  }
}

function Get-HttpCode {
  param([string]$Url, [switch]$Insecure)
  $curlArgs = @('-s', '-o', 'NUL', '-w', '%{http_code}', '-m', '20', '-L')
  if ($Insecure) { $curlArgs += '-k' }
  $curlArgs += $Url
  try { return (& curl.exe @curlArgs).Trim() } catch { return '000' }
}

function Test-PortListening {
  param([int]$PortNumber)
  $pattern = ':' + $PortNumber + '\s'
  return [bool](netstat -ano | Select-String -Pattern $pattern | Select-String -Pattern 'LISTENING')
}

function Wait-HttpOk {
  param([string]$Url, [int]$Seconds, [switch]$Insecure, [string]$Label)
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if ((Get-HttpCode -Url $Url -Insecure:$Insecure) -eq '200') {
      Write-Host ("  OK   {0}" -f $Label)
      return $true
    }
    Start-Sleep -Milliseconds 1500
  }
  Write-Host ("  FAIL {0} ({1})" -f $Label, $Url)
  return $false
}

$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodePath) {
  foreach ($candidate in @(
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'),
    'C:\Program Files\nodejs\node.exe'
  )) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) { $nodePath = $candidate; break }
  }
}
if (-not $nodePath) { throw '需要 Node.js 24 或更新版本：https://nodejs.org/' }
$nodeMajor = [int]((& $nodePath --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 24) { throw ("需要 Node.js 24+，当前为 {0}" -f $nodeMajor) }

$localStatusUrl = "http://127.0.0.1:$Port/api/status"

Write-Host "[1/4] 本机后端"
if (Test-PortListening -PortNumber $Port) {
  Write-Host ("  已在监听 :{0}，跳过启动" -f $Port)
} else {
  Write-Host ("  启动 node server/index.js（端口 {0}）..." -f $Port)
  Start-Process -FilePath $nodePath -ArgumentList 'server/index.js' -WorkingDirectory $projectPath -WindowStyle Hidden
}

Write-Host "[2/4] 等待本机 /api/status 返回 200"
if (-not (Wait-HttpOk -Url $localStatusUrl -Seconds 40 -Label $localStatusUrl)) {
  Write-Host '本机后端未就绪，已终止。'
  exit 1
}

Write-Host "[3/4] 樱花隧道进程"
$tunnel = Get-Process -Name 'frpc', 'SakuraFrpService' -ErrorAction SilentlyContinue
if ($tunnel) {
  $names = ($tunnel | Select-Object -ExpandProperty ProcessName | Sort-Object -Unique) -join ', '
  Write-Host ("  存活：{0}" -f $names)
} else {
  Write-Host '  未发现 frpc.exe / SakuraFrpService.exe。'
  Write-Host '  请启动 SakuraFrpLauncher 并开启隧道后重跑本脚本（隧道是外部工具，配置不在仓库内）。'
}

Write-Host "[4/4] 等待公网隧道端点返回 200（自签证书，curl -sk）"
if (-not (Wait-HttpOk -Url $PublicStatusUrl -Seconds $TimeoutSeconds -Insecure -Label $PublicStatusUrl)) {
  Write-Host '公网隧道端点未就绪：隧道进程可能未启动，或 frpc 未把隧道指向本机端口。'
  exit 2
}

Write-Host ''
Write-Host '后端已就绪。下一步验证 AI 链路（唯一判定标准：mode:"ai"）：'
Write-Host '  node scripts/check-connectivity.mjs --insecure'
exit 0
