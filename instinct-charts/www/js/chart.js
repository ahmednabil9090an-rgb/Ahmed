/*
 * إدارة الرسم البياني:
 *  - نافذة السعر (شموع) + نوافذ فرعية متزامنة (أحجام / RSI / MACD / WaveTrend)
 *  - طبقة رسم إضافية فوق نافذة السعر للمناطق (FVG / OTE / أوردر بلوك) وتسمياتها
 */

import * as I from './indicators.js';
import { turnoverSeries, obv, moneyFlowIndex, turnoverUnit } from './liquidity.js';

const LWC = window.LightweightCharts;

export const THEMES = {
  dark: {
    bg: '#0e1117',
    grid: '#1b2130',
    text: '#9aa4b8',
    border: '#222a3a',
    up: '#17b26a',
    down: '#e5484d',
    crosshair: '#5b6478',
  },
  light: {
    bg: '#ffffff',
    grid: '#eef1f6',
    text: '#5b6478',
    border: '#dfe4ec',
    up: '#0ca678',
    down: '#e03131',
    crosshair: '#98a2b3',
  },
};

function baseOptions(theme) {
  const t = THEMES[theme];
  return {
    layout: {
      background: { type: 'solid', color: t.bg },
      textColor: t.text,
      fontFamily:
        "'IBM Plex Sans Arabic', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize: 11,
    },
    grid: {
      vertLines: { color: t.grid },
      horzLines: { color: t.grid },
    },
    rightPriceScale: { borderColor: t.border, scaleMargins: { top: 0.12, bottom: 0.12 } },
    timeScale: { borderColor: t.border, rightOffset: 6, barSpacing: 8 },
    crosshair: {
      mode: LWC.CrosshairMode.Normal,
      vertLine: { color: t.crosshair, width: 1, style: 2, labelBackgroundColor: t.crosshair },
      horzLine: { color: t.crosshair, width: 1, style: 2, labelBackgroundColor: t.crosshair },
    },
    handleScale: { axisPressedMouseMove: { time: true, price: true } },
    localization: {
      locale: 'ar-EG',
      priceFormatter: (p) =>
        Math.abs(p) >= 1000 ? p.toFixed(1) : Math.abs(p) >= 1 ? p.toFixed(2) : p.toFixed(4),
    },
  };
}

export class ChartManager {
  constructor(containers, theme = 'dark') {
    this.theme = theme;
    this.containers = containers; // { price, sub1, sub2 }
    this.syncing = false;
    this.bars = [];
    this.priceLines = [];
    this.overlays = { zones: [], lines: [], labels: [] };
    this.subPanes = new Map(); // id -> { chart, series:[] }

    this.priceChart = LWC.createChart(containers.price, {
      ...baseOptions(theme),
      autoSize: true,
    });
    this.candles = this.priceChart.addCandlestickSeries({
      upColor: THEMES[theme].up,
      downColor: THEMES[theme].down,
      borderUpColor: THEMES[theme].up,
      borderDownColor: THEMES[theme].down,
      wickUpColor: THEMES[theme].up,
      wickDownColor: THEMES[theme].down,
      priceLineVisible: true,
      lastValueVisible: true,
    });

    this.overlaySeries = new Map(); // id -> series (على نافذة السعر)

    this._buildOverlayCanvas();
    this._wireSync(this.priceChart);
    this._wireCrosshair();
  }

  /* ---------------------------------------------------------- */
  /* طبقة الرسم الإضافية                                          */
  /* ---------------------------------------------------------- */

  _buildOverlayCanvas() {
    const el = document.createElement('canvas');
    el.className = 'chart-overlay';
    this.containers.price.appendChild(el);
    this.overlayCanvas = el;
    this.ctx = el.getContext('2d');

    const redraw = () => this.drawOverlay();
    this.priceChart.timeScale().subscribeVisibleLogicalRangeChange(redraw);
    this.priceChart.subscribeCrosshairMove(() => {}); // يبقي التفاعل سلسًا
    this._ro = new ResizeObserver(() => {
      this._sizeOverlay();
      this.drawOverlay();
    });
    this._ro.observe(this.containers.price);
    this._sizeOverlay();
  }

