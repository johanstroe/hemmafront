export type NotificationPrefs = {
  enabled: boolean;
  listActivity: boolean;
  eventReminders: boolean;
  reminderMinutes: number;
};

const PREFS_KEY = "hemmafront-notification-prefs";
const REMINDED_KEY = "hemmafront-reminded-events";

const DEFAULT_PREFS: NotificationPrefs = {
  enabled: false,
  listActivity: true,
  eventReminders: true,
  reminderMinutes: 15,
};

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

export async function requestNotificationPermission() {
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

export function showBrowserNotification(title: string, body: string, tag?: string) {
  if (!isNotificationSupported() || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag });
  } catch {
    // iOS / restricted contexts may throw
  }
}

export function notifyUser(title: string, body: string, tag?: string) {
  const prefs = getNotificationPrefs();
  if (!prefs.enabled) return;

  if (document.visibilityState === "hidden") {
    showBrowserNotification(title, body, tag);
  }
}
