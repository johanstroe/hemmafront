import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import type { Household } from "@/hooks/useHousehold";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function InviteSheet({ open, onClose, household }: { open: boolean; onClose: () => void; household: Household }) {
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCode(null);
    setError(null);
    supabase.rpc("get_household_invite_code", { _household_id: household.id }).then(({ data, error }) => {
      if (error) setError("Endast administratörer kan se inbjudningskoden");
      else setCode(data as unknown as string);
    });
  }, [open, household.id]);

  const copy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Kod kopierad");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">Bjud in till hushållet</SheetTitle>
          <SheetDescription>Dela koden så kan andra gå med i {household.name}.</SheetDescription>
        </SheetHeader>
        <div className="py-8 flex flex-col items-center gap-4">
          <div className="font-mono text-4xl font-bold tracking-[0.2em] bg-secondary rounded-2xl px-8 py-6 min-h-[5rem] grid place-items-center">
            {error ? <span className="text-sm font-sans font-normal text-muted-foreground">{error}</span> : code ?? "…"}
          </div>
          <Button onClick={copy} disabled={!code} variant="outline" size="lg" className="rounded-full gap-2">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Kopierad!" : "Kopiera kod"}
          </Button>
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            Den nya medlemmen loggar in med Google och anger koden för att gå med.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}