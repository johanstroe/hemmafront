export type NotificationPrefs = {
  enabled: boolean;
  listActivity: boolean;
  eventReminders: boolean;
  reminderMinutes: number;
};

const PREFS_KEY = "hemmafront-notification-prefs";
const REMINDED_KEY = "hemmafront-reminded-events";
const SW_PATH = "/sw.js";

const DEFAULT_PREFS: NotificationPrefs = {
  enabled: false,
  listActivity: true,
  eventReminders: true,
  reminderMinutes: 15,
};

let swRegistration: ServiceWorkerRegistration | null = null;
let swRegisterPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function getNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveNotificationPrefs(prefs: NotificationPrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function isNotificationSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function registerNotificationServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  if (swRegistration) return swRegistration;
  if (swRegisterPromise) return swRegisterPromise;

  swRegisterPromise = navigator.serviceWorker
    .register(SW_PATH, { scope: "/" })
    .then((registration) => {
      swRegistration = registration;
      return registration;
    })
    .catch(() => null);

  return swRegisterPromise;
}

export async function requestNotificationPermission() {
  await registerNotificationServiceWorker();
  if (!isNotificationSupported()) return "unsupported" as const;
  if (Notification.permission === "granted") return "granted" as const;
  if (Notification.permission === "denied") return "denied" as const;
  return Notification.requestPermission();
}

export function getRemindedEventIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(REMINDED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markEventReminded(eventId: string) {
  const ids = getRemindedEventIds();
  ids.add(eventId);
  sessionStorage.setItem(REMINDED_KEY, JSON.stringify([...ids]));
}

export function clearOldRemindedEvents(validIds: string[]) {
  const valid = new Set(validIds);
  const ids = [...getRemindedEventIds()].filter((id) => valid.has(id));
  sessionStorage.setItem(REMINDED_KEY, JSON.stringify(ids));
}

export async function showBrowserNotification(title: string, body: string, tag?: string) {
  if (!isNotificationSupported() || Notification.permission !== "granted") return false;

  const options: NotificationOptions = {
    body,
    tag: tag ?? "hemmafront",
    icon: "/icon.svg",
    badge: "/icon.svg",
  };

  try {
    const registration = swRegistration ?? (await registerNotificationServiceWorker());
    if (registration) {
      await registration.showNotification(title, options);
      return true;
    }
  } catch {
    // fall through to Notification API
  }

  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

export async function sendTestNotification() {
  const ok = await showBrowserNotification(
    "Hemmafront test",
    "Notiser fungerar! Du får påminnelser innan kalenderhändelser.",
    "hemmafront-test",
  );
  return ok;
}
