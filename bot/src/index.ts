import type { Env, SourceEntry } from './types';
import { TelegramAPI } from './telegram';
import { getDataFile, putDataFile, getCategories } from './github';
import { fetchPageMeta, classify, hasEnoughSignal } from './classifier';

const DASHBOARD_URL = 'https://norooviruz.github.io/sourcing-bot/';

// 대시보드(github.io)가 다른 도메인이라 CORS 필요
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,x-board-secret',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }
    if (req.method === 'POST' && url.pathname === '/api/add') {
      return handleAddApi(req, env);
    }
    if (req.method === 'GET') {
      return new Response('sourcing-bot online 🔴', { status: 200 });
    }
    if (!url.pathname.startsWith('/webhook/')) {
      return new Response('sourcing-bot online 🔴', { status: 200 });
    }

    const pathSecret = url.pathname.slice('/webhook/'.length);
    if (pathSecret !== env.WEBHOOK_SECRET) {
      return new Response('forbidden', { status: 401 });
    }
    const headerSecret = req.headers.get('x-telegram-bot-api-secret-token');
    if (headerSecret !== env.WEBHOOK_SECRET) {
      return new Response('forbidden', { status: 401 });
    }

    let update: any;
    try {
      update = await req.json();
    } catch {
      return new Response('invalid json', { status: 400 });
    }

    const allowed = env.ALLOWED_USER_IDS.split(',').map((s) => s.trim()).filter(Boolean);
    const fromId = String(update?.message?.from?.id ?? '');
    if (!fromId || !allowed.includes(fromId)) {
      return new Response('ok'); // 허용 안 된 사용자는 조용히 무시
    }

    ctx.waitUntil(handleUpdate(update, env).catch((e) => console.error('handle error', e)));
    return new Response('ok');
  },
};

async function handleUpdate(update: any, env: Env): Promise<void> {
  if (!update.message) return;
  const tg = new TelegramAPI(env);
  const m = update.message;
  const chatId = m.chat.id;
  const userId = m.from.id;
  const text = (m.text || '').trim();
  if (!text) return;

  if (text.startsWith('/')) {
    await handleCommand(text, chatId, userId, tg, env);
    return;
  }

  const urls = extractUrls(text);
  if (urls.length === 0) {
    await tg.sendMessage(chatId, '흥, URL이 없잖아. 링크를 보내야 저장하지.');
    return;
  }
  for (const u of urls) {
    await addSourceFlow(u, chatId, userId, tg, env);
  }
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"'）)]+/g) || [];
  return matches.map((u) => u.replace(/[.,)\]]+$/, ''));
}

// 공용 저장 경로 — 텔레그램·보드 API 둘 다 이걸 탄다.
// 핵심 = 링크 저장. 페이지 읽기/AI 분류는 되면 좋고 안 되면 넘어감 (GEMINI 키 없어도 동작).
async function saveSource(
  env: Env,
  url: string,
  addedBy: string
): Promise<{ dup: boolean; entry?: SourceEntry; aiNote: string }> {
  const domain = new URL(url).hostname;

  const { data, sha } = await getDataFile(env);
  if (data.items.some((it) => it.url === url)) {
    return { dup: true, aiNote: '' };
  }

  let meta = { title: '', ogTitle: '', ogDesc: '', metaDesc: '', bodyText: '', finalUrl: url };
  try {
    meta = await fetchPageMeta(url);
  } catch {}

  // 단축링크(x.alibaba.com/xxx)는 리다이렉트 최종 도메인이 실체 — 그걸 기준으로 저장
  let finalDomain = domain;
  try {
    finalDomain = new URL(meta.finalUrl).hostname;
  } catch {}

  // 알리바바 스토어는 콘텐츠가 캡차로 막혀도 서브도메인 = 스토어명 (ivypet.en.alibaba.com 실측)
  const storeMatch = finalDomain.match(/^([a-z0-9][a-z0-9-]*)\.(?:en\.)?alibaba\.com$/i);
  const NOT_STORES = new Set(['www', 'x', 'm', 'sale', 'activity', 'message', 'login', 'passport']);
  const storeName = storeMatch && !NOT_STORES.has(storeMatch[1].toLowerCase()) ? storeMatch[1] : null;

  const id = `${finalDomain.replace(/\./g, '-')}-${Date.now().toString(36)}`;

  const entry: SourceEntry = {
    id, url,
    domain: finalDomain,
    company: (meta.title || meta.ogTitle || (storeName ? `${storeName} (알리바바 스토어)` : finalDomain)).slice(0, 120),
    desc_ko: meta.ogDesc || meta.metaDesc || '',
    category: '미분류',
    confidence: 0,
    classified_by: 'manual',
    saved_at: new Date().toISOString(),
    added_by: addedBy,
    notes: null,
  };

  let aiNote = '';
  if (hasEnoughSignal(meta)) {
    try {
      const categories = await getCategories(env);
      const result = await classify(env, url, meta, categories);
      entry.company = result.company;
      entry.category = result.category;
      entry.desc_ko = result.desc_ko;
      entry.confidence = result.confidence;
      entry.classified_by = 'ai';
    } catch {
      aiNote = `AI 분류는 실패해서 페이지 제목으로만 저장 — /분류 ${id} <카테고리> <설명> 으로 수정 가능`;
    }
  } else {
    aiNote = `사이트가 안 읽혀서 링크만 저장 — 차단/캡차 가능성. /분류 ${id} <카테고리> <설명> 으로 수정 가능`;
  }

  data.items.unshift(entry);
  data.updated_at = entry.saved_at;
  await putDataFile(env, data, sha, `add: ${finalDomain} (${entry.category})`);

  return { dup: false, entry, aiNote };
}

