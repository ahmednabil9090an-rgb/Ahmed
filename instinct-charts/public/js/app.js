/* نقطة التشغيل: تربط البيانات والتحليل والرسم والواجهة */

import { api } from './api.js';
import {
  MARKETS,
  describe,
  displayName,
  DEFAULT_WATCHLIST,
  isAllowed,
  normalizeAr,
} from './symbols.js';
import { analyze } from './ict.js';
import { findConfluence } from './confluence.js';
import { buildPlan, roundPrice, labelBias } from './strategy.js';
import { ChartManager, renderSubPanes, renderPriceOverlays } from './chart.js';
import * as Ind from './indicators.js';
import { Replay } from './replay.js';
import * as Alerts from './alerts.js';
import { load, save } from './store.js';

/* ------------------------------------------------------------------ */
/* الحالة                                                               */
/* ------------------------------------------------------------------ */

const TIMEFRAMES = [
  { id: '1m', label: 'د1' },
  { id: '5m', label: 'د5' },
  { id: '15m', label: 'د15' },
  { id: '30m', label: 'د30' },
  { id: '1h', label: 'س1' },
  { id: '4h', label: 'س4' },
  { id: '1d', label: 'يومي' },
  { id: '1wk', label: 'أسبوعي' },
  { id: '1mo', label: 'شهري' },
];

const LAYERS = [
  { id: 'confluence', label: '⭐ نقاط الالتقاء' },
  { id: 'fib', label: 'فيبوناتشي' },
  { id: 'fvg', label: 'فجوات الفريم' },
  { id: 'htf', label: 'فجوات يومي/أسبوعي' },
  { id: 'ote', label: 'منطقة OTE' },
  { id: 'ob', label: 'مناطق الأوامر' },
  { id: 'structure', label: 'MSS / BOS' },
  { id: 'liquidity', label: 'السيولة' },
  { id: 'plan', label: 'مستويات الخطة' },
];

const INTRADAY_TFS = new Set(['1m', '5m', '15m', '30m', '1h', '4h']);

/**
 * يقرأ مجموعة محفوظة، ويفعّل تلقائيًا أي خيار جديد أُضيف للتطبيق بعد آخر
 * حفظ — حتى لا تختفي الميزات الجديدة عمّن استخدم التطبيق من قبل.
 */
function loadSet(key, allIds, defaults) {
  const stored = load(key, null);
  const knownKey = key + ':known';
  const known = load(knownKey, null);
  save(knownKey, allIds);
  if (!stored) return new Set(defaults);
  const set = new Set(stored);
  if (known) allIds.filter((id) => !known.includes(id)).forEach((id) => set.add(id));
  return set;
}

const INDICATOR_IDS = ['ema20', 'ema50', 'ema200', 'bb', 'vwap', 'volume', 'rsi', 'macd', 'wt'];

const state = {
  symbol: load('symbol', 'COMI.CA'),
  tf: load('tf', '1d'),
  bars: [],
  meta: null,
  htf: {},
  analysis: null,
  plan: null,
  indicators: loadSet('indicators', INDICATOR_IDS, [
    'ema20',
    'ema50',
    'ema200',
    'volume',
    'rsi',
    'wt',
  ]),
  // المناطق المعروضة افتراضيًا — الباقي يُفعّل من لوحة «طبقات الرسم»
  layers: loadSet('layers', LAYERS.map((l) => l.id), [
    'confluence',
    'fib',
    'htf',
    'structure',
    'plan',
  ]),
  confluence: { supports: [], resistances: [], all: [] },
  theme: load('theme', 'dark'),
  watchlist: load('watchlist', DEFAULT_WATCHLIST),
  lastPrice: null,
  loading: false,
};

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ */
/* تهيئة الرسم                                                          */
/* ------------------------------------------------------------------ */

document.body.dataset.theme = state.theme;

const cm = new ChartManager(
  { price: $('chart-price'), subs: $('chart-subs') },
  state.theme
);

const replay = new Replay({
  onFrame: (bars) => {
    cm.setBars(bars, { keepView: true });
    recompute(bars, { light: true });
  },
  onState: (s) => renderReplayState(s),
});

/* ------------------------------------------------------------------ */
/* أدوات مساعدة للعرض                                                   */
/* ------------------------------------------------------------------ */

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const nfVol = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

function fmtPrice(p) {
  if (p == null || !isFinite(p)) return '—';
  const a = Math.abs(p);
  return a >= 1000 ? nf.format(+p.toFixed(1)) : a >= 1 ? p.toFixed(2) : p.toFixed(4);
}