  _sizeOverlay() {
    const r = this.containers.price.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.overlayCanvas.width = Math.max(1, Math.floor(r.width * dpr));
    this.overlayCanvas.height = Math.max(1, Math.floor(r.height * dpr));
    this.overlayCanvas.style.width = r.width + 'px';
    this.overlayCanvas.style.height = r.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** يحوّل رقم الشمعة إلى إحداثي أفقي */
  _x(index) {
    const c = this.priceChart.timeScale().logicalToCoordinate(index);
    return c == null ? null : c;
  }

  _y(price) {
    const c = this.candles.priceToCoordinate(price);
    return c == null ? null : c;
  }

  setOverlayData({ zones = [], lines = [], labels = [] } = {}) {
    this.overlays = { zones, lines, labels };
    this.drawOverlay();
  }

  drawOverlay() {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.overlayCanvas.width / (window.devicePixelRatio || 1);
    const h = this.overlayCanvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);
    let priceAxisWidth = 58;
    try {
      const pw = this.priceChart.priceScale('right').width();
      if (pw && isFinite(pw)) priceAxisWidth = pw;
    } catch {
      /* نستخدم القيمة الافتراضية */
    }
    const right = w - priceAxisWidth;

    // المناطق المستطيلة
    for (const z of this.overlays.zones) {
      const yTop = this._y(z.top);
      const yBottom = this._y(z.bottom);
      if (yTop == null || yBottom == null) continue;
      let x1 = this._x(z.fromIndex);
      if (x1 == null) x1 = 0;
      x1 = Math.max(0, x1);
      let x2 = z.toIndex != null ? this._x(z.toIndex) : right;
      if (x2 == null) x2 = right;
      x2 = Math.min(right, Math.max(x1 + 2, x2));
      if (x2 <= 0 || x1 >= right) continue;

      const top = Math.min(yTop, yBottom);
      const height = Math.max(1.5, Math.abs(yBottom - yTop));

      ctx.fillStyle = z.fill;
      ctx.fillRect(x1, top, x2 - x1, height);

      if (z.stroke) {
        ctx.strokeStyle = z.stroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(x1 + 0.5, top + 0.5, x2 - x1 - 1, height - 1);
      }

      if (z.label && height > 12) {
        ctx.font = '600 10px "IBM Plex Sans Arabic", sans-serif';
        ctx.textBaseline = 'top';
        const tw = ctx.measureText(z.label).width;
        const tx = Math.min(Math.max(x1 + 5, 5), Math.max(5, right - tw - 6));
        ctx.fillStyle = this.theme === 'dark' ? 'rgba(11,14,20,.72)' : 'rgba(255,255,255,.78)';
        ctx.fillRect(tx - 3, top + 1.5, tw + 6, 12);
        ctx.fillStyle = z.labelColor || '#c7cede';
        ctx.fillText(z.label, tx, top + 2);
      }
    }

    // الخطوط الأفقية القصيرة (مثل مستوى الكسر في MSS)
    for (const l of this.overlays.lines) {
      const y = this._y(l.price);
      if (y == null) continue;
      let x1 = this._x(l.fromIndex);
      let x2 = l.toIndex != null ? this._x(l.toIndex) : right;
      if (x1 == null) x1 = 0;
      if (x2 == null) x2 = right;
      x1 = Math.max(0, x1);
      x2 = Math.min(right, x2);
      if (x2 - x1 < 2) continue;

      ctx.save();
      ctx.strokeStyle = l.color;
      ctx.lineWidth = l.width || 1.2;
      if (l.dashed) ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, y + 0.5);
      ctx.lineTo(x2, y + 0.5);
      ctx.stroke();
      ctx.restore();

      if (l.label) {
        ctx.font = '600 10px "IBM Plex Sans Arabic", sans-serif';
        const tw = ctx.measureText(l.label).width;
        // الوضع "end" يضع التسمية عند نهاية الخط بدل منتصفه (أقل ازدحامًا)
        const cx =
          l.labelAt === 'end'
            ? Math.max(x1, Math.min(x2 - tw - 6, right - tw - 6))
            : (x1 + x2) / 2 - tw / 2;
        ctx.fillStyle =
          l.labelBg || (this.theme === 'dark' ? 'rgba(11,14,20,.82)' : 'rgba(255,255,255,.85)');
        ctx.fillRect(cx - 4, y - 14, tw + 8, 13);
        ctx.fillStyle = l.color;
        ctx.textBaseline = 'top';
        ctx.fillText(l.label, cx, y - 13);
      }
    }

