#!/bin/bash
# .dev.vars에 이미 저장된 토큰/시크릿을 이 스크립트 안에서만 읽어서 텔레그램 webhook 등록.
# 값은 여기서만 쓰이고 화면에 echo 안 됨.
cd "$(dirname "$0")" || exit 1

if [ ! -f .dev.vars ]; then
  echo ".dev.vars가 없어 — collect-secrets.sh 먼저 실행해줘."
  exit 1
fi

set -a
source .dev.vars
set +a

if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$WEBHOOK_SECRET" ]; then
  echo "TELEGRAM_BOT_TOKEN 또는 WEBHOOK_SECRET이 비어있어 — collect-secrets.sh로 다시 채워줘."
  exit 1
fi

curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://sourcing-bot.noroovirus-dev.workers.dev/webhook/${WEBHOOK_SECRET}" \
  -d "secret_token=${WEBHOOK_SECRET}"
echo ""
