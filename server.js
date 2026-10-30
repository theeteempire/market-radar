// نقطة التشغيل: تحميل .env ثم بدء الخادم.
import { loadEnv } from './src/env.js';

loadEnv();

const { createApp } = await import('./src/app.js');
const { APP_NAME, APP_VERSION } = await import('./src/config.js');

const app = createApp();

try {
  const info = await app.listen();
  const x = app.providers.x.status();
  const tg = app.notifier.status();
  const lines = [
    '',
    `  ${APP_NAME} ${APP_VERSION}`,
    `  الواجهة: ${info.url}`,
    `  الحالة:  ${info.url}/api/health`,
    `  البث:    ${info.url}/api/stream (SSE)`,
    '',
    `  X / Twitter: ${x.enabled ? 'مفعّل' : 'غير مفعّل (اختياري)'}`,
    `  Telegram:    ${tg.enabled ? 'مفعّل' : 'غير مفعّل (اختياري)'}`,
    '',
    '  البيانات لأغراض معلوماتية فقط وليست نصيحة استثمارية.',
    '  للإيقاف: Ctrl+C',
    '',
  ];
  console.log(lines.join('\n'));
} catch (err) {
  if (err.code === 'EADDRINUSE') {
    console.error(`المنفذ مستخدم بالفعل. غيّر PORT في .env أو أوقف العملية الأخرى.\n${err.message}`);
  } else {
    console.error('فشل بدء الخادم:', err);
  }
  process.exit(1);
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\nإيقاف (${signal})...`);
  const timer = setTimeout(() => process.exit(1), 5000);
  timer.unref();
  try {
    await app.close();
  } catch (err) {
    console.error('خطأ أثناء الإيقاف:', err.message);
  }
  clearTimeout(timer);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection:', err);
});
