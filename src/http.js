// طبقة HTTP موحّدة: مهلة، إعادة محاولة محدودة، وبصمة UA واضحة.
// تعتمد على fetch المدمج في Node (>= 20) بدون أي حزم خارجية.

const DEFAULT_UA =
  'MarketRadar/1.0 (+local research dashboard; contact: local-user) Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

export class HttpError extends Error {
  constructor(message, { status = 0, url = '', body = '', headers = null } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
    this.body = body;
    this.headers = headers;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function httpGet(url, options = {}) {
  const {
    timeoutMs = 20000,
    headers = {},
    retries = 1,
    etag,
    lastModified,
    signal,
  } = options;

  const requestHeaders = {
    'User-Agent': DEFAULT_UA,
    Accept: 'application/rss+xml, application/atom+xml, application/xml, application/json, text/xml, */*',
    'Accept-Language': 'ar,en-US;q=0.8,en;q=0.7',
    ...headers,
  };
  if (etag) requestHeaders['If-None-Match'] = etag;
  if (lastModified) requestHeaders['If-Modified-Since'] = lastModified;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const timeout = AbortSignal.timeout(timeoutMs);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const res = await fetch(url, { headers: requestHeaders, signal: combined, redirect: 'follow' });
      if (res.status === 304) {
        return {
          status: 304,
          notModified: true,
          text: '',
          etag: res.headers.get('etag') || etag,
          lastModified: res.headers.get('last-modified') || lastModified,
          headers: res.headers,
          url: res.url || url,
        };
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          const retryAfter = Number(res.headers.get('retry-after'));
          const wait = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 8000)
            : 700 * (attempt + 1);
          await sleep(wait);
          lastError = new HttpError(`HTTP ${res.status}`, {
            status: res.status,
            url,
            body: body.slice(0, 300),
            headers: res.headers,
          });
          continue;
        }
        throw new HttpError(`HTTP ${res.status}`, {
          status: res.status,
          url,
          body: body.slice(0, 300),
          headers: res.headers,
        });
      }
      const text = await res.text();
      return {
        status: res.status,
        notModified: false,
        text,
        etag: res.headers.get('etag') || undefined,
        lastModified: res.headers.get('last-modified') || undefined,
        headers: res.headers,
        url: res.url || url,
      };
    } catch (err) {
      lastError = err;
      if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
        lastError = new HttpError('انتهت مهلة الطلب', { url });
      }
      if (attempt < retries && !(err instanceof HttpError && err.status >= 400 && err.status < 500)) {
        await sleep(600 * (attempt + 1));
        continue;
      }
      break;
    }
  }
  throw lastError instanceof Error ? lastError : new HttpError('فشل الطلب', { url });
}

export async function fetchJson(url, options = {}) {
  const res = await httpGet(url, options);
  if (res.notModified) return { notModified: true, data: null };
  try {
    return { notModified: false, data: JSON.parse(res.text) };
  } catch {
    throw new HttpError('استجابة JSON غير صالحة', { status: res.status, url, body: res.text.slice(0, 200) });
  }
}

export async function fetchText(url, options = {}) {
  return httpGet(url, options);
}
