import { useState } from "react";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Calendar, ListChecks, Users } from "lucide-react";

export function Landing() {
  const [signingIn, setSigningIn] = useState(false);

  const signIn = async () => {
    setSigningIn(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Kunde inte logga in", { description: result.error.message });
      setSigningIn(false);
      return;
    }
    if (result.redirected) return;
    setSigningIn(false);
  };

  return (
    <main className="min-h-dvh bg-background text-foreground overflow-x-hidden pt-[env(safe-area-inset-top)]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12 lg:py-24">
        <header className="flex items-center justify-between mb-10 sm:mb-16">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-primary grid place-items-center text-primary-foreground font-display text-lg font-semibold">H</div>
            <span className="font-display text-xl font-semibold">Hemmafront</span>
          </div>
        </header>

        <section className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <p className="text-xs uppercase tracking-[0.18em] font-semibold text-primary">För hushållet</p>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-6xl font-semibold leading-[1.05] text-balance">
              Hela familjens vardag, på ett ställe.
            </h1>
            <p className="text-lg text-muted-foreground max-w-[48ch] text-pretty">
              Synka allas Google-kalendrar i en gemensam vy. Dela inköpslistan, kom-ihåg och att-göra som uppdateras i realtid.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button size="lg" onClick={signIn} disabled={signingIn} className="rounded-full h-12 px-6 gap-3">
                <GoogleLogo />
                {signingIn ? "Loggar in…" : "Fortsätt med Google"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Vi använder Google för att kunna synka dina kalendrar.</p>
          </div>

          <div className="bg-card rounded-3xl ring-1 ring-border p-6 space-y-4 shadow-sm">
            <Feature icon={<Calendar className="size-4" />} title="Gemensam kalender">
              Se allas händelser i en färgkodad vy.
            </Feature>
            <Feature icon={<ListChecks className="size-4" />} title="Listor i realtid">
              Inköp, kom ihåg och att göra — synkas direkt.
            </Feature>
            <Feature icon={<Users className="size-4" />} title="2–6 personer">
              Bjud in hela hushållet med en kod.
            </Feature>
          </div>
        </section>
      </div>
    </main>
  );
}

function Feature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="size-9 rounded-xl bg-accent text-accent-foreground grid place-items-center shrink-0">{icon}</div>
      <div>
        <h3 className="font-semibold text-sm">{title}</h3>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12S6.7 21.6 12 21.6c6.9 0 11.5-4.9 11.5-11.7 0-.8-.1-1.4-.2-2L12 10.2z"/>
      <path fill="#34A853" d="M3.9 7.3l3.2 2.4C8 7.7 9.8 6.4 12 6.4c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.4 12 2.4c-3.6 0-6.7 2-8.1 4.9z"/>
      <path fill="#FBBC05" d="M12 21.6c2.6 0 4.7-.9 6.3-2.4l-3-2.4c-.8.6-1.9 1-3.3 1-2.6 0-4.7-1.7-5.5-4.1l-3.2 2.5C4.6 19.5 8 21.6 12 21.6z"/>
      <path fill="#4285F4" d="M23.5 12c0-.8-.1-1.4-.2-2H12v3.9h5.5c-.2 1.1-1 2.2-2.2 3l3 2.4c1.7-1.6 2.7-4 2.7-7.3z"/>
    </svg>
  );
}