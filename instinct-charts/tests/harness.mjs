/* أداة اختبار صغيرة بلا اعتماديات */

let passed = 0;
let failed = 0;
const failures = [];
let currentSuite = '';

export function suite(name, fn) {
  currentSuite = name;
  console.log(`\n\x1b[1m${name}\x1b[0m`);
  fn();
}

export function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failed++;
    failures.push({ suite: currentSuite, name, message: err.message });
    console.log(`  \x1b[31m✗ ${name}\x1b[0m`);
    console.log(`      ${err.message.split('\n').join('\n      ')}`);
  }
}

export function assert(cond, message) {
  if (!cond) throw new Error(message || 'التوقع لم يتحقق');
}

export function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'قيمة مختلفة'}\n  المتوقع: ${expected}\n  الفعلي:  ${actual}`);
  }
}

export function close(actual, expected, tolerance, message) {
  if (actual == null || !isFinite(actual)) {
    throw new Error(`${message || 'قيمة غير رقمية'}: ${actual}`);
  }
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(
      `${message || 'خارج حدود السماح'}\n  المتوقع: ${expected} ± ${tolerance}\n  الفعلي:  ${actual}`
    );
  }
}

export function arrayClose(actual, expected, tolerance, message) {
  equal(actual.length, expected.length, `${message}: الطول مختلف`);
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] === null) {
      equal(actual[i], null, `${message}: العنصر ${i} كان يجب أن يكون null`);
    } else {
      close(actual[i], expected[i], tolerance, `${message}: العنصر ${i}`);
    }
  }
}

export function report() {
  console.log(`\n${'─'.repeat(52)}`);
  if (failed === 0) {
    console.log(`\x1b[32m\x1b[1mنجحت كل الاختبارات: ${passed}\x1b[0m`);
  } else {
    console.log(`\x1b[31m\x1b[1mفشل ${failed} من ${passed + failed}\x1b[0m`);
    failures.forEach((f) => console.log(`  • ${f.suite} › ${f.name}`));
  }
  return failed;
}

/* ---------------------------------------------------------------- */
/* مولّد شموع للاختبار                                                */
/* ---------------------------------------------------------------- */

/** مولّد أرقام شبه عشوائي ثابت النتيجة، حتى تكون الاختبارات قابلة للتكرار */
export function rng(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** يبني شموعًا من أسعار إغلاق، مع مدى معقول لكل شمعة */
export function barsFromCloses(closes, { start = 1700000000, step = 86400, volume = 1000 } = {}) {
  return closes.map((c, i) => {
    const prev = i === 0 ? c : closes[i - 1];
    const open = prev;
    return {
      time: start + i * step,
      open,
      high: Math.max(open, c) * 1.004,
      low: Math.min(open, c) * 0.996,
      close: c,
      volume,
    };
  });
}

/** شمعة واحدة بقيم صريحة */
export function bar(time, open, high, low, close, volume = 1000) {
  return { time, open, high, low, close, volume };
}
