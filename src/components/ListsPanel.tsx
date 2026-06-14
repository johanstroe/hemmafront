import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Member } from "@/hooks/useHousehold";
import { Input } from "@/components/ui/input";
import { Check, ChevronDown, ChevronRight, Plus, X } from "lucide-react";
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
  parent_id?: string | null;
};

const TABS: { type: ListType; label: string }[] = [
  { type: "shopping", label: "Inköp" },
  { type: "reminders", label: "Kom ihåg" },
  { type: "todos", label: "Att göra" },
];

function getChildren(items: ListItem[], parentId: string) {
  return items.filter((i) => i.parent_id === parentId);
}

function isTopicComplete(item: ListItem, items: ListItem[]) {
  const children = getChildren(items, item.id);
  if (children.length === 0) return item.completed;
  return children.every((c) => c.completed);
}

export function ListsPanel({ householdId, userId, members }: { householdId: string; userId: string; members: Member[] }) {
  const [lists, setLists] = useState<ListRow[]>([]);
  const [items, setItems] = useState<ListItem[]>([]);
  const [activeTab, setActiveTab] = useState<ListType>("shopping");
  const [newContent, setNewContent] = useState("");
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

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
  const isTodos = activeTab === "todos";

  const flatItems = isTodos ? activeItems.filter((i) => !i.parent_id) : activeItems;
  const pending = isTodos
    ? flatItems.filter((i) => !isTopicComplete(i, activeItems))
    : activeItems.filter((i) => !i.completed);
  const done = isTodos
    ? flatItems.filter((i) => isTopicComplete(i, activeItems))
    : activeItems.filter((i) => i.completed);

  const addItem = async () => {
    if (!activeList || !newContent.trim()) return;
    const content = newContent.trim();
    setNewContent("");
    const { error } = await supabase.from("list_items").insert({
      list_id: activeList.id,
      content,
      created_by: userId,
    });
    if (error) toast.error("Kunde inte lägga till", { description: error.message });
  };

  const addSubItem = async (parentId: string, content: string) => {
    if (!activeList || !content.trim()) return;
    const { error } = await supabase.from("list_items").insert({
      list_id: activeList.id,
      content: content.trim(),
      created_by: userId,
      parent_id: parentId,
    });
    if (error) toast.error("Kunde inte lägga till deluppgift", { description: error.message });
    else setExpandedTopics((prev) => new Set(prev).add(parentId));
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
    const idsToDelete = new Set<string>();
    for (const item of done) {
      idsToDelete.add(item.id);
      getChildren(activeItems, item.id).forEach((c) => idsToDelete.add(c.id));
    }
    await supabase.from("list_items").delete().in("id", [...idsToDelete]);
    toast.success("Klara objekt rensade");
  };

  const toggleExpanded = (id: string) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
            {pending.map((item) =>
              isTodos ? (
                <TodoTopicRow
                  key={item.id}
                  item={item}
                  items={activeItems}
                  members={members}
                  userId={userId}
                  expanded={expandedTopics.has(item.id)}
                  onToggleExpand={() => toggleExpanded(item.id)}
                  onToggle={() => toggleItem(item)}
                  onDelete={() => deleteItem(item.id)}
                  onAddSubItem={(content) => addSubItem(item.id, content)}
                  onToggleSub={(sub) => toggleItem(sub)}
                  onDeleteSub={(id) => deleteItem(id)}
                />
              ) : (
                <ItemRow
                  key={item.id}
                  item={item}
                  members={members}
                  onToggle={() => toggleItem(item)}
                  onDelete={() => deleteItem(item.id)}
                  userId={userId}
                />
              )
            )}
          </ul>
          {done.length > 0 && (
            <>
              <div className="flex items-center justify-between pt-4 pb-2">
                <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">Klart ({done.length})</span>
                <button onClick={clearDone} className="text-xs text-muted-foreground hover:text-destructive">Rensa</button>
              </div>
              <ul className="divide-y divide-border">
                {done.map((item) =>
                  isTodos ? (
                    <TodoTopicRow
                      key={item.id}
                      item={item}
                      items={activeItems}
                      members={members}
                      userId={userId}
                      expanded={expandedTopics.has(item.id)}
                      onToggleExpand={() => toggleExpanded(item.id)}
                      onToggle={() => toggleItem(item)}
                      onDelete={() => deleteItem(item.id)}
                      onAddSubItem={(content) => addSubItem(item.id, content)}
                      onToggleSub={(sub) => toggleItem(sub)}
                      onDeleteSub={(id) => deleteItem(id)}
                    />
                  ) : (
                    <ItemRow
                      key={item.id}
                      item={item}
                      members={members}
                      onToggle={() => toggleItem(item)}
                      onDelete={() => deleteItem(item.id)}
                      userId={userId}
                    />
                  )
                )}
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
              placeholder={isTodos ? "Lägg till huvuduppgift…" : "Lägg till i listan…"}
              className="bg-card pr-11 rounded-xl"
            />
            <button
              onClick={() => addItem()}
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

function TodoTopicRow({
  item,
  items,
  members,
  userId,
  expanded,
  onToggleExpand,
  onToggle,
  onDelete,
  onAddSubItem,
  onToggleSub,
  onDeleteSub,
}: {
  item: ListItem;
  items: ListItem[];
  members: Member[];
  userId: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onAddSubItem: (content: string) => void;
  onToggleSub: (sub: ListItem) => void;
  onDeleteSub: (id: string) => void;
}) {
  const [subContent, setSubContent] = useState("");
  const children = getChildren(items, item.id);
  const hasChildren = children.length > 0;
  const complete = isTopicComplete(item, items);
  const doneCount = children.filter((c) => c.completed).length;
  const creator = members.find((m) => m.user_id === item.created_by);

  const handleAddSub = () => {
    if (!subContent.trim()) return;
    onAddSubItem(subContent);
    setSubContent("");
  };

  return (
    <li className="py-2 group">
      <div className="flex items-center gap-2">
        {hasChildren ? (
          <button
            onClick={onToggleExpand}
            className="size-5 grid place-items-center text-muted-foreground hover:text-foreground shrink-0"
            aria-label={expanded ? "Dölj deluppgifter" : "Visa deluppgifter"}
          >
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ) : (
          <button
            onClick={onToggle}
            className={`size-5 rounded-md border-2 grid place-items-center transition-colors shrink-0 ${
              complete ? "bg-primary border-primary" : "border-border hover:border-primary"
            }`}
            aria-label={complete ? "Markera som ogjort" : "Markera som klart"}
          >
            {complete && <Check className="size-3 text-primary-foreground" strokeWidth={3} />}
          </button>
        )}
        <span
          className={`text-sm flex-1 truncate font-medium ${complete ? "line-through text-muted-foreground" : ""}`}
          onClick={hasChildren ? onToggleExpand : undefined}
          role={hasChildren ? "button" : undefined}
        >
          {item.content}
        </span>
        {hasChildren && (
          <span className="text-[10px] font-medium text-muted-foreground tabular-nums shrink-0">
            {doneCount}/{children.length}
          </span>
        )}
        {creator && (
          <span
            className="size-5 rounded-full grid place-items-center text-[9px] font-semibold text-white shrink-0"
            style={{ backgroundColor: creator.avatar_color }}
            title={`${creator.display_name} lade till`}
          >
            {creator.display_name.slice(0, 1).toUpperCase()}
          </span>
        )}
        {item.created_by === userId && (
          <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0" aria-label="Ta bort">
            <X className="size-4" />
          </button>
        )}
      </div>

      {hasChildren && expanded && (
        <div className="ml-7 mt-1.5 space-y-0.5">
          {children.map((sub) => (
            <SubItemRow
              key={sub.id}
              item={sub}
              members={members}
              userId={userId}
              onToggle={() => onToggleSub(sub)}
              onDelete={() => onDeleteSub(sub.id)}
            />
          ))}
          <SubItemInput value={subContent} onChange={setSubContent} onAdd={handleAddSub} />
        </div>
      )}

      {!hasChildren && expanded && (
        <div className="ml-7 mt-1.5">
          <SubItemInput value={subContent} onChange={setSubContent} onAdd={handleAddSub} />
        </div>
      )}

      {!hasChildren && !expanded && (
        <button
          onClick={onToggleExpand}
          className="ml-7 mt-1 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          + Lägg till deluppgifter
        </button>
      )}
    </li>
  );
}

function SubItemInput({ value, onChange, onAdd }: { value: string; onChange: (v: string) => void; onAdd: () => void }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="relative flex-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }}
          placeholder="Lägg till deluppgift…"
          className="h-8 text-xs bg-secondary/60 rounded-lg pr-9"
        />
        <button
          onClick={onAdd}
          disabled={!value.trim()}
          className="absolute right-1 top-1/2 -translate-y-1/2 size-6 rounded-md bg-primary text-primary-foreground grid place-items-center disabled:opacity-30"
          aria-label="Lägg till deluppgift"
        >
          <Plus className="size-3" />
        </button>
      </div>
    </div>
  );
}

function SubItemRow({ item, members, onToggle, onDelete, userId }: {
  item: ListItem;
  members: Member[];
  onToggle: () => void;
  onDelete: () => void;
  userId: string;
}) {
  const creator = members.find((m) => m.user_id === item.created_by);
  return (
    <div className="flex items-center gap-2 py-1 group/sub">
      <button
        onClick={onToggle}
        className={`size-4 rounded border-2 grid place-items-center transition-colors shrink-0 ${
          item.completed ? "bg-primary border-primary" : "border-border hover:border-primary"
        }`}
        aria-label={item.completed ? "Markera som ogjort" : "Markera som klart"}
      >
        {item.completed && <Check className="size-2.5 text-primary-foreground" strokeWidth={3} />}
      </button>
      <span className={`text-xs flex-1 truncate ${item.completed ? "line-through text-muted-foreground" : ""}`}>
        {item.content}
      </span>
      {creator && (
        <span
          className="size-4 rounded-full grid place-items-center text-[8px] font-semibold text-white shrink-0"
          style={{ backgroundColor: creator.avatar_color }}
          title={`${creator.display_name} lade till`}
        >
          {creator.display_name.slice(0, 1).toUpperCase()}
        </span>
      )}
      {(item.created_by === userId || item.completed) && (
        <button onClick={onDelete} className="opacity-0 group-hover/sub:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0" aria-label="Ta bort">
          <X className="size-3.5" />
        </button>
      )}
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
