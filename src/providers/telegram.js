// إشعارات Telegram الاختيارية للتنبيهات عالية الأهمية فقط.
export class TelegramNotifier {
  constructor(logger) {
    this.logger = logger;
    this.token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
    this.chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
    this.minSeverity = (process.env.TELEGRAM_MIN_SEVERITY || 'high').toLowerCase();
    this.enabled = Boolean(this.token && this.chatId);
    this.lastSentAt = 0;
    this.sent = 0;
    this.failed = 0;
  }

  status() {
    return {
      enabled: this.enabled,
      minSeverity: this.minSeverity,
      sent: this.sent,
      failed: this.failed,
      reason: this.enabled
        ? 'مفعّل'
        : 'غير مفعّل: يتطلب TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID في .env',
    };
  }

  #escape(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  async notify(alert) {
    if (!this.enabled || !alert) return false;
    if (alert.severity !== this.minSeverity && !(this.minSeverity === 'medium' && alert.severity === 'high')) {
      return false;
    }
    const now = Date.now();
    if (now - this.lastSentAt < 4000) return false;
    this.lastSentAt = now;

    const lines = [
      `<b>🚨 ${this.#escape(alert.title)}</b>`,
      this.#escape(alert.body || ''),
    ];
    if (alert.url) lines.push(this.#escape(alert.url));
    const text = lines.filter(Boolean).join('\n').slice(0, 4000);

    try {
      const res = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: false,
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Telegram HTTP ${res.status}: ${body.slice(0, 160)}`);
      }
      this.sent += 1;
      return true;
    } catch (err) {
      this.failed += 1;
      this.logger?.warn(`Telegram: ${err.message}`);
      return false;
    }
  }
}
