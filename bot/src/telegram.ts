import type { Env } from './types';

export class TelegramAPI {
  private base: string;

  constructor(env: Env) {
    this.base = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
  }

  async sendMessage(
    chatId: number,
    text: string,
    options: { parseMode?: 'Markdown' | 'MarkdownV2' | null; disablePreview?: boolean } = {}
  ): Promise<Response> {
    return fetch(`${this.base}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options.parseMode === null ? undefined : options.parseMode || 'Markdown',
        disable_web_page_preview: options.disablePreview ?? true,
      }),
    });
  }
}
