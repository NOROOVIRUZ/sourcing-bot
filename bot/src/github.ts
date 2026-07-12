import type { Env, DataFile, CategoriesFile } from './types';

const GH_API = 'https://api.github.com';

let cachedCategories: CategoriesFile | null = null;

export async function getCategories(env: Env): Promise<CategoriesFile> {
  if (cachedCategories) return cachedCategories;
  const url = `${GH_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${env.CATEGORIES_PATH}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.raw+json',
      'User-Agent': 'sourcing-bot',
    },
  });
  if (!res.ok) throw new Error(`categories fetch failed: ${res.status}`);
  cachedCategories = (await res.json()) as CategoriesFile;
  return cachedCategories;
}

export async function getDataFile(env: Env): Promise<{ data: DataFile; sha: string }> {
  const url = `${GH_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${env.DATA_PATH}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'sourcing-bot',
    },
  });
  if (!res.ok) throw new Error(`data fetch failed: ${res.status}`);
  const r = (await res.json()) as { content: string; sha: string };
  const decoded = decodeBase64(r.content);
  return { data: JSON.parse(decoded) as DataFile, sha: r.sha };
}

export async function putDataFile(env: Env, data: DataFile, sha: string, message: string): Promise<void> {
  const url = `${GH_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${env.DATA_PATH}`;
  const content = encodeBase64(JSON.stringify(data, null, 2) + '\n');
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'sourcing-bot',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      content,
      sha,
      branch: 'main',
      committer: { name: 'sourcing-bot', email: 'bot@sourcing.local' },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`commit failed: ${res.status} ${errText}`);
  }
}

function decodeBase64(b64: string): string {
  const cleaned = b64.replace(/\s/g, '');
  const bin = atob(cleaned);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function encodeBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
