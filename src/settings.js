// إعدادات المستخدم: تُحفظ في data/settings.json بكتابة ذرّية.
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, SENSITIVITY, ASSET_BY_ID } from './config.js';

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

export function sanitizeSettings(input, base = DEFAULT_SETTINGS) {
  const out = {
    sensitivity: base.sensitivity,
    newsAlerts: base.newsAlerts,
    priceAlerts: { ...base.priceAlerts },
    updatedAt: base.updatedAt,
  };
  if (input && typeof input === 'object') {
    if (typeof input.sensitivity === 'string' && SENSITIVITY[input.sensitivity]) {
      out.sensitivity = input.sensitivity;
    }
    if (typeof input.newsAlerts === 'boolean') out.newsAlerts = input.newsAlerts;
    if (input.priceAlerts && typeof input.priceAlerts === 'object') {
      const clean = {};
      for (const [id, rule] of Object.entries(input.priceAlerts)) {
        if (!ASSET_BY_ID.has(id) || !rule || typeof rule !== 'object') continue;
        const above = clampNumber(rule.above, 0.0000001, 1e12);
        const below = clampNumber(rule.below, 0.0000001, 1e12);
        if (above === null && below === null) continue;
        clean[id] = {};
        if (above !== null) clean[id].above = above;
        if (below !== null) clean[id].below = below;
      }
      out.priceAlerts = clean;
    }
  }
  return out;
}

export class SettingsStore {
  constructor(file) {
    this.file = file;
    this.data = { ...DEFAULT_SETTINGS, priceAlerts: {} };
    this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.file)) return;
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = sanitizeSettings(parsed, this.data);
    } catch {
      this.data = { ...DEFAULT_SETTINGS, priceAlerts: {} };
    }
  }

  get() {
    return {
      ...this.data,
      priceAlerts: { ...this.data.priceAlerts },
    };
  }

  update(patch) {
    const next = sanitizeSettings(patch, this.data);
    next.updatedAt = Date.now();
    this.data = next;
    this.save();
    return this.get();
  }

  save() {
    const dir = path.dirname(this.file);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, this.file);
  }
}
