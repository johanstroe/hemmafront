import {
  getNotificationPrefs,
  getRemindedEventIds,
  markEventReminded,
  showBrowserNotification,
} from "@/lib/notifications";
import { toast } from "sonner";

export type ReminderEvent = {
  id: string;
  title: string;
  start_time: string;
  all_day: boolean;
  member_id?: string | null;
  member_ids?: string[] | null;
};

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function getAssignedIds(event: ReminderEvent): string[] {
  if (event.member_ids && event.member_ids.length > 0) return event.member_ids;
  if (event.member_id) return [event.member_id];
  return [];
}

function isAssignedToMember(event: ReminderEvent, memberId: string) {
  const ids = getAssignedIds(event);
  if (ids.length === 0) return true;
  return ids.includes(memberId);
}

function formatEventTime(startTime: string, allDay: boolean) {
  if (allDay) return "Heldag";
  return new Date(startTime).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}

export function cancelEventReminder(eventId: string) {
  const timer = timers.get(eventId);
  if (timer) clearTimeout(timer);
  timers.delete(eventId);
}

export async function fireEventReminder(event: ReminderEvent, reminderMinutes: number) {
  const reminded = getRemindedEventIds();
  if (reminded.has(event.id)) return;

  markEventReminded(event.id);
  const title = `Om ${reminderMinutes} min: ${event.title}`;
  const body = formatEventTime(event.start_time, event.all_day);
  toast.info(title, { description: body });
  await showBrowserNotification(title, body, `reminder-${event.id}`);
}

export function scheduleEventReminder(event: ReminderEvent, memberId: string) {
  cancelEventReminder(event.id);

  const prefs = getNotificationPrefs();
  if (!prefs.enabled || !prefs.eventReminders) return;
  if (!isAssignedToMember(event, memberId)) return;

  const fireAt = new Date(event.start_time).getTime() - prefs.reminderMinutes * 60 * 1000;
  const delay = fireAt - Date.now();
  if (delay <= 0) return;
  if (delay > 2_147_483_647) return;

  timers.set(
    event.id,
    setTimeout(() => {
      void fireEventReminder(event, prefs.reminderMinutes);
      timers.delete(event.id);
    }, delay),
  );
}

export function syncEventReminders(events: ReminderEvent[], memberId: string) {
  const prefs = getNotificationPrefs();
  if (!prefs.enabled || !prefs.eventReminders) {
    for (const id of timers.keys()) cancelEventReminder(id);
    return;
  }

  const upcoming = new Set<string>();
  for (const event of events) {
    if (!isAssignedToMember(event, memberId)) continue;
    upcoming.add(event.id);
    scheduleEventReminder(event, memberId);
  }

  for (const id of timers.keys()) {
    if (!upcoming.has(id)) cancelEventReminder(id);
  }
}

export async function notifyEventSaved(event: ReminderEvent, memberId: string) {
  const prefs = getNotificationPrefs();
  if (!isAssignedToMember(event, memberId)) {
    toast.success("Tillagd i kalendern");
    return;
  }

  if (prefs.enabled && prefs.eventReminders) {
    scheduleEventReminder(event, memberId);
    const when = formatEventTime(event.start_time, event.all_day);
    const title = `Händelse sparad: ${event.title}`;
    const body = `Påminnelse ${prefs.reminderMinutes} min innan · ${when}`;
    toast.success(title, { description: body });
    await showBrowserNotification(title, body, `saved-${event.id}`);
    return;
  }

  toast.success("Tillagd i kalendern");
}
