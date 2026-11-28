#!/usr/bin/env node
/**
 * Instinct Charts — خادم بسيط بدون أي اعتماديات خارجية.
 *  - يقدّم ملفات الواجهة من مجلد public
 *  - يعمل كوسيط (proxy) لبيانات الشموع من Yahoo Finance مع كاش داخلي
 *
 * التشغيل:  node server.js  [--port 8080]
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = path.join(__dirname, 'public');
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const argPort = (() => {
  const i = process.argv.indexOf('--port');
  if (i !== -1 && process.argv[i + 1]) return Number(process.argv[i + 1]);
  return Number(process.env.PORT) || 8080;
})();

/* ------------------------------------------------------------------ */
/* كاش بسيط في الذاكرة                                                  */
/* ------------------------------------------------------------------ */

const cache = new Map(); // key -> { expires, value }

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value, ttlMs) {
  cache.set(key, { value, expires: Date.now() + ttlMs });
  if (cache.size > 400) {
    // تنظيف أقدم المدخلات
    const keys = [...cache.keys()].slice(0, 100);
    keys.forEach((k) => cache.delete(k));
  }
}

/* ------------------------------------------------------------------ */
/* جلب من ياهو مع إعادة محاولة                                          */
/* ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, tries = 4) {
  let lastErr = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
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

/* ------------------------------------------------------------------ */
/* الفريمات الزمنية                                                     */
/* ------------------------------------------------------------------ */

// tf -> { interval, range, ttl, aggregate }
const TF = {
  '1m': { interval: '1m', range: '5d', ttl: 45e3 },
  '5m': { interval: '5m', range: '1mo', ttl: 60e3 },
  '15m': { interval: '15m', range: '1mo', ttl: 90e3 },
  '30m': { interval: '30m', range: '2mo', ttl: 120e3 },
  '1h': { interval: '1h', range: '2y', ttl: 180e3 },
  '4h': { interval: '1h', range: '2y', ttl: 180e3, aggregate: 4 },
  '1d': { interval: '1d', range: '10y', ttl: 300e3 },
  '1wk': { interval: '1wk', range: '10y', ttl: 600e3 },
  '1mo': { interval: '1mo', range: 'max', ttl: 900e3 },
};

/** يحوّل شموع الساعة إلى شموع 4 ساعات */
function aggregate(bars, factor) {
  const out = [];
  for (let i = 0; i < bars.length; i += factor) {
    const chunk = bars.slice(i, i + factor);
    if (!chunk.length) continue;
    out.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map((b) => b.high)),
      low: Math.min(...chunk.map((b) => b.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, b) => s + (b.volume || 0), 0),
    });
  }
  return out;
}

function normalizeChart(json) {
  const chart = json && json.chart;
  if (!chart) throw new Error('رد غير متوقع');
  if (chart.error) throw new Error(chart.error.description || chart.error.code);
  const r = chart.result && chart.result[0];
  if (!r) throw new Error('لا توجد بيانات لهذا الرمز');

  const ts = r.timestamp || [];
  const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open ? q.open[i] : null;
    const h = q.high ? q.high[i] : null;
    const l = q.low ? q.low[i] : null;
    const c = q.close ? q.close[i] : null;
    if (o == null || h == null || l == null || c == null) continue;
    bars.push({
      time: ts[i],
      open: +o,
      high: +h,
      low: +l,
      close: +c,
      volume: q.volume && q.volume[i] != null ? +q.volume[i] : 0,
    });
  }

  const m = r.meta || {};
  const lastBar = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2];

  // بعض الأدوات (خاصة في البورصة المصرية) يرجع لها المزوّد سعرًا قديمًا في
  // بيانات الـ meta بينما سلسلة الشموع محدّثة — لذلك نثق بالشموع عند الاختلاف.
  const metaPrice = m.regularMarketPrice;
  const metaTime = m.regularMarketTime;
  let metaTrusted =
    metaPrice != null &&
    lastBar != null &&
    (metaTime == null || metaTime >= lastBar.time) &&
    Math.abs(metaPrice - lastBar.close) / lastBar.close < 0.25;

  const price = metaTrusted ? metaPrice : lastBar ? lastBar.close : null;
  let changePercent = metaTrusted ? m.regularMarketChangePercent : null;
  if (changePercent == null && lastBar && prevBar && prevBar.close) {
    changePercent = ((lastBar.close - prevBar.close) / prevBar.close) * 100;
  }

  return {
    meta: {
      symbol: m.symbol,
      currency: m.currency,
      exchange: m.fullExchangeName || m.exchangeName,
      type: m.instrumentType,
      timezone: m.exchangeTimezoneName,
      gmtoffset: m.gmtoffset,
      price,
      changePercent,
      previousClose: prevBar ? prevBar.close : m.chartPreviousClose,
      lastBarTime: lastBar ? lastBar.time : null,
      quoteStale: !metaTrusted,
      dayHigh: lastBar ? lastBar.high : m.regularMarketDayHigh,
      dayLow: lastBar ? lastBar.low : m.regularMarketDayLow,
      marketTime: metaTrusted ? metaTime : lastBar ? lastBar.time : null,
      name: m.longName || m.shortName || m.symbol,
    },
    bars,
  };
}

async function getSeries(symbol, tf) {
  const conf = TF[tf] || TF['1d'];
  const key = `c:${symbol}:${tf}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const url =
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=${conf.interval}&range=${conf.range}&includePrePost=false&events=div%2Csplit`;

  const data = normalizeChart(await fetchJson(url));
  if (conf.aggregate) data.bars = aggregate(data.bars, conf.aggregate);
  data.timeframe = tf;
  cacheSet(key, data, conf.ttl);
  return data;
}

async function search(q) {
  const key = 's:' + q.toLowerCase();
  const hit = cacheGet(key);
  if (hit) return hit;
  const url =
    'https://query2.finance.yahoo.com/v1/finance/search?q=' +
    encodeURIComponent(q) +
    '&quotesCount=12&newsCount=0&listsCount=0';
  const json = await fetchJson(url);
  const out = (json.quotes || [])
    .filter((x) => x.symbol)
    .map((x) => ({
      symbol: x.symbol,
      name: x.longname || x.shortname || x.symbol,
      exchange: x.exchDisp || x.exchange,
      type: x.typeDisp || x.quoteType,
    }));
  cacheSet(key, out, 10 * 60e3);
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
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/* ------------------------------------------------------------------ */
/* الخادم                                                               */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  try {
    if (p === '/api/chart') {
      const symbol = url.searchParams.get('symbol');
      const tf = url.searchParams.get('tf') || '1d';
      if (!symbol) return sendJson(res, 400, { error: 'الرمز مطلوب' });
      const data = await getSeries(symbol, tf);
      return sendJson(res, 200, data);
    }

    if (p === '/api/multi') {
      // عدة فريمات لنفس الرمز في طلب واحد (للتحليل متعدد الأطر)
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

server.listen(argPort, () => {
  console.log(`Instinct Charts يعمل على  http://localhost:${argPort}`);
});
