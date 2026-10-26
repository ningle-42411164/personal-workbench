$ErrorActionPreference = 'Stop'
$servicePath = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $servicePath
$env:WRANGLER_SEND_METRICS = 'false'
$wranglerPath = Join-Path $servicePath 'node_modules/wrangler/bin/wrangler.js'

# 仅由用户在本机终端交互输入；Wrangler 的 secret prompt 隐藏输入。
# 不把秘密放进命令参数、环境变量、文件或聊天，也不启用调试日志。
Write-Host 'Personal Workbench API Test - GitHub OAuth secrets'
Write-Host 'Paste each value only into the hidden Wrangler prompt, then press Enter.'
Write-Host 'Do not paste credentials into this chat or a shell command.'

foreach ($secretName in @('GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET')) {
    Write-Host "Uploading $secretName to personal-workbench-api-test"
    & node $wranglerPath secret put $secretName
    if ($LASTEXITCODE -ne 0) {
        throw "Upload failed for $secretName. No further secret was requested."
    }
}

Write-Host 'Both Cloudflare secrets were uploaded successfully.'
