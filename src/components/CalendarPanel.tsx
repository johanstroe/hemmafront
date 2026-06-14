import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Member } from "@/hooks/useHousehold";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, RefreshCw, Link2, Link2Off, Check, ChevronLeft, ChevronRight, CalendarDays, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
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

const SV_DAYS_SHORT = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];
const SV_DAYS = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];
const SV_MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];

export function CalendarPanel({ householdId, members, userId }: { householdId: string; members: Member[]; userId: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [creating, setCreating] = useState(false);
  const [createDate, setCreateDate] = useState<string | undefined>();
  const [gConnected, setGConnected] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState<"week" | "month">("week");
  const [monthOffset, setMonthOffset] = useState(0);

  const getAuthUrl = useServerFn(getGoogleAuthUrl);
  const getStatus = useServerFn(getGoogleStatus);
  const runSync = useServerFn(syncGoogleCalendar);
  const disconnect = useServerFn(disconnectGoogle);

  const visibleRange = useMemo(() => {
    if (view === "week") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return { start, end };
    }
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return { start, end };
  }, [view, monthOffset]);

  const fetchEvents = async () => {
    const { start, end } = visibleRange;
    const { data } = await supabase
      .from("events")
      .select("*")
      .eq("household_id", householdId)
      .gte("start_time", start.toISOString())
      .lt("start_time", end.toISOString())
      .order("start_time", { ascending: true });
    setEvents((data as Event[]) ?? []);
  };

  const doSync = async (silent = false) => {
    setSyncing(true);
    try {
      const res = await runSync({ data: { householdId } });
      if (!res.connected) {
        setGConnected(false);
        return;
      }
      setGConnected(true);
      if (!silent) {
        toast.success(`Synkad: ${res.pulled} hämtade, ${res.pushed} skickade`);
      }
      fetchEvents();
    } catch (e) {
      if (!silent) toast.error("Synk misslyckades", { description: (e as Error).message });
    } finally {
      setSyncing(false);
    }
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
    fetchEvents();
    getStatus().then((s) => {
      setGConnected(s.connected);
      if (s.connected) doSync(true);
    }).catch(() => setGConnected(false));

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
      .on("postgres_changes", { event: "*", schema: "public", table: "events", filter: `household_id=eq.${householdId}` }, fetchEvents)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, view, monthOffset]);

  const openCreate = (date?: string) => {
    setCreateDate(date);
    setCreating(true);
  };

  const monthTitle = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
    return `${SV_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }, [monthOffset]);

  const deleteEvent = async (id: string) => {
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) toast.error("Kunde inte ta bort");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-2xl font-semibold">Kalender</h2>
          <p className="text-xs text-muted-foreground">
            {view === "week" ? "Kommande 7 dagar" : monthTitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {view === "month" && (
            <div className="flex items-center gap-1">
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
          )}
          <div className="flex items-center bg-muted rounded-full p-0.5">
            <button
              onClick={() => setView("week")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${view === "week" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <CalendarDays className="size-3.5" /> Vecka
            </button>
            <button
              onClick={() => setView("month")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${view === "month" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <CalendarIcon className="size-3.5" /> Månad
            </button>
          </div>
          {gConnected === true ? (
            <>
              <Button onClick={() => doSync(false)} disabled={syncing} size="sm" variant="ghost" className="rounded-full gap-1.5" title="Synka Google">
                <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
              </Button>
              <Button onClick={disconnectG} size="sm" variant="ghost" className="rounded-full gap-1.5" title="Koppla från Google">
                <Link2Off className="size-4" />
              </Button>
            </>
          ) : gConnected === false ? (
            <Button onClick={connectGoogle} size="sm" variant="outline" className="rounded-full gap-1.5">
              <Link2 className="size-4" /> Google
            </Button>
          ) : null}
          <Button onClick={() => openCreate()} size="sm" className="rounded-full gap-1.5">
            <Plus className="size-4" /> Ny
          </Button>
        </div>
      </div>

      {view === "week" ? (
        <WeekView events={events} members={members} userId={userId} onDelete={deleteEvent} onDayClick={openCreate} />
      ) : (
        <MonthView events={events} members={members} userId={userId} onDelete={deleteEvent} monthOffset={monthOffset} onDayClick={openCreate} />
      )}

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

function WeekView({ events, members, userId, onDelete, onDayClick }: {
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
    const d = new Date(today);
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
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const weeks: { date: Date; events: Event[] }[][] = [];
  let currentWeek: { date: Date; events: Event[] }[] = [];

  // Pad with previous month days
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = startDay - 1; i >= 0; i--) {
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
          <div key={d} className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center py-2">
            {d}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 min-h-[120px]">
          {week.map(({ date, events: dayEvents }) => {
            const isToday = sameDay(date, today);
            const isCurrentMonth = date.getMonth() === month;
            return (
              <button
                key={date.toISOString()}
                onClick={() => onDayClick(date.toISOString().slice(0, 10))}
                className={`relative border-b border-r border-border p-1.5 text-left transition-colors hover:bg-muted/40 ${!isCurrentMonth ? "bg-muted/20 opacity-60" : ""}`}
              >
                <span className={`inline-flex items-center justify-center size-6 text-xs font-medium rounded-full mb-1 ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                  {date.getDate()}
                </span>
                <div className="flex flex-col gap-1">
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
      className={`w-full text-left bg-card rounded-2xl ring-1 ring-border p-4 transition-shadow hover:shadow-sm ${events.length === 0 ? "opacity-70" : ""}`}
    >
      <div className="flex items-baseline gap-3 mb-3">
        <span className={`text-xs uppercase font-semibold tracking-wider ${isToday ? "text-primary" : "text-muted-foreground"}`}>
          {isToday ? "Idag" : SV_DAYS_SHORT[date.getDay()]}
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
    <div key={e.id} className="group flex items-center gap-3 p-2.5 rounded-lg" style={{ backgroundColor: `color-mix(in oklch, ${color} 10%, transparent)`, borderLeft: `3px solid ${color}` }}>
      <span className="font-mono text-xs font-semibold shrink-0 w-12" style={{ color }}>{time}</span>
      <span className="text-sm font-medium flex-1 truncate">{e.title}</span>
      {assigned.length > 0 && (
        <span className="flex items-center gap-1 flex-wrap justify-end">
          {assigned.map((mm) => (
            <span key={mm.id} className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: `color-mix(in oklch, ${mm.avatar_color} 15%, transparent)`, color: mm.avatar_color }}>
              {mm.display_name}
            </span>
          ))}
        </span>
      )}
      {e.created_by === userId && (
        <button onClick={(ev) => { ev.stopPropagation(); onDelete(e.id); }} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
          <Trash2 className="size-3.5" />
        </button>
      )}
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

  const toggleMember = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const submit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    const start = allDay ? new Date(`${date}T00:00:00`) : new Date(`${date}T${time}:00`);
    const { error } = await supabase.from("events").insert({
      household_id: householdId,
      title: title.trim(),
      start_time: start.toISOString(),
      all_day: allDay,
      member_id: selectedIds[0] ?? null,
      member_ids: selectedIds,
      created_by: userId,
      source: "manual",
    } as never);
    if (error) {
      toast.error("Kunde inte spara", { description: error.message });
      setSubmitting(false);
      return;
    }
    toast.success("Tillagd i kalendern");
    setTitle("");
    setSubmitting(false);
    onCreated();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-2xl">
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