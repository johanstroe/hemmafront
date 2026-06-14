import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useHousehold } from "@/hooks/useHousehold";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MEMBER_COLORS } from "@/lib/colors";

export function Onboarding() {
  const { user } = useAuth();
  const { refresh } = useHousehold();
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [householdName, setHouseholdName] = useState("");
  const [displayName, setDisplayName] = useState(
    user?.user_metadata?.full_name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? ""
  );
  const [inviteCode, setInviteCode] = useState("");
  const [colorIdx, setColorIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const signOut = () => supabase.auth.signOut();

  const createHousehold = async () => {
    if (!user || !householdName.trim() || !displayName.trim()) return;
    setSubmitting(true);
    const { data: hh, error } = await supabase
      .from("households")
      .insert({ name: householdName.trim(), created_by: user.id })
      .select()
      .single();
    if (error || !hh) {
      toast.error("Kunde inte skapa hushåll", { description: error?.message });
      setSubmitting(false);
      return;
    }
    const { error: memberErr } = await supabase.from("household_members").upsert(
      {
        household_id: hh.id,
        user_id: user.id,
        display_name: displayName.trim(),
        avatar_color: MEMBER_COLORS[colorIdx],
        role: "admin",
      },
      { onConflict: "household_id,user_id" },
    );
    if (memberErr) {
      toast.error("Kunde inte lägga till dig", { description: memberErr.message });
      setSubmitting(false);
      return;
    }
    // Create default lists
    await supabase.from("lists").insert([
      { household_id: hh.id, name: "Inköp", type: "shopping", sort_order: 0 },
      { household_id: hh.id, name: "Kom ihåg", type: "reminders", sort_order: 1 },
      { household_id: hh.id, name: "Att göra", type: "todos", sort_order: 2 },
    ]);
    toast.success("Hushåll skapat!");
    await refresh();
  };

  const joinHousehold = async () => {
    if (!user || !inviteCode.trim() || !displayName.trim()) return;
    setSubmitting(true);
    const { data: hh, error } = await supabase
      .from("households")
      .select("id")
      .eq("invite_code", inviteCode.trim().toUpperCase())
      .maybeSingle();
    if (error || !hh) {
      toast.error("Inbjudningskoden hittades inte");
      setSubmitting(false);
      return;
    }
    const { error: memberErr } = await supabase.from("household_members").insert({
      household_id: hh.id,
      user_id: user.id,
      display_name: displayName.trim(),
      avatar_color: MEMBER_COLORS[colorIdx],
      role: "member",
    });
    if (memberErr) {
      toast.error("Kunde inte gå med", { description: memberErr.message });
      setSubmitting(false);
      return;
    }
    toast.success("Du är med!");
    await refresh();
  };

  return (
    <main className="min-h-screen bg-background py-12 px-4">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-primary grid place-items-center text-primary-foreground font-display font-semibold">H</div>
            <span className="font-display text-lg font-semibold">Hemmafront</span>
          </div>
          <button onClick={signOut} className="text-xs text-muted-foreground hover:text-foreground">Logga ut</button>
        </div>

        <div className="bg-card rounded-3xl ring-1 ring-border p-8 shadow-sm">
          {mode === "choose" && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-semibold mb-2">Välkommen!</h1>
                <p className="text-sm text-muted-foreground">Skapa ett nytt hushåll eller gå med i ett befintligt.</p>
              </div>
              <div className="space-y-3">
                <Button onClick={() => setMode("create")} className="w-full rounded-xl h-12" size="lg">Skapa nytt hushåll</Button>
                <Button onClick={() => setMode("join")} variant="outline" className="w-full rounded-xl h-12" size="lg">Gå med via kod</Button>
              </div>
            </div>
          )}

          {mode === "create" && (
            <div className="space-y-5">
              <button onClick={() => setMode("choose")} className="text-xs text-muted-foreground hover:text-foreground">← Tillbaka</button>
              <h2 className="font-display text-xl font-semibold">Skapa hushåll</h2>
              <div className="space-y-2">
                <Label htmlFor="hh-name">Hushållets namn</Label>
                <Input id="hh-name" value={householdName} onChange={(e) => setHouseholdName(e.target.value)} placeholder="Familjen Andersson" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="display-name">Ditt namn</Label>
                <Input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Anna" />
              </div>
              <ColorPicker value={colorIdx} onChange={setColorIdx} />
              <Button onClick={createHousehold} disabled={submitting || !householdName.trim() || !displayName.trim()} className="w-full rounded-xl h-12" size="lg">
                {submitting ? "Skapar…" : "Skapa hushåll"}
              </Button>
            </div>
          )}

          {mode === "join" && (
            <div className="space-y-5">
              <button onClick={() => setMode("choose")} className="text-xs text-muted-foreground hover:text-foreground">← Tillbaka</button>
              <h2 className="font-display text-xl font-semibold">Gå med i hushåll</h2>
              <div className="space-y-2">
                <Label htmlFor="invite">Inbjudningskod</Label>
                <Input id="invite" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} placeholder="ABC12345" className="font-mono uppercase tracking-widest" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="display-name-2">Ditt namn</Label>
                <Input id="display-name-2" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Anna" />
              </div>
              <ColorPicker value={colorIdx} onChange={setColorIdx} />
              <Button onClick={joinHousehold} disabled={submitting || !inviteCode.trim() || !displayName.trim()} className="w-full rounded-xl h-12" size="lg">
                {submitting ? "Går med…" : "Gå med"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function ColorPicker({ value, onChange }: { value: number; onChange: (i: number) => void }) {
  return (
    <div className="space-y-2">
      <Label>Välj din färg</Label>
      <div className="flex gap-2">
        {MEMBER_COLORS.map((c, i) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(i)}
            className={`size-9 rounded-full ring-offset-2 ring-offset-card transition-all ${value === i ? "ring-2 ring-foreground" : ""}`}
            style={{ backgroundColor: c }}
            aria-label={`Färg ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}