function toast(message, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = message;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

/* ------------------------------------------------------------------ */
/* الشريط العلوي: الفريمات والمؤشرات                                    */
/* ------------------------------------------------------------------ */

function buildTimeframes() {
  const wrap = $('tf-group');
  wrap.innerHTML = '';
  TIMEFRAMES.forEach((tf) => {
    const b = document.createElement('button');
    b.textContent = tf.label;
    b.dataset.tf = tf.id;
    if (tf.id === state.tf) b.classList.add('active');
    b.onclick = () => {
      state.tf = tf.id;
      save('tf', tf.id);
      buildTimeframes();
      loadSymbol();
    };
    wrap.appendChild(b);
  });
}

function buildIndicatorMenu() {
  const list = $('ind-list');
  const defs = [
    { id: 'ema20', label: 'متوسط أسي 20' },
    { id: 'ema50', label: 'متوسط أسي 50' },
    { id: 'ema200', label: 'متوسط أسي 200' },
    { id: 'bb', label: 'بولينجر باند' },
    { id: 'vwap', label: 'VWAP' },
    { id: 'volume', label: 'الأحجام' },
    { id: 'rsi', label: 'RSI' },
    { id: 'macd', label: 'MACD' },
    { id: 'wt', label: 'WaveTrend' },
  ];
  list.innerHTML = '';
  defs.forEach((d) => {
    const lab = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.indicators.has(d.id);
    cb.onchange = () => {
      cb.checked ? state.indicators.add(d.id) : state.indicators.delete(d.id);
      save('indicators', [...state.indicators]);
      drawIndicators();
    };
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(d.label));
    list.appendChild(lab);
  });
}

function buildLayerToggles() {
  const wrap = $('layer-toggles');
  wrap.innerHTML = '';
  LAYERS.forEach((l) => {
    const lab = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.layers.has(l.id);
    cb.onchange = () => {
      cb.checked ? state.layers.add(l.id) : state.layers.delete(l.id);
      save('layers', [...state.layers]);
      drawAnalysisLayers();
    };
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(l.label));
    wrap.appendChild(lab);
  });
}

/* ------------------------------------------------------------------ */
/* القوائم الجانبية                                                     */
/* ------------------------------------------------------------------ */

function rowItem(symbol, name, quote) {
  const row = document.createElement('div');
  row.className = 'row-item' + (symbol === state.symbol ? ' active' : '');
  row.onclick = () => selectSymbol(symbol);

  const nm = document.createElement('div');
  nm.className = 'nm';
  const b = document.createElement('b');
  b.textContent = name;
  const s = document.createElement('span');
  s.textContent = symbol;
  nm.append(b, s);

  const px = document.createElement('div');
  px.className = 'px';
  if (quote && quote.price != null) {
    const p = document.createElement('b');
    p.textContent = fmtPrice(quote.price);
    const c = document.createElement('span');
    const ch = quote.changePercent;
    c.className = ch >= 0 ? 'up' : 'down';
    c.textContent = ch == null ? '' : `${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%`;
    px.append(p, c);
  }

  row.append(nm, px);
  return row;
}

let quoteCache = new Map();

function renderWatchlist() {
  const el = $('watchlist');
  el.innerHTML = '';
  if (!state.watchlist.length) {
    const p = document.createElement('div');
    p.className = 'muted small';
    p.style.padding = '14px';
    p.textContent = 'قائمة المراقبة فارغة — أضف أدوات بالنجمة ☆';
    el.appendChild(p);
    return;
  }
  state.watchlist.forEach((sym) => {
    const d = describe(sym);
    el.appendChild(rowItem(sym, d ? d.ar : sym, quoteCache.get(sym)));
  });
}

async function refreshQuotes() {
  if (!state.watchlist.length) return;
  try {
    const rows = await api.quotes(state.watchlist);
    rows.forEach((r) => {
      if (!r.error) quoteCache.set(r.symbol, r);
    });
    renderWatchlist();
  } catch {
    /* تجاهل أخطاء التحديث الدوري */
  }
}

function renderMarkets() {
  const el = $('markets');
  el.innerHTML = '';
  MARKETS.forEach((m) => {
    const t = document.createElement('div');
    t.className = 'group-title';
    t.textContent = m.label;
    el.appendChild(t);
    m.items.forEach((it) => el.appendChild(rowItem(it.symbol, it.ar, quoteCache.get(it.symbol))));
  });
}

/* ------------------------------------------------------------------ */
/* البحث                                                               */
/* ------------------------------------------------------------------ */

function setupSearch() {
  const input = $('search');
  const box = $('search-results');
  let timer = null;

  const localMatches = (q) => {
    const n = normalizeAr(q);
    if (!n) return [];
    const out = [];
    MARKETS.forEach((m) =>
      m.items.forEach((it) => {
        if (
          normalizeAr(it.symbol).includes(n) ||
          normalizeAr(it.ar).includes(n) ||
          normalizeAr(it.en).includes(n)
        )
          out.push({ symbol: it.symbol, name: it.ar, exchange: m.label });
      })
    );
    return out.slice(0, 8);
  };

  const render = (items) => {
    box.innerHTML = '';
    if (!items.length) {
      box.hidden = true;
      return;
    }
    items.forEach((it) => {
      const d = document.createElement('div');
      d.className = 'res';
      const left = document.createElement('div');
      left.innerHTML = `<b>${it.name}</b>`;
      const right = document.createElement('div');
      right.className = 'muted small';
      right.style.direction = 'ltr';
      right.textContent = `${it.symbol} · ${it.exchange || ''}`;
      d.append(left, right);
      d.onclick = () => {
        selectSymbol(it.symbol);
        input.value = '';
        box.hidden = true;
      };
      box.appendChild(d);
    });
    box.hidden = false;
  };

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearTimeout(timer);
    if (!q) {
      box.hidden = true;
      return;
    }
    render(localMatches(q));
    timer = setTimeout(async () => {
      try {
        // نقصر النتائج على البورصة المصرية والمعادن الثلاثة
        const remote = (await api.search(q)).filter((r) => isAllowed(r.symbol));
        const local = localMatches(q);
        const seen = new Set(local.map((x) => x.symbol));
        render([...local, ...remote.filter((r) => !seen.has(r.symbol))].slice(0, 12));
      } catch {
        /* نكتفي بالنتائج المحلية */
      }
    }, 320);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrap')) box.hidden = true;
  });
}