    // تسميات حرة عند شمعة/سعر محدد
    for (const t of this.overlays.labels) {
      const x = this._x(t.index);
      const y = this._y(t.price);
      if (x == null || y == null) continue;
      ctx.font = '600 10px "IBM Plex Sans Arabic", sans-serif';
      const tw = ctx.measureText(t.text).width;
      ctx.fillStyle = t.bg || 'rgba(37,99,235,.9)';
      ctx.fillRect(x - tw / 2 - 5, y - 8, tw + 10, 16);
      ctx.fillStyle = t.color || '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.text, x - tw / 2, y);
    }
  }

  /* ---------------------------------------------------------- */
  /* المزامنة بين النوافذ                                         */
  /* ---------------------------------------------------------- */

  _wireSync(chart) {
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (this.syncing || !range) return;
      this.syncing = true;
      this.allCharts().forEach((c) => {
        if (c !== chart) c.timeScale().setVisibleLogicalRange(range);
      });
      this.syncing = false;
    });
  }

  _wireCrosshair() {
    this.priceChart.subscribeCrosshairMove((param) => {
      if (this.onCrosshair) this.onCrosshair(param);
    });
  }

  allCharts() {
    return [this.priceChart, ...[...this.subPanes.values()].map((p) => p.chart)];
  }

  /* ---------------------------------------------------------- */
  /* البيانات                                                     */
  /* ---------------------------------------------------------- */

  /**
   * @param focusLast عدد الشموع المعروضة ابتداءً — أوضح بكثير من عرض
   *                  السلسلة كاملة، خاصة على شاشة الهاتف.
   */
  setBars(bars, { keepView = false, focusLast = 120 } = {}) {
    this.bars = bars;
    const data = bars.map((b) => ({
      time: b.time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    const range = keepView ? this.priceChart.timeScale().getVisibleLogicalRange() : null;
    this.candles.setData(data);
    if (range) {
      this.priceChart.timeScale().setVisibleLogicalRange(range);
    } else if (focusLast && bars.length > focusLast) {
      this.priceChart
        .timeScale()
        .setVisibleLogicalRange({ from: bars.length - focusLast, to: bars.length + 4 });
    } else {
      this.priceChart.timeScale().fitContent();
    }
  }

  /** تحديث آخر شمعة فقط (مفيد في وضع إعادة التشغيل والتحديث الحي) */
  updateLast(bar) {
    this.candles.update({
      time: bar.time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    });
  }

  /* ---------------------------------------------------------- */
  /* مؤشرات على نافذة السعر                                       */
  /* ---------------------------------------------------------- */

  clearPriceOverlays() {
    this.overlaySeries.forEach((s) => this.priceChart.removeSeries(s));
    this.overlaySeries.clear();
  }

  addLineOverlay(id, values, color, width = 1.4, dashed = false) {
    const s = this.priceChart.addLineSeries({
      color,
      lineWidth: width,
      priceLineVisible: false,
      lastValueVisible: false,
      lineStyle: dashed ? 2 : 0,
      crosshairMarkerVisible: false,
    });
    s.setData(
      this.bars
        .map((b, i) => ({ time: b.time, value: values[i] }))
        .filter((p) => p.value != null)
    );
    this.overlaySeries.set(id, s);
    return s;
  }

  /* ---------------------------------------------------------- */
  /* النوافذ الفرعية                                              */
  /* ---------------------------------------------------------- */

  clearSubPanes() {
    this.subPanes.forEach((p) => {
      p.chart.remove();
      p.el.remove();
    });
    this.subPanes.clear();
  }

  addSubPane(id, title, height = 110) {
    const wrap = document.createElement('div');
    wrap.className = 'sub-pane';
    wrap.style.height = height + 'px';
    const label = document.createElement('span');
    label.className = 'pane-title';
    label.textContent = title;
    wrap.appendChild(label);
    this.containers.subs.appendChild(wrap);

    const chart = LWC.createChart(wrap, {
      ...baseOptions(this.theme),
      autoSize: true,
      timeScale: { ...baseOptions(this.theme).timeScale, visible: false },
      rightPriceScale: {
        borderColor: THEMES[this.theme].border,
        scaleMargins: { top: 0.15, bottom: 0.1 },
      },
      handleScroll: true,
      handleScale: true,
    });
    this._wireSync(chart);
    const pane = { chart, el: wrap, series: [] };
    this.subPanes.set(id, pane);

    // مزامنة فورية مع النافذة الرئيسية
    const r = this.priceChart.timeScale().getVisibleLogicalRange();
    if (r) chart.timeScale().setVisibleLogicalRange(r);
    return pane;
  }

  /* ---------------------------------------------------------- */
  /* خطوط الأسعار (خطة التداول)                                   */
  /* ---------------------------------------------------------- */

  clearPriceLines() {
    this.priceLines.forEach((l) => this.candles.removePriceLine(l));
    this.priceLines = [];
  }

  addPriceLine({ price, color, title, dashed = true, width = 1 }) {
    if (price == null || !isFinite(price)) return null;
    const line = this.candles.createPriceLine({
      price,
      color,
      lineWidth: width,
      lineStyle: dashed ? 2 : 0,
      axisLabelVisible: true,
      title,
    });
    this.priceLines.push(line);
    return line;
  }

  setMarkers(markers) {
    this.candles.setMarkers(markers);
  }

  /* ---------------------------------------------------------- */

  setTheme(theme) {
    this.theme = theme;
    const t = THEMES[theme];
    const opts = baseOptions(theme);
    this.priceChart.applyOptions(opts);
    this.candles.applyOptions({
      upColor: t.up,
      downColor: t.down,
      borderUpColor: t.up,
      borderDownColor: t.down,
      wickUpColor: t.up,
      wickDownColor: t.down,
    });
    this.subPanes.forEach((p) =>
      p.chart.applyOptions({ ...opts, timeScale: { ...opts.timeScale, visible: false } })
    );
    this.drawOverlay();
  }

  fit() {
    this.priceChart.timeScale().fitContent();
  }
}

/* ------------------------------------------------------------------ */
/* بناء النوافذ الفرعية حسب المؤشرات المفعّلة                           */
/* ------------------------------------------------------------------ */

export function renderSubPanes(cm, bars, active) {
  cm.clearSubPanes();
  const t = THEMES[cm.theme];

  // على الهاتف المساحة ضيقة: نكتفي بأول نافذتين فرعيتين وبارتفاع أقل،
  // حتى تبقى نافذة السعر هي الأكبر.
  const narrow = window.innerWidth <= 820;
  const maxPanes = narrow ? (window.innerHeight >= 760 ? 2 : 1) : 4;
  const order = ['liquidity', 'obv', 'mfi', 'volume', 'rsi', 'macd', 'wt'];
  const shown = new Set(order.filter((id) => active.has(id)).slice(0, maxPanes));
  const h = (full) => (narrow ? 74 : full);

  /* السيولة: قيمة التداول لكل شمعة ومتوسطها — يرى المتداول فورًا
     إن كانت الأموال تتدفّق على الأداة أم تنسحب منها */
  if (shown.has('liquidity')) {
    const unit = turnoverUnit(cm.symbol);
    const pane = cm.addSubPane(
      'liquidity',
      unit === 'currency' ? 'السيولة — قيمة التداول' : 'السيولة — عدد العقود',
      h(92)
    );
    const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
    pane.chart.applyOptions({ localization: { priceFormatter: (v) => compact.format(v) } });

    const activity = unit === 'currency' ? turnoverSeries(bars) : bars.map((b) => b.volume || 0);
    const hist = pane.chart.addHistogramSeries({ priceLineVisible: false });
    hist.setData(
      bars.map((b, i) => ({
        time: b.time,
        value: activity[i],
        color: b.close >= b.open ? 'rgba(23,178,106,.6)' : 'rgba(229,72,77,.6)',
      }))
    );
    const avg = I.sma(activity, 20);
    const line = pane.chart.addLineSeries({
      color: '#e0b341',
      lineWidth: 1.6,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    line.setData(bars.map((b, i) => ({ time: b.time, value: avg[i] })).filter((p) => p.value != null));
    pane.series.push(hist, line);
  }

  /* الرصيد الحجمي التراكمي: اتجاهه يكشف التجميع أو التصريف */
  if (shown.has('obv')) {
    const pane = cm.addSubPane('obv', 'تدفّق السيولة التراكمي (OBV)', h(88));
    const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
    pane.chart.applyOptions({ localization: { priceFormatter: (v) => compact.format(v) } });
    const vals = obv(bars);
    const line = pane.chart.addLineSeries({ color: '#38bdf8', lineWidth: 1.8, priceLineVisible: false });
    line.setData(bars.map((b, i) => ({ time: b.time, value: vals[i] })));
    pane.series.push(line);
  }

  /* مؤشر تدفّق الأموال: مثل RSI لكنه موزون بالحجم */
  if (shown.has('mfi')) {
    const pane = cm.addSubPane('mfi', 'مؤشر تدفّق الأموال (MFI)', h(90));
    const vals = moneyFlowIndex(bars, 14);
    const line = pane.chart.addLineSeries({ color: '#34d399', lineWidth: 1.6, priceLineVisible: false });
    line.setData(bars.map((b, i) => ({ time: b.time, value: vals[i] })).filter((p) => p.value != null));
    [20, 50, 80].forEach((lvl) =>
      line.createPriceLine({
        price: lvl,
        color: lvl === 50 ? t.border : '#34d39955',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
      })
    );
    pane.series.push(line);
  }

  if (shown.has('volume')) {
    const pane = cm.addSubPane('volume', 'الأحجام', h(90));
    const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
    pane.chart.applyOptions({ localization: { priceFormatter: (v) => compact.format(v) } });
    const hist = pane.chart.addHistogramSeries({ priceLineVisible: false });
    hist.setData(
      bars.map((b) => ({
        time: b.time,
        value: b.volume || 0,
        color: b.close >= b.open ? 'rgba(23,178,106,.55)' : 'rgba(229,72,77,.55)',
      }))
    );
    const vmaVals = I.sma(bars.map((b) => b.volume || 0), 20);
    const vma = pane.chart.addLineSeries({ color: '#4c7dff', lineWidth: 1.4, priceLineVisible: false, lastValueVisible: false });
    vma.setData(bars.map((b, i) => ({ time: b.time, value: vmaVals[i] })).filter((p) => p.value != null));
    pane.series.push(hist, vma);
  }

  if (shown.has('rsi')) {
    const pane = cm.addSubPane('rsi', 'RSI 14', h(95));
    const vals = I.rsi(I.closes(bars), 14);
    const line = pane.chart.addLineSeries({ color: '#8b5cf6', lineWidth: 1.6, priceLineVisible: false });
    line.setData(bars.map((b, i) => ({ time: b.time, value: vals[i] })).filter((p) => p.value != null));
    [30, 50, 70].forEach((lvl) =>
      line.createPriceLine({
        price: lvl,
        color: lvl === 50 ? t.border : '#8b5cf655',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
      })
    );
    pane.series.push(line);
  }

  if (shown.has('macd')) {
    const pane = cm.addSubPane('macd', 'MACD 12/26/9', h(100));
    const m = I.macd(I.closes(bars));
    const hist = pane.chart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
    hist.setData(
      bars
        .map((b, i) => ({
          time: b.time,
          value: m.hist[i],
          color: (m.hist[i] ?? 0) >= 0 ? 'rgba(23,178,106,.6)' : 'rgba(229,72,77,.6)',
        }))
        .filter((p) => p.value != null)
    );
    const l1 = pane.chart.addLineSeries({ color: '#2563eb', lineWidth: 1.4, priceLineVisible: false });
    l1.setData(bars.map((b, i) => ({ time: b.time, value: m.line[i] })).filter((p) => p.value != null));
    const l2 = pane.chart.addLineSeries({ color: '#f59e0b', lineWidth: 1.4, priceLineVisible: false });
    l2.setData(bars.map((b, i) => ({ time: b.time, value: m.signal[i] })).filter((p) => p.value != null));
    pane.series.push(hist, l1, l2);
  }

  if (shown.has('wt')) {
    const pane = cm.addSubPane('wt', 'WaveTrend', h(95));
    const { wt1, wt2 } = I.waveTrend(bars);
    const l1 = pane.chart.addLineSeries({ color: '#22d3ee', lineWidth: 1.6, priceLineVisible: false });
    l1.setData(bars.map((b, i) => ({ time: b.time, value: wt1[i] })).filter((p) => p.value != null));
    const l2 = pane.chart.addLineSeries({ color: '#f97316', lineWidth: 1.4, priceLineVisible: false });
    l2.setData(bars.map((b, i) => ({ time: b.time, value: wt2[i] })).filter((p) => p.value != null));
    [-60, 0, 60].forEach((lvl) =>
      l1.createPriceLine({
        price: lvl,
        color: lvl === 0 ? t.border : '#22d3ee44',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
      })
    );
    pane.series.push(l1, l2);
  }
}

/* ------------------------------------------------------------------ */
/* مؤشرات نافذة السعر                                                  */
/* ------------------------------------------------------------------ */

export function renderPriceOverlays(cm, bars, active) {
  cm.clearPriceOverlays();
  const cl = I.closes(bars);
  if (active.has('ema20')) cm.addLineOverlay('ema20', I.ema(cl, 20), '#2bb673');
  if (active.has('ema50')) cm.addLineOverlay('ema50', I.ema(cl, 50), '#f0a33c');
  if (active.has('ema200')) cm.addLineOverlay('ema200', I.ema(cl, 200), '#e05c5c', 1.6);
  if (active.has('bb')) {
    const bb = I.bollinger(cl, 20, 2);
    cm.addLineOverlay('bbU', bb.upper, 'rgba(138,143,163,.75)', 1);
    cm.addLineOverlay('bbM', bb.mid, 'rgba(138,143,163,.45)', 1, true);
    cm.addLineOverlay('bbL', bb.lower, 'rgba(138,143,163,.75)', 1);
  }
  if (active.has('vwap')) cm.addLineOverlay('vwap', I.vwap(bars, true), '#a78bfa', 1.5);
}
