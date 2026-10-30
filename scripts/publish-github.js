#!/usr/bin/env node
// نشر «رادار السوق» إلى GitHub عبر REST API فقط — لا يحتاج git ولا gh.
//
// الاستخدام:
//   GITHUB_TOKEN=... node scripts/publish-github.js --repo market-radar
//   GITHUB_TOKEN=... node scripts/publish-github.js --repo market-radar --pages
//   GITHUB_TOKEN=... node scripts/publish-github.js --repo market-radar --pages --app-url https://xxx.onrender.com
//
// التوكن: fine-grained PAT بصلاحيات:
//   - Contents: Read and write
//   - Administration: Read and write (لإنشاء المستودع)
//   - Pages: Read and write (اختياري، لتفعيل GitHub Pages)
// أو classic PAT بنطاق repo (وworkflow إن أردت).
//
// ملاحظة: لا يُطبع التوكن أبدًا، ولا يُرسل إلى أي جهة غير api.github.com.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const API = 'https://api.github.com';
const ROOT = path.resolve(import.meta.dirname, '..');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback = '') => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const REPO = value('--repo', 'market-radar').replace(/[^A-Za-z0-9._-]/g, '-');
const BRANCH = value('--branch', 'main');
const DESCRIPTION = value(
  '--description',
  'منصة عربية (RTL) للأسعار اللحظية والأخبار العاجلة وتقدير التأثير الآلي — كريبتو وذهب وطاقة وأسهم تقنية',
);
const APP_URL = value('--app-url', process.env.APP_URL || '').replace(/\/+$/, '');
const PRIVATE = flag('--private');
const PAGES = flag('--pages');
const DRY_RUN = flag('--dry-run');
const OWNER_OVERRIDE = value('--owner', '');
const MESSAGE = value('--message', 'chore: publish market-radar v1.1.0');

const EXCLUDED_DIRS = new Set([
  '.git', 'node_modules', 'data', 'coverage', 'dist', '.vscode', '.idea',
  'tmp', 'temp', 'docs/preview-old',
]);
const EXCLUDED_FILES = new Set([
  '.env', '.env.local', '.env.production', '.env.development',
  '.github-token', 'github-token.txt', 'Thumbs.db', '.DS_Store', 'desktop.ini',
]);
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.avif',
  '.woff', '.woff2', '.ttf', '.otf', '.eot', '.zip', '.gz', '.7z',
  '.pdf', '.mp4', '.webm', '.mp3', '.wav',
]);
const MAX_BYTES = 25 * 1024 * 1024;

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function readToken() {
  const direct = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
  if (direct) return direct;
  const tokenFile = value('--token-file', process.env.GITHUB_TOKEN_FILE || '');
  if (!tokenFile) return '';
  try {
    return fs.readFileSync(path.resolve(tokenFile), 'utf8').split(/\r?\n/)[0].trim();
  } catch {
    return '';
  }
}

function isExcluded(relativePath) {
  const parts = relativePath.split('/');
  if (parts.some((part) => EXCLUDED_DIRS.has(part))) return true;
  const base = parts[parts.length - 1];
  if (EXCLUDED_FILES.has(base)) return true;
  if (/\.(log|zip|7z|tar\.gz)$/i.test(base)) return true;
  return false;
}

async function collectFiles(dir = ROOT, prefix = '') {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (isExcluded(relative)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolute, relative));
    } else if (entry.isFile()) {
      const stat = await fsp.stat(absolute);
      if (stat.size > MAX_BYTES) {
        console.warn(`تخطّي ملف كبير (>25MB): ${relative}`);
        continue;
      }
      files.push({ relative, absolute, size: stat.size });
    }
  }
  return files;
}

function isBinary(relative, buffer) {
  const ext = path.extname(relative).toLowerCase();
  if (BINARY_EXT.has(ext)) return true;
  const sample = buffer.subarray(0, 8000);
  return sample.includes(0);
}

function replacements(owner, repo) {
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const pagesUrl = `https://${owner}.github.io/${repo}/`;
  return {
    'https://github.com/theeteempire/market-radar': repoUrl,
    'https://theeteempire.github.io/market-radar/': pagesUrl,
    'https://github.com/theeteempire/market-radar#deploy': APP_URL || `${repoUrl}#deploy`,
    'theeteempire': owner,
    'market-radar': repo,
  };
}

function applyTokens(text, map) {
  let output = text;
  for (const [token, replacement] of Object.entries(map)) {
    output = output.split(token).join(replacement);
  }
  return output;
}

