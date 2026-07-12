import type { Env, CategoriesFile } from './types';

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
const RETRIABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export interface PageMeta {
  title: string;
  ogTitle: string;
  ogDesc: string;
  metaDesc: string;
  bodyText: string;
}

export interface ClassifyResult {
  company: string;
  category: string;
  desc_ko: string;
  confidence: number;
}

// 알리바바 등 안티봇 캡차 페이지는 title/og 태그가 아예 없음 — 이걸 신호로 차단 여부 판별
// (body 텍스트 길이는 캡차 방어 스크립트로도 부풀 수 있어 신호로 못 씀)
export function hasEnoughSignal(meta: PageMeta): boolean {
  return Boolean(meta.title || meta.ogTitle || meta.ogDesc || meta.metaDesc);
}

// 사이트가 JS로만 렌더돼도 og:title/description은 SNS 공유용이라 서버 HTML에 보통 박혀있음 — 브라우저 렌더링 없이 plain fetch로 충분
export async function fetchPageMeta(url: string): Promise<PageMeta> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`페이지 요청 실패: HTTP ${res.status}`);

  const meta: PageMeta = { title: '', ogTitle: '', ogDesc: '', metaDesc: '', bodyText: '' };
  let bodyChars = 0;
  const BODY_CAP = 3000;

  const rewriter = new HTMLRewriter()
    .on('title', {
      text(t) {
        meta.title += t.text;
      },
    })
    .on('meta', {
      element(el) {
        const property = el.getAttribute('property') || el.getAttribute('name');
        const content = el.getAttribute('content') || '';
        if (property === 'og:title') meta.ogTitle = content;
        if (property === 'og:description') meta.ogDesc = content;
        if (property === 'description') meta.metaDesc = content;
      },
    })
    // script/style는 body 텍스트로 안 새게 통째로 제거 (안 하면 캡차 방어 스크립트 코드가 "본문"으로 섞여 들어감)
    .on('script', { element: (el) => { el.remove(); } })
    .on('style', { element: (el) => { el.remove(); } })
    .on('body', {
      text(t) {
        if (bodyChars >= BODY_CAP) return;
        const chunk = t.text.replace(/\s+/g, ' ');
        meta.bodyText += chunk;
        bodyChars += chunk.length;
      },
    });

  await rewriter.transform(res).arrayBuffer();

  meta.title = meta.title.trim();
  meta.bodyText = meta.bodyText.trim().slice(0, BODY_CAP);
  return meta;
}

export async function classify(env: Env, url: string, meta: PageMeta, categories: CategoriesFile): Promise<ClassifyResult> {
  const domain = new URL(url).hostname;
  const catList = Object.values(categories.categories)
    .map((c) => `- ${c.label}: ${c.description}`)
    .join('\n');

  const systemPrompt =
    '너는 소싱 담당자를 돕는 분류 도우미다. 업체/제품 사이트 링크 하나를 보고 ' +
    '(1) 회사/공장명(마켓플레이스명·"Wholesale" 같은 광고문구는 빼고 실제 업체명만), ' +
    '(2) 이미 있는 카테고리 중 가장 알맞은 것, ' +
    '(3) 어떤 제품/업체인지 한국어 1문장 짧은 설명을 뽑는다. 회사명이 안 보이면 도메인을 그대로 써라. ' +
    '반드시 지정된 JSON 스키마로만 답한다.';

  const userPrompt =
    `[URL]\n${url} (도메인: ${domain})\n\n` +
    `[페이지 정보]\n제목: ${meta.title || meta.ogTitle || '(없음)'}\n` +
    `og:description: ${meta.ogDesc || '(없음)'}\nmeta description: ${meta.metaDesc || '(없음)'}\n` +
    `본문 일부: ${meta.bodyText || '(추출 안 됨)'}\n\n` +
    `[카테고리 목록]\n${catList}\n\n` +
    `[규칙]\n${Object.values(categories.rules).join('\n')}\n\n` +
    '반드시 아래 JSON 스키마로만 출력하라. 설명·인사·마크다운 금지:\n' +
    '{"company":"<회사/공장명>","category":"<카테고리 목록 중 하나 또는 신규>","desc_ko":"<1문장 짧은 설명>","confidence":<0~1 사이 숫자>}';

  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');

  let lastErr: any = null;
  for (const model of GEMINI_MODELS) {
    try {
      const raw = await callGemini(env, systemPrompt, userPrompt, model);
      const parsed = JSON.parse(raw);
      return {
        company: String(parsed.company || meta.title || meta.ogTitle || domain),
        category: String(parsed.category || '기타'),
        desc_ko: String(parsed.desc_ko || ''),
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };
    } catch (e: any) {
      lastErr = e;
      if (e && e.status && !RETRIABLE_STATUS.has(e.status)) break;
    }
  }
  throw lastErr || new Error('분류 실패');
}

function geminiEndpoint(env: Env, model: string): string {
  if (env.CF_ACCOUNT_ID && env.AI_GATEWAY) {
    return `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.AI_GATEWAY}/google-ai-studio/v1beta/models/${model}:generateContent`;
  }
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

async function callGemini(env: Env, systemPrompt: string, userPrompt: string, model: string): Promise<string> {
  const reqBody = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
  });
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY };
  if (env.AI_GATEWAY_TOKEN) headers['cf-aig-authorization'] = `Bearer ${env.AI_GATEWAY_TOKEN}`;

  const res = await fetch(geminiEndpoint(env, model), { method: 'POST', headers, body: reqBody });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    const e: any = new Error(`[${model}] API 오류 HTTP ${res.status}: ${bodyText.slice(0, 300) || res.statusText}`);
    e.status = res.status;
    throw e;
  }
  const data = (await res.json()) as any;
  const cand = (data.candidates || [])[0];
  const outText = ((cand && cand.content && cand.content.parts) || [])
    .filter((p: any) => !p.thought)
    .map((p: any) => p.text || '')
    .join('')
    .trim();
  const match = outText.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`[${model}] JSON 응답 파싱 실패: ${outText.slice(0, 200)}`);
  return match[0];
}
