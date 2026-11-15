import { getStore } from "@netlify/blobs";
import { timingSafeEqual, createHash } from "node:crypto";

const KEY = "totals";
const EMPTY = { eur: 0, usd: 0, gbp: 0, count: 0, updatedAt: null };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const store = () => getStore({ name: "porschefund", consistency: "strong" });

function passwordOk(given) {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected || typeof given !== "string") return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return null;
  return Math.round(n * 100) / 100;
}

export default async (req) => {
  if (req.method === "GET") {
    const saved = await store().get(KEY, { type: "json" });
    return json({ ...EMPTY, ...(saved || {}) });
  }

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid body" }, 400);
  }

  if (!process.env.ADMIN_PASSWORD) return json({ error: "not configured" }, 503);

  if (!passwordOk(body.password)) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return json({ error: "wrong password" }, 401);
  }

  if (body.check) return json({ ok: true });

  const eur = money(body.eur);
  const usd = money(body.usd ?? 0);
  const gbp = money(body.gbp ?? 0);
  const count = Number.isInteger(Number(body.count)) && Number(body.count) >= 0 ? Number(body.count) : 0;
  if (eur === null || usd === null || gbp === null) return json({ error: "invalid amount" }, 400);

  const totals = { eur, usd, gbp, count, updatedAt: new Date().toISOString() };
  await store().setJSON(KEY, totals);
  return json({ ok: true, totals });
};

export const config = { path: "/api/funds" };