async function buildPayload(owner, repo) {
  const map = replacements(owner, repo);
  const files = await collectFiles();
  const payload = [];
  for (const file of files) {
    const buffer = await fsp.readFile(file.absolute);
    const binary = isBinary(file.relative, buffer);
    if (binary) {
      payload.push({ path: file.relative, size: file.size, encoding: 'base64', content: buffer.toString('base64') });
    } else {
      const text = applyTokens(buffer.toString('utf8'), map);
      payload.push({ path: file.relative, size: Buffer.byteLength(text), encoding: 'utf-8', content: text });
    }
  }
  payload.sort((a, b) => a.path.localeCompare(b.path));
  return { payload, map };
}

async function api(pathname, { method = 'GET', body = null, token = '' } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(`${API}${pathname}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'market-radar-publisher/1.1',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let data = null;
      if (text) {
        try { data = JSON.parse(text); } catch { data = text; }
      }
      if (res.ok) return data;
      const message = data?.message || String(text || '').slice(0, 200);
      const error = new Error(`${method} ${pathname} → HTTP ${res.status}: ${message}`);
      error.status = res.status;
      error.data = data;
      if (res.status === 429 || res.status >= 500) {
        lastError = error;
        const wait = Number(res.headers.get('retry-after') || 0) * 1000 || attempt * 1500;
        console.warn(`إعادة محاولة بعد ${Math.round(wait / 1000)}s (${error.message})`);
        await new Promise((resolve) => setTimeout(resolve, wait));
        continue;
      }
      throw error;
    } catch (err) {
      if (err.status) throw err;
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
    }
  }
  throw lastError;
}

async function uploadBlobs(owner, repo, payload, token) {
  const blobs = [];
  const queue = [...payload];
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const file = queue.shift();
      const blob = await api(`/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        token,
        body: { content: file.content, encoding: file.encoding === 'base64' ? 'base64' : 'utf-8' },
      });
      blobs.push({ path: file.path, sha: blob.sha });
      process.stdout.write('.');
    }
  });
  await Promise.all(workers);
  process.stdout.write('\n');
  return blobs;
}

