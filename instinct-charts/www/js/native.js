/*
 * طبقة الربط مع النظام على الهاتف.
 *
 * كل دالة هنا آمنة على الويب أيضًا: إن لم نكن داخل تطبيق Capacitor
 * تعود بقيمة محايدة بدل أن تفشل، فيبقى نفس الكود يعمل في المتصفح.
 */

const C = window.Capacitor;
export const isNative = !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
export const platform = C?.getPlatform?.() || 'web';
const P = () => C?.Plugins || {};

/* ------------------------------------------------------------------ */
/* تخزين دائم                                                           */
/* ------------------------------------------------------------------ */

const MIRROR_KEYS = [
  'instinct:symbol',
  'instinct:tf',
  'instinct:watchlist',
  'instinct:alerts',
  'instinct:indicators',
  'instinct:layers',
  'instinct:theme',
];

/**
 * على iOS قد يمسح النظام تخزين المتصفح عند ضيق المساحة، لذلك نحتفظ بنسخة
 * في تخزين النظام (Preferences) ونستعيدها عند الإقلاع قبل تشغيل التطبيق.
 */
export async function hydrateStorage() {
  if (!isNative || !P().Preferences) return;
  try {
    for (const key of MIRROR_KEYS) {
      const { value } = await P().Preferences.get({ key });
      if (value != null && localStorage.getItem(key) == null) {
        localStorage.setItem(key, value);
      }
    }
  } catch {
    /* التخزين الدائم غير متاح — نكمل بالتخزين المحلي */
  }
}

/** يُستدعى بعد كل حفظ محلي ليبقى تخزين النظام متطابقًا */
export function mirrorStorage(key, rawValue) {
  if (!isNative || !P().Preferences) return;
  if (!MIRROR_KEYS.includes(key)) return;
  P().Preferences.set({ key, value: rawValue }).catch(() => {});
}

/* ------------------------------------------------------------------ */
/* الإشعارات                                                            */
/* ------------------------------------------------------------------ */

let notificationsReady = false;

export async function prepareNotifications() {
  if (!isNative || !P().LocalNotifications) return false;
  try {
    let perm = await P().LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      perm = await P().LocalNotifications.requestPermissions();
    }
    notificationsReady = perm.display === 'granted';
    return notificationsReady;
  } catch {
    return false;
  }
}

/** إشعار نظام حقيقي يظهر حتى لو كان التطبيق في الخلفية */
export async function notify(title, body, id = Date.now() % 100000) {
  if (!isNative || !P().LocalNotifications) return false;
  if (!notificationsReady && !(await prepareNotifications())) return false;
  try {
    await P().LocalNotifications.schedule({
      notifications: [
        {
          id,
          title,
          body,
          schedule: { at: new Date(Date.now() + 200) },
          smallIcon: 'ic_stat_icon',
          iconColor: '#3b82f6',
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* اهتزاز خفيف عند التفاعل                                              */
/* ------------------------------------------------------------------ */

export function tap(style = 'Light') {
  if (!isNative || !P().Haptics) return;
  P().Haptics.impact({ style }).catch(() => {});
}

export function buzz() {
  if (!isNative || !P().Haptics) return;
  P().Haptics.notification({ type: 'WARNING' }).catch(() => {});
}

/* ------------------------------------------------------------------ */
/* شريط الحالة والشاشة الافتتاحية                                       */
/* ------------------------------------------------------------------ */

export function applyStatusBar(theme) {
  if (!isNative || !P().StatusBar) return;
  const { StatusBar } = P();
  StatusBar.setStyle({ style: theme === 'dark' ? 'DARK' : 'LIGHT' }).catch(() => {});
  if (platform === 'android') {
    StatusBar.setBackgroundColor({ color: theme === 'dark' ? '#11151e' : '#ffffff' }).catch(() => {});
  }
}

export function hideSplash() {
  if (!isNative || !P().SplashScreen) return;
  P().SplashScreen.hide().catch(() => {});
}

/* ------------------------------------------------------------------ */
/* دورة حياة التطبيق والشبكة                                            */
/* ------------------------------------------------------------------ */

/** يُستدعى عند عودة التطبيق للواجهة — لتحديث الأسعار فورًا */
export function onResume(fn) {
  if (isNative && P().App) {
    P().App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) fn();
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) fn();
  });
}

/** زر الرجوع في أندرويد: يعود لتبويب الشارت قبل الخروج */
export function onBackButton(fn) {
  if (!isNative || !P().App) return;
  P().App.addListener('backButton', ({ canGoBack }) => {
    const handled = fn();
    if (!handled && !canGoBack) P().App.exitApp();
  });
}

export function onNetworkChange(fn) {
  if (isNative && P().Network) {
    P().Network.addListener('networkStatusChange', (s) => fn(s.connected));
    P()
      .Network.getStatus()
      .then((s) => fn(s.connected))
      .catch(() => {});
  } else {
    window.addEventListener('online', () => fn(true));
    window.addEventListener('offline', () => fn(false));
    fn(navigator.onLine);
  }
}

/** مشاركة ملخّص التحليل */
export async function share(title, text) {
  try {
    if (isNative && P().Share) {
      await P().Share.share({ title, text, dialogTitle: title });
      return true;
    }
    if (navigator.share) {
      await navigator.share({ title, text });
      return true;
    }
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return false;
  }
}
