/* اختبارات محرّك السيولة والتدفّق النقدي */

import { suite, test, assert, equal, close, bar, rng } from './harness.mjs';
import {
  analyzeLiquidity,
  chaikinMoneyFlow,
  moneyFlowIndex,
  obv,
  turnoverSeries,
  turnoverUnit,
  compactNumber,
  formatActivity,
} from '../www/js/liquidity.js';

/** شموع بحجم ثابت أو متغيّر حسب دالة */
function series(n, fn) {
  return Array.from({ length: n }, (_, i) => {
    const s = fn(i);
    return bar(1700000000 + i * 86400, s.o, s.h, s.l, s.c, s.v);
  });
}

suite('وحدة قياس النشاط', () => {
  test('الأسهم تُقاس بقيمة نقدية', () => {
    equal(turnoverUnit('COMI.CA'), 'currency', 'سهم مصري');
    equal(turnoverUnit('COPA.L'), 'currency', 'ورقة في لندن');
  });

  test('العقود الآجلة تُقاس بعدد العقود لا بمبلغ', () => {
    equal(turnoverUnit('GC=F'), 'contracts', 'الذهب');
    equal(turnoverUnit('HG=F'), 'contracts', 'النحاس');
  });
});

suite('قيمة التداول', () => {
  test('تساوي الحجم × السعر النموذجي', () => {
    const bars = [bar(1, 10, 12, 8, 10, 1000)];
    close(turnoverSeries(bars)[0], 1000 * 10, 1e-9, 'الشمعة الأولى');
  });

  test('تعطي صفرًا حين لا يوجد حجم', () => {
    close(turnoverSeries([bar(1, 10, 11, 9, 10, 0)])[0], 0, 1e-9, 'بلا حجم');
  });
});

suite('الرصيد الحجمي التراكمي OBV', () => {
  test('يزيد في الصعود وينقص في الهبوط', () => {
    const bars = [
      bar(1, 10, 10, 10, 10, 100),
      bar(2, 10, 11, 10, 11, 200), // صعود ← +200
      bar(3, 11, 11, 10, 10, 300), // هبوط ← −300
      bar(4, 10, 10, 10, 10, 400), // ثبات ← بلا تغيير
    ];
    const o = obv(bars);
    close(o[1], 200, 1e-9, 'بعد الصعود');
    close(o[2], -100, 1e-9, 'بعد الهبوط');
    close(o[3], -100, 1e-9, 'عند الثبات');
  });

  test('صعود متواصل يعطي رصيدًا متزايدًا دائمًا', () => {
    const bars = series(30, (i) => ({ o: 10 + i, h: 11 + i, l: 9 + i, c: 10.5 + i, v: 100 }));
    const o = obv(bars);
    for (let i = 2; i < o.length; i++) assert(o[i] > o[i - 1], `تراجع عند ${i}`);
  });
});

suite('تدفّق الأموال لتشايكن CMF', () => {
  test('الإغلاق عند القمة دائمًا يعطي +1', () => {
    const bars = series(30, () => ({ o: 10, h: 12, l: 8, c: 12, v: 500 }));
    close(chaikinMoneyFlow(bars, 20)[29], 1, 1e-9, 'تجميع تام');
  });

  test('الإغلاق عند القاع دائمًا يعطي −1', () => {
    const bars = series(30, () => ({ o: 10, h: 12, l: 8, c: 8, v: 500 }));
    close(chaikinMoneyFlow(bars, 20)[29], -1, 1e-9, 'تصريف تام');
  });

  test('الإغلاق في منتصف المدى يعطي صفرًا', () => {
    const bars = series(30, () => ({ o: 10, h: 12, l: 8, c: 10, v: 500 }));
    close(chaikinMoneyFlow(bars, 20)[29], 0, 1e-9, 'محايد');
  });

  test('النتيجة محصورة بين −1 و +1 على بيانات عشوائية', () => {
    const r = rng(31);
    const bars = series(200, () => {
      const base = 50 + r() * 10;
      const h = base + r() * 2;
      const l = base - r() * 2;
      return { o: base, h, l, c: l + r() * (h - l), v: Math.round(r() * 5000) };
    });
    chaikinMoneyFlow(bars, 20).forEach((v, i) => {
      if (v != null) assert(v >= -1 && v <= 1, `خارج المدى عند ${i}: ${v}`);
    });
  });

  test('شمعة بلا مدى لا تسبب قسمة على صفر', () => {
    const bars = series(30, () => ({ o: 10, h: 10, l: 10, c: 10, v: 100 }));
    const v = chaikinMoneyFlow(bars, 20)[29];
    assert(v === 0 || v === null, `قيمة غير متوقعة: ${v}`);
  });
});

