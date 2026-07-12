import type { Env, SourceEntry } from './types';
import { TelegramAPI } from './telegram';
import { getDataFile, putDataFile, getCategories } from './github';
import { fetchPageMeta, classify, hasEnoughSignal } from './classifier';

const DASHBOARD_URL = 'https://norooviruz.github.io/sourcing-bot/';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

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

async function addSourceFlow(url: string, chatId: number, userId: number, tg: TelegramAPI, env: Env): Promise<void> {
  let domain = '';
  try {
    domain = new URL(url).hostname;
  } catch {
    await tg.sendMessage(chatId, `이 링크는 못 읽겠어: ${url}`);
    return;
  }

  const { data, sha } = await getDataFile(env);
  if (data.items.some((it) => it.url === url)) {
    await tg.sendMessage(chatId, `이미 저장돼 있어: ${domain}`);
    return;
  }

  const id = `${domain.replace(/\./g, '-')}-${Date.now().toString(36)}`;

  try {
    const meta = await fetchPageMeta(url);

    // 알리바바류 안티봇 캡차 페이지 — 못 읽었으면 정직하게 미분류로 저장(링크는 잃지 않되 거짓 분류는 안 함)
    if (!hasEnoughSignal(meta)) {
      const entry: SourceEntry = {
        id, url, domain,
        title: domain,
        desc_ko: '(자동 추출 실패 — 접속 차단/캡차 페이지로 보임)',
        category: '미분류',
        confidence: 0,
        classified_by: 'manual',
        saved_at: new Date().toISOString(),
        added_by: `telegram:${userId}`,
        notes: null,
      };
      data.items.unshift(entry);
      data.updated_at = entry.saved_at;
      await putDataFile(env, data, sha, `add(미분류): ${domain}`);
      await tg.sendMessage(
        chatId,
        `⚠️ 이 사이트는 못 읽었어 (차단/캡차 가능성). 일단 링크는 저장했어.\n` +
          `직접 분류하려면: /분류 ${entry.id} <카테고리> <설명>`
      );
      return;
    }

    const categories = await getCategories(env);
    const result = await classify(env, url, meta, categories);

    const entry: SourceEntry = {
      id, url, domain,
      title: result.title,
      desc_ko: result.desc_ko,
      category: result.category,
      confidence: result.confidence,
      classified_by: 'ai',
      saved_at: new Date().toISOString(),
      added_by: `telegram:${userId}`,
      notes: null,
    };
    data.items.unshift(entry);
    data.updated_at = entry.saved_at;
    await putDataFile(env, data, sha, `add: ${domain} (${entry.category})`);

    await tg.sendMessage(
      chatId,
      `✅ 저장했어\n📂 ${entry.category}\n📝 ${entry.desc_ko}\n🔗 ${domain}` +
        (entry.confidence < 0.6 ? `\n⚠️ 신뢰도 낮음(${Math.round(entry.confidence * 100)}%) — 카테고리 확인해줘` : '')
    );
  } catch (e: any) {
    // 조용히 실패시키지 않음 — 원문 에러 그대로 보고
    await tg.sendMessage(chatId, `⚠️ 분류 실패: ${e.message || e}`);
  }
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
        '/dashboard — 대시보드 링크'
    );
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

  if (cmd === '/dashboard') {
    await tg.sendMessage(chatId, DASHBOARD_URL, { disablePreview: false });
    return;
  }

  if (cmd === '/list') {
    const n = Math.min(Number(arg) || 10, 30);
    const { data } = await getDataFile(env);
    if (data.items.length === 0) {
      await tg.sendMessage(chatId, '아직 저장된 게 없어.');
      return;
    }
    const lines = data.items.slice(0, n).map((it) => `• [${it.category}] ${it.domain} — ${it.desc_ko}\n  id: ${it.id}`);
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
      [it.title, it.desc_ko, it.category, it.domain].join(' ').toLowerCase().includes(q)
    );
    if (hits.length === 0) {
      await tg.sendMessage(chatId, `"${arg}" 결과 없음.`);
      return;
    }
    const lines = hits.slice(0, 20).map((it) => `• [${it.category}] ${it.domain} — ${it.desc_ko}\n  id: ${it.id}`);
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
