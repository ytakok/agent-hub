# Deploys the API to Google Cloud Run (builds remotely with Cloud Build — no local Docker needed).
#
# One-time prerequisites (done by you):
#   1. Firebase project on the Blaze plan (billing enabled).
#   2. gcloud CLI installed (winget install Google.CloudSDK) and logged in (gcloud auth login).
#
# Usage (from the repo root):
#   ./scripts/deploy-api.ps1 -KeyFile C:\secure\sample-app-5fff2-sa.json            # first time (creates the secret)
#   ./scripts/deploy-api.ps1                                                          # later deploys
param(
  [string]$Project = 'sample-app-5fff2',
  [string]$Region = 'me-west1',                 # Tel Aviv
  [string]$Service = 'agency-hub-api',
  [string]$AllowedOrigin = 'https://ytakok.github.io',
  [string]$DataMode = 'mock',
  [string]$KeyFile = ''                          # service-account JSON; only needed to create/rotate the secret
)
$ErrorActionPreference = 'Stop'

gcloud config set project $Project | Out-Null

Write-Host '== Enabling required APIs (idempotent)'
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com

# The key lives in Secret Manager, never in the image or the repo.
$secret = 'firebase-sa'
$exists = (gcloud secrets list --filter="name~$secret$" --format='value(name)')
if (-not $exists) {
  if (-not $KeyFile) { throw "Secret '$secret' does not exist yet. Run again with -KeyFile <path to service-account JSON>." }
  Write-Host "== Creating secret $secret"
  gcloud secrets create $secret --replication-policy=automatic --data-file=$KeyFile
} elseif ($KeyFile) {
  Write-Host "== Adding new version of secret $secret (key rotation)"
  gcloud secrets versions add $secret --data-file=$KeyFile
}

# Cloud Run's runtime identity (default compute service account) must be able to read the secret.
$projectNumber = (gcloud projects describe $Project --format='value(projectNumber)')
$runtimeSa = "$projectNumber-compute@developer.gserviceaccount.com"
gcloud secrets add-iam-policy-binding $secret --member="serviceAccount:$runtimeSa" --role='roles/secretmanager.secretAccessor' | Out-Null

# Public web key is needed only for username login (Identity Toolkit); read it from the local web config.
$webKey = (Select-String -Path 'web/src/environments/firebase.config.ts' -Pattern "apiKey:\s*'([^']+)'").Matches[0].Groups[1].Value

Write-Host "== Deploying $Service to $Region"
gcloud run deploy $Service `
  --source . `
  --region $Region `
  --allow-unauthenticated `
  --min-instances 0 `
  --max-instances 3 `
  --memory 512Mi `
  --set-env-vars "NODE_ENV=production,DATA_MODE=$DataMode,FIREBASE_PROJECT_ID=$Project,FIREBASE_WEB_API_KEY=$webKey,CORS_ORIGINS=$AllowedOrigin" `
  --set-secrets 'FIREBASE_SERVICE_ACCOUNT_JSON=firebase-sa:latest'

$url = (gcloud run services describe $Service --region $Region --format='value(status.url)')
Write-Host ""
Write-Host "API URL: $url"
Write-Host "Set apiBaseUrl: '$url/api' in web/src/environments/environment.ts, then: npm run deploy -w web"
