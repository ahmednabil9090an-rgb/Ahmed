#!/usr/bin/env node
/*
 * يبني نسخة واحدة مستقلة من التطبيق في ملف HTML واحد.
 *
 * الغرض: رابط يُفتح مباشرة بلا خادم ولا تثبيت. ولأن الصفحة المنشورة لا
 * تستطيع مخاطبة مزوّد البيانات (قيود المتصفح)، تُحزَم لقطة من الشموع
 * داخل الملف — فالأسعار ثابتة عند لحظة البناء، وهذا موضّح في الصفحة.
 *
 * التشغيل: شغّل الخادم ثم:  node build-standalone.mjs [port]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WWW = path.join(__dirname, 'www');
const PORT = process.argv[2] || 8099;

/* ------------------------------------------------------------------ */
/* 1) تجميع الوحدات في ملف واحد                                         */
/* ------------------------------------------------------------------ */

/**
 * الوحدات تستخدم import/export، والصفحة الواحدة لا تملك ملفات منفصلة
 * لتستوردها. نلفّ كل وحدة في دالة تُرجع صادراتها، ونحوّل كل import إلى
 * قراءة من سجلّ الوحدات — فتبقى الأسماء معزولة ولا تتصادم.
 */
function bundleModule(name, source) {
  const deps = [];
  let body = source;

  // import * as N from './x.js'
  body = body.replace(/^\s*import\s+\*\s+as\s+(\w+)\s+from\s+['"]\.\/([\w.-]+)['"];?\s*$/gm, (_, ns, file) => {
    deps.push(`  const ${ns} = __m['${file}'];`);
    return '';
  });

  // import { a, b as c } from './x.js'   (قد يمتد على عدة أسطر)
  body = body.replace(
    /^\s*import\s+\{([^}]+)\}\s+from\s+['"]\.\/([\w.-]+)['"];?\s*$/gms,
    (_, names, file) => {
      const clean = names
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => n.replace(/\s+as\s+/, ': '))
        .join(', ');
      deps.push(`  const { ${clean} } = __m['${file}'];`);
      return '';
    }
  );

  // جمع الأسماء المُصدَّرة ثم إزالة الكلمة المفتاحية
  const exported = [];
  body = body.replace(/^\s*export\s+(async\s+)?(function|class|const|let|var)\s+(\w+)/gm, (m, a, kind, id) => {
    exported.push(id);
    return m.replace(/export\s+/, '');
  });

  // export { a, b as c };
  body = body.replace(/^\s*export\s+\{([^}]+)\};?\s*$/gm, (_, names) => {
    names
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .forEach((n) => exported.push(n.split(/\s+as\s+/).pop().trim()));
    return '';
  });

  if (/^\s*export\s/m.test(body)) {
    throw new Error(`صيغة تصدير غير مدعومة في ${name}:\n` + body.match(/^\s*export\s.*$/m)[0]);
  }

  return `__m['${name}'] = (() => {
${deps.join('\n')}
${body}
  return { ${exported.join(', ')} };
})();`;
}

const read = (f) => fs.readFileSync(path.join(WWW, 'js', f), 'utf8');

/** بديل طبقة النظام: لا وجود لها خارج تطبيق الهاتف */
const NATIVE_STUB = `
const isNative = false;
const platform = 'web';
async function hydrateStorage() {}
function mirrorStorage() {}
async function prepareNotifications() { return false; }
async function notify() { return false; }
function tap() {}
function buzz() {}
function applyStatusBar() {}
function hideSplash() {}
function onResume(fn) { document.addEventListener('visibilitychange', () => { if (!document.hidden) fn(); }); }
function onBackButton() {}
function onNetworkChange(fn) { fn(navigator.onLine); }
async function share() { return false; }
export { isNative, platform, hydrateStorage, mirrorStorage, prepareNotifications, notify, tap, buzz, applyStatusBar, hideSplash, onResume, onBackButton, onNetworkChange, share };
`;

/** طبقة بيانات تقرأ من اللقطة المحزومة بدل الشبكة */
const DATA_API = `
import { normalizeAr } from './symbols.js';

const SNAP = window.__SNAPSHOT__ || { series: {}, builtAt: 0 };

function get(symbol, tf) {
  const s = SNAP.series[symbol + '|' + tf];
  if (!s) return null;
  // الشموع محزومة كمصفوفات مختصرة لتصغير حجم الملف
  return {
    meta: s.m,
    bars: s.b.map((r) => ({ time: r[0], open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5] })),
    snapshot: true,
  };
}

export const api = {
  isNative: false,
  platform: 'web',

  async chart(symbol, tf) {
    const d = get(symbol, tf) || get(symbol, '1d');
    if (!d) throw new Error('هذه الأداة غير متاحة في النسخة المحزومة');
    return d;
  },

  async multi(symbol, tfs) {
    const out = {};
    for (const tf of tfs) {
      const d = get(symbol, tf);
      if (d) out[tf] = d;
      else out[tf] = { error: 'غير متاح' };
    }
    return out;
  },

  async quotes(symbols) {
    return symbols.map((s) => {
      const d = get(s, '1d');
      if (!d) return { symbol: s, error: 'غير متاح' };
      return {
        symbol: s,
        name: d.meta.name,
        currency: d.meta.currency,
        price: d.meta.price,
        changePercent: d.meta.changePercent,
        spark: d.bars.slice(-40).map((b) => b.close),
      };
    });
  },

  async search(q) {
    const n = normalizeAr(q);
    return Object.keys(SNAP.series)
      .map((k) => k.split('|')[0])
      .filter((s, i, a) => a.indexOf(s) === i)
      .filter((s) => normalizeAr(s).includes(n))
      .slice(0, 10)
      .map((s) => ({ symbol: s, name: s, exchange: 'لقطة محزومة' }));
  },
};
`;

