/* رادار السوق — منطق الواجهة (بدون أطر عمل) */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const state = {
    assets: new Map(),
    series: new Map(),
    news: [],
    alerts: [],
    sources: new Map(),
    selectedId: 'BTCUSDT',
    rangeSec: 3600,
    watchCls: 'all',
    newsCls: 'all',
    alertSev: 'all',
    newsQuery: '',
    newsPaused: false,
    pendingNews: [],
    newNewsIds: new Set(),
    breaking: { index: 0, currentId: '', paused: false, speed: 1, remaining: 0, total: 0, lastTick: 0 },
    techRenderAt: 0,
    newsRenderAt: 0,
    settings: { sensitivity: 'balanced', newsAlerts: true, priceAlerts: {} },
    settingsDraft: null,
    classes: {},
    newsClasses: {},
    x: null,
    mastodon: null,
    translation: null,
    images: null,
    telegram: null,
    xLinks: [],
    sound: localStorage.getItem('mr.sound') === '1',
    notify: localStorage.getItem('mr.notify') === '1',
    chart: null,
    chartRenderAt: 0,
    seriesToken: 0,
    connected: false,
    lastTickAt: 0,
    lastNewsAt: 0,
    initialized: false,
  };

  const els = {
    clock: $('#clock'), date: $('#date'), conn: $('#conn'), connText: $('#connText'),
    soundBtn: $('#soundBtn'), notifyBtn: $('#notifyBtn'), settingsBtn: $('#settingsBtn'),
    tickerTrack: $('#tickerTrack'),
    watchFilters: $('#watchFilters'), watchList: $('#watchList'), watchUpdated: $('#watchUpdated'),
    sourceList: $('#sourceList'), sourceSummary: $('#sourceSummary'),
    chartClass: $('#chartClass'), chartName: $('#chartName'), chartSymbol: $('#chartSymbol'),
    chartPrice: $('#chartPrice'), chartUnit: $('#chartUnit'), chartChange: $('#chartChange'),
    chartHigh: $('#chartHigh'), chartLow: $('#chartLow'), chartOpen: $('#chartOpen'),
    chartTs: $('#chartTs'), chartSource: $('#chartSource'), chartNote: $('#chartNote'),
    chartPoints: $('#chartPoints'), chartEmpty: $('#chartEmpty'), chartCanvas: $('#chart'),
    chartPanel: $('.chart-panel'), chartFullscreen: $('#chartFullscreen'),
    rangeTabs: $('#rangeTabs'),
    newsList: $('#newsList'), newsCount: $('#newsCount'), newsUpdated: $('#newsUpdated'),
    newsFilters: $('#newsFilters'), newsSearch: $('#newsSearch'), newsPause: $('#newsPause'),
    breakingSlide: $('#breakingSlide'), breakingCount: $('#breakingCount'),
    breakingPrev: $('#breakingPrev'), breakingNext: $('#breakingNext'),
    breakingPause: $('#breakingPause'), breakingSpeed: $('#breakingSpeed'),
    techGrid: $('#techGrid'), techCount: $('#techCount'),
    alertList: $('#alertList'), alertCount: $('#alertCount'), alertFilters: $('#alertFilters'),
    ackAll: $('#ackAll'), testAlert: $('#testAlert'), soundToggle: $('#soundToggle'),
    notifyToggle: $('#notifyToggle'),
    footerStatus: $('#footerStatus'),
    dialog: $('#settingsDialog'), settingsForm: $('#settingsForm'),
    sensitivityGroup: $('#sensitivityGroup'), newsAlertsToggle: $('#newsAlertsToggle'),
    alertAsset: $('#alertAsset'), alertAbove: $('#alertAbove'), alertBelow: $('#alertBelow'),
    addPriceAlert: $('#addPriceAlert'), priceAlertList: $('#priceAlertList'),
    integrationStatus: $('#integrationStatus'), settingsSources: $('#settingsSources'),
    toast: $('#toast'),
  };

  const fmtCache = new Map();
  function fmt(value, decimals = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const d = Math.min(8, Math.max(0, Number(decimals) || 0));
    if (!fmtCache.has(d)) {
      fmtCache.set(d, new Intl.NumberFormat('en-US', {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      }));
    }
    return fmtCache.get(d).format(n);
  }

  function fmtPct(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
  }

  function fmtClock(ts, withSeconds = false) {
    const d = new Date(Number(ts) || Date.now());
    return d.toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}),
      hour12: false,
    });
  }

  function fmtDateTime(ts) {
    return new Date(Number(ts) || Date.now()).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  }

  function timeAgo(ts) {
    const diff = Math.max(0, Date.now() - Number(ts || 0));
    const s = Math.floor(diff / 1000);
    if (s < 10) return 'الآن';
    if (s < 60) return `قبل ${s} ث`;
    const m = Math.floor(s / 60);
    if (m < 60) return `قبل ${m} د`;
    const h = Math.floor(m / 60);
    if (h < 24) return `قبل ${h} س`;
    return `قبل ${Math.floor(h / 24)} ي`;
  }

  function fmtDuration(ms) {
    const s = Math.round(Number(ms) / 1000);
    if (s < 60) return `${s} ث`;
    if (s < 3600) return `${Math.round(s / 60)} د`;
    return `${(s / 3600).toFixed(s % 3600 === 0 ? 0 : 1)} س`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    try {
      // روابط الصور والأخبار يجب أن تكون مطلقة؛ تمرير نص فارغ إلى URL
      // كان يُنتج عنوان الصفحة نفسه ويظهر كصورة مكسورة.
      const url = new URL(raw);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function classLabel(cls) {
    return state.classes?.[cls]?.short || state.newsClasses?.[cls] || cls || 'عام';
  }

  function direction(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return 'flat';
    return n > 0 ? 'up' : 'down';
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => els.toast.classList.remove('show'), 3200);
  }

  // ===== الساعة والاتصال =====
  function updateClock() {
    const now = new Date();
    els.clock.textContent = now.toLocaleTimeString('en-GB', { hour12: false });
    try {
      els.date.textContent = new Intl.DateTimeFormat('ar-EG-u-nu-latn-ca-gregory', {
        weekday: 'long', day: 'numeric', month: 'long',
      }).format(now);
    } catch {
      els.date.textContent = now.toLocaleDateString('en-GB');
    }
  }

  function setConnection(mode) {
    state.connected = mode === 'live';
    els.conn.classList.toggle('is-live', mode === 'live');
    els.conn.classList.toggle('is-down', mode === 'down');
    els.conn.classList.toggle('is-connecting', mode === 'connecting');
    els.connText.textContent = mode === 'live' ? 'مباشر' : mode === 'down' ? 'انقطاع — إعادة محاولة' : 'جارٍ الاتصال…';
    updateFooter();
  }

  // ===== الصوت والإشعارات =====
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function beep(severity = 'medium') {
    if (!state.sound) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const tones = severity === 'high' ? [880, 660, 880] : severity === 'medium' ? [660, 880] : [440];
    let at = ctx.currentTime;
    for (const freq of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(severity === 'high' ? 0.16 : 0.1, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.18);
      at += 0.19;
    }
  }

  function syncAudioButtons() {
    els.soundBtn.setAttribute('aria-pressed', String(state.sound));
    els.soundToggle.checked = state.sound;
    els.notifyBtn.setAttribute('aria-pressed', String(state.notify));
    els.notifyToggle.checked = state.notify;
  }

  function toggleSound() {
    state.sound = !state.sound;
    localStorage.setItem('mr.sound', state.sound ? '1' : '0');
    syncAudioButtons();
    if (state.sound) beep('medium');
    toast(state.sound ? 'تم تشغيل التنبيه الصوتي' : 'تم إيقاف التنبيه الصوتي');
  }

  async function toggleNotify() {
    if (!('Notification' in window)) {
      toast('المتصفح لا يدعم الإشعارات');
      return;
    }
    if (!state.notify) {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast('لم يتم منح إذن الإشعارات');
        return;
      }
      state.notify = true;
      toast('تم تشغيل إشعارات المتصفح');
    } else {
      state.notify = false;
      toast('تم إيقاف إشعارات المتصفح');
    }
    localStorage.setItem('mr.notify', state.notify ? '1' : '0');
    syncAudioButtons();
  }

  function maybeNotify(alert) {
    if (!state.notify || alert.severity === 'low' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted' || !document.hidden) return;
    try {
      new Notification(`رادار السوق · ${alert.title}`, {
        body: alert.body || '',
        tag: alert.id,
        icon: '/favicon.svg',
      });
    } catch {
      /* ignore */
    }
  }

  // ===== الرسم البياني =====
  function downsample(points, maxPoints) {
    if (!points || points.length <= maxPoints) return points || [];
    const out = [];
    const step = (points.length - 1) / (maxPoints - 1);
    for (let i = 0; i < maxPoints; i += 1) out.push(points[Math.round(i * step)]);
    return out;
  }

  function ensureChart() {
    if (state.chart || !window.Chart) return;
    const ctx = els.chartCanvas.getContext('2d');
    state.chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [{
          data: [],
          borderColor: '#38e1b0',
          backgroundColor: 'rgba(56, 225, 176, 0.12)',
          borderWidth: 2,
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHitRadius: 12,
          spanGaps: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        parsing: false,
        normalized: true,
        interaction: { mode: 'nearest', intersect: false, axis: 'x' },
        layout: { padding: { top: 8, right: 4, left: 4, bottom: 0 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(8, 13, 22, 0.95)',
            borderColor: 'rgba(148, 163, 184, 0.3)',
            borderWidth: 1,
            titleColor: '#8fa1b8',
            bodyColor: '#e8eef8',
            titleFont: { family: 'Cairo', size: 11 },
            bodyFont: { family: 'JetBrains Mono, monospace', size: 12 },
            padding: 9,
            displayColors: false,
            callbacks: {
              title(items) {
                if (!items.length) return '';
                return fmtDateTime(items[0].parsed.x);
              },
              label(item) {
                const asset = state.assets.get(state.selectedId);
                return `${fmt(item.parsed.y, asset?.decimals ?? 2)} ${asset?.unit || ''}`;
              },
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            grid: { color: 'rgba(148, 163, 184, 0.07)', drawTicks: false },
            border: { display: false },
            ticks: {
              color: '#5f7188',
              maxTicksLimit: 7,
              padding: 8,
              font: { family: 'JetBrains Mono, monospace', size: 9 },
              callback(value) {
                return fmtClock(value, state.rangeSec <= 900);
              },
            },
          },
          y: {
            position: 'right',
            grid: { color: 'rgba(148, 163, 184, 0.07)', drawTicks: false },
            border: { display: false },
            ticks: {
              color: '#5f7188',
              maxTicksLimit: 6,
              padding: 8,
              font: { family: 'JetBrains Mono, monospace', size: 9 },
              callback(value) { return axisNumber(value); },
            },
          },
        },
      },
    });
  }

  function axisNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    const a = Math.abs(n);
    if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (a >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
    if (a >= 100) return n.toFixed(0);
    if (a >= 1) return n.toFixed(2);
    return n.toFixed(4);
  }

  function renderChart(force = false) {
    ensureChart();
    if (!state.chart) return;
    const now = Date.now();
    if (!force && now - state.chartRenderAt < 850) return;
    state.chartRenderAt = now;

    const asset = state.assets.get(state.selectedId);
    const all = state.series.get(state.selectedId) || [];
    const cutoff = now - state.rangeSec * 1000;
    let points = all.filter((p) => p.t >= cutoff && Number.isFinite(p.p));
    points = downsample(points, 420);

    const chart = state.chart;
    const dataset = chart.data.datasets[0];
    dataset.data = points.map((p) => ({ x: p.t, y: p.p }));

    const first = points[0]?.p;
    const last = points[points.length - 1]?.p;
    const rising = Number.isFinite(first) && Number.isFinite(last) ? last >= first : (asset?.changePct ?? 0) >= 0;
    const color = rising ? '#2ee6a8' : '#ff5d73';
    dataset.borderColor = color;
    const height = chart.height || 360;
    const gradient = chart.ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, rising ? 'rgba(46, 230, 168, 0.24)' : 'rgba(255, 93, 115, 0.24)');
    gradient.addColorStop(1, 'rgba(7, 11, 18, 0)');
    dataset.backgroundColor = gradient;

    chart.options.scales.x.min = now - state.rangeSec * 1000;
    chart.options.scales.x.max = now + 1000;
    chart.update('none');

    els.chartEmpty.classList.toggle('hidden', points.length >= 2);
    els.chartPoints.textContent = `${points.length} نقطة · ${fmtDuration(state.rangeSec * 1000)}`;
  }

  function scheduleChart() {
    const now = Date.now();
    if (now - state.chartRenderAt < 850) return;
    requestAnimationFrame(() => renderChart());
  }

  function renderChartHeader() {
    const asset = state.assets.get(state.selectedId);
    if (!asset) return;
    els.chartName.textContent = asset.name;
    els.chartSymbol.textContent = asset.symbol;
    els.chartClass.textContent = classLabel(asset.cls);
    els.chartClass.className = `chip ${asset.cls}`;
    els.chartPrice.textContent = fmt(asset.price, asset.decimals);
    els.chartUnit.textContent = asset.unit;
    els.chartHigh.textContent = fmt(asset.dayHigh, asset.decimals);
    els.chartLow.textContent = fmt(asset.dayLow, asset.decimals);
    els.chartOpen.textContent = fmt(asset.dayOpen, asset.decimals);
    els.chartTs.textContent = asset.ts ? fmtClock(asset.ts, true) : '—';
    els.chartTs.title = asset.ts ? fmtDateTime(asset.ts) : '';
    const change = Number(asset.changePct);
    els.chartChange.textContent = Number.isFinite(change) ? fmtPct(change) : '—';
    els.chartChange.className = `change-badge ${direction(change)}`;
    els.chartSource.textContent = asset.source === 'binance' ? 'المصدر: Binance · REST' : 'المصدر: Yahoo Finance · chart';
    els.chartNote.textContent = asset.note || '';
  }

  async function loadSeries(id, rangeSec) {
    const token = ++state.seriesToken;
    try {
      const res = await fetch(`/api/series?id=${encodeURIComponent(id)}&range=${Math.max(600, Math.round(rangeSec * 1.5))}&points=1000`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (token !== state.seriesToken) return;
      state.series.set(id, Array.isArray(data.series) ? data.series : []);
      if (id === state.selectedId) renderChart(true);
    } catch {
      if (token === state.seriesToken) toast('تعذّر تحميل سلسلة السعر');
    }
  }

  function selectAsset(id) {
    if (!state.assets.has(id)) return;
    state.selectedId = id;
    $$('.watch-item').forEach((el) => el.classList.toggle('active', el.dataset.watchId === id));
    $$('.tech-card').forEach((el) => el.classList.toggle('active', el.dataset.techId === id));
    renderChartHeader();
    renderChart(true);
    loadSeries(id, state.rangeSec);
  }

  // ===== لوحة المتابعة =====
  function sparkPoints(series, width = 64, height = 24, pad = 2) {
    const points = (series || []).slice(-60).filter((p) => Number.isFinite(p.p));
    if (points.length < 2) return '';
    const min = Math.min(...points.map((p) => p.p));
    const max = Math.max(...points.map((p) => p.p));
    const span = max - min || 1;
    return points.map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - pad - ((p.p - min) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  function renderWatchList() {
    const items = [...state.assets.values()].filter((a) => state.watchCls === 'all' || a.cls === state.watchCls);
    els.watchList.innerHTML = items.map((asset) => {
      const series = state.series.get(asset.id) || [];
      const points = sparkPoints(series);
      const dir = direction(asset.changePct);
      const stroke = dir === 'down' ? '#ff5d73' : '#2ee6a8';
      return `
        <button type="button" class="watch-item ${asset.id === state.selectedId ? 'active' : ''}" data-watch-id="${escapeHtml(asset.id)}">
          <span class="wi-main">
            <span class="wi-name">${escapeHtml(asset.name)}</span>
            <span class="wi-symbol mono">${escapeHtml(asset.symbol)}</span>
          </span>
          <svg class="wi-spark" viewBox="0 0 64 24" preserveAspectRatio="none" aria-hidden="true">
            ${points ? `<polyline points="${points}" stroke="${stroke}"></polyline>` : ''}
          </svg>
          <span class="wi-price">
            <span class="price mono" data-price-id="${escapeHtml(asset.id)}">${fmt(asset.price, asset.decimals)}</span>
            <span class="chg ${dir}" data-chg-id="${escapeHtml(asset.id)}">${fmtPct(asset.changePct)}</span>
          </span>
        </button>`;
    }).join('');
    els.watchUpdated.textContent = state.lastTickAt ? timeAgo(state.lastTickAt) : '—';
  }

  function renderTicker() {
    const items = [...state.assets.values()].map((asset) => {
      const dir = direction(asset.changePct);
      return `
        <span class="ticker-item" data-ticker-id="${escapeHtml(asset.id)}">
          <span class="ticker-symbol mono">${escapeHtml(asset.symbol)}</span>
          <span class="ticker-price mono">${fmt(asset.price, asset.decimals)}</span>
          <span class="ticker-change ${dir}">${fmtPct(asset.changePct)}</span>
        </span>`;
    }).join('');
    els.tickerTrack.innerHTML = items + items;
  }

  function updateAssetDom(asset) {
    const priceEl = $(`[data-price-id="${CSS.escape(asset.id)}"]`);
    const chgEl = $(`[data-chg-id="${CSS.escape(asset.id)}"]`);
    if (priceEl) {
      priceEl.textContent = fmt(asset.price, asset.decimals);
      priceEl.classList.remove('flash-up', 'flash-down');
      if (asset.flash === 1) priceEl.classList.add('flash-up');
      else if (asset.flash === -1) priceEl.classList.add('flash-down');
    }
    if (chgEl) {
      const dir = direction(asset.changePct);
      chgEl.textContent = fmtPct(asset.changePct);
      chgEl.className = `chg ${dir}`;
    }
    $$(`[data-ticker-id="${CSS.escape(asset.id)}"]`).forEach((el) => {
      const p = $('.ticker-price', el);
      const c = $('.ticker-change', el);
      if (p) p.textContent = fmt(asset.price, asset.decimals);
      if (c) {
        c.textContent = fmtPct(asset.changePct);
        c.className = `ticker-change ${direction(asset.changePct)}`;
      }
    });
    if (asset.id === state.selectedId) {
      renderChartHeader();
      els.chartPrice.classList.remove('flash-up', 'flash-down');
      if (asset.flash === 1) els.chartPrice.classList.add('flash-up');
      else if (asset.flash === -1) els.chartPrice.classList.add('flash-down');
      scheduleChart();
    }
  }

  // ===== الأخبار =====
  function newsMatches(item) {
    if (state.newsCls === 'x' && item.via !== 'x') return false;
    if (state.newsCls === 'breaking' && !item.breaking) return false;
    if (state.newsCls !== 'all' && state.newsCls !== 'x' && state.newsCls !== 'breaking' && item.cls !== state.newsCls) return false;
    if (state.newsQuery) {
      const haystack = `${item.title} ${item.titleAr || ''} ${item.summary} ${item.summaryAr || ''} ${item.source}`.toLowerCase();
      if (!haystack.includes(state.newsQuery)) return false;
    }
    return true;
  }

  const CLS_ICONS = { crypto: '₿', gold: '◈', energy: '◍', tech: '⌘', macro: '◔', general: '•' };
  const DIR_ICONS = { up: '▲', down: '▼', mixed: '◆', neutral: '•' };

  function thumbHtml(item, className = 'news-thumb') {
    const url = safeUrl(item.image);
    if (url) {
      return `<img class="${className}" src="${escapeHtml(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-thumb-for="${escapeHtml(item.id)}">`;
    }
    const cls = item.cls || 'general';
    return `<span class="${className} placeholder cls-${escapeHtml(cls)}" aria-hidden="true">${CLS_ICONS[cls] || '•'}</span>`;
  }

  function impactHtml(item, { compact = false } = {}) {
    const imp = item.impact;
    if (!imp) return '';
    const dir = ['up', 'down', 'mixed', 'neutral'].includes(imp.direction) ? imp.direction : 'neutral';
    const dirCls = dir === 'mixed' ? 'flat' : dir === 'neutral' ? 'flat' : dir;
    const conf = Math.round((Number(imp.confidence) || 0) * 100);
    const assets = (imp.assets || []).slice(0, compact ? 4 : 6).map((asset) => {
      const aDir = asset.dir === 'mixed' || asset.dir === 'neutral' ? 'flat' : asset.dir;
      return `<span class="impact-chip ${aDir}" title="${escapeHtml(asset.name || '')}">${escapeHtml(asset.label || '')} ${DIR_ICONS[asset.dir] || ''}</span>`;
    }).join('');
    return `
      <div class="impact-box">
        <div class="impact-head">
          <strong>${escapeHtml(imp.label || 'تقدير التأثير (آلي)')}</strong>
          <span class="impact-dir ${dirCls}">${DIR_ICONS[dir] || '•'} ${escapeHtml(imp.directionLabel || '')}</span>
          <span class="impact-conf">ثقة ${conf}%</span>
        </div>
        ${assets ? `<div class="impact-assets">${assets}</div>` : ''}
        <p class="impact-note">${escapeHtml(imp.rationale || '')}</p>
        <p class="impact-disclaimer">${escapeHtml(imp.disclaimer || '')}</p>
      </div>`;
  }

  function attachThumbFallback(root) {
    $$('img[data-thumb-for]', root).forEach((img) => {
      img.addEventListener('error', () => {
        const id = img.dataset.thumbFor;
        const item = state.news.find((n) => n.id === id);
        const cls = item?.cls || 'general';
        const span = document.createElement('span');
        span.className = `news-thumb placeholder cls-${cls}`;
        span.setAttribute('aria-hidden', 'true');
        span.textContent = CLS_ICONS[cls] || '•';
        img.replaceWith(span);
      }, { once: true });
    });
  }

  function newsTitle(item) {
    return item.titleAr || (item.lang === 'ar' ? item.title : '') || item.title || '';
  }

  function renderNews() {
    const filtered = state.news.filter(newsMatches).slice(0, 140);
    els.newsCount.textContent = String(filtered.length);
    const list = els.newsList;
    const prevTop = list.scrollTop;
    const prevHeight = list.scrollHeight;

    if (!filtered.length) {
      list.innerHTML = '<div class="empty-state">لا توجد أخبار مطابقة الآن. سيتم تحديث التدفق تلقائيًا.</div>';
    } else {
      list.innerHTML = filtered.map((item) => {
        const url = safeUrl(item.url);
        const chipCls = item.cls || 'general';
        const isNew = state.newNewsIds.has(item.id) ? ' is-new' : '';
        const titleAr = newsTitle(item);
        const showOriginal = item.title && item.title !== titleAr;
        const failedTr = item.lang !== 'ar' && !item.titleAr && item.translation?.status === 'failed';
        const pendingTr = item.lang !== 'ar' && !item.titleAr && !failedTr;
        const summaryAr = item.summaryAr || (item.lang === 'ar' ? item.summary : '');
        const summaryEn = item.lang !== 'ar' ? item.summary : '';
        const translated = item.translation?.status === 'done' || item.translation?.status === 'partial';
        const openTag = url
          ? `<a class="news-title-ar${pendingTr ? ' is-original' : ''}"${pendingTr ? ' dir="ltr"' : ''} href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(titleAr)}</a>`
          : `<span class="news-title-ar${pendingTr ? ' is-original' : ''}"${pendingTr ? ' dir="ltr"' : ''}>${escapeHtml(titleAr)}</span>`;
        return `
          <article class="news-item cls-${escapeHtml(chipCls)} ${item.via === 'x' ? 'via-x' : ''}${item.breaking ? ' is-breaking' : ''}${isNew}" data-news-id="${escapeHtml(item.id)}">
            ${thumbHtml(item)}
            <div class="news-body">
              <div class="news-meta">
                <span class="chip ${escapeHtml(chipCls)}">${escapeHtml(classLabel(chipCls))}</span>
                ${item.breaking ? '<span class="news-tag-break">عاجل</span>' : ''}
                ${translated ? '<span class="news-tag-tr">ترجمة آلية</span>' : ''}
                ${pendingTr ? '<span class="news-tag-pending">قيد الترجمة</span>' : ''}
                ${failedTr ? '<span class="news-tag-failed">تعذّرت الترجمة</span>' : ''}
                <span class="src">${escapeHtml(item.source)}</span>
                <span class="time" title="${escapeHtml(fmtDateTime(item.ts))}">${timeAgo(item.ts)}</span>
              </div>
              ${openTag}
              ${showOriginal ? `<span class="news-title-en" dir="ltr">${escapeHtml(item.title)}</span>` : ''}
              ${summaryAr ? `<p class="news-summary-ar">${escapeHtml(summaryAr)}</p>` : (summaryEn ? `<p class="news-summary-ar">${escapeHtml(summaryEn)}</p>` : '')}
              ${impactHtml(item, { compact: true })}
            </div>
          </article>`;
      }).join('');
      attachThumbFallback(list);
    }

    const delta = list.scrollHeight - prevHeight;
    if (prevTop > 5) list.scrollTop = prevTop + Math.max(0, delta);
    if (state.lastNewsAt) els.newsUpdated.textContent = timeAgo(state.lastNewsAt);
    state.newNewsIds.clear();
  }

  function onNews(items) {
    if (!Array.isArray(items) || !items.length) return;
    const known = new Set(state.news.map((n) => n.id));
    const fresh = items.filter((n) => n && !known.has(n.id));
    if (!fresh.length) return;
    state.lastNewsAt = Date.now();
    if (state.newsPaused) {
      state.pendingNews.push(...fresh);
      updatePauseButton();
      return;
    }
    for (const item of fresh) state.newNewsIds.add(item.id);
    state.news = [...fresh, ...state.news].sort((a, b) => b.ts - a.ts).slice(0, 800);
    renderNews();
    renderBreaking();
    scheduleTechRender();
  }

  // تحديث جزئي لخبر (ترجمة/صورة/تقدير) قادم عبر SSE.
  function onNewsUpdate(item) {
    if (!item?.id) return;
    const index = state.news.findIndex((n) => n.id === item.id);
    if (index === -1) return;
    state.news[index] = { ...state.news[index], ...item };
    if (item.id === state.breaking.currentId) renderBreaking();
    if (state.newsPaused) return;
    scheduleNewsRender();
  }

  function scheduleNewsRender() {
    const now = Date.now();
    if (now - state.newsRenderAt < 700) return;
    state.newsRenderAt = now;
    clearTimeout(scheduleNewsRender._t);
    scheduleNewsRender._t = setTimeout(() => {
      state.newsRenderAt = Date.now();
      renderNews();
    }, 120);
  }

  function scheduleTechRender() {
    const now = Date.now();
    if (now - state.techRenderAt < 900) return;
    state.techRenderAt = now;
    renderTech();
  }

  function updatePauseButton() {
    const n = state.pendingNews.length;
    els.newsPause.textContent = state.newsPaused ? `استئناف${n ? ` (${n})` : ''}` : 'إيقاف';
    els.newsPause.setAttribute('aria-pressed', String(state.newsPaused));
  }

  function toggleNewsPause() {
    state.newsPaused = !state.newsPaused;
    if (!state.newsPaused && state.pendingNews.length) {
      const pending = state.pendingNews;
      state.pendingNews = [];
      for (const item of pending) state.newNewsIds.add(item.id);
      state.news = [...pending, ...state.news].sort((a, b) => b.ts - a.ts).slice(0, 800);
      renderNews();
    }
    updatePauseButton();
  }

  // ===== الأخبار العاجلة (عرض دوّار) =====
  function breakingItems() {
    return state.news
      .filter((n) => n.breaking)
      .sort((a, b) => (Number(b.importance) || 0) - (Number(a.importance) || 0) || b.ts - a.ts)
      .slice(0, 12);
  }

  function breakingBaseDuration(item) {
    const text = `${newsTitle(item)} ${item.summaryAr || item.summary || ''}`;
    return Math.min(22000, Math.max(9000, 7500 + text.length * 42));
  }

  function updateBreakingBar() {
    const bar = $('#breakingBar');
    if (!bar) return;
    const { remaining, total } = state.breaking;
    const ratio = total > 0 ? 1 - Math.max(0, remaining) / total : 0;
    bar.style.width = `${Math.min(100, Math.max(0, ratio * 100)).toFixed(2)}%`;
  }

  function renderBreaking({ reset = false } = {}) {
    const list = breakingItems();
    const st = state.breaking;
    if (!list.length) {
      els.breakingCount.textContent = '0';
      els.breakingSlide.innerHTML = '<div class="breaking-empty">لا توجد أخبار عاجلة الآن. تُصنَّف الأخبار تلقائيًا كعاجلة عند وجود محفّز قوي (فائدة، أوبك، اختراق، حظر، حرب…).</div>';
      st.currentId = '';
      st.remaining = 0;
      return;
    }
    if (st.index >= list.length) st.index = 0;
    const item = list[st.index];
    els.breakingCount.textContent = `${st.index + 1} / ${list.length}`;

    if (reset || st.currentId !== item.id) {
      st.currentId = item.id;
      st.total = breakingBaseDuration(item) / st.speed;
      st.remaining = st.total;
      st.lastTick = 0;
    }

    const url = safeUrl(item.url);
    const titleAr = newsTitle(item);
    const showOriginal = item.title && item.title !== titleAr;
    const failedTr = item.lang !== 'ar' && !item.titleAr && item.translation?.status === 'failed';
    const pendingTr = item.lang !== 'ar' && !item.titleAr && !failedTr;
    const summaryAr = item.summaryAr || (item.lang === 'ar' ? item.summary : '');
    const summaryEn = item.lang !== 'ar' ? item.summary : '';
    const image = safeUrl(item.image);
    const media = image
      ? `<div class="breaking-media"><img data-break-img src="${escapeHtml(image)}" alt="" referrerpolicy="no-referrer">${item.imageSource === 'og' ? '<span class="media-tag">صورة من صفحة الخبر</span>' : ''}</div>`
      : '<div class="breaking-media no-image" aria-hidden="true"></div>';

    els.breakingSlide.innerHTML = `
      <article class="breaking-card" data-break-id="${escapeHtml(item.id)}">
        <div class="breaking-content">
          <div class="breaking-badges">
            <span class="chip ${escapeHtml(item.cls || 'general')}">${escapeHtml(classLabel(item.cls))}</span>
            <span class="news-tag-break">عاجل</span>
            ${pendingTr ? '<span class="news-tag-pending">قيد الترجمة</span>' : ''}
            ${failedTr ? '<span class="news-tag-failed">تعذّرت الترجمة</span>' : ''}
            <span class="time" title="${escapeHtml(fmtDateTime(item.ts))}">${timeAgo(item.ts)}</span>
          </div>
          ${url
            ? `<a class="breaking-title${pendingTr ? ' is-original' : ''}"${pendingTr ? ' dir="ltr"' : ''} href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(titleAr)}</a>`
            : `<span class="breaking-title${pendingTr ? ' is-original' : ''}"${pendingTr ? ' dir="ltr"' : ''}>${escapeHtml(titleAr)}</span>`}
          ${showOriginal ? `<span class="breaking-title-en" dir="ltr">${escapeHtml(item.title)}</span>` : ''}
          ${summaryAr ? `<p class="breaking-summary">${escapeHtml(summaryAr)}</p>` : (summaryEn ? `<p class="breaking-summary">${escapeHtml(summaryEn)}</p>` : '')}
          ${summaryAr && summaryEn ? `<p class="breaking-summary-en" dir="ltr">${escapeHtml(summaryEn)}</p>` : ''}
          ${impactHtml(item)}
          <div class="breaking-foot">
            <span>${escapeHtml(item.source)}</span>
            <span class="muted">·</span>
            <span>${escapeHtml(item.impact?.horizon || '')}</span>
            ${url ? `<a class="breaking-source" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">فتح المصدر ↗</a>` : ''}
          </div>
        </div>
        ${media}
        <div class="breaking-progress"><span id="breakingBar"></span></div>
      </article>`;

    const img = $('img[data-break-img]', els.breakingSlide);
    if (img) {
      img.addEventListener('error', () => {
        const parent = img.closest('.breaking-media');
        img.remove();
        parent?.classList.add('no-image');
        parent?.querySelector('.media-tag')?.remove();
      }, { once: true });
    }
    updateBreakingBar();
  }

  function tickBreaking() {
    const st = state.breaking;
    if (st.paused || !st.currentId || !st.total) return;
    const now = Date.now();
    if (!st.lastTick) {
      st.lastTick = now;
      return;
    }
    const dt = Math.min(2500, Math.max(0, now - st.lastTick));
    st.lastTick = now;
    st.remaining = Math.max(0, st.remaining - dt);
    updateBreakingBar();
    if (st.remaining <= 0) {
      const list = breakingItems();
      if (!list.length) return;
      st.index = (st.index + 1) % list.length;
      renderBreaking({ reset: true });
    }
  }

  function breakingGo(delta) {
    const list = breakingItems();
    if (!list.length) return;
    state.breaking.index = (state.breaking.index + delta + list.length) % list.length;
    renderBreaking({ reset: true });
  }

  function toggleBreakingPause() {
    const st = state.breaking;
    st.paused = !st.paused;
    st.lastTick = 0;
    els.breakingPause.setAttribute('aria-pressed', String(st.paused));
    els.breakingPause.title = st.paused ? 'تشغيل التبديل التلقائي' : 'إيقاف التبديل التلقائي';
    els.breakingPause.innerHTML = st.paused
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    updateBreakingBar();
  }

  function setBreakingSpeed(speed) {
    const st = state.breaking;
    const next = Number(speed) || 1;
    if (next === st.speed) return;
    const prev = st.speed;
    st.speed = next;
    if (st.total > 0) st.total = (st.total * prev) / next;
    st.remaining = (st.remaining * prev) / next;
    st.lastTick = 0;
    updateBreakingBar();
  }

  // ===== أسهم التقنية =====
  function techAssets() {
    return [...state.assets.values()].filter((a) => a.cls === 'tech');
  }

  function renderTech() {
    const list = techAssets();
    els.techCount.textContent = String(list.length);
    if (!list.length) {
      els.techGrid.innerHTML = '<div class="empty-state">لا توجد بيانات تقنية بعد.</div>';
      return;
    }
    els.techGrid.innerHTML = list.map((asset) => {
      const dir = direction(asset.changePct);
      const stroke = dir === 'down' ? '#ff5d73' : '#2ee6a8';
      const points = sparkPoints(state.series.get(asset.id) || [], 120, 22, 2);
      return `
        <button type="button" class="tech-card ${asset.id === state.selectedId ? 'active' : ''}" data-tech-id="${escapeHtml(asset.id)}">
          <span class="tech-top">
            <span class="tech-sym mono">${escapeHtml(asset.symbol)}</span>
            <span class="tech-name">${escapeHtml(asset.name)}</span>
          </span>
          <span class="tech-price">${fmt(asset.price, asset.decimals)}</span>
          <span class="tech-chg ${dir}">${fmtPct(asset.changePct)}</span>
          <svg class="tech-spark" viewBox="0 0 120 22" preserveAspectRatio="none" aria-hidden="true">
            ${points ? `<polyline points="${points}" stroke="${stroke}"></polyline>` : ''}
          </svg>
        </button>`;
    }).join('');
  }

  // ===== التنبيهات =====
  const KIND_LABELS = {
    price_move: 'حركة سعر',
    threshold: 'حد سعر',
    volatility: 'تقلّب',
    news: 'خبر مؤثر',
    test: 'اختبار',
    system: 'نظام',
  };

  function renderAlerts() {
    const unack = state.alerts.filter((a) => !a.acknowledged).length;
    els.alertCount.textContent = String(unack);
    const filtered = state.alerts
      .filter((a) => state.alertSev === 'all' || a.severity === state.alertSev)
      .slice(0, 100);

    if (!filtered.length) {
      els.alertList.innerHTML = '<div class="empty-state">لا توجد تنبيهات بعد. سيظهر هنا أي تحرك سعري أو خبر مؤثر.</div>';
      return;
    }

    els.alertList.innerHTML = filtered.map((alert) => {
      const url = safeUrl(alert.url);
      return `
        <article class="alert-item sev-${escapeHtml(alert.severity)} ${alert.acknowledged ? 'ack' : 'unack'}" data-alert-id="${escapeHtml(alert.id)}">
          <div class="alert-top">
            <span class="sev-dot"></span>
            <span class="alert-kind">${escapeHtml(KIND_LABELS[alert.kind] || alert.kind)}</span>
            <span class="alert-time" title="${escapeHtml(fmtDateTime(alert.ts))}">${timeAgo(alert.ts)}</span>
            <button type="button" class="alert-ack" data-ack="${escapeHtml(alert.id)}" title="تعليم كمقروء" aria-label="تعليم كمقروء">✓</button>
          </div>
          <h3 class="alert-title">${escapeHtml(alert.title)}</h3>
          ${alert.body ? `<p class="alert-body">${escapeHtml(alert.body)}</p>` : ''}
          ${url ? `<a class="alert-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">فتح المصدر ↗</a>` : ''}
        </article>`;
    }).join('');
  }

  function onAlert(alert) {
    if (!alert || state.alerts.some((a) => a.id === alert.id)) return;
    state.alerts.unshift(alert);
    if (state.alerts.length > 300) state.alerts.length = 300;
    renderAlerts();
    if (alert.severity === 'high' || alert.severity === 'medium') beep(alert.severity);
    maybeNotify(alert);
    if (alert.severity === 'high') toast(`تنبيه: ${alert.title}`);
  }

  async function ackAlert(id) {
    const alert = state.alerts.find((a) => a.id === id);
    if (!alert || alert.acknowledged) return;
    alert.acknowledged = true;
    renderAlerts();
    try {
      await fetch('/api/alerts/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch {
      /* ignore */
    }
  }

  async function ackAll() {
    for (const alert of state.alerts) alert.acknowledged = true;
    renderAlerts();
    try {
      await fetch('/api/alerts/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      toast('تم تعليم كل التنبيهات كمقروءة');
    } catch {
      toast('تعذّر تحديث التنبيهات');
    }
  }

  async function testAlert() {
    try {
      const res = await fetch('/api/alerts/test', { method: 'POST' });
      if (!res.ok) throw new Error();
      toast('تم إنشاء تنبيه تجريبي');
    } catch {
      toast('تعذّر إنشاء التنبيه التجريبي');
    }
  }

  // ===== المصادر والحالة =====
  function renderSources() {
    const sources = [...state.sources.values()];
    const ok = sources.filter((s) => s.status === 'ok').length;
    const errors = sources.filter((s) => s.status === 'error').length;
    els.sourceSummary.textContent = `${ok}/${sources.length} يعمل${errors ? ` · ${errors} خطأ` : ''}`;
    const sorted = [...sources].sort((a, b) => {
      const rank = (s) => (s.status === 'error' ? 0 : s.status === 'ok' ? 1 : 2);
      return rank(a) - rank(b);
    });
    els.sourceList.innerHTML = sorted.map((s) => {
      const last = s.lastOkAt ? timeAgo(s.lastOkAt) : s.status === 'disabled' ? 'معطّل' : '—';
      return `
        <div class="source-item ${escapeHtml(s.status)}" title="${escapeHtml(s.error || s.name)}">
          <span class="sdot"></span>
          <span class="sname">${escapeHtml(s.name)}</span>
          <span class="stime">${escapeHtml(last)}</span>
        </div>`;
    }).join('');
    updateFooter();
    if (els.dialog.open) renderSettingsSources();
  }

  function updateFooter() {
    const sources = [...state.sources.values()];
    const ok = sources.filter((s) => s.status === 'ok').length;
    const errors = sources.filter((s) => s.status === 'error').length;
    const last = state.lastTickAt ? timeAgo(state.lastTickAt) : '—';
    els.footerStatus.textContent = `${ok}/${sources.length} مصدر · ${errors} خطأ · آخر سعر ${last} · ${state.connected ? 'SSE متصل' : 'SSE منقطع'}`;
    els.watchUpdated.textContent = state.lastTickAt ? timeAgo(state.lastTickAt) : '—';
  }

  // ===== الإعدادات =====
  function renderSettings() {
    const settings = state.settingsDraft || state.settings;
    $$('input[name="sensitivity"]', els.sensitivityGroup).forEach((input) => {
      input.checked = input.value === settings.sensitivity;
    });
    els.newsAlertsToggle.checked = settings.newsAlerts !== false;
    renderPriceAlertList();
    renderIntegrations();
    renderSettingsSources();
  }

  function renderPriceAlertList() {
    const settings = state.settingsDraft || state.settings;
    const entries = Object.entries(settings.priceAlerts || {});
    if (!entries.length) {
      els.priceAlertList.innerHTML = '<div class="muted small">لا توجد حدود مخصصة بعد.</div>';
      return;
    }
    els.priceAlertList.innerHTML = entries.map(([id, rule]) => {
      const asset = state.assets.get(id);
      const parts = [];
      if (Number.isFinite(rule.above)) parts.push(`▲ ${fmt(rule.above, asset?.decimals ?? 2)}`);
      if (Number.isFinite(rule.below)) parts.push(`▼ ${fmt(rule.below, asset?.decimals ?? 2)}`);
      return `
        <div class="price-alert-item">
          <span class="pa-name">${escapeHtml(asset?.name || id)}</span>
          <span class="pa-val">${escapeHtml(parts.join(' · '))}</span>
          <button type="button" data-del-alert="${escapeHtml(id)}" title="حذف" aria-label="حذف الحد">✕</button>
        </div>`;
    }).join('');
  }

  function renderIntegrations() {
    const x = state.x || { enabled: false, reason: 'غير معروف' };
    const tg = state.telegram || { enabled: false, reason: 'غير معروف' };
    const masto = state.mastodon || { enabled: false };
    const tr = state.translation || { enabled: false };
    const img = state.images || { enabled: false };
    const links = (state.xLinks || []).map((link) => {
      const url = safeUrl(link.url);
      return url ? `<a class="x-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>` : '';
    }).join('');
    els.integrationStatus.innerHTML = `
      <div class="integration-item ${x.enabled ? 'on' : 'off'}">
        <span class="status-dot"></span>
        <div><strong>X / Twitter</strong><span>${escapeHtml(x.reason || '')}</span></div>
      </div>
      <div class="integration-item ${masto.enabled ? 'on' : 'off'}">
        <span class="status-dot"></span>
        <div><strong>Mastodon</strong><span>${escapeHtml(masto.enabled ? `خطوط وسوم عامة · ${masto.tags || 0} وسوم` : 'غير مفعّل')}</span></div>
      </div>
      <div class="integration-item ${tr.enabled ? 'on' : 'off'}">
        <span class="status-dot"></span>
        <div><strong>الترجمة الآلية</strong><span>${escapeHtml(tr.enabled ? `Google Translate غير رسمي · ${tr.cached || 0} نصًا مخزّنًا · نصوص الأخبار تُرسل لخدمة خارجية` : 'معطّلة')}</span></div>
      </div>
      <div class="integration-item ${img.enabled ? 'on' : 'off'}">
        <span class="status-dot"></span>
        <div><strong>صور الأخبار</strong><span>${escapeHtml(img.enabled ? `من الخلاصة + og:image · حد ${img.maxPerMinute || 0} طلب/دقيقة` : 'معطّلة')}</span></div>
      </div>
      <div class="integration-item ${tg.enabled ? 'on' : 'off'}">
        <span class="status-dot"></span>
        <div><strong>Telegram</strong><span>${escapeHtml(tg.reason || '')}</span></div>
      </div>
      <div class="integration-item on">
        <span class="status-dot"></span>
        <div><strong>مركز التنبيهات</strong><span>داخل المتصفح + صوت اختياري + إشعارات النظام</span></div>
      </div>
      ${links ? `<div class="x-links"><span class="muted small">بحث يدوي على X:</span>${links}</div>` : ''}`;
  }

  function renderSettingsSources() {
    const sources = [...state.sources.values()];
    els.settingsSources.innerHTML = sources.map((s) => {
      const interval = s.meta?.intervalMs ? fmtDuration(s.meta.intervalMs) : '—';
      return `<div class="settings-source"><span>${escapeHtml(s.name)}</span><span class="mono">${escapeHtml(interval)}</span></div>`;
    }).join('');
  }

  function openSettings() {
    state.settingsDraft = JSON.parse(JSON.stringify(state.settings));
    const options = [...state.assets.values()].map((a) =>
      `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)} · ${escapeHtml(a.symbol)}</option>`).join('');
    els.alertAsset.innerHTML = options;
    renderSettings();
    els.dialog.showModal();
  }

  function addPriceAlert() {
    if (!state.settingsDraft) return;
    const id = els.alertAsset.value;
    const above = Number(els.alertAbove.value);
    const below = Number(els.alertBelow.value);
    if (!id || (!Number.isFinite(above) && !Number.isFinite(below)) || (above <= 0 && below <= 0)) {
      toast('أدخل حدًا أعلى أو أدنى صالحًا');
      return;
    }
    const rule = {};
    if (Number.isFinite(above) && above > 0) rule.above = above;
    if (Number.isFinite(below) && below > 0) rule.below = below;
    state.settingsDraft.priceAlerts[id] = rule;
    els.alertAbove.value = '';
    els.alertBelow.value = '';
    renderPriceAlertList();
  }

  async function saveSettings() {
    if (!state.settingsDraft) return;
    const sensitivity = $('input[name="sensitivity"]:checked', els.sensitivityGroup)?.value || 'balanced';
    const payload = {
      sensitivity,
      newsAlerts: els.newsAlertsToggle.checked,
      priceAlerts: state.settingsDraft.priceAlerts || {},
    };
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.settings = await res.json();
      state.settingsDraft = null;
      els.dialog.close();
      toast('تم حفظ الإعدادات');
    } catch {
      toast('تعذّر حفظ الإعدادات');
    }
  }

  // ===== استقبال البيانات =====
  function applySnapshot(data) {
    if (!data || typeof data !== 'object') return;
    if (data.classes) state.classes = data.classes;
    if (data.newsClasses) state.newsClasses = data.newsClasses;
    if (data.settings) state.settings = data.settings;
    if (data.x) state.x = data.x;
    if (data.mastodon) state.mastodon = data.mastodon;
    if (data.translation) state.translation = data.translation;
    if (data.images) state.images = data.images;
    if (data.telegram) state.telegram = data.telegram;
    if (Array.isArray(data.xLinks)) state.xLinks = data.xLinks;

    for (const asset of data.assets || []) {
      state.assets.set(asset.id, asset);
      const incoming = Array.isArray(asset.series) ? asset.series : [];
      const existing = state.series.get(asset.id) || [];
      if (!existing.length || incoming.length > existing.length) state.series.set(asset.id, incoming);
      if (asset.ts) state.lastTickAt = Math.max(state.lastTickAt, asset.ts);
    }

    if (Array.isArray(data.news)) {
      state.news = data.news;
      if (data.news.length) state.lastNewsAt = Math.max(...data.news.map((n) => n.ts || 0));
    }
    if (Array.isArray(data.alerts)) state.alerts = data.alerts;

    if (Array.isArray(data.sources)) {
      state.sources.clear();
      for (const source of data.sources) state.sources.set(source.id, source);
    }

    if (!state.assets.has(state.selectedId)) {
      state.selectedId = state.assets.keys().next().value || 'BTCUSDT';
    }

    renderTicker();
    renderWatchList();
    renderTech();
    renderChartHeader();
    renderNews();
    renderBreaking({ reset: true });
    renderAlerts();
    renderSources();
    if (state.initialized) renderSettings();
    state.initialized = true;
    updatePauseButton();
    updateFooter();
    ensureChart();
    renderChart(true);
    loadSeries(state.selectedId, state.rangeSec);
  }

  function onTick(tick) {
    const asset = state.assets.get(tick.id);
    if (!asset) return;
    asset.prevPrice = tick.prevPrice;
    asset.price = tick.price;
    asset.ts = tick.ts;
    asset.changePct = tick.changePct;
    asset.dayOpen = tick.dayOpen;
    asset.dayHigh = tick.dayHigh;
    asset.dayLow = tick.dayLow;
    asset.prevClose = tick.prevClose;
    asset.volume = tick.volume;
    asset.flash = tick.flash;
    state.lastTickAt = Math.max(state.lastTickAt, Number(tick.ts) || Date.now());

    const series = state.series.get(tick.id) || [];
    const last = series[series.length - 1];
    if (!last || tick.ts > last.t) series.push({ t: tick.ts, p: tick.price });
    else if (tick.ts === last.t) last.p = tick.price;
    if (series.length > 6000) series.splice(0, series.length - 6000);
    state.series.set(tick.id, series);

    updateAssetDom(asset);
    if (asset.cls === 'tech') scheduleTechRender();
    updateFooter();
  }

  function onSource(source) {
    if (!source || !source.id) return;
    state.sources.set(source.id, source);
    renderSources();
  }

  function connectSse() {
    if (!window.EventSource) {
      setConnection('down');
      toast('المتصفح لا يدعم البث المباشر');
      return;
    }
    const es = new EventSource('/api/stream');
    es.addEventListener('open', () => setConnection('live'));
    es.addEventListener('snapshot', (event) => {
      try {
        applySnapshot(JSON.parse(event.data));
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('tick', (event) => {
      try {
        onTick(JSON.parse(event.data));
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('news', (event) => {
      try {
        onNews(JSON.parse(event.data));
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('news_update', (event) => {
      try {
        onNewsUpdate(JSON.parse(event.data));
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('alert', (event) => {
      try {
        onAlert(JSON.parse(event.data));
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('source', (event) => {
      try {
        onSource(JSON.parse(event.data));
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('settings', (event) => {
      try {
        state.settings = JSON.parse(event.data);
        if (!state.settingsDraft && els.dialog.open) renderSettings();
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('alerts_ack', (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.all) state.alerts.forEach((a) => { a.acknowledged = true; });
        else {
          const alert = state.alerts.find((a) => a.id === payload.id);
          if (alert) alert.acknowledged = true;
        }
        renderAlerts();
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('error', () => setConnection('down'));
    setConnection('connecting');
  }

  async function bootstrap() {
    updateClock();
    syncAudioButtons();
    ensureChart();
    try {
      const res = await fetch('/api/snapshot', { cache: 'no-store' });
      if (res.ok) applySnapshot(await res.json());
    } catch {
      /* SSE will retry */
    }
    connectSse();
    setInterval(updateClock, 1000);
    setInterval(tickBreaking, 100);
    setInterval(() => {
      updateFooter();
      if (els.newsUpdated) els.newsUpdated.textContent = state.lastNewsAt ? timeAgo(state.lastNewsAt) : '—';
      $$('.news-item .time').forEach((el) => {
        const id = el.closest('.news-item')?.dataset.newsId;
        const item = state.news.find((n) => n.id === id);
        if (item) el.textContent = timeAgo(item.ts);
      });
      const breakTime = $('.breaking-badges .time');
      if (breakTime) {
        const item = state.news.find((n) => n.id === state.breaking.currentId);
        if (item) breakTime.textContent = timeAgo(item.ts);
      }
      $$('.alert-time').forEach((el) => {
        const id = el.closest('.alert-item')?.dataset.alertId;
        const item = state.alerts.find((a) => a.id === id);
        if (item) el.textContent = timeAgo(item.ts);
      });
    }, 1000);
    setInterval(() => {
      renderWatchList();
      renderTicker();
    }, 30000);
  }

  // ===== الأحداث =====
  els.watchFilters.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-cls]');
    if (!btn) return;
    state.watchCls = btn.dataset.cls;
    $$('button', els.watchFilters).forEach((b) => b.classList.toggle('active', b === btn));
    renderWatchList();
  });

  els.watchList.addEventListener('click', (event) => {
    const item = event.target.closest('[data-watch-id]');
    if (item) selectAsset(item.dataset.watchId);
  });

  els.techGrid.addEventListener('click', (event) => {
    const item = event.target.closest('[data-tech-id]');
    if (item) selectAsset(item.dataset.techId);
  });

  els.breakingPrev.addEventListener('click', () => breakingGo(-1));
  els.breakingNext.addEventListener('click', () => breakingGo(1));
  els.breakingPause.addEventListener('click', toggleBreakingPause);
  els.breakingSpeed.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-speed]');
    if (!btn) return;
    $$('button', els.breakingSpeed).forEach((b) => b.classList.toggle('active', b === btn));
    setBreakingSpeed(btn.dataset.speed);
  });

  els.rangeTabs.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-range]');
    if (!btn) return;
    state.rangeSec = Number(btn.dataset.range) || 3600;
    $$('button', els.rangeTabs).forEach((b) => b.classList.toggle('active', b === btn));
    renderChart(true);
    loadSeries(state.selectedId, state.rangeSec);
  });

  els.chartFullscreen.addEventListener('click', () => {
    const active = els.chartPanel.classList.toggle('is-fullscreen');
    document.body.classList.toggle('has-fullscreen', active);
    setTimeout(() => state.chart?.resize(), 120);
  });

  els.newsFilters.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-cls]');
    if (!btn) return;
    state.newsCls = btn.dataset.cls;
    $$('button', els.newsFilters).forEach((b) => b.classList.toggle('active', b === btn));
    renderNews();
  });

  let searchTimer;
  els.newsSearch.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.newsQuery = els.newsSearch.value.trim().toLowerCase();
      renderNews();
    }, 180);
  });

  els.newsPause.addEventListener('click', toggleNewsPause);

  els.alertFilters.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-sev]');
    if (!btn) return;
    state.alertSev = btn.dataset.sev;
    $$('button', els.alertFilters).forEach((b) => b.classList.toggle('active', b === btn));
    renderAlerts();
  });

  els.alertList.addEventListener('click', (event) => {
    const ack = event.target.closest('[data-ack]');
    if (ack) {
      event.preventDefault();
      ackAlert(ack.dataset.ack);
    }
  });

  els.ackAll.addEventListener('click', ackAll);
  els.testAlert.addEventListener('click', testAlert);
  els.soundBtn.addEventListener('click', toggleSound);
  els.soundToggle.addEventListener('change', toggleSound);
  els.notifyBtn.addEventListener('click', toggleNotify);
  els.notifyToggle.addEventListener('change', toggleNotify);
  els.settingsBtn.addEventListener('click', openSettings);

  els.sensitivityGroup.addEventListener('change', () => {
    const checked = $('input[name="sensitivity"]:checked', els.sensitivityGroup);
    if (checked && state.settingsDraft) state.settingsDraft.sensitivity = checked.value;
  });
  els.newsAlertsToggle.addEventListener('change', () => {
    if (state.settingsDraft) state.settingsDraft.newsAlerts = els.newsAlertsToggle.checked;
  });
  els.addPriceAlert.addEventListener('click', addPriceAlert);
  els.priceAlertList.addEventListener('click', (event) => {
    const del = event.target.closest('[data-del-alert]');
    if (!del || !state.settingsDraft) return;
    delete state.settingsDraft.priceAlerts[del.dataset.delAlert];
    renderPriceAlertList();
  });

  els.settingsForm.addEventListener('submit', async (event) => {
    if (event.submitter?.value === 'cancel') return;
    event.preventDefault();
    await saveSettings();
  });

  els.dialog.addEventListener('click', (event) => {
    if (event.target === els.dialog) els.dialog.close();
  });

  window.addEventListener('resize', () => state.chart?.resize());

  bootstrap();
})();
