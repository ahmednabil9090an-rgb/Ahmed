/*
 * التنبيهات: عند تجاوز سعر محدد أو عند دخول السعر منطقة (مثل منطقة الشراء المثالية).
 * تُفحص مع كل تحديث للأسعار طالما التطبيق مفتوح.
 */

import { load, save } from './store.js';
import * as Native from './native.js';

let alerts = load('alerts', []);
const listeners = new Set();

export function all() {
  return alerts;
}

export function forSymbol(symbol) {
  return alerts.filter((a) => a.symbol === symbol);
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  save('alerts', alerts);
  listeners.forEach((fn) => fn(alerts));
}

export function add(alert) {
  const a = {
    id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    createdAt: Date.now(),
    active: true,
    triggeredAt: null,
    ...alert,
  };
  alerts = [a, ...alerts].slice(0, 100);
  emit();
  return a;
}

export function remove(id) {
  alerts = alerts.filter((a) => a.id !== id);
  emit();
}

export function toggle(id) {
  alerts = alerts.map((a) => (a.id === id ? { ...a, active: !a.active, triggeredAt: null } : a));
  emit();
}

export function clearTriggered() {
  alerts = alerts.filter((a) => !a.triggeredAt);
  emit();
}

/**
 * يفحص التنبيهات مقابل سعر جديد ويُطلق ما تحقق منها.
 * @returns قائمة التنبيهات التي انطلقت الآن
 */
export function check(symbol, price, prevPrice) {
  if (price == null) return [];
  const fired = [];
  let changed = false;

  alerts = alerts.map((a) => {
    if (!a.active || a.triggeredAt || a.symbol !== symbol) return a;
    let hit = false;

    if (a.type === 'zone') {
      hit = price <= a.high && price >= a.low;
    } else if (a.direction === 'above') {
      hit = price >= a.price && (prevPrice == null || prevPrice < a.price);
      if (!hit && prevPrice == null) hit = price >= a.price;
    } else {
      hit = price <= a.price && (prevPrice == null || prevPrice > a.price);
      if (!hit && prevPrice == null) hit = price <= a.price;
    }

    if (!hit) return a;
    changed = true;
    const t = { ...a, triggeredAt: Date.now(), triggerPrice: price };
    fired.push(t);
    return t;
  });

  if (changed) emit();
  return fired;
}

export function describe(a) {
  if (a.type === 'zone') return `دخول المنطقة ${a.low} – ${a.high}`;
  return a.direction === 'above' ? `تجاوز ${a.price}` : `هبوط تحت ${a.price}`;
}

/* ---------------------------------------------------------------- */
/* الإشعار الصوتي والمرئي                                             */
/* ---------------------------------------------------------------- */

let audioCtx = null;

export function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.setValueAtTime(1180, audioCtx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.45);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
  } catch {
    /* الصوت غير متاح */
  }
}

export async function requestPermission() {
  // على الهاتف نطلب إذن إشعارات النظام، وعلى الويب إذن المتصفح
  if (Native.isNative) return Native.prepareNotifications();
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const p = await Notification.requestPermission();
  return p === 'granted';
}

export function notify(title, body) {
  if (Native.isNative) {
    Native.buzz();
    Native.notify(title, body);
    return;
  }
  beep();
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, dir: 'rtl', lang: 'ar' });
    }
  } catch {
    /* تجاهل */
  }
}
