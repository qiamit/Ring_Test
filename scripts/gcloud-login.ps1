# Log in for Firebase Admin SDK (Application Default Credentials) without a JSON key.
$gcloud = "${env:ProgramFiles(x86)}\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
if (-not (Test-Path $gcloud)) {
  $gcloud = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
}
if (-not (Test-Path $gcloud)) {
  Write-Error "Google Cloud SDK not found. Install: winget install Google.CloudSDK"
  exit 1
}
& $gcloud auth application-default login --project ring-test-manager