async function main() {
  const token = readToken();

  if (DRY_RUN) {
    const owner = OWNER_OVERRIDE || 'OWNER';
    const { payload, map } = await buildPayload(owner, REPO);
    const bytes = payload.reduce((sum, file) => sum + file.size, 0);
    console.log(`\nوضع المعاينة (dry-run) — ${payload.length} ملفًا · ${(bytes / 1024).toFixed(0)}KB\n`);
    for (const file of payload) {
      console.log(`  ${String(Math.round(file.size / 1024)).padStart(6)}KB  ${file.path}`);
    }
    console.log('\nروابط ستُستبدل:');
    for (const [key, val] of Object.entries(map)) console.log(`  ${key} → ${val}`);
    return;
  }

  if (!token) {
    fail('لا يوجد توكن. ضع GITHUB_TOKEN في البيئة، أو استخدم --token-file، أو شغّل --dry-run للمعاينة.');
  }

  console.log('جارٍ التحقق من حساب GitHub…');
  const user = await api('/user', { token });
  const owner = OWNER_OVERRIDE || user.login;
  console.log(`الحساب: ${owner}`);

  let repoInfo = null;
  try {
    repoInfo = await api(`/repos/${owner}/${REPO}`, { token });
    console.log(`المستودع موجود: ${repoInfo.full_name}`);
  } catch (err) {
    if (err.status !== 404) throw err;
    console.log(`إنشاء المستودع ${owner}/${REPO}…`);
    repoInfo = await api('/user/repos', {
      method: 'POST',
      token,
      body: {
        name: REPO,
        description: DESCRIPTION,
        private: PRIVATE,
        has_issues: true,
        has_projects: false,
        has_wiki: false,
        auto_init: true,
      },
    });
    console.log(`أُنشئ: ${repoInfo.html_url}`);
  }

  const repoUrl = repoInfo.html_url || `https://github.com/${owner}/${REPO}`;
  const pagesUrl = `https://${owner}.github.io/${REPO}/`;

  console.log('تجهيز الملفات…');
  const { payload } = await buildPayload(owner, REPO);
  const bytes = payload.reduce((sum, file) => sum + file.size, 0);
  console.log(`${payload.length} ملفًا · ${(bytes / 1024).toFixed(0)}KB`);

  let parentSha = null;
  try {
    const ref = await api(`/repos/${owner}/${REPO}/git/ref/heads/${BRANCH}`, { token });
    parentSha = ref.object.sha;
    console.log(`الفرع ${BRANCH}: ${parentSha.slice(0, 7)}`);
  } catch (err) {
    // 404: الفرع غير موجود. 409/422: المستودع فارغ تمامًا (بلا أي التزام).
    if (![404, 409, 422].includes(err.status)) throw err;
    console.log(`الفرع ${BRANCH} غير موجود؛ سيُنشأ.`);
  }

  console.log('رفع الملفات (blobs)…');
  if (!parentSha) {
    // المستودع الفارغ يرفض POST /git/blobs بـ409 «Git Repository is empty».
    // ننشئ التزامًا أوّليًا صغيرًا عبر Contents API، ثم نبني فوقه.
    console.log('تهيئة المستودع الفارغ بالالتزام الأول…');
    const init = await api(`/repos/${owner}/${REPO}/contents/.gitkeep`, {
      method: 'PUT',
      token,
      body: { message: 'تهيئة المستودع', content: Buffer.from('\n').toString('base64') },
    });
    parentSha = init?.commit?.sha || null;
    if (!parentSha) throw new Error('تعذّر إنشاء الالتزام الأولي للمستودع الفارغ');
    console.log(`الفرع ${BRANCH}: ${parentSha.slice(0, 7)}`);
  }
  const blobs = await uploadBlobs(owner, REPO, payload, token);

  console.log('بناء الشجرة…');
  const tree = await api(`/repos/${owner}/${REPO}/git/trees`, {
    method: 'POST',
    token,
    body: {
      tree: blobs.map((blob) => ({ path: blob.path, mode: '100644', type: 'blob', sha: blob.sha })),
    },
  });

  console.log('إنشاء الالتزام…');
  const commit = await api(`/repos/${owner}/${REPO}/git/commits`, {
    method: 'POST',
    token,
    body: {
      message: MESSAGE,
      tree: tree.sha,
      parents: parentSha ? [parentSha] : [],
    },
  });

  console.log('تحديث الفرع…');
  if (parentSha) {
    await api(`/repos/${owner}/${REPO}/git/refs/heads/${BRANCH}`, {
      method: 'PATCH',
      token,
      body: { sha: commit.sha, force: true },
    });
  } else {
    await api(`/repos/${owner}/${REPO}/git/refs`, {
      method: 'POST',
      token,
      body: { ref: `refs/heads/${BRANCH}`, sha: commit.sha },
    });
  }

  try {
    await api(`/repos/${owner}/${REPO}`, {
      method: 'PATCH',
      token,
      body: { default_branch: BRANCH },
    });
  } catch (err) {
    console.warn(`تعذّر ضبط الفرع الافتراضي: ${err.message}`);
  }

  if (PAGES) {
    console.log('تفعيل GitHub Pages من /docs…');
    const source = { source: { branch: BRANCH, path: '/docs' } };
    try {
      await api(`/repos/${owner}/${REPO}/pages`, { method: 'POST', token, body: source });
      console.log('تم تفعيل Pages.');
    } catch (err) {
      if (err.status === 409) {
        await api(`/repos/${owner}/${REPO}/pages`, { method: 'PUT', token, body: source });
        console.log('تم تحديث إعداد Pages.');
      } else if (err.status === 403 || err.status === 404) {
        console.warn('تعذّر تفعيل Pages تلقائيًا (صلاحية ناقصة). فعّله يدويًا: Settings → Pages → main /docs.');
      } else {
        throw err;
      }
    }
  }

  console.log('\n✔ تم النشر');
  console.log(`  المستودع: ${repoUrl}`);
  console.log(`  الالتزام: ${commit.sha.slice(0, 7)}`);
  console.log(`  الملفات:  ${payload.length}`);
  if (PAGES) {
    console.log(`  الصفحة:   ${pagesUrl}  (قد يستغرق البناء دقيقة)`);
    if (!APP_URL) {
      console.log('\nملاحظة: لم يُضبط --app-url، لذا زر «افتح المنصة» يشير إلى قسم النشر.');
      console.log('بعد نشر الخادم أعد التشغيل مع: --pages --app-url https://your-app.onrender.com');
    }
  }
  if (!APP_URL) {
    console.log('\nلنشر التطبيق نفسه (وليس صفحة Pages): استخدم render.yaml على Render أو Docker.');
    console.log('دليل النشر: docs/DEPLOY.md');
  }
}

main().catch((err) => {
  fail(err?.message || String(err));
});
