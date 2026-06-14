import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  getNotificationPrefs,
  isNotificationSupported,
  registerNotificationServiceWorker,
  requestNotificationPermission,
  saveNotificationPrefs,
  sendTestNotification,
  type NotificationPrefs,
} from "@/lib/notifications";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";

export function NotificationSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(getNotificationPrefs);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    if (!open) return;
    setPrefs(getNotificationPrefs());
    setPermission(isNotificationSupported() ? Notification.permission : "unsupported");
  }, [open]);

  const update = (patch: Partial<NotificationPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveNotificationPrefs(next);
  };

  const enableNotifications = async () => {
    await registerNotificationServiceWorker();
    const result = await requestNotificationPermission();
    if (result === "unsupported") {
      toast.error("Notiser stöds inte i den här webbläsaren");
      return;
    }
    setPermission(result);
    if (result === "granted") {
      update({ enabled: true });
      toast.success("Notiser aktiverade");
    } else {
      toast.error("Tillåt notiser i webbläsarens inställningar");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md w-[calc(100%-1.5rem)] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <Bell className="size-5" /> Notiser
          </DialogTitle>
          <DialogDescription>
            Få aviseringar när någon i hushållet uppdaterar listor eller när en kalenderhändelse närmar sig.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {permission === "unsupported" ? (
            <p className="text-sm text-muted-foreground">Din webbläsare stöder inte notiser.</p>
          ) : permission !== "granted" ? (
            <Button onClick={enableNotifications} className="w-full rounded-xl gap-2">
              <Bell className="size-4" /> Aktivera notiser
            </Button>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="notif-enabled" className="text-sm font-medium">Notiser på</Label>
                <p className="text-xs text-muted-foreground">Visa aviseringar från hushållet</p>
              </div>
              <Switch
                id="notif-enabled"
                checked={prefs.enabled}
                onCheckedChange={(checked) => update({ enabled: checked })}
              />
            </div>
          )}

          {permission === "granted" && prefs.enabled && (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="notif-lists" className="text-sm font-medium">Listor</Label>
                  <p className="text-xs text-muted-foreground">När någon lägger till eller bockar av</p>
                </div>
                <Switch
                  id="notif-lists"
                  checked={prefs.listActivity}
                  onCheckedChange={(checked) => update({ listActivity: checked })}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="notif-events" className="text-sm font-medium">Kalenderpåminnelser</Label>
                  <p className="text-xs text-muted-foreground">{prefs.reminderMinutes} min innan händelsen</p>
                </div>
                <Switch
                  id="notif-events"
                  checked={prefs.eventReminders}
                  onCheckedChange={(checked) => update({ eventReminders: checked })}
                />
              </div>

              <Button
                variant="outline"
                className="w-full rounded-xl"
                onClick={async () => {
                  const ok = await sendTestNotification();
                  if (ok) toast.success("Test-notis skickad");
                  else toast.error("Kunde inte skicka testnotis");
                }}
              >
                Skicka testnotis
              </Button>
            </>
          )}

          {permission === "denied" && (
            <p className="text-xs text-muted-foreground flex items-start gap-2">
              <BellOff className="size-4 shrink-0 mt-0.5" />
              Notiser är blockerade. Öppna webbläsarens inställningar för den här sidan och tillåt notiser.
            </p>
          )}

          <p className="text-[11px] text-muted-foreground">
            På iPhone: öppna sidan i Safari → Dela → Lägg till på hemskärmen. Öppna appen därifrån och tillåt notiser.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Stäng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
