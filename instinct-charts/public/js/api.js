/* طبقة الاتصال بالخادم */

async function getJson(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({ error: 'رد غير صالح' }));
  if (!res.ok || data.error) throw new Error(data.error || `خطأ ${res.status}`);
  return data;
}

export const api = {
  chart: (symbol, tf) =>
    getJson(`/api/chart?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}`),

  multi: (symbol, tfs) =>
    getJson(`/api/multi?symbol=${encodeURIComponent(symbol)}&tfs=${encodeURIComponent(tfs.join(','))}`),

  quotes: (symbols) =>
    getJson(`/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`),

  search: (q) => getJson(`/api/search?q=${encodeURIComponent(q)}`),
};
