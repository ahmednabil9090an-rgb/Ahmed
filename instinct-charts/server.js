#!/usr/bin/env node
/**
 * خادم التطوير للنسخة الويب — بدون أي اعتماديات خارجية.
 *  - يقدّم ملفات الواجهة من مجلد www
 *  - يعمل كوسيط لبيانات الشموع (المتصفح لا يستطيع مخاطبة المزوّد مباشرة بسبب CORS)
 *
 * نسخة الهاتف لا تحتاج هذا الخادم إطلاقًا: تستدعي المزوّد عبر شبكة النظام.
 *
 * التشغيل:  node server.js  [--port 8080]
 */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  TF,
  USER_AGENT,
  chartUrl,
  searchUrl,
  aggregate,
  annotateResolution,
  medianGap,
  normalizeChart,
  normalizeSearch,
  createCache,
} from './www/js/provider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, 'www');

const argPort = (() => {
  const i = process.argv.indexOf('--port');
  if (i !== -1 && process.argv[i + 1]) return Number(process.argv[i + 1]);
  return Number(process.env.PORT) || 8080;
})();

const cache = createCache();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, tries = 4) {
  let lastErr = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json,text/plain,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error('HTTP ' + res.status);
        await sleep(400 * Math.pow(2, attempt));
        continue;
      }
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error('رد غير صالح من مزوّد البيانات');
      }
    } catch (err) {
      lastErr = err;
      await sleep(400 * Math.pow(2, attempt));
    }
  }
  throw lastErr || new Error('فشل الجلب');
}

async function getSeries(symbol, tf) {
  const conf = TF[tf] || TF['1d'];
  const key = `c:${symbol}:${tf}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const data = normalizeChart(await fetchJson(chartUrl(symbol, tf)));
  // لا ندمج الشموع إلا إذا كان المصدر فعلًا بدقّة الساعة
  if (conf.aggregate && (medianGap(data.bars) || 0) <= 3600 * 1.5) {
    data.bars = aggregate(data.bars, conf.aggregate);
  }
  data.timeframe = tf;
  annotateResolution(data, tf);
  cache.set(key, data, conf.ttl);
  return data;
}

async function search(q) {
  const key = 's:' + q.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const out = normalizeSearch(await fetchJson(searchUrl(q)));
  cache.set(key, out, 10 * 60e3);
  return out;
}

/* ------------------------------------------------------------------ */
/* ملفات ثابتة                                                          */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('غير موجود');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  });
}

function sendJson(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(obj));
}

/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  try {
    if (p === '/api/chart') {
      const symbol = url.searchParams.get('symbol');
      const tf = url.searchParams.get('tf') || '1d';
      if (!symbol) return sendJson(res, 400, { error: 'الرمز مطلوب' });
      return sendJson(res, 200, await getSeries(symbol, tf));
    }

    if (p === '/api/multi') {
      const symbol = url.searchParams.get('symbol');
      const tfs = (url.searchParams.get('tfs') || '1d,1wk').split(',');
      if (!symbol) return sendJson(res, 400, { error: 'الرمز مطلوب' });
      const out = {};
      for (const tf of tfs) {
        try {
          out[tf] = await getSeries(symbol, tf.trim());
        } catch (e) {
          out[tf] = { error: String(e.message || e) };
        }
      }
      return sendJson(res, 200, out);
    }

    if (p === '/api/quotes') {
      const symbols = (url.searchParams.get('symbols') || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 40);
      const out = [];
      for (const s of symbols) {
        try {
          const d = await getSeries(s, '1d');
          out.push({
            symbol: s,
            name: d.meta.name,
            currency: d.meta.currency,
            price: d.meta.price,
            changePercent: d.meta.changePercent,
            spark: d.bars.slice(-40).map((b) => b.close),
          });
        } catch (e) {
          out.push({ symbol: s, error: String(e.message || e) });
        }
      }
      return sendJson(res, 200, out);
    }

    if (p === '/api/search') {
      const q = url.searchParams.get('q') || '';
      if (q.trim().length < 1) return sendJson(res, 200, []);
      return sendJson(res, 200, await search(q.trim()));
    }

    if (p === '/api/health') {
      return sendJson(res, 200, { ok: true, cache: cache.size, time: Date.now() });
    }

    return serveStatic(req, res, p);
  } catch (err) {
    return sendJson(res, 502, { error: String((err && err.message) || err) });
  }
});

/* ------------------------------------------------------------------ */
/* بدء التشغيل                                                          */
/* ------------------------------------------------------------------ */

/** عنوان الجهاز على الشبكة المحلية — لفتح التطبيق من الموبايل */
function localNetworkAddress() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

function openBrowser(url) {
  const cmd =
    process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    // لا بد من معالج للخطأ: غياب أمر الفتح يُطلق حدثًا غير متزامن
    // يُسقط العملية كلها إن لم يُلتقط — والعنوان مطبوع على أي حال.
    child.on('error', () => {});
    child.unref();
  } catch {
    /* تعذّر فتح المتصفح */
  }
}

server.listen(argPort, () => {
  const lan = localNetworkAddress();
  const line = '─'.repeat(46);
  console.log(`\n${line}`);
  console.log('  إنستينكت تشارتس يعمل الآن');
  console.log(line);
  console.log(`  على هذا الجهاز:   http://localhost:${argPort}`);
  if (lan) {
    console.log(`  من الموبايل:      http://${lan}:${argPort}`);
    console.log('  (لا بد أن يكون الموبايل على نفس شبكة الواي فاي)');
  }
  console.log(`${line}`);
  console.log('  للإيقاف: اضغط Ctrl + C\n');

  if (process.argv.includes('--open')) openBrowser(`http://localhost:${argPort}`);
});
