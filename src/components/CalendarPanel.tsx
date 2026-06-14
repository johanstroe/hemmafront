import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Member } from "@/hooks/useHousehold";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, RefreshCw, Link2, Link2Off } from "lucide-react";
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
  created_by: string;
};

const SV_DAYS = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];
const SV_MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];

export function CalendarPanel({ householdId, members, userId }: { householdId: string; members: Member[]; userId: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [creating, setCreating] = useState(false);
  const [gConnected, setGConnected] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);

  const getAuthUrl = useServerFn(getGoogleAuthUrl);
  const getStatus = useServerFn(getGoogleStatus);
  const runSync = useServerFn(syncGoogleCalendar);
  const disconnect = useServerFn(disconnectGoogle);

  const fetchEvents = async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 14);
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
    // Check Google status, then auto-sync on each page load
    getStatus().then((s) => {
      setGConnected(s.connected);
      if (s.connected) doSync(true);
    }).catch(() => setGConnected(false));

    // Show toast for callback redirect
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
  }, [householdId]);

  // Group events by day (next 7 days)
  const days: { date: Date; events: Event[] }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dayEvents = events.filter((e) => {
      const ed = new Date(e.start_time);
      return ed.getFullYear() === d.getFullYear() && ed.getMonth() === d.getMonth() && ed.getDate() === d.getDate();
    });
    days.push({ date: d, events: dayEvents });
  }

  const deleteEvent = async (id: string) => {
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) toast.error("Kunde inte ta bort");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-2xl font-semibold">Kalender</h2>
          <p className="text-xs text-muted-foreground">Kommande 7 dagar</p>
        </div>
        <div className="flex items-center gap-2">
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
          <Button onClick={() => setCreating(true)} size="sm" className="rounded-full gap-1.5">
            <Plus className="size-4" /> Ny
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {days.map(({ date, events: dayEvents }) => (
          <DayBlock
            key={date.toISOString()}
            date={date}
            events={dayEvents}
            members={members}
            userId={userId}
            onDelete={deleteEvent}
          />
        ))}
      </div>

      <CreateEventDialog
        open={creating}
        onClose={() => setCreating(false)}
        householdId={householdId}
        members={members}
        userId={userId}
        onCreated={fetchEvents}
      />
    </div>
  );
}

function DayBlock({ date, events, members, userId, onDelete }: {
  date: Date;
  events: Event[];
  members: Member[];
  userId: string;
  onDelete: (id: string) => void;
}) {
  const isToday = date.toDateString() === new Date().toDateString();
  return (
    <div className={`bg-card rounded-2xl ring-1 ring-border p-4 ${events.length === 0 ? "opacity-70" : ""}`}>
      <div className="flex items-baseline gap-3 mb-3">
        <span className={`text-xs uppercase font-semibold tracking-wider ${isToday ? "text-primary" : "text-muted-foreground"}`}>
          {isToday ? "Idag" : SV_DAYS[date.getDay()]}
        </span>
        <span className="font-display text-lg font-semibold">{date.getDate()}</span>
        <span className="text-xs text-muted-foreground">{SV_MONTHS[date.getMonth()]}</span>
      </div>
      {events.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Inget planerat</p>
      ) : (
        <div className="space-y-2">
          {events.map((e) => {
            const m = members.find((x) => x.id === e.member_id);
            const color = m?.avatar_color ?? "oklch(0.5 0.02 130)";
            const time = e.all_day ? "Heldag" : new Date(e.start_time).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
            return (
              <div key={e.id} className="group flex items-center gap-3 p-2.5 rounded-lg" style={{ backgroundColor: `color-mix(in oklch, ${color} 10%, transparent)`, borderLeft: `3px solid ${color}` }}>
                <span className="font-mono text-xs font-semibold shrink-0 w-12" style={{ color }}>{time}</span>
                <span className="text-sm font-medium flex-1 truncate">{e.title}</span>
                {m && (
                  <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: `color-mix(in oklch, ${color} 15%, transparent)`, color }}>
                    {m.display_name}
                  </span>
                )}
                {e.created_by === userId && (
                  <button onClick={() => onDelete(e.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateEventDialog({ open, onClose, householdId, members, userId, onCreated }: {
  open: boolean;
  onClose: () => void;
  householdId: string;
  members: Member[];
  userId: string;
  onCreated: () => void;
}) {
  const myMember = members.find((m) => m.user_id === userId);
  const [title, setTitle] = useState("");
  const today = new Date();
  const defaultDate = today.toISOString().slice(0, 10);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("18:00");
  const [allDay, setAllDay] = useState(false);
  const [memberId, setMemberId] = useState<string>(myMember?.id ?? "");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    const start = allDay ? new Date(`${date}T00:00:00`) : new Date(`${date}T${time}:00`);
    const { error } = await supabase.from("events").insert({
      household_id: householdId,
      title: title.trim(),
      start_time: start.toISOString(),
      all_day: allDay,
      member_id: memberId || null,
      created_by: userId,
      source: "manual",
    });
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
            <Label>För vem?</Label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger><SelectValue placeholder="Välj medlem" /></SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="inline-flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: m.avatar_color }} />
                      {m.display_name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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