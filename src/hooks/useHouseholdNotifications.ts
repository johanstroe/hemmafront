import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Member } from "@/hooks/useHousehold";
import {
  fireEventReminder,
  scheduleEventReminder,
  syncEventReminders,
  type ReminderEvent,
} from "@/lib/event-reminders";
import {
  clearOldRemindedEvents,
  getNotificationPrefs,
  getRemindedEventIds,
  showBrowserNotification,
} from "@/lib/notifications";
import { toast } from "sonner";

type ListMeta = { id: string; name: string; type: string };
type HouseholdEvent = ReminderEvent & { created_by: string };

function isAssignedToMember(event: Pick<HouseholdEvent, "member_id" | "member_ids">, memberId: string) {
  if (event.member_ids && event.member_ids.length > 0) return event.member_ids.includes(memberId);
  if (event.member_id) return event.member_id === memberId;
  return true;
}

function formatEventTime(startTime: string, allDay: boolean) {
  if (allDay) return "Heldag";
  return new Date(startTime).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}

async function pushNotify(title: string, body: string, tag?: string) {
  const prefs = getNotificationPrefs();
  if (!prefs.enabled) return;
  toast.info(title, { description: body });
  await showBrowserNotification(title, body, tag);
}

export function useHouseholdNotifications(householdId: string, userId: string, members: Member[]) {
  const listsRef = useRef<Map<string, ListMeta>>(new Map());
  const membersRef = useRef(members);
  membersRef.current = members;

  useEffect(() => {
    if (!householdId || !userId) return;

    supabase
      .from("lists")
      .select("id, name, type")
      .eq("household_id", householdId)
      .then(({ data }) => {
        listsRef.current = new Map((data as ListMeta[] | null)?.map((l) => [l.id, l]) ?? []);
      });
  }, [householdId]);

  useEffect(() => {
    if (!householdId || !userId) return;

    const channel = supabase
      .channel(`notifications-${householdId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "list_items" },
        (payload) => {
          const prefs = getNotificationPrefs();
          if (!prefs.enabled || !prefs.listActivity) return;
          const item = payload.new as { id: string; list_id: string; content: string; created_by: string };
          if (item.created_by === userId) return;
          const list = listsRef.current.get(item.list_id);
          if (!list) return;
          const creator = membersRef.current.find((m) => m.user_id === item.created_by);
          void pushNotify(
            `${creator?.display_name ?? "Någon"} lade till`,
            `${item.content} · ${list.name}`,
            `list-add-${item.id}`,
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "list_items" },
        (payload) => {
          const prefs = getNotificationPrefs();
          if (!prefs.enabled || !prefs.listActivity) return;
          const oldItem = payload.old as { completed?: boolean; created_by?: string };
          const item = payload.new as { id: string; list_id: string; content: string; completed: boolean; completed_by: string | null };
          if (!item.completed || oldItem.completed) return;
          const completedBy = item.completed_by ?? oldItem.created_by;
          if (!completedBy || completedBy === userId) return;
          const list = listsRef.current.get(item.list_id);
          if (!list) return;
          const actor = membersRef.current.find((m) => m.user_id === completedBy);
          void pushNotify(
            `${actor?.display_name ?? "Någon"} bockade av`,
            `${item.content} · ${list.name}`,
            `list-done-${item.id}`,
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events", filter: `household_id=eq.${householdId}` },
        (payload) => {
          const prefs = getNotificationPrefs();
          if (!prefs.enabled) return;
          const event = payload.new as HouseholdEvent;
          const myMember = membersRef.current.find((m) => m.user_id === userId);
          if (!myMember) return;

          if (isAssignedToMember(event, myMember.id)) {
            scheduleEventReminder(event, myMember.id);
          }

          if (event.created_by === userId) return;

          const creator = membersRef.current.find((m) => m.user_id === event.created_by);
          void pushNotify(
            `Ny händelse: ${event.title}`,
            `${formatEventTime(event.start_time, event.all_day)} · ${creator?.display_name ?? "Någon"}`,
            `event-${event.id}`,
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId, userId]);

  useEffect(() => {
    if (!householdId || !userId) return;
    const myMember = members.find((m) => m.user_id === userId);
    if (!myMember) return;

    const syncReminders = async () => {
      const prefs = getNotificationPrefs();
      if (!prefs.enabled || !prefs.eventReminders) return;

      const now = new Date();
      const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const { data } = await supabase
        .from("events")
        .select("id, title, start_time, all_day, member_id, member_ids")
        .eq("household_id", householdId)
        .gte("start_time", now.toISOString())
        .lte("start_time", horizon.toISOString());

      const events = (data as HouseholdEvent[] | null) ?? [];
      syncEventReminders(events, myMember.id);

      const leadMs = prefs.reminderMinutes * 60 * 1000;
      const windowStart = new Date(Date.now() + leadMs - 60_000);
      const windowEnd = new Date(Date.now() + leadMs + 60_000);
      clearOldRemindedEvents(events.map((e) => e.id));
      const reminded = getRemindedEventIds();

      for (const event of events) {
        if (!isAssignedToMember(event, myMember.id)) continue;
        const start = new Date(event.start_time).getTime();
        if (start < windowStart.getTime() || start > windowEnd.getTime()) continue;
        if (reminded.has(event.id)) continue;
        void fireEventReminder(event, prefs.reminderMinutes);
      }
    };

    syncReminders();
    const interval = setInterval(syncReminders, 60_000);
    return () => clearInterval(interval);
  }, [householdId, userId, members]);
}
