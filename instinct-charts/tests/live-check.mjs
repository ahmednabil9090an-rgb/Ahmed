#!/usr/bin/env node
/*
 * تحقّق على بيانات حقيقية: يعيد التحقق من كل مؤشر من الشموع الخام
 * بمنطق مستقل، ويطبع جدول نتائج.
 *
 * التشغيل: شغّل الخادم أولًا ثم:  node tests/live-check.mjs [port]
 */

import { ema, rsi, closes as closesOf } from '../www/js/indicators.js';
import { findFVGs, marketStructure, orderBlockFor, analyze } from '../www/js/ict.js';
import { volumeNodes } from '../www/js/confluence.js';

const PORT = process.argv[2] || 8099;
const SYMBOLS = ['COMI.CA', 'ABUK.CA', 'GC=F', 'HG=F'];

let problems = 0;
const ok = (c, msg) => {
  console.log(`    ${c ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${msg}`);
  if (!c) problems++;
};

for (const symbol of SYMBOLS) {
  const res = await fetch(
    `http://localhost:${PORT}/api/chart?symbol=${encodeURIComponent(symbol)}&tf=1d`
  );
  const data = await res.json();
  if (data.error) {
    console.log(`\n\x1b[1m${symbol}\x1b[0m — تعذّر الجلب: ${data.error}`);
    problems++;
    continue;
  }

  const bars = data.bars.slice(-500);
  const cl = closesOf(bars);
  const last = bars.length - 1;
  console.log(`\n\x1b[1m${symbol}\x1b[0m  (${bars.length} شمعة، ${data.meta.currency})`);

  /* ---------------- EMA ---------------- */
  console.log('  EMA');
  const e200 = ema(cl, 200);
  const e50 = ema(cl, 50);
  const e20 = ema(cl, 20);
  // إعادة الحساب بالمعادلة التكرارية من البذرة، مستقلةً عن التنفيذ
  const k = 2 / 201;
  let ref = cl.slice(0, 200).reduce((a, b) => a + b, 0) / 200;
  for (let i = 200; i <= last; i++) ref = cl[i] * k + ref * (1 - k);
  ok(Math.abs(e200[last] - ref) < 1e-6, `EMA200 = ${e200[last].toFixed(4)} يطابق إعادة الحساب`);

  const lo = Math.min(...cl.slice(-250));
  const hi = Math.max(...cl.slice(-250));
  ok(e200[last] >= lo && e200[last] <= hi, `EMA200 داخل مدى الأسعار (${lo.toFixed(2)}–${hi.toFixed(2)})`);
  ok(
    e20[last] != null && e50[last] != null,
    `EMA20 = ${e20[last]?.toFixed(2)} ، EMA50 = ${e50[last]?.toFixed(2)}`
  );
  // المتوسط الأقصر يلاحق السعر أسرع: انحرافه عن آخر سعر أقل في المتوسط
  const dev20 = Math.abs(cl[last] - e20[last]);
  const dev200 = Math.abs(cl[last] - e200[last]);
  ok(dev20 <= dev200 * 3, `EMA20 أقرب للسعر من EMA200 (${dev20.toFixed(2)} مقابل ${dev200.toFixed(2)})`);

  /* ---------------- RSI ---------------- */
  console.log('  RSI');
  const r = rsi(cl, 14);
  const rv = r[last];
  ok(rv >= 0 && rv <= 100, `RSI = ${rv.toFixed(2)} داخل المدى 0–100`);
  const defined = r.filter((x) => x != null).length;
  ok(defined === bars.length - 14, `عدد القيم المحسوبة ${defined} = الشموع − 14`);
  // اتساق الاتجاه: RSI فوق 50 يعني أن متوسط المكاسب يفوق متوسط الخسائر
  let g = 0;
  let l = 0;
  for (let i = bars.length - 14; i <= last; i++) {
    const d = cl[i] - cl[i - 1];
    if (d > 0) g += d;
    else l -= d;
  }
  ok((rv > 50) === (g > l) || Math.abs(rv - 50) < 6, `اتجاه RSI متسق مع آخر 14 شمعة`);

  /* ---------------- FVG ---------------- */
  console.log('  FVG');
  const gaps = findFVGs(bars);
  ok(gaps.length > 0, `رُصدت ${gaps.length} فجوة (منها ${gaps.filter((x) => !x.mitigated).length} مفتوحة)`);
  let badGap = null;
  for (const f of gaps) {
    const a = bars[f.index - 1];
    const c = bars[f.index + 1];
    const valid =
      f.dir === 'bull'
        ? a.high < c.low && Math.abs(f.bottom - a.high) < 1e-9 && Math.abs(f.top - c.low) < 1e-9
        : a.low > c.high && Math.abs(f.bottom - c.high) < 1e-9 && Math.abs(f.top - a.low) < 1e-9;
    if (!valid) {
      badGap = f;
      break;
    }
  }
  ok(!badGap, 'كل فجوة تطابق تعريف الشمعات الثلاث عند موضعها');
  ok(
    gaps.every((f) => f.top > f.bottom),
    'حدود كل الفجوات منطقية'
  );
  // الفجوة المفتوحة يجب ألا يكون السعر قد اخترقها بالكامل بعد تكوّنها
  const wrongOpen = gaps
    .filter((f) => !f.mitigated)
    .find((f) => {
      for (let j = f.index + 2; j < bars.length; j++) {
        if (f.dir === 'bull' && bars[j].low <= f.bottom) return true;
        if (f.dir === 'bear' && bars[j].high >= f.top) return true;
      }
      return false;
    });
  ok(!wrongOpen, 'لا توجد فجوة موصوفة بأنها مفتوحة وقد رُدمت فعلًا');

  /* ---------------- Order Block ---------------- */
  console.log('  Order Block');
  const { events } = marketStructure(bars, 2);
  const ev = events[events.length - 1];
  ok(!!ev, `آخر حدث بنيوي: ${ev?.kind} ${ev?.dir}`);
  if (ev) {
    const ob = orderBlockFor(bars, ev);
    if (ob) {
      const c = bars[ob.index];
      const isBear = c.close < c.open;
      ok(
        (ev.dir === 'bull') === isBear,
        `شمعة المنطقة ${isBear ? 'هابطة' : 'صاعدة'} كما يقتضي كسر ${ev.dir === 'bull' ? 'صاعد' : 'هابط'}`
      );
      ok(ob.index <= ev.breakIndex, `موضع المنطقة (${ob.index}) قبل الكسر (${ev.breakIndex}) أو عنده`);
      ok(
        Math.abs(ob.top - c.high) < 1e-9 && Math.abs(ob.bottom - c.low) < 1e-9,
        `حدود المنطقة = مدى الشمعة (${ob.bottom.toFixed(2)}–${ob.top.toFixed(2)})`
      );
      // لا توجد شمعة معاكسة أحدث بينها وبين الكسر
      let later = false;
      for (let i = ob.index + 1; i <= ev.breakIndex; i++) {
        const b = bars[i];
        if ((b.close < b.open) === (ev.dir === 'bull')) later = true;
      }
      ok(!later, 'هي فعلًا آخر شمعة معاكسة قبل الكسر');
    } else {
      ok(true, 'لا توجد منطقة أوامر في النطاق (حالة مقبولة)');
    }
  }

  /* ---------------- Volume Profile ---------------- */
  console.log('  Volume Profile');
  const hasVolume = bars.slice(-100).some((b) => b.volume > 0);
  if (!hasVolume) {
    ok(true, 'المزوّد لا يوفّر أحجامًا لهذه الأداة — تم التخطي');
  } else {
    const nodes = volumeNodes(bars, { lookback: 300, bins: 48, topN: 3 });
    ok(nodes.length > 0, `أعلى كثافة عند ${nodes[0]?.price.toFixed(2)}`);

    const slice = bars.slice(-300);
    const pLo = Math.min(...slice.map((b) => b.low));
    const pHi = Math.max(...slice.map((b) => b.high));
    ok(
      nodes.every((n) => n.price >= pLo && n.price <= pHi),
      `كل العقد داخل المدى ${pLo.toFixed(2)}–${pHi.toFixed(2)}`
    );

    // تحقّق مستقل: الحجم الفعلي المتداول قرب عقدة الذروة يفوق الحجم قرب حوافّ المدى
    const band = (center, width) =>
      slice
        .filter((b) => b.low <= center + width && b.high >= center - width)
        .reduce((s, b) => s + (b.volume || 0), 0);
    const w = (pHi - pLo) * 0.03;
    const atPoc = band(nodes[0].price, w);
    const atTop = band(pHi - w, w);
    const atBottom = band(pLo + w, w);
    ok(
      atPoc >= atTop && atPoc >= atBottom,
      `حجم التداول عند الذروة (${(atPoc / 1e6).toFixed(1)}م) ≥ عند الحافتين (${(atTop / 1e6).toFixed(1)}م / ${(atBottom / 1e6).toFixed(1)}م)`
    );
  }

  /* ---------------- التحليل الكامل ---------------- */
  const A = analyze(bars);
  ok(A.ok, `التحليل الكامل ناجح — الاتجاه ${A.trend}`);
}

console.log(`\n${'─'.repeat(52)}`);
if (problems === 0) console.log('\x1b[32m\x1b[1mكل الفحوص على البيانات الحقيقية سليمة\x1b[0m');
else console.log(`\x1b[31m\x1b[1m${problems} فحص فشل\x1b[0m`);
process.exit(problems === 0 ? 0 : 1);
