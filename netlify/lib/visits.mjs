// Shared helpers for the visit log. Each page view is one blob whose KEY holds all
// its fields, so the stats endpoint can read a whole day with a single list() call.
import { getStore } from "@netlify/blobs";

export const store = () => getStore({ name: "porschefund-visits", consistency: "strong" });

export const FIELDS = ["ts", "pid", "vh", "cls", "cc", "city", "dev", "br", "os", "ref", "utm", "path"];

export const enc = (v, max = 120) => encodeURIComponent(String(v ?? "").slice(0, max)).replace(/\|/g, "%7C");
export const dec = (v) => {
  try { return decodeURIComponent(v); } catch { return v; }
};

export const day = (ms) => new Date(ms).toISOString().slice(0, 10);

// pid = <ms since epoch, base36>-<random>; the view's day comes from it.
export function pidTime(pid) {
  if (typeof pid !== "string" || !/^[0-9a-z]{6,12}-[0-9a-z]{4,16}$/.test(pid)) return null;
  const t = parseInt(pid.split("-")[0], 36);
  return Number.isFinite(t) ? t : null;
}
