import { createFileRoute } from "@tanstack/react-router";
import { verifyState } from "@/lib/google-calendar.functions";

export const Route = createFileRoute("/api/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        const base = `${url.protocol}//${url.host}`;

        if (error) {
          return Response.redirect(`${base}/?google=error&reason=${encodeURIComponent(error)}`, 302);
        }
        if (!code || !state) {
          return new Response("Missing code/state", { status: 400 });
        }
        const userId = verifyState(state);
        if (!userId) {
          return new Response("Invalid state", { status: 400 });
        }

        const redirectUri = `${base}/api/google/callback`;
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        });

        if (!tokenRes.ok) {
          const t = await tokenRes.text();
          console.error("Google token exchange failed", tokenRes.status, t);
          return Response.redirect(`${base}/?google=error&reason=token_exchange`, 302);
        }

        const tok = (await tokenRes.json()) as {
          access_token: string;
          refresh_token?: string;
          expires_in: number;
          scope?: string;
        };

        if (!tok.refresh_token) {
          // Without refresh_token we can't sync long-term; ask user to re-consent
          return Response.redirect(`${base}/?google=error&reason=no_refresh_token`, 302);
        }

        const expiry = new Date(Date.now() + tok.expires_in * 1000).toISOString();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error: upErr } = await supabaseAdmin
          .from("google_calendar_tokens")
          .upsert({
            user_id: userId,
            access_token: tok.access_token,
            refresh_token: tok.refresh_token,
            expiry,
            scope: tok.scope ?? null,
            calendar_id: "primary",
          });

        if (upErr) {
          console.error("Token upsert failed", upErr);
          return Response.redirect(`${base}/?google=error&reason=db`, 302);
        }

        return Response.redirect(`${base}/?google=connected`, 302);
      },
    },
  },
});