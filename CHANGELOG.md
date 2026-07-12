# CHANGELOG — VUUI 개발보드 (sourcing-bot)

## v2 — 2026-07-12
- 단축링크 리다이렉트 추적: x.alibaba.com/xxx 를 최종 도메인(스토어 주소)으로 풀어서 저장
- 알리바바 스토어명 자동 추출: 콘텐츠가 캡차로 막혀도 서브도메인(ivypet 등)을 회사명으로 사용
- 화면 버전 표기 시작 (푸터 v2)

## v1 — 2026-07-12
- 최초 구축: 텔레그램(@vuuui_bot)에 링크 보내면 자동 저장 → GitHub Pages 대시보드 표시
- asuka_bot(repos-dashboard) 구조 재사용: Cloudflare Worker + GitHub Contents API + docs/ 정적 대시보드
- AI 분류(Gemini)는 선택사항 — 키 없이도 페이지 제목/설명으로 저장 (알리바바 등 차단 사이트는 미분류+링크 저장)
- 애플 HIG 다크 테마 적용 (designs/apple-hig 토큰)
- 보드 입력창: 대시보드에서 링크 붙여넣고 Enter로 저장 (POST /api/add, /보드키로 기기 인증)
- 명령어: /list /search /분류 /delete /dashboard(/대쉬보드) /보드키 /알람끔 /알람켬 (알람은 asuka_bot과 KV 공유)
- 제목추출 버그 수정: head > title만 추출 (본문 SVG 아이콘 title 오염 방지) + HTML 엔티티 복원
- 시크릿 자동화: collect-secrets.sh(다이얼로그) / autofill-secrets.sh(gh 토큰 등 자동) / register-webhook.sh