/* ------------------------------------------------------------------ */
/* تحميل الأداة                                                         */
/* ------------------------------------------------------------------ */

function selectSymbol(symbol) {
  if (replay.active) exitReplay();
  state.symbol = symbol;
  save('symbol', symbol);
  renderWatchlist();
  renderMarkets();
  loadSymbol();
}

async function loadSymbol() {
  state.loading = true;
  $('chart-loading').hidden = false;
  $('chart-error').hidden = true;

  try {
    const data = await api.chart(state.symbol, state.tf);
    if (!data.bars || data.bars.length < 10) throw new Error('بيانات غير كافية لهذه الأداة');

    state.bars = data.bars;
    state.meta = data.meta;

    renderHeader();
    cm.setBars(state.bars);
    drawIndicators();
    recompute(state.bars);

    // الأطر الأعلى للتأكيد (في الخلفية)
    const tfs = ['1d', '1wk'].filter((t) => t !== state.tf);
    if (tfs.length) {
      api
        .multi(state.symbol, tfs)
        .then((res) => {
          state.htf = {};
          Object.entries(res).forEach(([tf, d]) => {
            if (d && d.bars && d.bars.length > 20) state.htf[tf] = { ...analyze(d.bars), bars: d.bars };
          });
          recompute(replay.active ? replay.visibleBars : state.bars);
        })
        .catch(() => {});
    } else {
      state.htf = {};
    }

    checkAlertsFor(state.meta.price ?? state.bars[state.bars.length - 1].close);
  } catch (err) {
    const box = $('chart-error');
    box.hidden = false;
    box.textContent = 'تعذّر تحميل البيانات: ' + (err.message || err);
  } finally {
    state.loading = false;
    $('chart-loading').hidden = true;
  }
}

function renderHeader() {
  const m = state.meta || {};
  const d = describe(state.symbol);
  $('sym-name').textContent = d ? d.ar : m.name || state.symbol;
  $('sym-code').textContent = state.symbol;

  const last = state.bars[state.bars.length - 1];
  const price = m.price ?? (last ? last.close : null);
  $('price').textContent = fmtPrice(price);

  const ch = m.changePercent;
  const chEl = $('change');
  if (ch != null) {
    chEl.textContent = `${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%`;
    chEl.className = 'chg ' + (ch >= 0 ? 'up' : 'down');
  } else {
    chEl.textContent = '';
  }

  $('sym-meta').textContent = [m.exchange, m.currency].filter(Boolean).join(' · ');
  $('btn-fav').classList.toggle('on', state.watchlist.includes(state.symbol));
  $('btn-fav').textContent = state.watchlist.includes(state.symbol) ? '★' : '☆';
}

/* ------------------------------------------------------------------ */
/* المؤشرات                                                             */
/* ------------------------------------------------------------------ */

function drawIndicators() {
  const bars = replay.active ? replay.visibleBars : state.bars;
  if (!bars.length) return;
  renderPriceOverlays(cm, bars, state.indicators);
  renderSubPanes(cm, bars, state.indicators);
  if (cm.onCrosshair) cm.onCrosshair(null);
}

/* ------------------------------------------------------------------ */
/* التحليل والرسم عليه                                                  */
/* ------------------------------------------------------------------ */

function recompute(bars, { light = false } = {}) {
  if (!bars || bars.length < 20) return;
  state.analysis = analyze(bars);
  state.confluence = findConfluence(bars, state.analysis, {
    intraday: INTRADAY_TFS.has(state.tf),
  });

  // الفريم الحالي يُحتسب ضمن أطر التأكيد إن كان يوميًا أو أسبوعيًا
  const htfForPlan = { ...state.htf };
  if (state.tf === '1d' || state.tf === '1wk') htfForPlan[state.tf] = state.analysis;

  state.plan = buildPlan(bars, state.analysis, htfForPlan, state.confluence);
  drawAnalysisLayers();
  renderAnalysisPanel();
  if (!light) drawIndicators();
}

