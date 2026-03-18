#!/bin/bash
set -e

GCLOUD=/opt/homebrew/bin/gcloud

PROJECT_ID="m2st-net"
REGION="asia-northeast1"
REPO="${REGION}-docker.pkg.dev/${PROJECT_ID}/cataso"

BACKEND_IMAGE="${REPO}/backend"
FRONTEND_IMAGE="${REPO}/frontend"

FRONTEND_URL="https://cataso.m2st.org"
BACKEND_CUSTOM_DOMAIN="api-cataso.m2st.org"

echo "=== GCPプロジェクト設定 ==="
${GCLOUD} config set project ${PROJECT_ID}

echo "=== 必要なAPIを有効化 ==="
${GCLOUD} services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project=${PROJECT_ID}

echo "=== Artifact Registryリポジトリ作成（初回のみ） ==="
${GCLOUD} artifacts repositories create cataso \
  --repository-format=docker \
  --location=${REGION} \
  --project=${PROJECT_ID} \
  2>/dev/null || echo "（既存のリポジトリを使用）"

echo "=== BackendをCloud Buildでビルド & プッシュ ==="
${GCLOUD} builds submit ./backend \
  --tag=${BACKEND_IMAGE} \
  --project=${PROJECT_ID}

echo "=== BackendをCloud Runにデプロイ ==="
${GCLOUD} run deploy cataso-backend \
  --image=${BACKEND_IMAGE} \
  --region=${REGION} \
  --platform=managed \
  --allow-unauthenticated \
  --set-env-vars="ALLOWED_ORIGINS=${FRONTEND_URL}" \
  --project=${PROJECT_ID}

BACKEND_URL=$(${GCLOUD} run services describe cataso-backend \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --format="value(status.url)")

echo "Backend URL: ${BACKEND_URL}"

API_URL="${BACKEND_URL}"
WS_URL="${BACKEND_URL/https/wss}"

echo "=== FrontendをCloud Buildでビルド & プッシュ ==="
${GCLOUD} builds submit ./frontend \
  --config=scripts/cloudbuild-frontend.yaml \
  --substitutions="_IMAGE=${FRONTEND_IMAGE},_API_URL=${API_URL},_WS_URL=${WS_URL}" \
  --project=${PROJECT_ID}

echo "=== FrontendをCloud Runにデプロイ ==="
${GCLOUD} run deploy cataso-frontend \
  --image=${FRONTEND_IMAGE} \
  --region=${REGION} \
  --platform=managed \
  --allow-unauthenticated \
  --project=${PROJECT_ID}

FRONTEND_DEPLOY_URL=$(${GCLOUD} run services describe cataso-frontend \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --format="value(status.url)")

echo ""
echo "=== デプロイ完了 ==="
echo "Frontend: ${FRONTEND_DEPLOY_URL}"
echo "Backend:  ${BACKEND_URL}"
echo ""
echo "カスタムドメイン設定は別途 gcloud run domain-mappings create で行ってください"
