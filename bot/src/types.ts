export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  GITHUB_TOKEN: string;
  WEBHOOK_SECRET: string;
  ALLOWED_USER_IDS: string;
  GEMINI_API_KEY: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  DATA_PATH: string;
  CATEGORIES_PATH: string;
  CF_ACCOUNT_ID?: string;
  AI_GATEWAY?: string;
  AI_GATEWAY_TOKEN?: string;
  ALARM_KV: KVNamespace;
}

export interface SourceEntry {
  id: string;
  url: string;
  domain: string;
  company: string;
  desc_ko: string;
  category: string;
  confidence: number;
  classified_by: 'ai' | 'manual';
  saved_at: string;
  added_by: string;
  notes: string | null;
}

export interface DataFile {
  version: number;
  updated_at: string;
  items: SourceEntry[];
}

export interface CategoryDef {
  label: string;
  description: string;
}

export interface CategoriesFile {
  version: number;
  updated: string;
  rules: Record<string, string>;
  categories: Record<string, CategoryDef>;
}