// 보드에서 직접 저장 — 대시보드 입력창이 POST {url} + x-board-secret 헤더로 호출
async function handleAddApi(req: Request, env: Env): Promise<Response> {
  const jsonRes = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });

  const secret = req.headers.get('x-board-secret') || new URL(req.url).searchParams.get('secret');
  if (secret !== env.WEBHOOK_SECRET) {
    return jsonRes(401, { ok: false, error: 'forbidden' });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonRes(400, { ok: false, error: 'invalid json' });
  }
  const rawUrl = String(body?.url || '').trim();
  try {
    const u = new URL(rawUrl);
    if (!/^https?:$/.test(u.protocol)) throw new Error();
  } catch {
    return jsonRes(400, { ok: false, error: 'URL이 아니야' });
  }

  try {
    const result = await saveSource(env, rawUrl, 'board');
    if (result.dup) return jsonRes(409, { ok: false, error: '이미 저장돼 있어' });
    return jsonRes(200, { ok: true, entry: result.entry, note: result.aiNote });
  } catch (e: any) {
    return jsonRes(502, { ok: false, error: e.message || String(e) });
  }
}

async function addSourceFlow(url: string, chatId: number, userId: number, tg: TelegramAPI, env: Env): Promise<void> {
  try {
    new URL(url);
  } catch {
    await tg.sendMessage(chatId, `이 링크는 못 읽겠어: ${url}`);
    return;
  }

  let result: { dup: boolean; entry?: SourceEntry; aiNote: string };
  try {
    result = await saveSource(env, url, `telegram:${userId}`);
  } catch (e: any) {
    // 저장 자체가 실패한 건 조용히 못 넘어감 — 원문 에러 그대로 보고
    await tg.sendMessage(chatId, `⚠️ 저장 실패: ${e.message || e}`);
    return;
  }

  if (result.dup) {
    await tg.sendMessage(chatId, `이미 저장돼 있어: ${new URL(url).hostname}`);
    return;
  }

  const entry = result.entry!;
  await tg.sendMessage(
    chatId,
    `✅ 저장했어\n🏭 ${entry.company}\n📂 ${entry.category}` +
      (entry.desc_ko ? `\n📝 ${entry.desc_ko}` : '') +
      (entry.classified_by === 'ai' && entry.confidence < 0.6
        ? `\n⚠️ 신뢰도 낮음(${Math.round(entry.confidence * 100)}%) — 카테고리 확인해줘`
        : '') +
      (result.aiNote ? `\n(${result.aiNote})` : '')
  );
}

