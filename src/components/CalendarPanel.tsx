import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Member } from "@/hooks/useHousehold";
import { useAppEnter } from "@/hooks/use-app-enter";
import { useHorizontalSwipe } from "@/hooks/use-swipe";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, RefreshCw, Link2, Link2Off, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { notifyEventSaved } from "@/lib/event-reminders";
import { getGoogleAuthUrl, getGoogleStatus, syncGoogleCalendar, disconnectGoogle } from "@/lib/google-calendar.functions";

type Event = {
  id: string;
  household_id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  all_day: boolean;
  member_id: string | null;
  member_ids: string[] | null;
  created_by: string;
};

const SV_DAYS_SHORT = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
const SV_DAYS = ["måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag", "söndag"];
const SV_MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];

export function CalendarPanel({ householdId, members, userId }: { householdId: string; members: Member[]; userId: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [creating, setCreating] = useState(false);
  const [createDate, setCreateDate] = useState<string | undefined>();
  const [gConnected, setGConnected] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);

  const getAuthUrl = useServerFn(getGoogleAuthUrl);
  const getStatus = useServerFn(getGoogleStatus);
  const runSync = useServerFn(syncGoogleCalendar);
  const disconnect = useServerFn(disconnectGoogle);

  const visibleRange = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return { start, end };
  }, [monthOffset]);

  const fetchEvents = useCallback(async () => {
    const { start, end } = visibleRange;
    const { data } = await supabase
      .from("events")
      .select("*")
      .eq("household_id", householdId)
      .gte("start_time", start.toISOString())
      .lt("start_time", end.toISOString())
      .order("start_time", { ascending: true });
    setEvents((data as Event[]) ?? []);
  }, [householdId, visibleRange]);

  const refreshAll = useCallback(async (silent = true) => {
    setSyncing(true);
    try {
      const status = await getStatus();
      setGConnected(status.connected);
      if (status.connected) {
        const res = await runSync({ data: { householdId } });
        if (!silent) toast.success(`Synkad: ${res.pulled} hämtade, ${res.pushed} skickade`);
      }
    } catch (e) {
      setGConnected(false);
      if (!silent) toast.error("Synk misslyckades", { description: (e as Error).message });
    } finally {
      setSyncing(false);
    }
    await fetchEvents();
  }, [fetchEvents, getStatus, householdId, runSync]);

  const doSync = async (silent = false) => {
    await refreshAll(silent);
  };

  const connectGoogle = async () => {
    try {
      const { url } = await getAuthUrl();
      window.location.href = url;
    } catch (e) {
      toast.error("Kunde inte starta Google-anslutning", { description: (e as Error).message });
    }
  };

  const disconnectG = async () => {
    await disconnect();
    setGConnected(false);
    toast.success("Google-kalender frånkopplad");
  };

  useEffect(() => {
    void refreshAll(true);

    const url = new URL(window.location.href);
    const g = url.searchParams.get("google");
    if (g === "connected") {
      toast.success("Google-kalender ansluten");
      url.searchParams.delete("google");
      window.history.replaceState({}, "", url.toString());
    } else if (g === "error") {
      const reason = url.searchParams.get("reason") ?? "okänt fel";
      toast.error("Google-anslutning misslyckades", { description: reason });
      url.searchParams.delete("google");
      url.searchParams.delete("reason");
      window.history.replaceState({}, "", url.toString());
    }

    const channel = supabase
      .channel(`events-${householdId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "events", filter: `household_id=eq.${householdId}` }, () => {
        void fetchEvents();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId, refreshAll, fetchEvents]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  useAppEnter(() => {
    void refreshAll(true);
  });

  const openCreate = (date?: string) => {
    setCreateDate(date);
    setCreating(true);
  };

  const monthTitle = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
    return `${SV_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }, [monthOffset]);

  const monthSwipe = useHorizontalSwipe(
    () => setMonthOffset((o) => o + 1),
    () => setMonthOffset((o) => o - 1),
  );

  const deleteEvent = async (id: string) => {
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) toast.error("Kunde inte ta bort");
  };

  return (
    <div className="min-w-0">
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-xl sm:text-2xl font-semibold">Kalender</h2>
          <p className="text-xs text-muted-foreground truncate">{monthTitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <div className="flex items-center gap-0.5 sm:gap-1">
            <Button onClick={() => setMonthOffset((o) => o - 1)} size="sm" variant="ghost" className="rounded-full size-8 p-0">
              <ChevronLeft className="size-4" />
            </Button>
            <Button onClick={() => setMonthOffset(0)} size="sm" variant="ghost" className="rounded-full text-xs px-2">
              Idag
            </Button>
            <Button onClick={() => setMonthOffset((o) => o + 1)} size="sm" variant="ghost" className="rounded-full size-8 p-0">
              <ChevronRight className="size-4" />
            </Button>
          </div>
          {gConnected === true ? (
            <>
              <Button onClick={() => doSync(false)} disabled={syncing} size="sm" variant="ghost" className="rounded-full size-8 p-0 sm:size-auto sm:px-3" title="Synka Google">
                <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
              </Button>
              <Button onClick={disconnectG} size="sm" variant="ghost" className="rounded-full size-8 p-0 sm:size-auto sm:px-3" title="Koppla från Google">
                <Link2Off className="size-4" />
              </Button>
            </>
          ) : gConnected === false ? (
            <Button onClick={connectGoogle} size="sm" variant="outline" className="rounded-full gap-1.5 px-2.5 sm:px-3">
              <Link2 className="size-4" /> <span className="hidden sm:inline">Google</span>
            </Button>
          ) : null}
          <Button onClick={() => openCreate()} size="sm" className="rounded-full gap-1.5 px-2.5 sm:px-3">
            <Plus className="size-4" /> <span className="hidden sm:inline">Ny</span>
          </Button>
        </div>
      </div>

      <div className="touch-pan-y sm:touch-auto" {...monthSwipe}>
        <MonthView events={events} members={members} userId={userId} onDelete={deleteEvent} monthOffset={monthOffset} onDayClick={openCreate} />
      </div>

      <CreateEventDialog
        open={creating}
        onClose={() => { setCreating(false); setCreateDate(undefined); }}
        householdId={householdId}
        members={members}
        userId={userId}
        onCreated={fetchEvents}
        defaultDate={createDate}
      />
    </div>
  );
}

function WeekView({ weekStart, events, members, userId, onDelete, onDayClick }: {
  weekStart: Date;
  events: Event[];
  members: Member[];
  userId: string;
  onDelete: (id: string) => void;
  onDayClick: (date?: string) => void;
}) {
  const days: { date: Date; events: Event[] }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dayEvents = events.filter((e) => sameDay(new Date(e.start_time), d));
    days.push({ date: d, events: dayEvents });
  }

  return (
    <div className="space-y-3">
      {days.map(({ date, events: dayEvents }) => (
        <DayBlock
          key={date.toISOString()}
          date={date}
          events={dayEvents}
          members={members}
          userId={userId}
          onDelete={onDelete}
          onClick={() => onDayClick(date.toISOString().slice(0, 10))}
        />
      ))}
    </div>
  );
}