const MODULES = [
  ['native.js', NATIVE_STUB],
  ['store.js', read('store.js')],
  ['indicators.js', read('indicators.js')],
  ['liquidity.js', read('liquidity.js')],
  ['ict.js', read('ict.js')],
  ['confluence.js', read('confluence.js')],
  ['strategy.js', read('strategy.js')],
  ['chart.js', read('chart.js')],
  ['replay.js', read('replay.js')],
  ['alerts.js', read('alerts.js')],
  ['symbols.js', read('symbols.js')],
  ['api.js', DATA_API],
  ['app.js', read('app.js')],
];

const bundled = MODULES.map(([n, src]) => bundleModule(n, src)).join('\n\n');

/* ------------------------------------------------------------------ */
/* 2) جلب لقطة البيانات                                                 */
/* ------------------------------------------------------------------ */

const { MARKETS } = await import(path.join(WWW, 'js', 'symbols.js'));
const symbols = MARKETS.flatMap((m) => m.items.map((i) => i.symbol));

const round = (v) => (Math.abs(v) >= 100 ? +v.toFixed(2) : +v.toFixed(4));
const series = {};
let fetched = 0;
let failed = 0;

async function grab(symbol, tf, keep) {
  try {
    const res = await fetch(
      `http://localhost:${PORT}/api/chart?symbol=${encodeURIComponent(symbol)}&tf=${tf}`
    );
    const d = await res.json();
    if (d.error || !d.bars || d.bars.length < 30) throw new Error(d.error || 'بيانات قليلة');
    const bars = d.bars.slice(-keep);
    series[`${symbol}|${tf}`] = {
      m: d.meta,
      b: bars.map((b) => [b.time, round(b.open), round(b.high), round(b.low), round(b.close), b.volume || 0]),
    };
    fetched++;
    return true;
  } catch (e) {
    failed++;
    console.log(`  تعذّر ${symbol} ${tf}: ${e.message}`);
    return false;
  }
}

console.log(`جلب لقطة لـ ${symbols.length} أداة...`);
for (const s of symbols) {
  await grab(s, '1d', 600);
  await grab(s, '1wk', 300);
  // الفريمات الداخلية حقيقية للمعادن فقط
  if (/=F$/.test(s) || s === 'COPA.L') {
    await grab(s, '1h', 500);
    await grab(s, '4h', 400);
  }
}
console.log(`تم: ${fetched} سلسلة، فشل ${failed}`);

/* ------------------------------------------------------------------ */
/* 3) تركيب الصفحة                                                      */
/* ------------------------------------------------------------------ */

let html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(WWW, 'styles.css'), 'utf8');
const lwc = fs.readFileSync(
  path.join(WWW, 'vendor', 'lightweight-charts.standalone.production.js'),
  'utf8'
);

// الخط من Google Fonts بدل الملفات المحلية
html = html.replace(
  /<link rel="stylesheet" href="fonts\/plex-arabic\.css" \/>/,
  '<link rel="preconnect" href="https://fonts.googleapis.com" />\n' +
    '    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n' +
    '    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet" />'
);
// لا وجود لملفات منفصلة في صفحة واحدة
html = html.replace(/\s*<link rel="icon"[^>]*>/, '');
html = html.replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '');
html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');
html = html.replace(
  /<link rel="stylesheet" href="styles\.css" \/>/,
  `<style>\n${css}\n</style>`
);
html = html.replace(
  /<script src="vendor\/lightweight-charts\.standalone\.production\.js"><\/script>/,
  `<script>${lwc}</script>`
);

html = html.replace(/<title>[^<]*<\/title>/, '<title>إنستينكت تشارتس</title>');

const builtAt = new Date().toISOString();
const snapshot = JSON.stringify({ builtAt, series });

// شريط يوضّح أن الأسعار لقطة ثابتة
const banner = `
    <div class="snapshot-note">
      📦 نسخة تجريبية ببيانات محفوظة بتاريخ <b id="snap-date"></b> — الأسعار ثابتة ولا تتحدّث.
      للأسعار الحيّة شغّل النسخة الكاملة على جهازك.
    </div>`;
html = html.replace('<main class="layout">', `${banner}\n    <main class="layout">`);

const extraCss = `
.snapshot-note {
  background: color-mix(in srgb, var(--gold) 18%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--gold) 40%, transparent);
  color: var(--text);
  font-size: 11.5px;
  padding: 6px 14px;
  text-align: center;
  line-height: 1.6;
}
@media (max-width: 820px) {
  .snapshot-note { font-size: 10.5px; padding: 5px 10px; }
  .layout { height: calc(100% - var(--header) - 30px - env(safe-area-inset-top)); }
}
`;
html = html.replace('</style>', `${extraCss}\n</style>`);

html = html.replace(
  /<script type="module" src="js\/app\.js"><\/script>/,
  `<script id="snapshot-data" type="application/json">${snapshot.replace(/</g, '\\u003c')}</script>
    <script>
      window.__SNAPSHOT__ = JSON.parse(document.getElementById('snapshot-data').textContent);
      const __m = {};
${bundled}
      document.getElementById('snap-date').textContent =
        new Date(window.__SNAPSHOT__.builtAt).toLocaleDateString('ar-EG', {
          year: 'numeric', month: 'long', day: 'numeric',
        });
    </script>`
);

const out = path.join(__dirname, 'standalone.html');
fs.writeFileSync(out, html);
const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
console.log(`\nالناتج: ${out}  (${mb} ميجابايت)`);
