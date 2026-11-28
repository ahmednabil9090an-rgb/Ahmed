/* اختبارات المتوسطات ومؤشر القوة النسبية */

import { suite, test, assert, equal, close, arrayClose, rng, barsFromCloses } from './harness.mjs';
import { sma, ema, rsi, atr, closes as closesOf } from '../www/js/indicators.js';

/* ------------------------------------------------------------------ */
/* مراجع مستقلة — مكتوبة بطريقة مختلفة عن التنفيذ الذي نختبره            */
/* ------------------------------------------------------------------ */

/**
 * EMA من التعريف المباشر كمجموع موزون، لا من المعادلة التكرارية:
 *   EMA_i = k·Σ (1-k)^j · v[i-j]  +  (1-k)^(i-p+1) · SMA(أول p قيمة)
 * هذه صياغة مستقلة تمامًا، فإن تطابقت مع التنفيذ فالتنفيذ سليم.
 */
function emaByWeightedSum(values, period, i) {
  const k = 2 / (period + 1);
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let acc = 0;
  for (let j = 0; j <= i - period; j++) acc += Math.pow(1 - k, j) * values[i - j] * k;
  return acc + Math.pow(1 - k, i - period + 1) * seed;
}

/** RSI وايلدر مكتوبًا بصياغة مباشرة ومنفصلة */
function rsiReference(values, period) {
  const out = new Array(values.length).fill(null);
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d > 0) gainSum += d;
    else lossSum -= d;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/* ------------------------------------------------------------------ */

suite('المتوسط البسيط SMA', () => {
  test('قيم محسوبة يدويًا', () => {
    arrayClose(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4], 1e-12, 'SMA(3)');
  });

  test('أول قيمة تظهر عند اكتمال الفترة بالضبط', () => {
    const out = sma([10, 20, 30, 40], 4);
    arrayClose(out, [null, null, null, 25], 1e-12, 'SMA(4)');
  });

  test('سلسلة ثابتة تعطي نفس القيمة', () => {
    const out = sma(new Array(10).fill(7), 5);
    for (let i = 4; i < 10; i++) close(out[i], 7, 1e-12, `العنصر ${i}`);
  });

  test('النافذة المتحركة صحيحة بعد فجوة null', () => {
    // بعد القيمة المفقودة تبدأ النافذة من جديد ولا تخلط ما قبلها بما بعدها
    const out = sma([1, 2, 3, null, 10, 20, 30, 40], 3);
    equal(out[3], null, 'موضع الفجوة');
    equal(out[5], null, 'لم تكتمل النافذة بعد');
    close(out[6], 20, 1e-12, 'أول نافذة كاملة بعد الفجوة = (10+20+30)/3');
    close(out[7], 30, 1e-12, 'النافذة التالية = (20+30+40)/3');
  });
});

