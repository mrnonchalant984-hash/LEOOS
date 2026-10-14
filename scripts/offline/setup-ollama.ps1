$ErrorActionPreference = 'Stop'
$model = if ($env:LEO_LOCAL_MODEL_NAME) { $env:LEO_LOCAL_MODEL_NAME } else { 'qwen2.5:3b' }

Write-Host 'LeonardX local model setup' -ForegroundColor Cyan
Write-Host "Model: $model"

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  Write-Host 'Ollama is not installed.' -ForegroundColor Yellow
  Write-Host 'Install Ollama for Windows from https://ollama.com/download, then reopen PowerShell and run this script again.'
  exit 1
}

try {
  $null = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3
} catch {
  Write-Host 'Ollama is installed but its local service is not responding. Start the Ollama app, then run this script again.' -ForegroundColor Yellow
  exit 1
}

Write-Host "Downloading model $model. This first step requires internet and may download several GB." -ForegroundColor Yellow
ollama pull $model
if ($LASTEXITCODE -ne 0) { throw "ollama pull failed with exit code $LASTEXITCODE" }
Write-Host 'Model is installed. Add these lines to the project .env.local:' -ForegroundColor Green
Write-Host 'LEO_OFFLINE_MODE=true'
Write-Host 'LEO_LOCAL_MODEL_URL=http://127.0.0.1:11434/v1'
Write-Host "LEO_LOCAL_MODEL_NAME=$model"
Write-Host 'Then restart npm run dev. Once the model is downloaded, text chat can run without mobile data while the local app and Ollama are running.'
