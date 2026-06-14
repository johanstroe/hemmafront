import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
].join(" ");

function getBaseUrl(): string {
  const req = getRequest();
  const url = new URL(req!.url);
  // Honor proxy headers
  const proto = req!.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req!.headers.get("x-forwarded-host") ?? req!.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

export const getGoogleAuthUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error("GOOGLE_CLIENT_ID saknas");
    const base = getBaseUrl();
    const redirectUri = `${base}/api/google/callback`;
    const { signState } = await import("./google-state.server");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: signState(context.userId),
    });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, redirectUri };
  });

export const getGoogleStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("google_calendar_tokens")
      .select("user_id,last_sync_at,calendar_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { connected: !!data, lastSyncAt: data?.last_sync_at ?? null, calendarId: data?.calendar_id ?? null };
  });

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("google_calendar_tokens").delete().eq("user_id", context.userId);
    return { ok: true };
  });

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function getValidAccessToken(userId: string): Promise<{ token: string; calendarId: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("google_calendar_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  const expiresAt = new Date(data.expiry).getTime();
  if (expiresAt - Date.now() > 60_000) {
    return { token: data.access_token, calendarId: data.calendar_id };
  }
  const refreshed = await refreshAccessToken(data.refresh_token);
  const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabaseAdmin
    .from("google_calendar_tokens")
    .update({ access_token: refreshed.access_token, expiry: newExpiry })
    .eq("user_id", userId);
  return { token: refreshed.access_token, calendarId: data.calendar_id };
}

type GEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

export const syncGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { householdId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify user is a member of household
    const { data: member } = await supabaseAdmin
      .from("household_members")
      .select("id,user_id,household_id")
      .eq("household_id", data.householdId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member) throw new Error("Inte medlem av detta hushåll");

    const cred = await getValidAccessToken(context.userId);
    if (!cred) return { connected: false, pulled: 0, pushed: 0 };

    const headers = { Authorization: `Bearer ${cred.token}` };
    const now = new Date();
    const timeMin = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + 60 * 24 * 3600 * 1000).toISOString();

    // --- PULL ---
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cred.calendarId)}/events`);
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("orderBy", "startTime");
    const gRes = await fetch(url, { headers });
    if (!gRes.ok) throw new Error(`Google fetch fail: ${gRes.status} ${await gRes.text()}`);
    const gJson = (await gRes.json()) as { items?: GEvent[] };
    const items = gJson.items ?? [];

    let pulled = 0;
    for (const ev of items) {
      if (ev.status === "cancelled") {
        await supabaseAdmin
          .from("events")
          .delete()
          .eq("household_id", data.householdId)
          .eq("google_event_id", ev.id);
        continue;
      }
      const allDay = !!ev.start?.date && !ev.start?.dateTime;
      const startTime = ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date}T00:00:00Z` : null);
      const endTime = ev.end?.dateTime ?? (ev.end?.date ? `${ev.end.date}T00:00:00Z` : null);
      if (!startTime) continue;
      const { error: upsertErr } = await supabaseAdmin.from("events").upsert(
        {
          household_id: data.householdId,
          google_event_id: ev.id,
          title: ev.summary ?? "(utan titel)",
          description: ev.description ?? null,
          start_time: startTime,
          end_time: endTime,
          all_day: allDay,
          member_id: member.id,
          source: "google",
          created_by: context.userId,
        },
        { onConflict: "household_id,google_event_id" },
      );
      if (upsertErr) throw new Error(`Upsert misslyckades: ${upsertErr.message}`);
      pulled++;
    }

    // --- PUSH manual events created by this user that have no google_event_id ---
    const { data: manualEvents } = await supabaseAdmin
      .from("events")
      .select("*")
      .eq("household_id", data.householdId)
      .eq("created_by", context.userId)
      .eq("source", "manual")
      .is("google_event_id", null)
      .gte("start_time", timeMin);

    let pushed = 0;
    for (const ev of manualEvents ?? []) {
      const body: Record<string, unknown> = {
        summary: ev.title,
        description: ev.description ?? undefined,
      };
      if (ev.all_day) {
        body.start = { date: ev.start_time.slice(0, 10) };
        body.end = { date: (ev.end_time ?? ev.start_time).slice(0, 10) };
      } else {
        body.start = { dateTime: new Date(ev.start_time).toISOString() };
        body.end = { dateTime: new Date(ev.end_time ?? ev.start_time).toISOString() };
      }
      const pRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cred.calendarId)}/events`,
        { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      if (pRes.ok) {
        const created = (await pRes.json()) as { id: string };
        await supabaseAdmin
          .from("events")
          .update({ google_event_id: created.id, source: "google" })
          .eq("id", ev.id);
        pushed++;
      }
    }

    await supabaseAdmin
      .from("google_calendar_tokens")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("user_id", context.userId);

    return { connected: true, pulled, pushed };
  });