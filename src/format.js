// تنسيق الأرقام والأوقات — تُستخدم في الخادم وفي الاختبارات.
export function formatPrice(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const d = Math.min(8, Math.max(0, Number(decimals) || 0));
  return n.toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

export function formatPct(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

export function formatDuration(seconds) {
  const s = Math.round(Number(seconds) || 0);
  if (s < 60) return `${s} ثانية`;
  if (s < 3600) return `${Math.round(s / 60)} دقيقة`;
  if (s < 86400) return `${Math.round(s / 3600)} ساعة`;
  return `${Math.round(s / 86400)} يوم`;
}

export function timeAgo(ts, now = Date.now()) {
  const diff = Math.max(0, now - Number(ts || 0));
  const s = Math.floor(diff / 1000);
  if (s < 10) return 'الآن';
  if (s < 60) return `قبل ${s} ثانية`;
  const m = Math.floor(s / 60);
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  const d = Math.floor(h / 24);
  return `قبل ${d} يوم`;
}
