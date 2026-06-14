import { createHmac, timingSafeEqual } from "node:crypto";

export function signState(userId: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const nonce = Math.random().toString(36).slice(2, 10);
  const payload = `${userId}.${Date.now()}.${nonce}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyState(state: string): string | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const parts = decoded.split(".");
    if (parts.length !== 4) return null;
    const [userId, ts, nonce, sig] = parts;
    const payload = `${userId}.${ts}.${nonce}`;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    if (Date.now() - Number(ts) > 10 * 60 * 1000) return null;
    return userId;
  } catch {
    return null;
  }
}