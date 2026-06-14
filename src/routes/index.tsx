import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { useHousehold } from "@/hooks/useHousehold";
import { Landing } from "@/components/Landing";
import { Onboarding } from "@/components/Onboarding";
import { Dashboard } from "@/components/Dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hemmafront — Hushållets kalender och listor" },
      { name: "description", content: "Synka Google-kalendrar och håll koll på inköp, kom ihåg och att göra i realtid." },
      { property: "og:title", content: "Hemmafront" },
      { property: "og:description", content: "Synka Google-kalendrar och håll koll på inköp, kom ihåg och att göra i realtid." },
    ],
  }),
  component: Index,
  ssr: false,
});

function Index() {
  const { user, loading: authLoading } = useAuth();
  const { household, loading: hhLoading } = useHousehold();

  if (authLoading || (user && hhLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return <Landing />;
  if (!household) return <Onboarding />;
  return <Dashboard />;
}