suite('المتوسط الأسي EMA', () => {
  test('قيم محسوبة يدويًا: [1..5] بفترة 3', () => {
    // k = 0.5 ، البذرة = (1+2+3)/3 = 2 ، ثم 4·0.5+2·0.5=3 ، 5·0.5+3·0.5=4
    arrayClose(ema([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4], 1e-12, 'EMA(3)');
  });

  test('أول قيمة تساوي المتوسط البسيط للفترة الأولى', () => {
    const v = [5, 7, 9, 11, 13, 15];
    const out = ema(v, 4);
    close(out[3], (5 + 7 + 9 + 11) / 4, 1e-12, 'البذرة');
  });

  test('فترة 1 تعيد السلسلة نفسها', () => {
    const v = [3, 9, 4, 11];
    const out = ema(v, 1);
    arrayClose(out, v, 1e-12, 'EMA(1)');
  });

  test('سلسلة ثابتة تعطي نفس القيمة', () => {
    const out = ema(new Array(30).fill(42), 10);
    for (let i = 9; i < 30; i++) close(out[i], 42, 1e-10, `العنصر ${i}`);
  });

  test('يطابق المجموع الموزون المستقل على بيانات عشوائية', () => {
    const r = rng(7);
    const v = Array.from({ length: 120 }, () => 50 + r() * 20);
    for (const period of [5, 12, 26, 50]) {
      const out = ema(v, period);
      for (const i of [period - 1, period + 3, 60, 119]) {
        close(out[i], emaByWeightedSum(v, period, i), 1e-9, `EMA(${period}) عند ${i}`);
      }
    }
  });

  test('المعادلة التكرارية صحيحة في كل خطوة', () => {
    const r = rng(11);
    const v = Array.from({ length: 80 }, () => 10 + r() * 5);
    const period = 14;
    const k = 2 / (period + 1);
    const out = ema(v, period);
    for (let i = period; i < v.length; i++) {
      close(out[i], v[i] * k + out[i - 1] * (1 - k), 1e-10, `الخطوة ${i}`);
    }
  });

  test('فترة أطول من البيانات تعطي null بالكامل', () => {
    const out = ema([1, 2, 3], 10);
    assert(out.every((x) => x === null), 'كان يجب ألا تُحسب أي قيمة');
  });
});

suite('مؤشر القوة النسبية RSI', () => {
  // السلسلة المرجعية المعروفة لوايلدر (المستخدمة في شروح RSI القياسية)
  const wilder = [
    44.3389, 44.0902, 44.1497, 43.6124, 44.3278, 44.8264, 45.0955, 45.4245, 45.8433, 46.0826,
    45.8931, 46.0328, 45.614, 46.282, 46.282, 46.0033, 46.0328, 46.4116, 46.2222, 45.6439,
    46.2122, 46.2521, 45.7137, 46.4516, 45.7835, 45.3548, 44.0288, 44.1783, 44.2181, 44.5672,
    43.4205, 42.6628, 43.1314,
  ];

  test('القيمة الأولى تظهر عند الشمعة رقم 14 بالضبط', () => {
    const out = rsi(wilder, 14);
    for (let i = 0; i < 14; i++) equal(out[i], null, `العنصر ${i} يجب أن يكون null`);
    assert(out[14] != null, 'العنصر 14 يجب أن يحمل قيمة');
  });

  test('يطابق القيم المرجعية المنشورة لوايلدر', () => {
    const out = rsi(wilder, 14);
    close(out[14], 70.46, 0.15, 'أول قيمة RSI');
    close(out[15], 66.25, 0.15, 'القيمة الثانية');
    close(out[16], 66.48, 0.15, 'القيمة الثالثة');
    close(out[19], 57.92, 0.2, 'القيمة عند 19');
  });

  test('يطابق تنفيذًا مرجعيًا مستقلًا', () => {
    const r = rng(3);
    const v = Array.from({ length: 200 }, () => 100 + r() * 40);
    const mine = rsi(v, 14);
    const ref = rsiReference(v, 14);
    for (let i = 14; i < v.length; i++) close(mine[i], ref[i], 1e-9, `العنصر ${i}`);
  });

  test('سلسلة صاعدة دائمًا تعطي 100', () => {
    const v = Array.from({ length: 40 }, (_, i) => 10 + i);
    const out = rsi(v, 14);
    close(out[39], 100, 1e-9, 'صعود مستمر');
  });

  test('سلسلة هابطة دائمًا تعطي قيمة قريبة من الصفر', () => {
    const v = Array.from({ length: 40 }, (_, i) => 100 - i);
    const out = rsi(v, 14);
    close(out[39], 0, 1e-6, 'هبوط مستمر');
  });

  test('النتيجة محصورة دائمًا بين 0 و 100', () => {
    const r = rng(99);
    const v = Array.from({ length: 300 }, () => 1 + r() * 1000);
    rsi(v, 14).forEach((x, i) => {
      if (x != null) assert(x >= 0 && x <= 100, `خارج المدى عند ${i}: ${x}`);
    });
  });
});

suite('المدى الحقيقي المتوسط ATR', () => {
  test('يساوي مدى الشمعة حين لا توجد فجوات', () => {
    // كل شمعة مداها 10 بالضبط ولا فجوة بين الإغلاق والشمعة التالية
    const bars = Array.from({ length: 30 }, (_, i) => ({
      time: i,
      open: 100,
      high: 105,
      low: 95,
      close: 100,
      volume: 1,
    }));
    const out = atr(bars, 14);
    close(out[29], 10, 1e-9, 'ATR لمدى ثابت');
  });

  test('يأخذ الفجوات في الحسبان', () => {
    const bars = [
      { time: 1, open: 100, high: 101, low: 99, close: 100, volume: 1 },
      // فجوة صاعدة: المدى الحقيقي = 120 - 100 = 20 وليس 120-118 = 2
      { time: 2, open: 118, high: 120, low: 118, close: 119, volume: 1 },
    ];
    const out = atr(bars, 2);
    close(out[1], (2 + 20) / 2, 1e-9, 'متوسط المدى الحقيقي');
  });
});

suite('مساعدات', () => {
  test('closes تستخرج أسعار الإغلاق بالترتيب', () => {
    const bars = barsFromCloses([1, 2, 3]);
    arrayClose(closesOf(bars), [1, 2, 3], 1e-12, 'الإغلاقات');
  });
});
