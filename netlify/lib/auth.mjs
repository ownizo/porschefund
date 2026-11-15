import { timingSafeEqual, createHash } from "node:crypto";

export function adminConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export function passwordOk(given) {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected || typeof given !== "string") return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export const slow = () => new Promise((r) => setTimeout(r, 800));

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
