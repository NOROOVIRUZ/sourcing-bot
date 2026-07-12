#!/bin/bash
# 이미 값을 아는 건 전부 파일 대 파일로 조용히 채우고, 진짜 모르는 것만 딱 하나 물어봄.
# - TELEGRAM_BOT_TOKEN: 방금 입력한 값 유지
# - GITHUB_TOKEN, ALLOWED_USER_IDS: asuka_bot(repos-dashboard)에서 이미 쓰던 값 재사용
# - WEBHOOK_SECRET: 그냥 랜덤 생성 (물어볼 이유 없음)
# - GEMINI_API_KEY: 로컬 어디에도 평문으로 저장된 적 없어서 이것만 물어봄
cd "$(dirname "$0")" || exit 1

SRC=~/projects/virusworks/repos-dashboard/bot/.dev.vars
[ -f "$SRC" ] || { echo "재사용할 asuka_bot .dev.vars가 없어 — 수동으로 채워야 해."; exit 1; }
[ -f .dev.vars ] || { echo ".dev.vars가 없어 — collect-secrets.sh 먼저 실행해줘."; exit 1; }

get() { awk -F= -v k="$1" '$0 ~ "^"k"="{print substr($0, index($0,"=")+1); exit}' "$2"; }

tg_token=$(get TELEGRAM_BOT_TOKEN .dev.vars)
gh_token=$(get GITHUB_TOKEN "$SRC")
allowed=$(get ALLOWED_USER_IDS "$SRC")
webhook_secret=$(openssl rand -hex 24)
gemini_key=$(get GEMINI_API_KEY .dev.vars)

if [ -z "$gemini_key" ]; then
  gemini_key=$(osascript -e 'text returned of (display dialog "GEMINI_API_KEY 값을 입력해줘 (이건 로컬에 저장된 적이 없어서 딱 이것만 물어봐)" default answer "" with hidden answer with title "VUUI 개발보드 · 마지막 하나")' 2>/dev/null)
fi

{
  echo "TELEGRAM_BOT_TOKEN=${tg_token}"
  echo "GITHUB_TOKEN=${gh_token}"
  echo "WEBHOOK_SECRET=${webhook_secret}"
  echo "ALLOWED_USER_IDS=${allowed}"
  echo "GEMINI_API_KEY=${gemini_key}"
} > .dev.vars

echo "채움 상태 (값은 안 보여줌, 길이만): TG=${#tg_token} GH=${#gh_token} WEBHOOK=${#webhook_secret} ALLOWED=${#allowed} GEMINI=${#gemini_key}"
echo "wrangler secret bulk 재실행..."
wrangler secret bulk .dev.vars

echo ""
echo "webhook 등록..."
./register-webhook.sh
