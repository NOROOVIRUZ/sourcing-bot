#!/bin/bash
# 맥 네이티브 입력창으로 시크릿 받아서 .dev.vars에 쓰고 바로 wrangler secret bulk까지.
# 값은 이 스크립트 안에서만 돌고 터미널에 echo되지 않음 (asuka 눈에 안 보임).
cd "$(dirname "$0")" || exit 1

KEYS=(TELEGRAM_BOT_TOKEN GITHUB_TOKEN WEBHOOK_SECRET ALLOWED_USER_IDS GEMINI_API_KEY)
> .dev.vars

for key in "${KEYS[@]}"; do
  val=$(osascript -e "text returned of (display dialog \"${key} 값을 입력해줘\" default answer \"\" with hidden answer with title \"VUUI 개발보드 · 시크릿 등록\")" 2>/dev/null)
  # 취소 누르면 빈 값으로 스킵 (나중에 이 스크립트 다시 실행해서 채우면 됨)
  echo "${key}=${val}" >> .dev.vars
done

echo "입력 끝. .dev.vars에 ${#KEYS[@]}개 항목 저장했어."
echo "wrangler secret bulk .dev.vars 실행할게..."
wrangler secret bulk .dev.vars
