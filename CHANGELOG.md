# CHANGELOG — VUUI 개발보드 (sourcing-bot)

## v4 — 2026-07-20
- URL 주소에서 제품명 자동 추출: 알리바바 product-detail 링크가 캡차로 본문이 막혀도 URL 경로의 제품명 slug를 뽑아 분류 (www.alibaba.com → "Multiple Colorful Round Rope Pet Dog" + 애견 자동, 실측 확인)
- Gemini 키 있으면 slug를 근거로 회사명·카테고리·한글설명 추론(코덱스식 URL 추론), 키 없어도 slug+키워드로 카테고리 자동 추정(confidence 0.4 → "확인 필요" 배지 유지, 노루군이 최종 확정)
- classifier: extractProductSlug()·guessCategory() 추가, /product-detail/<slug>_<id>.html + /p|pd|products/ 패턴, subject 같은 쓰레기 slug 필터. 단축링크(/x/)는 리다이렉트 최종 URL에서 slug 시도
- 한계: product-detail URL엔 공장명이 없어 제품명만 자동(공장명 자동은 스토어 서브도메인 링크일 때만). 정확한 회사명은 대시보드 [수정]으로 확정
- 검색 키워드: URL slug 제품명 자동분류 alibaba product-detail 캡차 우회 코덱스 extractProductSlug guessCategory

## v3 — 2026-07-20
- 대시보드 카드 직접 수정/삭제 기능 추가 — 카드에 마우스 올리면 [수정]/[삭제] 버튼(터치 기기는 항상 노출). 보드키(x-board-secret) 인증 재사용
- 수정 = 회사·공장명 + 카테고리 + 설명을 인라인 폼에서 편집 (텔레그램 /분류는 회사명을 못 고쳤음 — 이걸 해결). 카테고리는 기존 값 자동완성(datalist)
- 신뢰도 업데이트: 노루군이 수동 확정하면 confidence=1 → "확인 필요" 배지 사라짐. www.alibaba.com처럼 회사명 못 딴 미확정 카드는 왼쪽 빨간 힌트 + "확인 필요" 배지로 구분
- 워커 API 추가: POST /api/update {id, company?, category?, desc_ko?}, POST /api/delete {id} (둘 다 x-board-secret 인증, saveSource/putDataFile 패턴 재사용)
- hozi(주식회사 호지, hozi.co.kr) 브랜드 소싱함 등록 — 한국 반려견 워킹 액세서리 프리미엄, VUUI 벤치마크(러프웨어=아웃도어 / 호지=패션·감성)
- 검색 키워드: 카드 수정 삭제 편집 신뢰도 confidence api/update api/delete alibaba www.alibaba.com hozi 호지

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
