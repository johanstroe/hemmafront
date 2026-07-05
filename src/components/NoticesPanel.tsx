import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Member } from "@/hooks/useHousehold";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pin, PinOff, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

type Notice = {
  id: string;
  household_id: string;
  created_by: string;
  content: string;
  color: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

const COLORS: { key: string; bg: string; border: string }[] = [
  { key: "yellow", bg: "bg-amber-100", border: "border-amber-300" },
  { key: "pink", bg: "bg-rose-100", border: "border-rose-300" },
  { key: "green", bg: "bg-emerald-100", border: "border-emerald-300" },
  { key: "blue", bg: "bg-sky-100", border: "border-sky-300" },
  { key: "purple", bg: "bg-violet-100", border: "border-violet-300" },
];

function colorClasses(key: string) {
  return COLORS.find((c) => c.key === key) ?? COLORS[0];
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

export function NoticesPanel({
  householdId,
  userId,
  members,
}: {
  householdId: string;
  userId: string;
  members: Member[];
}) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftColor, setDraftColor] = useState("yellow");

  const fetchNotices = async () => {
    const { data, error } = await (supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (c: string, v: string) => {
            order: (c: string, o: { ascending: boolean }) => {
              order: (c: string, o: { ascending: boolean }) => Promise<{ data: Notice[] | null; error: unknown }>;
            };
          };
        };
      };
    })
      .from("notices")
      .select("*")
      .eq("household_id", householdId)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) return;
    setNotices(data ?? []);
  };

  useEffect(() => {
    fetchNotices();
    const channel = supabase
      .channel(`notices-${householdId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notices", filter: `household_id=eq.${householdId}` },
        fetchNotices,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  const membersById = useMemo(() => {
    const m = new Map<string, Member>();
    for (const x of members) m.set(x.user_id, x);
    return m;
  }, [members]);

  const addNotice = async () => {
    const content = draft.trim();
    if (!content) return;
    const { error } = await (supabase as unknown as {
      from: (t: string) => { insert: (v: unknown) => Promise<{ error: unknown }> };
    })
      .from("notices")
      .insert({
        household_id: householdId,
        created_by: userId,
        content,
        color: draftColor,
      });
    if (error) {
      toast.error("Kunde inte spara notisen");
      return;
    }
    setDraft("");
    setDraftColor("yellow");
    setAdding(false);
  };

  const togglePin = async (n: Notice) => {
    await (supabase as unknown as {
      from: (t: string) => {
        update: (v: unknown) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
      };
    })
      .from("notices")
      .update({ pinned: !n.pinned })
      .eq("id", n.id);
  };

  const removeNotice = async (n: Notice) => {
    const { error } = await (supabase as unknown as {
      from: (t: string) => {
        delete: () => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
      };
    })
      .from("notices")
      .delete()
      .eq("id", n.id);
    if (error) toast.error("Kunde inte ta bort");
  };

  return (
    <div className="rounded-2xl border bg-card p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Anslagstavla</h2>
        {!adding ? (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1" /> Ny
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setDraft(""); }}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {adding && (
        <div className={`rounded-xl border p-3 mb-4 ${colorClasses(draftColor).bg} ${colorClasses(draftColor).border}`}>
          <Textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Skriv en notis till familjen…"
            rows={3}
            className="bg-white/60 border-transparent focus-visible:ring-1 resize-none"
          />
          <div className="flex items-center justify-between mt-3">
            <div className="flex gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-label={c.key}
                  onClick={() => setDraftColor(c.key)}
                  className={`h-6 w-6 rounded-full border ${c.bg} ${c.border} ${
                    draftColor === c.key ? "ring-2 ring-foreground/60" : ""
                  }`}
                />
              ))}
            </div>
            <Button size="sm" onClick={addNotice} disabled={!draft.trim()}>
              Sätt upp
            </Button>
          </div>
        </div>
      )}

      {notices.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Inga notiser än. Sätt upp den första!
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {notices.map((n) => {
            const c = colorClasses(n.color);
            const author = membersById.get(n.created_by);
            const canDelete = n.created_by === userId;
            return (
              <div
                key={n.id}
                className={`relative rounded-xl border p-3 pr-9 shadow-sm ${c.bg} ${c.border} rotate-[-0.4deg] hover:rotate-0 transition-transform`}
              >
                <button
                  type="button"
                  onClick={() => togglePin(n)}
                  aria-label={n.pinned ? "Ta bort nål" : "Nåla fast"}
                  className="absolute top-2 right-2 h-7 w-7 grid place-items-center rounded-full hover:bg-black/5 text-foreground/70"
                >
                  {n.pinned ? <Pin className="h-4 w-4 fill-current" /> : <PinOff className="h-4 w-4" />}
                </button>
                <p className="whitespace-pre-wrap text-sm text-foreground/90 leading-snug">{n.content}</p>
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-black/10">
                  <div className="flex items-center gap-2 min-w-0">
                    {author && (
                      <span
                        className="h-5 w-5 rounded-full grid place-items-center text-[10px] font-semibold text-white shrink-0"
                        style={{ backgroundColor: author.avatar_color }}
                      >
                        {author.display_name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="text-xs text-foreground/60 truncate">
                      {author?.display_name ?? "Okänd"} · {formatDate(n.created_at)}
                    </span>
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => removeNotice(n)}
                      aria-label="Ta bort"
                      className="h-6 w-6 grid place-items-center rounded hover:bg-black/5 text-foreground/50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}