async function handleCommand(text: string, chatId: number, userId: number, tg: TelegramAPI, env: Env): Promise<void> {
  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw.toLowerCase();
  const arg = rest.join(' ').trim();

  if (cmd === '/help' || cmd === '/도움말') {
    await tg.sendMessage(
      chatId,
      '*sourcing-bot 명령어*\n' +
        '링크를 그냥 보내면 자동 분류 저장돼.\n\n' +
        '/list [N] — 최근 N개 (기본 10)\n' +
        '/search <검색어> — 제목·설명·카테고리·도메인 검색\n' +
        '/분류 <id> <카테고리> <설명> — 자동분류 실패한 항목 수동 수정\n' +
        '/delete <id> — 삭제\n' +
        '/dashboard /대쉬보드 — 대시보드 링크\n' +
        '/보드키 — 보드 입력창 활성화 링크 (기기당 1회)\n' +
        '/알람끔 /알람켬 — 모든 봇 알람 스위치'
    );
    return;
  }

  if (cmd === '/알람끔') {
    await env.ALARM_KV.put('alarm_muted', '1');
    await tg.sendMessage(chatId, '🔕 알람 전부 껐어. 다시 들으려면 /알람켬');
    return;
  }

  if (cmd === '/알람켬') {
    await env.ALARM_KV.delete('alarm_muted');
    await tg.sendMessage(chatId, '🔔 알람 켰어. 이제 다 알려줄게.');
    return;
  }

  if (cmd === '/분류') {
    const [id, category, ...descParts] = rest;
    const desc = descParts.join(' ').trim();
    if (!id || !category || !desc) {
      await tg.sendMessage(chatId, '형식: /분류 <id> <카테고리> <설명>');
      return;
    }
    const { data, sha } = await getDataFile(env);
    const entry = data.items.find((it) => it.id === id);
    if (!entry) {
      await tg.sendMessage(chatId, `id "${id}"를 못 찾았어. /list로 확인해봐.`);
      return;
    }
    entry.category = category;
    entry.desc_ko = desc;
    entry.confidence = 1;
    entry.classified_by = 'manual';
    data.updated_at = new Date().toISOString();
    await putDataFile(env, data, sha, `recategorize: ${id} -> ${category}`);
    await tg.sendMessage(chatId, `✅ 수정했어\n📂 ${category}\n📝 ${desc}`);
    return;
  }

  if (cmd === '/dashboard' || cmd === '/대쉬보드' || cmd === '/대시보드') {
    await tg.sendMessage(chatId, `🌐 [대시보드 열기](${DASHBOARD_URL})`, { disablePreview: false });
    return;
  }

  // 보드 입력창용 비밀키 세팅 링크 — 이 링크로 열면 그 기기 브라우저에 키가 저장돼서 보드에서 바로 저장 가능
  if (cmd === '/보드키') {
    await tg.sendMessage(chatId, `이 링크로 한 번 열면 그 기기에선 보드 입력창을 바로 쓸 수 있어:\n${DASHBOARD_URL}#secret=${env.WEBHOOK_SECRET}`);
    return;
  }

  if (cmd === '/list') {
    const n = Math.min(Number(arg) || 10, 30);
    const { data } = await getDataFile(env);
    if (data.items.length === 0) {
      await tg.sendMessage(chatId, '아직 저장된 게 없어.');
      return;
    }
    const lines = data.items.slice(0, n).map((it) => `• [${it.category}] ${it.company} — ${it.desc_ko}\n  id: ${it.id}`);
    await tg.sendMessage(chatId, lines.join('\n\n'));
    return;
  }

  if (cmd === '/search') {
    if (!arg) {
      await tg.sendMessage(chatId, '검색어를 같이 보내줘. 예: /search 애견');
      return;
    }
    const { data } = await getDataFile(env);
    const q = arg.toLowerCase();
    const hits = data.items.filter((it) =>
      [it.company, it.desc_ko, it.category, it.domain].join(' ').toLowerCase().includes(q)
    );
    if (hits.length === 0) {
      await tg.sendMessage(chatId, `"${arg}" 결과 없음.`);
      return;
    }
    const lines = hits.slice(0, 20).map((it) => `• [${it.category}] ${it.company} — ${it.desc_ko}\n  id: ${it.id}`);
    await tg.sendMessage(chatId, lines.join('\n\n'));
    return;
  }

  if (cmd === '/delete') {
    if (!arg) {
      await tg.sendMessage(chatId, '삭제할 id를 같이 보내줘. /list로 id 확인 가능.');
      return;
    }
    const { data, sha } = await getDataFile(env);
    const before = data.items.length;
    data.items = data.items.filter((it) => it.id !== arg);
    if (data.items.length === before) {
      await tg.sendMessage(chatId, `id "${arg}"를 못 찾았어.`);
      return;
    }
    data.updated_at = new Date().toISOString();
    await putDataFile(env, data, sha, `delete: ${arg}`);
    await tg.sendMessage(chatId, `삭제했어: ${arg}`);
    return;
  }

  await tg.sendMessage(chatId, `모르는 명령어야: ${cmd}\n/help 봐봐.`);
}
