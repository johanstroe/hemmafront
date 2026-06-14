import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useHousehold } from "@/hooks/useHousehold";
import { TopBar } from "./TopBar";
import { CalendarPanel } from "./CalendarPanel";
import { ListsPanel } from "./ListsPanel";
import { InviteSheet } from "./InviteSheet";

export function Dashboard() {
  const { user } = useAuth();
  const { household, members } = useHousehold();
  const [showInvite, setShowInvite] = useState(false);

  if (!user || !household) return null;

  return (
    <main className="min-h-screen bg-background">
      <TopBar household={household} members={members} onInvite={() => setShowInvite(true)} />
      <div className="mx-auto max-w-6xl px-4 lg:px-8 py-6 lg:py-10">
        <div className="grid lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          <section className="lg:col-span-7">
            <CalendarPanel householdId={household.id} members={members} userId={user.id} />
          </section>
          <section className="lg:col-span-5">
            <ListsPanel householdId={household.id} userId={user.id} members={members} />
          </section>
        </div>
      </div>
      <InviteSheet open={showInvite} onClose={() => setShowInvite(false)} household={household} />
    </main>
  );
}