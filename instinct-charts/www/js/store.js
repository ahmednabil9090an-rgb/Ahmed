/* تخزين محلي بسيط مع تعامل آمن مع الأخطاء، ونسخة دائمة على الهاتف */

import { mirrorStorage } from './native.js';

const PREFIX = 'instinct:';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  const raw = JSON.stringify(value);
  try {
    localStorage.setItem(PREFIX + key, raw);
  } catch {
    /* التخزين غير متاح — نتجاهل بهدوء */
  }
  mirrorStorage(PREFIX + key, raw);
}