suite('مؤشر تدفّق الأموال MFI', () => {
  test('صعود متواصل يعطي 100', () => {
    const bars = series(40, (i) => ({ o: 10 + i, h: 11 + i, l: 9 + i, c: 10.5 + i, v: 100 }));
    close(moneyFlowIndex(bars, 14)[39], 100, 1e-9, 'تدفّق موجب فقط');
  });

  test('هبوط متواصل يعطي صفرًا', () => {
    const bars = series(40, (i) => ({ o: 100 - i, h: 101 - i, l: 99 - i, c: 99.5 - i, v: 100 }));
    close(moneyFlowIndex(bars, 14)[39], 0, 1e-9, 'تدفّق سالب فقط');
  });

  test('النتيجة محصورة بين 0 و 100', () => {
    const r = rng(37);
    const bars = series(200, () => {
      const base = 20 + r() * 5;
      return { o: base, h: base + 1, l: base - 1, c: base + (r() - 0.5), v: Math.round(r() * 900) };
    });
    moneyFlowIndex(bars, 14).forEach((v, i) => {
      if (v != null) assert(v >= 0 && v <= 100, `خارج المدى عند ${i}: ${v}`);
    });
  });
});

suite('التحليل الكامل للسيولة', () => {
  test('يرصد زيادة السيولة حين يقفز حجم التداول', () => {
    const bars = series(80, (i) => {
      const v = i >= 75 ? 10000 : 1000; // آخر خمس جلسات بحجم عشرة أضعاف
      return { o: 10, h: 10.4, l: 9.6, c: 10.1, v };
    });
    const L = analyzeLiquidity(bars, { symbol: 'TEST.CA', currency: 'EGP' });
    assert(L.ok, 'التحليل نجح');
    equal(L.trend.direction, 'up', 'اتجاه السيولة');
    assert(L.trend.pct5v20 > 100, `نسبة الزيادة ضعيفة: ${L.trend.pct5v20}`);
  });

  test('يرصد انخفاض السيولة حين يجف حجم التداول', () => {
    const bars = series(80, (i) => ({ o: 10, h: 10.4, l: 9.6, c: 10.1, v: i >= 75 ? 100 : 5000 }));
    const L = analyzeLiquidity(bars, { symbol: 'TEST.CA', currency: 'EGP' });
    equal(L.trend.direction, 'down', 'اتجاه السيولة');
    assert(L.trend.pct5v20 < -50, `نسبة الانخفاض ضعيفة: ${L.trend.pct5v20}`);
  });

  test('يصف السيولة بالمستقرة حين لا يتغيّر الحجم', () => {
    const bars = series(80, () => ({ o: 10, h: 10.4, l: 9.6, c: 10.1, v: 2000 }));
    equal(analyzeLiquidity(bars, { symbol: 'T.CA' }).trend.direction, 'flat', 'مستقرة');
  });

  test('صافي التدفّق موجب حين يتركّز التداول في جلسات صاعدة', () => {
    // الجلسات الصاعدة بحجم كبير والهابطة بحجم صغير
    const bars = series(60, (i) => {
      const up = i % 2 === 0;
      return up
        ? { o: 10, h: 10.5, l: 9.9, c: 10.4, v: 5000 }
        : { o: 10.4, h: 10.5, l: 9.9, c: 10.0, v: 500 };
    });
    const L = analyzeLiquidity(bars, { symbol: 'T.CA', currency: 'EGP' });
    assert(L.flow.netFlow > 0, 'صافي التدفّق يجب أن يكون موجبًا');
    assert(L.flow.inflowShare > 80, `نسبة الدخول: ${L.flow.inflowShare}`);
  });

  test('يرصد التجميع المخفي: سعر نازل ورصيد حجمي صاعد', () => {
    // السعر ينحدر، لكن الإغلاق فوق الفتح دائمًا بحجم كبير
    const bars = series(60, (i) => {
      const base = 100 - i * 0.5;
      return { o: base - 0.3, h: base + 0.2, l: base - 0.5, c: base, v: 1000 + i * 120 };
    });
    const L = analyzeLiquidity(bars, { symbol: 'T.CA', currency: 'EGP' });
    assert(L.ok, 'التحليل نجح');
    assert(
      L.priceSlope < 0,
      `ميل السعر يجب أن يكون سالبًا: ${L.priceSlope}`
    );
  });

  test('يرصد أيام السيولة الاستثنائية', () => {
    const bars = series(80, (i) => ({
      o: 10,
      h: 10.4,
      l: 9.6,
      c: 10.2,
      v: i === 70 ? 60000 : 1000,
    }));
    const L = analyzeLiquidity(bars, { symbol: 'T.CA', currency: 'EGP' });
    assert(L.bigDays.length > 0, 'لم تُرصد أي جلسة استثنائية');
    equal(L.bigDays[0].index, 70, 'موضع الجلسة الاستثنائية');
    assert(L.bigDays[0].times > 10, `المضاعف: ${L.bigDays[0].times}`);
  });

  test('يعود برسالة واضحة حين لا توجد أحجام', () => {
    const bars = series(80, () => ({ o: 10, h: 11, l: 9, c: 10, v: 0 }));
    const L = analyzeLiquidity(bars, { symbol: '^CASE30' });
    equal(L.ok, false, 'يجب ألا ينجح');
    assert(L.reason.includes('أحجام'), `الرسالة: ${L.reason}`);
  });

  test('يعود برسالة واضحة حين البيانات قليلة', () => {
    const L = analyzeLiquidity(series(10, () => ({ o: 1, h: 2, l: 0.5, c: 1.5, v: 10 })), {});
    equal(L.ok, false, 'يجب ألا ينجح');
  });

  test('العقود الآجلة لا تُعرض بقيمة نقدية ولا تقترح حجم مركز', () => {
    const bars = series(80, () => ({ o: 2000, h: 2010, l: 1990, c: 2005, v: 300 }));
    const L = analyzeLiquidity(bars, { symbol: 'GC=F', currency: 'USD' });
    equal(L.unit, 'contracts', 'الوحدة');
    equal(L.positionHint, null, 'لا اقتراح لحجم المركز');
    equal(L.depth, null, 'لا تصنيف عمق بالعملة');
    // النشاط يساوي عدد العقود لا العقود × السعر
    close(L.today, 300, 1e-9, 'نشاط اليوم بعدد العقود');
  });

  test('الأسهم تُعرض بقيمة نقدية مع اقتراح حجم مركز', () => {
    const bars = series(80, () => ({ o: 100, h: 101, l: 99, c: 100, v: 1_000_000 }));
    const L = analyzeLiquidity(bars, { symbol: 'COMI.CA', currency: 'EGP' });
    equal(L.unit, 'currency', 'الوحدة');
    close(L.today, 1_000_000 * 100, 1e-6, 'قيمة تداول اليوم');
    close(L.positionHint, L.avg20 * 0.01, 1e-6, 'اقتراح حجم المركز = 1٪ من المتوسط');
    assert(L.depth && L.depth.level === 'عالية', `تصنيف العمق: ${L.depth?.level}`);
  });
});

suite('عرض الأرقام', () => {
  test('يختصر الأرقام الكبيرة', () => {
    equal(compactNumber(1_240_000), '1.24 مليون', 'ملايين');
    equal(compactNumber(2_500_000_000), '2.50 مليار', 'مليارات');
    equal(compactNumber(4300), '4.3 ألف', 'آلاف');
    equal(compactNumber(250), '250', 'أرقام صغيرة');
  });

  test('يضيف اسم العملة للأسهم وكلمة عقد للعقود', () => {
    equal(formatActivity(5_000_000, 'currency', 'EGP'), '5.00 مليون جنيه', 'جنيه');
    equal(formatActivity(3200, 'contracts', 'USD'), '3.2 ألف عقد', 'عقود');
    equal(formatActivity(null, 'currency', 'EGP'), '—', 'قيمة غائبة');
  });
});
