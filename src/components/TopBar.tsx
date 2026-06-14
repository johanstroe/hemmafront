import { supabase } from "@/integrations/supabase/client";
import type { Household, Member } from "@/hooks/useHousehold";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { UserPlus, LogOut } from "lucide-react";

export function TopBar({ household, members, onInvite }: { household: Household; members: Member[]; onInvite: () => void }) {
  return (
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b border-border">
      <div className="mx-auto max-w-6xl px-4 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-9 rounded-xl bg-primary grid place-items-center text-primary-foreground font-display font-semibold shrink-0">H</div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.15em] font-semibold text-muted-foreground leading-none">Hushåll</p>
            <h1 className="font-display text-lg font-semibold truncate leading-tight">{household.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
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
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => supabase.auth.signOut()}>
                <LogOut className="size-4 mr-2" /> Logga ut
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}