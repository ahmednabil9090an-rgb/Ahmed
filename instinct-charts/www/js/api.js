/*
 * طبقة البيانات في الواجهة — تعمل في وضعين:
 *
 *  • على الهاتف (Capacitor): تخاطب المزوّد مباشرة عبر شبكة النظام،
 *    فلا قيود CORS ولا حاجة إلى أي خادم خلفي.
 *  • على الويب: تمرّ عبر وسيط /api في خادم التطوير.
 *
 * وفي الحالتين يُحفظ آخر رد ناجح محليًا، فيفتح التطبيق على بيانات
 * ظاهرة حتى بلا اتصال، مع توضيح أنها بيانات مخزّنة.
 */

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
} from './provider.js';

export const isNative = !!(
  window.Capacitor &&
  typeof window.Capacitor.isNativePlatform === 'function' &&
  window.Capacitor.isNativePlatform()
);

export const platform = window.Capacitor?.getPlatform?.() || 'web';

const memory = createCache(200);
const OFFLINE_PREFIX = 'instinct:offline:';

/* ------------------------------------------------------------------ */
/* تخزين آخر نسخة ناجحة للعمل بلا اتصال                                 */
/* ------------------------------------------------------------------ */

function saveOffline(key, value) {
  try {
    localStorage.setItem(
      OFFLINE_PREFIX + key,
      JSON.stringify({ at: Date.now(), value })
    );
  } catch {
    /* المساحة ممتلئة أو التخزين معطّل — نتجاهل */
  }
}

function readOffline(key) {
  try {
    const raw = localStorage.getItem(OFFLINE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { ...parsed.value, offline: true, cachedAt: parsed.at };
  } catch {
    return null;
  }
}

/** يمسح البيانات المخزّنة للعمل بلا اتصال (من الإعدادات) */
export function clearOfflineCache() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(OFFLINE_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* تجاهل */
  }
}

/* ------------------------------------------------------------------ */
/* الجلب                                                                */
/* ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** جلب عبر الشبكة الأصلية للنظام (على الهاتف فقط) */
async function nativeGetJson(url) {
  const { CapacitorHttp } = window.Capacitor.Plugins;
  const res = await CapacitorHttp.get({
    url,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json,text/plain,*/*',
    },
    readTimeout: 20000,
    connectTimeout: 15000,
  });
  if (res.status >= 400) throw new Error('HTTP ' + res.status);
  return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
}

async function webGetJson(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({ error: 'رد غير صالح' }));
  if (!res.ok || data.error) throw new Error(data.error || `خطأ ${res.status}`);
  return data;
}

/** جلب مع إعادة محاولة — المزوّد يرفض أحيانًا عند الازدحام */
async function getJson(url, { native = isNative, tries = 3 } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return native ? await nativeGetJson(url) : await webGetJson(url);
    } catch (err) {
      lastErr = err;
      if (attempt < tries - 1) await sleep(500 * Math.pow(2, attempt));
    }
  }
  throw lastErr;
}

/* ------------------------------------------------------------------ */
/* الواجهة العامة                                                       */
/* ------------------------------------------------------------------ */

async function series(symbol, tf) {
  const key = `${symbol}:${tf}`;
  const hit = memory.get(key);
  if (hit) return hit;

  const conf = TF[tf] || TF['1d'];
  try {
    let data;
    if (isNative) {
      data = normalizeChart(await getJson(chartUrl(symbol, tf)));
      if (conf.aggregate && (medianGap(data.bars) || 0) <= 3600 * 1.5) {
        data.bars = aggregate(data.bars, conf.aggregate);
      }
      data.timeframe = tf;
      annotateResolution(data, tf);
    } else {
      data = await getJson(
        `/api/chart?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}`,
        { native: false }
      );
    }
    memory.set(key, data, conf.ttl);
    saveOffline(key, data);
    return data;
  } catch (err) {
    const stale = readOffline(key);
    if (stale) return stale;
    throw err;
  }
}

export const api = {
  isNative,
  platform,

  chart: (symbol, tf) => series(symbol, tf),

  async multi(symbol, tfs) {
    const out = {};
    await Promise.all(
      tfs.map(async (tf) => {
        try {
          out[tf] = await series(symbol, tf);
        } catch (e) {
          out[tf] = { error: String(e.message || e) };
        }
      })
    );
    return out;
  },

  async quotes(symbols) {
    if (!isNative) {
      return getJson(`/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`, {
        native: false,
      });
    }
    // على الهاتف نجلب الرموز على دفعات صغيرة حتى لا يرفض المزوّد الطلبات
    const out = [];
    const batchSize = 4;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const rows = await Promise.all(
        batch.map(async (s) => {
          try {
            const d = await series(s, '1d');
            return {
              symbol: s,
              name: d.meta.name,
              currency: d.meta.currency,
              price: d.meta.price,
              changePercent: d.meta.changePercent,
              spark: d.bars.slice(-40).map((b) => b.close),
            };
          } catch (e) {
            return { symbol: s, error: String(e.message || e) };
          }
        })
      );
      out.push(...rows);
    }
    return out;
  },

  async search(q) {
    if (!isNative) return getJson(`/api/search?q=${encodeURIComponent(q)}`, { native: false });
    const key = 'search:' + q.toLowerCase();
    const hit = memory.get(key);
    if (hit) return hit;
    const out = normalizeSearch(await getJson(searchUrl(q)));
    memory.set(key, out, 10 * 60e3);
    return out;
  },
};
