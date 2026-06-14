import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Household, Member } from "@/hooks/useHousehold";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { UserPlus, LogOut, Pencil } from "lucide-react";
import { toast } from "sonner";

export function TopBar({
  household,
  members,
  userId,
  onInvite,
  onRenamed,
}: {
  household: Household;
  members: Member[];
  userId: string;
  onInvite: () => void;
  onRenamed: () => void;
}) {
  const isAdmin = members.some((m) => m.user_id === userId && m.role === "admin");
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState(household.name);
  const [renaming, setRenaming] = useState(false);

  const handleRename = async () => {
    if (!newName.trim() || newName.trim() === household.name) {
      setRenameOpen(false);
      return;
    }
    setRenaming(true);
    const { error } = await supabase
      .from("households")
      .update({ name: newName.trim() })
      .eq("id", household.id);
    if (error) {
      toast.error("Kunde inte byta namn", { description: error.message });
      setRenaming(false);
      return;
    }
    toast.success("Hushållet har fått nytt namn!");
    setRenaming(false);
    setRenameOpen(false);
    onRenamed();
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b border-border pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-6xl px-3 sm:px-4 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div className="size-8 sm:size-9 rounded-xl bg-primary grid place-items-center text-primary-foreground font-display font-semibold shrink-0 text-sm sm:text-base">H</div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.15em] font-semibold text-muted-foreground leading-none">Hushåll</p>
              <h1 className="font-display text-base sm:text-lg font-semibold truncate leading-tight">{household.name}</h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <div className="hidden sm:flex -space-x-2">
              {members.slice(0, 5).map((m) => (
                <div
                  key={m.id}
                  className="size-8 rounded-full ring-2 ring-background grid place-items-center text-[11px] font-semibold text-white"
                  style={{ backgroundColor: m.avatar_color }}
                  title={m.display_name}
                >
                  {m.display_name.slice(0, 1).toUpperCase()}
                </div>
              ))}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="rounded-full size-9 p-0">⋯</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={onInvite}>
                  <UserPlus className="size-4 mr-2" /> Bjud in medlem
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onClick={() => setRenameOpen(true)}>
                    <Pencil className="size-4 mr-2" /> Byt namn
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => supabase.auth.signOut()}>
                  <LogOut className="size-4 mr-2" /> Logga ut
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md w-[calc(100%-1.5rem)] max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Byt namn på hushållet</DialogTitle>
            <DialogDescription>Ange ett nytt namn för ditt hushåll.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Hushållets namn"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Avbryt</Button>
            <Button onClick={handleRename} disabled={renaming || !newName.trim()}>
              {renaming ? "Sparar…" : "Spara"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}