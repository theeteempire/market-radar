// سجل بسيط مع خاتم في الذاكرة لعرضه في /api/health.
const RING_SIZE = 200;

export class Logger {
  constructor(scope = 'app') {
    this.scope = scope;
    this.ring = [];
  }

  #push(level, message, extra) {
    const entry = {
      ts: Date.now(),
      level,
      scope: this.scope,
      message: String(message),
      ...(extra && typeof extra === 'object' ? { extra } : {}),
    };
    this.ring.push(entry);
    if (this.ring.length > RING_SIZE) this.ring.shift();
    const line = `${new Date(entry.ts).toISOString()} [${level}] ${this.scope}: ${entry.message}`;
    if (level === 'error') console.error(line, extra ?? '');
    else if (level === 'warn') console.warn(line, extra ?? '');
    else console.log(line, extra ?? '');
    return entry;
  }

  info(message, extra) { return this.#push('info', message, extra); }
  warn(message, extra) { return this.#push('warn', message, extra); }
  error(message, extra) { return this.#push('error', message, extra); }
  debug(message, extra) {
    if (process.env.DEBUG) this.#push('debug', message, extra);
  }

  recent(limit = 50) {
    return this.ring.slice(-limit);
  }
}

export const log = new Logger('market-radar');
