import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Member } from "@/hooks/useHousehold";
import { Input } from "@/components/ui/input";
import { Check, Plus, X } from "lucide-react";
import { toast } from "sonner";

type ListType = "shopping" | "reminders" | "todos";
type ListRow = { id: string; name: string; type: ListType };
type ListItem = {
  id: string;
  list_id: string;
  content: string;
  completed: boolean;
  completed_by: string | null;
  created_by: string;
  created_at: string;
};

const TABS: { type: ListType; label: string }[] = [
  { type: "shopping", label: "Inköp" },
  { type: "reminders", label: "Kom ihåg" },
  { type: "todos", label: "Att göra" },
];

export function ListsPanel({ householdId, userId, members }: { householdId: string; userId: string; members: Member[] }) {
  const [lists, setLists] = useState<ListRow[]>([]);
  const [items, setItems] = useState<ListItem[]>([]);
  const [activeTab, setActiveTab] = useState<ListType>("shopping");
  const [newContent, setNewContent] = useState("");

  const fetchAll = async () => {
    const { data: listData } = await supabase
      .from("lists")
      .select("id, name, type")
      .eq("household_id", householdId)
      .order("sort_order");
    const listRows = (listData as ListRow[]) ?? [];
    setLists(listRows);
    if (listRows.length === 0) return;
    const ids = listRows.map((l) => l.id);
    const { data: itemData } = await supabase
      .from("list_items")
      .select("*")
      .in("list_id", ids)
      .order("created_at", { ascending: true });
    setItems((itemData as ListItem[]) ?? []);
  };

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel(`lists-${householdId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lists", filter: `household_id=eq.${householdId}` }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "list_items" }, fetchAll)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  const activeList = lists.find((l) => l.type === activeTab);
  const activeItems = activeList ? items.filter((i) => i.list_id === activeList.id) : [];
  const pending = activeItems.filter((i) => !i.completed);
  const done = activeItems.filter((i) => i.completed);

  const addItem = async () => {
    if (!activeList || !newContent.trim()) return;
    const content = newContent.trim();
    setNewContent("");
    const { error } = await supabase.from("list_items").insert({
      list_id: activeList.id,
      content,
      created_by: userId,
    });
    if (error) toast.error("Kunde inte lägga till");
  };

  const toggleItem = async (item: ListItem) => {
    const { error } = await supabase
      .from("list_items")
      .update({
        completed: !item.completed,
        completed_by: !item.completed ? userId : null,
        completed_at: !item.completed ? new Date().toISOString() : null,
      })
      .eq("id", item.id);
    if (error) toast.error("Kunde inte uppdatera");
  };

  const deleteItem = async (id: string) => {
    await supabase.from("list_items").delete().eq("id", id);
  };

  const clearDone = async () => {
    if (done.length === 0) return;
    await supabase.from("list_items").delete().in("id", done.map((d) => d.id));
    toast.success("Klara objekt rensade");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-2xl font-semibold">Listor</h2>
      </div>

      <div className="bg-card rounded-2xl ring-1 ring-border overflow-hidden">
        <div className="flex p-1.5 m-1.5 bg-secondary rounded-xl">
          {TABS.map((t) => (
            <button
              key={t.type}
              onClick={() => setActiveTab(t.type)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === t.type ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="px-4 py-2 max-h-[420px] overflow-y-auto">
          {pending.length === 0 && done.length === 0 && (
            <p className="text-sm text-muted-foreground italic text-center py-8">Tomt här. Lägg till något!</p>
          )}
          <ul className="divide-y divide-border">
            {pending.map((item) => (
              <ItemRow key={item.id} item={item} members={members} onToggle={() => toggleItem(item)} onDelete={() => deleteItem(item.id)} userId={userId} />
            ))}
          </ul>
          {done.length > 0 && (
            <>
              <div className="flex items-center justify-between pt-4 pb-2">
                <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">Klart ({done.length})</span>
                <button onClick={clearDone} className="text-xs text-muted-foreground hover:text-destructive">Rensa</button>
              </div>
              <ul className="divide-y divide-border">
                {done.map((item) => (
                  <ItemRow key={item.id} item={item} members={members} onToggle={() => toggleItem(item)} onDelete={() => deleteItem(item.id)} userId={userId} />
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="border-t border-border bg-secondary/40 p-3">
          <div className="relative">
            <Input
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addItem(); }}
              placeholder="Lägg till i listan…"
              className="bg-card pr-11 rounded-xl"
            />
            <button
              onClick={addItem}
              disabled={!newContent.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 size-7 rounded-lg bg-primary text-primary-foreground grid place-items-center disabled:opacity-30"
              aria-label="Lägg till"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemRow({ item, members, onToggle, onDelete, userId }: {
  item: ListItem;
  members: Member[];
  onToggle: () => void;
  onDelete: () => void;
  userId: string;
}) {
  const creator = members.find((m) => m.user_id === item.created_by);
  return (
    <li className="flex items-center gap-3 py-2.5 group">
      <button
        onClick={onToggle}
        className={`size-5 rounded-md border-2 grid place-items-center transition-colors shrink-0 ${
          item.completed ? "bg-primary border-primary" : "border-border hover:border-primary"
        }`}
        aria-label={item.completed ? "Markera som ogjort" : "Markera som klart"}
      >
        {item.completed && <Check className="size-3 text-primary-foreground" strokeWidth={3} />}
      </button>
      <span className={`text-sm flex-1 truncate ${item.completed ? "line-through text-muted-foreground" : ""}`}>
        {item.content}
      </span>
      {creator && (
        <span
          className="size-5 rounded-full grid place-items-center text-[9px] font-semibold text-white shrink-0"
          style={{ backgroundColor: creator.avatar_color }}
          title={`${creator.display_name} lade till`}
        >
          {creator.display_name.slice(0, 1).toUpperCase()}
        </span>
      )}
      {(item.created_by === userId || item.completed) && (
        <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0" aria-label="Ta bort">
          <X className="size-4" />
        </button>
      )}
    </li>
  );
}