function MonthView({ events, members, userId, onDelete, monthOffset, onDayClick }: {
  events: Event[];
  members: Member[];
  userId: string;
  onDelete: (id: string) => void;
  monthOffset: number;
  onDayClick: (date?: string) => void;
}) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + monthOffset;
  const firstOfMonth = new Date(year, month, 1);
  const startDay = firstOfMonth.getDay();
  const mondayStartOffset = (startDay + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const weeks: { date: Date; events: Event[] }[][] = [];
  let currentWeek: { date: Date; events: Event[] }[] = [];

  // Pad with previous month days
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = mondayStartOffset - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthDays - i);
    currentWeek.push({ date: d, events: events.filter((e) => sameDay(new Date(e.start_time), d)) });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    currentWeek.push({ date: d, events: events.filter((e) => sameDay(new Date(e.start_time), d)) });
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // Pad remaining cells
  let nextDay = 1;
  while (currentWeek.length < 7) {
    const d = new Date(year, month + 1, nextDay++);
    currentWeek.push({ date: d, events: events.filter((e) => sameDay(new Date(e.start_time), d)) });
  }
  weeks.push(currentWeek);

  const today = new Date();

  return (
    <div className="bg-card rounded-2xl ring-1 ring-border overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border">
        {SV_DAYS_SHORT.map((d) => (
          <div key={d} className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center py-1.5 sm:py-2">
            {d}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 min-h-[4.5rem] sm:min-h-[120px]">
          {week.map(({ date, events: dayEvents }) => {
            const isToday = sameDay(date, today);
            const isCurrentMonth = date.getMonth() === month;
            return (
              <button
                key={date.toISOString()}
                onClick={() => onDayClick(date.toISOString().slice(0, 10))}
                className={`relative border-b border-r border-border p-0.5 sm:p-1.5 text-left transition-colors hover:bg-muted/40 min-w-0 overflow-hidden ${!isCurrentMonth ? "bg-muted/20 opacity-60" : ""}`}
              >
                <span className={`inline-flex items-center justify-center size-5 sm:size-6 text-[10px] sm:text-xs font-medium rounded-full mb-0.5 sm:mb-1 ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                  {date.getDate()}
                </span>
                <div className="hidden sm:flex flex-col gap-1">
                  {dayEvents.slice(0, 3).map((e) => {
                    const ids = (e.member_ids && e.member_ids.length > 0) ? e.member_ids : (e.member_id ? [e.member_id] : []);
                    const assigned = ids.map((id) => members.find((x) => x.id === id)).filter((x): x is Member => Boolean(x));
                    const color = assigned[0]?.avatar_color ?? "oklch(0.5 0.02 130)";
                    return (
                      <div key={e.id} className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium truncate" style={{ backgroundColor: `color-mix(in oklch, ${color} 12%, transparent)`, color, borderLeft: `2px solid ${color}` }}>
                        <span className="truncate">{e.title}</span>
                      </div>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <span className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 3}</span>
                  )}
                </div>
                <div className="flex sm:hidden flex-wrap gap-0.5 justify-center">
                  {dayEvents.slice(0, 3).map((e) => {
                    const ids = (e.member_ids && e.member_ids.length > 0) ? e.member_ids : (e.member_id ? [e.member_id] : []);
                    const assigned = ids.map((id) => members.find((x) => x.id === id)).filter((x): x is Member => Boolean(x));
                    const color = assigned[0]?.avatar_color ?? "oklch(0.5 0.02 130)";
                    return <span key={e.id} className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />;
                  })}
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function DayBlock({ date, events, members, userId, onDelete, onClick }: {
  date: Date;
  events: Event[];
  members: Member[];
  userId: string;
  onDelete: (id: string) => void;
  onClick?: () => void;
}) {
  const isToday = sameDay(date, new Date());
  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-card rounded-2xl ring-1 ring-border p-3 sm:p-4 transition-shadow hover:shadow-sm min-w-0 ${events.length === 0 ? "opacity-70" : ""}`}
    >
      <div className="flex items-baseline gap-3 mb-3">
        <span className={`text-xs uppercase font-semibold tracking-wider ${isToday ? "text-primary" : "text-muted-foreground"}`}>
          {isToday ? "Idag" : SV_DAYS_SHORT[(date.getDay() + 6) % 7]}
        </span>
        <span className="font-display text-lg font-semibold">{date.getDate()}</span>
        <span className="text-xs text-muted-foreground">{SV_MONTHS[date.getMonth()]}</span>
      </div>
      {events.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Inget planerat</p>
      ) : (
        <div className="space-y-2">
          {events.map((e) => (
            <EventRow key={e.id} event={e} members={members} userId={userId} onDelete={onDelete} />
          ))}
        </div>
      )}
    </button>
  );
}

function EventRow({ event: e, members, userId, onDelete }: {
  event: Event;
  members: Member[];
  userId: string;
  onDelete: (id: string) => void;
}) {
  const ids = (e.member_ids && e.member_ids.length > 0) ? e.member_ids : (e.member_id ? [e.member_id] : []);
  const assigned = ids.map((id) => members.find((x) => x.id === id)).filter((x): x is Member => Boolean(x));
  const color = assigned[0]?.avatar_color ?? "oklch(0.5 0.02 130)";
  const time = e.all_day ? "Heldag" : new Date(e.start_time).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  return (
    <div key={e.id} className="group flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3 p-2 sm:p-2.5 rounded-lg min-w-0" style={{ backgroundColor: `color-mix(in oklch, ${color} 10%, transparent)`, borderLeft: `3px solid ${color}` }}>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="font-mono text-xs font-semibold shrink-0 w-11 sm:w-12" style={{ color }}>{time}</span>
        <span className="text-sm font-medium flex-1 truncate">{e.title}</span>
      </div>
      <div className="flex items-center gap-1 pl-[3.25rem] sm:pl-0 sm:shrink-0">
        {assigned.length > 0 && (
          <span className="flex items-center gap-1 flex-wrap">
            {assigned.map((mm) => (
              <span key={mm.id} className="text-[10px] uppercase font-semibold px-1.5 sm:px-2 py-0.5 rounded truncate max-w-[5rem] sm:max-w-none" style={{ backgroundColor: `color-mix(in oklch, ${mm.avatar_color} 15%, transparent)`, color: mm.avatar_color }}>
                {mm.display_name}
              </span>
            ))}
          </span>
        )}
        {e.created_by === userId && (
          <button onClick={(ev) => { ev.stopPropagation(); onDelete(e.id); }} className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0 ml-auto sm:ml-0">
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function CreateEventDialog({ open, onClose, householdId, members, userId, onCreated, defaultDate }: {
  open: boolean;
  onClose: () => void;
  householdId: string;
  members: Member[];
  userId: string;
  onCreated: () => void;
  defaultDate?: string;
}) {
  const myMember = members.find((m) => m.user_id === userId);
  const [title, setTitle] = useState("");
  const today = new Date();
  const fallbackDate = today.toISOString().slice(0, 10);
  const [date, setDate] = useState(defaultDate ?? fallbackDate);
  const [time, setTime] = useState("18:00");
  const [allDay, setAllDay] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(myMember ? [myMember.id] : []);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (defaultDate) setDate(defaultDate);
  }, [defaultDate]);

  const toggleMember = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const submit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    const start = allDay ? new Date(`${date}T00:00:00`) : new Date(`${date}T${time}:00`);
    const { data, error } = await supabase.from("events").insert({
      household_id: householdId,
      title: title.trim(),
      start_time: start.toISOString(),
      all_day: allDay,
      member_id: selectedIds[0] ?? null,
      member_ids: selectedIds,
      created_by: userId,
      source: "manual",
    } as never).select("id, title, start_time, all_day, member_id, member_ids").single();
    if (error) {
      toast.error("Kunde inte spara", { description: error.message });
      setSubmitting(false);
      return;
    }
    if (data && myMember) {
      await notifyEventSaved(data as { id: string; title: string; start_time: string; all_day: boolean; member_id: string | null; member_ids: string[] | null }, myMember.id);
    } else {
      toast.success("Tillagd i kalendern");
    }
    setTitle("");
    setSubmitting(false);
    onCreated();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-2xl w-[calc(100%-1.5rem)] max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Ny händelse</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="ev-title">Vad?</Label>
            <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="t.ex. Tandläkare" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ev-date">Datum</Label>
              <Input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-time">Tid</Label>
              <Input id="ev-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={allDay} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="size-4 rounded" />
            Heldag
          </label>
          <div className="space-y-2">
            <Label>För vem? <span className="text-xs text-muted-foreground font-normal">(välj en eller flera)</span></Label>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => {
                const active = selectedIds.includes(m.id);
                return (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => toggleMember(m.id)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ring-1 ${active ? "ring-2" : "ring-border opacity-60 hover:opacity-100"}`}
                    style={active ? { backgroundColor: `color-mix(in oklch, ${m.avatar_color} 18%, transparent)`, color: m.avatar_color, boxShadow: `inset 0 0 0 1px ${m.avatar_color}` } : undefined}
                  >
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: m.avatar_color }} />
                    {m.display_name}
                    {active && <Check className="size-3.5" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Avbryt</Button>
          <Button onClick={submit} disabled={submitting || !title.trim()}>Spara</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}