/** يحوّل وقتًا إلى رقم الشمعة الأقرب في الفريم الحالي */
function indexAtTime(bars, time) {
  if (!bars.length) return 0;
  if (time <= bars[0].time) return 0;
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function drawAnalysisLayers() {
  const bars = replay.active ? replay.visibleBars : state.bars;
  const A = state.analysis;
  const plan = state.plan;
  if (!A || !A.ok || !bars.length) return;

  const zones = [];
  const lines = [];
  const labels = [];

  /* --- فجوات القيمة العادلة على الفريم الحالي --- */
  if (state.layers.has('fvg')) {
    A.openFVGs.slice(-14).forEach((f) => {
      zones.push({
        top: f.top,
        bottom: f.bottom,
        fromIndex: f.index - 1,
        toIndex: null,
        fill: f.dir === 'bull' ? 'rgba(23,178,106,.13)' : 'rgba(229,72,77,.13)',
        stroke: f.dir === 'bull' ? 'rgba(23,178,106,.35)' : 'rgba(229,72,77,.35)',
        label: 'FVG',
        labelColor: f.dir === 'bull' ? 'rgba(23,178,106,.9)' : 'rgba(229,72,77,.9)',
      });
    });
  }

  /* --- فجوات الأطر الأعلى --- */
  if (state.layers.has('htf')) {
    const marks = { '1d': { tag: 'D FVG', color: '245,158,11' }, '1wk': { tag: 'W FVG', color: '234,88,12' } };
    Object.entries(state.htf).forEach(([tf, h]) => {
      if (!h || !h.ok) return;
      const mk = marks[tf];
      if (!mk) return;
      h.openFVGs.slice(-4).forEach((f) => {
        zones.push({
          top: f.top,
          bottom: f.bottom,
          fromIndex: indexAtTime(bars, f.startTime),
          toIndex: null,
          fill: `rgba(${mk.color},.12)`,
          stroke: `rgba(${mk.color},.3)`,
          label: mk.tag,
          labelColor: `rgba(${mk.color},.95)`,
        });
      });
    });
  }

  /* --- منطقة OTE والتوازن --- */
  if (state.layers.has('ote') && A.impulse) {
    const i = A.impulse;
    zones.push({
      top: i.ote.top,
      bottom: i.ote.bottom,
      fromIndex: Math.min(i.from.index, i.to.index),
      toIndex: null,
      fill: 'rgba(224,179,65,.15)',
      stroke: 'rgba(224,179,65,.45)',
      label: `منطقة ذهبية OTE ${roundPrice(Math.min(i.ote.top, i.ote.bottom))} – ${roundPrice(
        Math.max(i.ote.top, i.ote.bottom)
      )}`,
      labelColor: 'rgba(224,179,65,.95)',
    });
    lines.push({
      price: i.equilibrium,
      fromIndex: Math.min(i.from.index, i.to.index),
      toIndex: null,
      color: 'rgba(148,163,184,.8)',
      dashed: true,
      label: `توازن ${roundPrice(i.equilibrium)}`,
    });
  }

  /* --- شبكة فيبوناتشي على الساق الاندفاعية --- */
  if (state.layers.has('fib') && A.impulse) {
    const imp = A.impulse;
    const up = imp.dir === 'bull';
    const range = imp.range;
    const legStart = Math.min(imp.from.index, imp.to.index);
    const base = (r) => (up ? imp.high.price - range * r : imp.low.price + range * r);

    // النسب الرئيسية فقط تحمل تسمية حتى لا يزدحم الرسم
    const ratios = [
      { r: 0, label: '0', color: 'rgba(148,163,184,.7)', named: false },
      { r: 0.236, label: '0.236', color: 'rgba(148,163,184,.5)', named: false },
      { r: 0.382, label: '0.382', color: 'rgba(96,165,250,.75)', named: true },
      { r: 0.5, label: '0.5', color: 'rgba(148,163,184,.8)', named: true },
      { r: 0.618, label: '0.618', color: 'rgba(224,179,65,.95)', named: true },
      { r: 0.705, label: '0.705', color: 'rgba(224,179,65,.55)', named: false },
      { r: 0.786, label: '0.786', color: 'rgba(224,179,65,.85)', named: true },
      { r: 1, label: '1', color: 'rgba(148,163,184,.7)', named: false },
    ];
    ratios.forEach((x) => {
      lines.push({
        price: base(x.r),
        fromIndex: legStart,
        toIndex: null,
        color: x.color,
        dashed: x.r !== 0 && x.r !== 1,
        width: x.r === 0.618 ? 1.5 : 1,
        label: x.named ? `فيبو ${x.label} · ${roundPrice(base(x.r))}` : null,
        labelAt: 'end',
      });
    });

    // امتدادات لأهداف ما بعد الساق
    [
      { v: imp.ext.e1272, label: 'امتداد 1.272' },
      { v: imp.ext.e1618, label: 'امتداد 1.618' },
    ].forEach((x) => {
      lines.push({
        price: x.v,
        fromIndex: Math.max(legStart, bars.length - 80),
        toIndex: null,
        color: 'rgba(167,139,250,.65)',
        dashed: true,
        label: `${x.label} · ${roundPrice(x.v)}`,
        labelAt: 'end',
      });
    });
  }

  /* --- نقاط الالتقاء: أهم ما يميّز التحليل --- */
  if (state.layers.has('confluence')) {
    // على الرسم نكتفي بأقوى منطقتين من كل جهة؛ البقية في لوحة التحليل
    const C = state.confluence;
    [...C.supports.slice(0, 2), ...C.resistances.slice(0, 2)].forEach((z) => {
      const strong = z.reliable;
      const isSup = z.side === 'support';
      const rgb = isSup ? '23,178,106' : '229,72,77';
      const alpha = strong ? 0.26 : 0.14;
      zones.push({
        top: z.high,
        bottom: z.low,
        fromIndex: Math.max(0, bars.length - 90),
        toIndex: null,
        fill: `rgba(${rgb},${alpha})`,
        stroke: `rgba(${rgb},${strong ? 0.85 : 0.4})`,
        label:
          `${strong ? '⭐ ' : ''}${isSup ? 'دعم' : 'مقاومة'} التقاء ${z.strength} · ` +
          `${z.catCount} عوامل` +
          (z.reaction.touches >= 2 ? ` · ارتدّ ${z.reaction.bounces}/${z.reaction.touches}` : ''),
        labelColor: `rgba(${rgb},1)`,
      });
    });
  }

  /* --- مناطق الأوامر --- */
  if (state.layers.has('ob') && A.orderBlock) {
    const ob = A.orderBlock;
    zones.push({
      top: ob.top,
      bottom: ob.bottom,
      fromIndex: ob.index,
      toIndex: null,
      fill: ob.dir === 'bull' ? 'rgba(59,130,246,.14)' : 'rgba(168,85,247,.14)',
      stroke: 'rgba(59,130,246,.4)',
      label: 'منطقة أوامر',
      labelColor: 'rgba(96,165,250,.95)',
    });
  }

  /* --- أحداث البنية --- */
  const markers = [];
  if (state.layers.has('structure')) {
    // تغيّرات البنية (MSS) أهم من الكسور العادية، لذلك نعرض كل MSS حديث
    // وعددًا محدودًا من كسور BOS حتى لا يزدحم الرسم.
    const recent = A.events.slice(-14);
    const mss = recent.filter((e) => e.kind === 'MSS').slice(-4);
    const bos = recent.filter((e) => e.kind === 'BOS').slice(-3);
    const shown = [...mss, ...bos].sort((a, b) => a.breakIndex - b.breakIndex);

    shown.forEach((e) => {
      lines.push({
        price: e.level,
        fromIndex: e.pivotIndex,
        toIndex: e.breakIndex,
        color: e.kind === 'MSS' ? '#3b82f6' : 'rgba(148,163,184,.7)',
        width: e.kind === 'MSS' ? 1.6 : 1,
        label: e.kind,
      });
      markers.push({
        time: bars[e.breakIndex].time,
        position: e.dir === 'bull' ? 'belowBar' : 'aboveBar',
        color: e.dir === 'bull' ? '#17b26a' : '#e5484d',
        shape: e.dir === 'bull' ? 'arrowUp' : 'arrowDown',
        text: e.kind,
      });
    });
  }
  cm.setMarkers(markers);

  /* --- السيولة --- */
  if (state.layers.has('liquidity')) {
    A.liquidity.slice(-4).forEach((l) => {
      lines.push({
        price: l.price,
        fromIndex: indexAtTime(bars, l.firstTime),
        toIndex: null,
        color: l.type === 'buyside' ? 'rgba(229,72,77,.55)' : 'rgba(23,178,106,.55)',
        dashed: true,
        label: l.type === 'buyside' ? 'سيولة أعلى' : 'سيولة أسفل',
        labelAt: 'end',
      });
    });
  }

  /* --- مستويات خطة التداول كخطوط سعرية على المحور --- */
  cm.clearPriceLines();
  if (state.layers.has('plan') && plan && plan.ok && plan.direction !== 'none') {
    const e = plan.entries;
    if (e.ideal) {
      const long = plan.direction === 'long';
      zones.push({
        top: Math.max(e.ideal.top, e.ideal.bottom),
        bottom: Math.min(e.ideal.top, e.ideal.bottom),
        fromIndex: Math.max(0, bars.length - 60),
        toIndex: null,
        fill: long ? 'rgba(23,178,106,.2)' : 'rgba(229,72,77,.18)',
        stroke: long ? 'rgba(23,178,106,.55)' : 'rgba(229,72,77,.5)',
        label: `${plan.sideWord} مثالي ${e.ideal.bottom} – ${e.ideal.top}`,
        labelColor: long ? 'rgba(23,178,106,1)' : 'rgba(248,113,113,1)',
      });
    }
    if (e.confirmed != null)
      cm.addPriceLine({ price: e.confirmed, color: '#3b82f6', title: 'مؤكد', dashed: true });
    if (e.early != null)
      cm.addPriceLine({ price: e.early, color: '#f59e0b', title: 'مبكر', dashed: true });
    if (plan.stop != null)
      cm.addPriceLine({ price: plan.stop, color: '#e5484d', title: 'وقف', dashed: false });
    plan.targets.forEach((t, i) =>
      cm.addPriceLine({ price: t.price, color: '#17b26a', title: `هدف ${i + 1}`, dashed: true })
    );
  }

  cm.setOverlayData({ zones, lines, labels });
}

/* ------------------------------------------------------------------ */
/* لوحة التحليل                                                         */
/* ------------------------------------------------------------------ */

function renderAnalysisPanel() {
  const plan = state.plan;
  const A = state.analysis;
  if (!plan || !plan.ok) return;

  const grade = $('an-grade');
  grade.textContent =
    plan.direction === 'long' ? 'نظرة صاعدة' : plan.direction === 'short' ? 'نظرة هابطة' : 'محايدة';
  grade.className = 'badge ' + (plan.direction === 'long' ? 'bull' : plan.direction === 'short' ? 'bear' : '');

  $('conf-fill').style.width = plan.confidence + '%';
  $('conf-text').textContent = `درجة الثقة ${plan.confidence}% — فرصة ${plan.grade}`;
  $('an-summary').textContent = plan.summary;

  /* المستويات */
  const lv = $('an-levels');
  lv.innerHTML = '';
  const addLevel = (label, value, color, sub) => {
    if (value == null || value === '') return;
    const d = document.createElement('div');
    d.className = 'lvl';
    d.style.borderInlineStartColor = color;
    const left = document.createElement('div');
    left.className = 'left';
    const t = document.createElement('span');
    t.textContent = label;
    left.appendChild(t);
    if (sub) {
      const s = document.createElement('span');
      s.className = 'sub';
      s.textContent = sub;
      left.appendChild(s);
    }
    const v = document.createElement('span');
    v.className = 'v';
    v.textContent = value;
    d.append(left, v);
    lv.appendChild(d);
  };

  const e = plan.entries;
  addLevel('السعر الحالي', fmtPrice(plan.price), '#64748b');
  if (e.ideal)
    addLevel(
      `منطقة ال${plan.sideWord} المثالية`,
      `${e.ideal.bottom} – ${e.ideal.top}`,
      '#17b26a',
      plan.idealSource + (plan.rr.ideal ? ` · عائد/مخاطرة ${plan.rr.ideal}` : '')
    );
  addLevel('دخول مبكر', e.early, '#f59e0b', plan.rr.early ? `عائد/مخاطرة ${plan.rr.early}` : '');
  addLevel(
    'دخول مؤكد (بعد الكسر)',
    e.confirmed,
    '#3b82f6',
    plan.rr.confirmed ? `عائد/مخاطرة ${plan.rr.confirmed}` : ''
  );
  addLevel('التوازن', plan.equilibrium, '#94a3b8');
  addLevel('وقف الخسارة', plan.stop, '#e5484d');
  plan.targets.forEach((t, i) => addLevel(`هدف ${i + 1}`, t.price, '#17b26a', t.label));

  /* توافق الأطر */
  const htf = $('an-htf');
  htf.innerHTML = '';
  const mk = (label, bias) => {
    const s = document.createElement('span');
    const txt = bias == null ? '—' : labelBias(bias);
    s.textContent = `${label}: ${txt}`;
    s.className = bias === 'bull' ? 'up' : bias === 'bear' ? 'down' : '';
    htf.appendChild(s);
  };
  mk('الفريم الحالي', plan.bias);
  mk('اليومي', plan.htf.daily);
  mk('الأسبوعي', plan.htf.weekly);
  if (plan.rsi != null) {
    const s = document.createElement('span');
    s.textContent = `RSI: ${plan.rsi}`;
    htf.appendChild(s);
  }

  renderConfluencePanel();

  /* قائمة التحقق */
  const ck = $('an-checklist');
  ck.innerHTML = '';
  plan.checklist.forEach((c) => {
    const li = document.createElement('li');
    li.className = c.ok ? 'yes' : 'no';
    const mkEl = document.createElement('span');
    mkEl.className = 'mk';
    mkEl.textContent = c.ok ? '✅' : '▫️';
    const tx = document.createElement('span');
    tx.textContent = c.text;
    li.append(mkEl, tx);
    ck.appendChild(li);
  });

  /* الأحداث */
  const ev = $('an-events');
  ev.innerHTML = '';
  (A.events || [])
    .slice(-6)
    .reverse()
    .forEach((x) => {
      const li = document.createElement('li');
      const a = document.createElement('span');
      a.textContent = `${x.kind} ${x.dir === 'bull' ? 'صاعد' : 'هابط'}`;
      a.className = x.dir === 'bull' ? 'up' : 'down';
      const b = document.createElement('span');
      b.className = 'muted small';
      b.textContent = `${roundPrice(x.level)} · ${new Date(x.breakTime * 1000).toLocaleDateString('ar-EG')}`;
      li.append(a, b);
      ev.appendChild(li);
    });
}

function renderConfluencePanel() {
  const el = $('an-confluence');
  el.innerHTML = '';
  const zones = state.confluence.all;

  if (!zones.length) {
    const p = document.createElement('div');
    p.className = 'muted small';
    p.textContent = 'لا توجد نقاط التقاء معتبرة قريبة من السعر الآن.';
    el.appendChild(p);
    return;
  }

  zones.forEach((z) => {
    const isSup = z.side === 'support';
    const d = document.createElement('div');
    d.className = 'conf-item ' + (isSup ? 'sup' : 'res');
    d.title = 'اضغط لضبط تنبيه عند دخول هذه المنطقة';

    const head = document.createElement('div');
    head.className = 'ch';
    const zone = document.createElement('span');
    zone.className = 'zone';
    zone.textContent = `${roundPrice(z.low)} – ${roundPrice(z.high)}`;
    const verdict = document.createElement('span');
    verdict.className = 'verdict ' + (isSup ? 'up' : 'down');
    verdict.textContent = `${isSup ? 'دعم' : 'مقاومة'} · ${z.strength}`;
    head.append(zone, verdict);

    const meter = document.createElement('div');
    meter.className = 'meter';
    const fill = document.createElement('i');
    fill.style.width = z.strength + '%';
    fill.style.background = isSup ? 'var(--up)' : 'var(--down)';
    meter.appendChild(fill);

    const verdictLine = document.createElement('div');
    verdictLine.className = 'small';
    verdictLine.style.marginBottom = '4px';
    verdictLine.textContent =
      z.verdict + ` · ${z.distancePct >= 0 ? '+' : ''}${z.distancePct.toFixed(1)}% عن السعر`;

    const chips = document.createElement('div');
    chips.className = 'chips';
    z.factors.forEach((f) => {
      const s = document.createElement('span');
      s.textContent = f.label;
      chips.appendChild(s);
    });

    d.append(head, meter, verdictLine, chips);

    if (z.reaction.touches >= 2) {
      const r = document.createElement('div');
      r.className = 'react';
      r.textContent =
        `تاريخيًا: اقترب منها السعر ${z.reaction.touches} مرات، ارتدّ ${z.reaction.bounces}` +
        (z.reaction.breaks ? ` واخترقها ${z.reaction.breaks}` : '') +
        ` (${Math.round(z.reaction.rate * 100)}٪ ارتداد)`;
      d.appendChild(r);
    }

    d.onclick = async () => {
      await Alerts.requestPermission();
      Alerts.add({
        symbol: state.symbol,
        type: 'zone',
        low: roundPrice(z.low),
        high: roundPrice(z.high),
      });
      toast(`تنبيه عند دخول منطقة ${roundPrice(z.low)} – ${roundPrice(z.high)}`);
    };

    el.appendChild(d);
  });
}

/* ------------------------------------------------------------------ */
/* مؤشر OHLC أعلى الرسم                                                 */
/* ------------------------------------------------------------------ */

/** قيم المتوسطات عند آخر شمعة — تُعرض بجوار بيانات الشمعة */
function maLegend(bars) {
  const defs = [
    ['ema20', 20, '#2bb673', 'EMA20'],
    ['ema50', 50, '#f0a33c', 'EMA50'],
    ['ema200', 200, '#e05c5c', 'EMA200'],
  ].filter(([id]) => state.indicators.has(id));
  if (!defs.length) return '';

  const cl = bars.map((b) => b.close);
  return defs
    .map(([, period, color, label]) => {
      if (bars.length < period) return '';
      const v = Ind.ema(cl, period);
      const last = v[v.length - 1];
      if (last == null) return '';
      return ` <span style="color:${color}">${label} <b style="color:${color}">${fmtPrice(
        last
      )}</b></span>`;
    })
    .join('');
}

cm.onCrosshair = (param) => {
  const bars = replay.active ? replay.visibleBars : state.bars;
  if (!bars.length) return;
  let bar = bars[bars.length - 1];
  if (param && param.time) {
    const found = bars.find((b) => b.time === param.time);
    if (found) bar = found;
  }
  const up = bar.close >= bar.open;
  $('ohlc').innerHTML =
    `<span class="${up ? 'up' : 'down'}">` +
    `O <b>${fmtPrice(bar.open)}</b> H <b>${fmtPrice(bar.high)}</b> ` +
    `L <b>${fmtPrice(bar.low)}</b> C <b>${fmtPrice(bar.close)}</b> ` +
    `V <b>${nfVol.format(bar.volume || 0)}</b></span>` +
    maLegend(bars);
};

/* ------------------------------------------------------------------ */
/* التنبيهات                                                            */
/* ------------------------------------------------------------------ */

function renderAlerts() {
  const list = $('alerts-list');
  list.innerHTML = '';
  const all = Alerts.all();
  const fired = all.filter((a) => a.triggeredAt).length;
  $('alerts-count').textContent = fired ? String(fired) : '';

  if (!all.length) {
    const p = document.createElement('div');
    p.className = 'muted small';
    p.style.padding = '14px';
    p.textContent = 'لا توجد تنبيهات بعد.';
    list.appendChild(p);
    return;
  }

  all.forEach((a) => {
    const d = document.createElement('div');
    d.className = 'alert-item' + (a.triggeredAt ? ' fired' : '');
    const left = document.createElement('div');
    const dd = describe(a.symbol);
    left.innerHTML =
      `<b>${dd ? dd.ar : a.symbol}</b><br><span class="muted small">${Alerts.describe(a)}` +
      (a.triggeredAt ? ' · انطلق ✅' : a.active ? '' : ' · موقوف') +
      '</span>';
    const x = document.createElement('button');
    x.className = 'x';
    x.textContent = '×';
    x.onclick = (ev) => {
      ev.stopPropagation();
      Alerts.remove(a.id);
    };
    d.onclick = () => selectSymbol(a.symbol);
    d.append(left, x);
    list.appendChild(d);
  });
}

function checkAlertsFor(price) {
  const prev = state.lastPrice;
  state.lastPrice = price;
  const fired = Alerts.check(state.symbol, price, prev);
  fired.forEach((a) => {
    const d = describe(a.symbol);
    const title = `تنبيه: ${d ? d.ar : a.symbol}`;
    const body = `${Alerts.describe(a)} — السعر الآن ${fmtPrice(price)}`;
    Alerts.notify(title, body);
    toast(`${title} — ${body}`, 'warn');
  });
}

Alerts.onChange(renderAlerts);

/* ------------------------------------------------------------------ */
/* إعادة التشغيل                                                        */
/* ------------------------------------------------------------------ */

function enterReplay() {
  if (!state.bars.length) return;
  $('replay-bar').hidden = false;
  $('btn-replay').classList.add('active');
  replay.start(state.bars);
  toast('وضع إعادة التشغيل: التحليل يُحسب من جديد مع كل شمعة.');
}

function exitReplay() {
  replay.stop();
  $('replay-bar').hidden = true;
  $('btn-replay').classList.remove('active');
  cm.setBars(state.bars);
  recompute(state.bars);
}

function renderReplayState(s) {
  if (!s.active) return;
  $('rp-play').textContent = s.playing ? '⏸' : '▶';
  $('rp-seek').value = String(Math.round((s.index / Math.max(1, s.total - 1)) * 1000));
  if (s.bar) {
    const d = new Date(s.bar.time * 1000);
    $('rp-info').textContent = `${d.toLocaleDateString('ar-EG')} · شمعة ${s.index + 1} من ${s.total}`;
  }
}

/* ------------------------------------------------------------------ */
/* ربط الأزرار                                                          */
/* ------------------------------------------------------------------ */

function wireUI() {
  // التبويبات الجانبية
  $('side-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    document.querySelectorAll('#side-tabs .tab').forEach((t) => t.classList.toggle('active', t === btn));
    document
      .querySelectorAll('.tab-panel')
      .forEach((p) => (p.hidden = p.dataset.panel !== btn.dataset.tab));
  });

  // المفضلة
  $('btn-fav').onclick = () => {
    const i = state.watchlist.indexOf(state.symbol);
    if (i === -1) state.watchlist = [state.symbol, ...state.watchlist];
    else state.watchlist = state.watchlist.filter((s) => s !== state.symbol);
    save('watchlist', state.watchlist);
    renderHeader();
    renderWatchlist();
    refreshQuotes();
  };

  // المؤشرات
  $('btn-indicators').onclick = (e) => {
    e.stopPropagation();
    $('ind-menu').hidden = !$('ind-menu').hidden;
  };
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#ind-menu') && !e.target.closest('#btn-indicators'))
      $('ind-menu').hidden = true;
  });

  // المظهر
  $('btn-theme').onclick = () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    save('theme', state.theme);
    document.body.dataset.theme = state.theme;
    $('btn-theme').textContent = state.theme === 'dark' ? '🌙' : '☀️';
    cm.setTheme(state.theme);
    drawIndicators();
    drawAnalysisLayers();
  };
  $('btn-theme').textContent = state.theme === 'dark' ? '🌙' : '☀️';

  $('btn-refresh').onclick = () => loadSymbol();

  // فتح/إغلاق لوحة الخطة على الشاشات الضيقة
  $('btn-plan').onclick = () => $('analysis').classList.toggle('show');
  $('an-close').onclick = () => $('analysis').classList.remove('show');

  // إعادة التشغيل
  $('btn-replay').onclick = () => (replay.active ? exitReplay() : enterReplay());
  $('rp-play').onclick = () => replay.toggle();
  $('rp-fwd').onclick = () => replay.step(1);
  $('rp-back').onclick = () => replay.step(-1);
  $('rp-exit').onclick = exitReplay;
  $('rp-seek').oninput = (e) => replay.seekRatio(Number(e.target.value) / 1000);
  $('rp-speed').onchange = (e) => replay.setSpeed(Number(e.target.value));

  // التنبيهات
  $('alert-add').onclick = async () => {
    const price = Number($('alert-price').value);
    if (!price) return toast('أدخل سعرًا صحيحًا للتنبيه.');
    await Alerts.requestPermission();
    Alerts.add({ symbol: state.symbol, price, direction: $('alert-dir').value, type: 'price' });
    $('alert-price').value = '';
    toast('تم ضبط التنبيه.');
  };

  $('alert-zone').onclick = async () => {
    const z = state.plan && state.plan.ok && state.plan.entries.ideal;
    if (!z) return toast('لا توجد منطقة مثالية محددة حاليًا.');
    await Alerts.requestPermission();
    Alerts.add({
      symbol: state.symbol,
      type: 'zone',
      low: Math.min(z.bottom, z.top),
      high: Math.max(z.bottom, z.top),
    });
    toast(`تنبيه عند دخول المنطقة ${z.bottom} – ${z.top}`);
  };

  // اختصارات لوحة المفاتيح
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.key === ' ' && replay.active) {
      e.preventDefault();
      replay.toggle();
    }
    if (e.key === 'ArrowLeft' && replay.active) replay.step(-1);
    if (e.key === 'ArrowRight' && replay.active) replay.step(1);
    if (e.key === 'r') replay.active ? exitReplay() : enterReplay();
  });
}

/* ------------------------------------------------------------------ */
/* التشغيل                                                              */
/* ------------------------------------------------------------------ */

function init() {
  buildTimeframes();
  buildIndicatorMenu();
  buildLayerToggles();
  renderMarkets();
  renderWatchlist();
  renderAlerts();
  setupSearch();
  wireUI();
  loadSymbol();
  refreshQuotes();

  // تحديث دوري
  setInterval(() => {
    if (!replay.active && !document.hidden) {
      refreshQuotes();
      api
        .chart(state.symbol, state.tf)
        .then((d) => {
          if (!d.bars || !d.bars.length) return;
          state.bars = d.bars;
          state.meta = d.meta;
          renderHeader();
          cm.setBars(state.bars, { keepView: true });
          recompute(state.bars);
          checkAlertsFor(d.meta.price ?? d.bars[d.bars.length - 1].close);
        })
        .catch(() => {});
    }
  }, 60000);
}

init();
