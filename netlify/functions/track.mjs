import { createHash, randomBytes } from "node:crypto";
import { isDatacenter } from "../lib/dc.mjs";
import { store, enc, day, pidTime } from "../lib/visits.mjs";

const BOT_UA = /bot|crawl|spider|slurp|scrap|fetch|preview|facebookexternalhit|embedly|quora link|whatsapp|telegram|discord|slack|linkedin|pinterest|vkshare|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|python|curl|wget|httpclient|okhttp|node-fetch|axios|go-http|java\/|libwww|perl|ruby|php|postman|insomnia|chatgpt|gptbot|claude|anthropic|perplexity|bytespider|amazonbot|applebot|bingpreview|yandex|baidu|semrush|ahrefs|mj12|dotbot|petalbot|seznam/i;

function device(ua) {
  if (/ipad|tablet|kindle|silk|playbook|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry/i.test(ua)) return "mobile";
  return "desktop";
}
function browser(ua) {
  if (/edg\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/samsungbrowser/i.test(ua)) return "Samsung Internet";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/crios|chrome\//i.test(ua)) return "Chrome";
  if (/safari/i.test(ua)) return "Safari";
  return "Other";
}
function os(ua) {
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/android/i.test(ua)) return "Android";
  if (/windows/i.test(ua)) return "Windows";
  if (/mac os x|macintosh/i.test(ua)) return "macOS";
  if (/cros/i.test(ua)) return "ChromeOS";
  if (/linux/i.test(ua)) return "Linux";
  return "Other";
}

// A new random salt every day: visitors can be counted per day without storing IPs.
const salts = new Map();
async function saltFor(d) {
  if (salts.has(d)) return salts.get(d);
  const s = store();
  let salt = await s.get(`salt/${d}`);
  if (!salt) {
    await s.set(`salt/${d}`, randomBytes(16).toString("hex"), { onlyIfNew: true });
    salt = await s.get(`salt/${d}`);
  }
  salts.set(d, salt);
  return salt;
}

function refHost(ref, selfHost) {
  try {
    const u = new URL(ref);
    const h = u.hostname.replace(/^www\./, "");
    if (!h || h === selfHost.replace(/^www\./, "")) return "";
    return h;
  } catch {
    return "";
  }
}

const ok = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export default async (req, context) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let b;
  try {
    b = JSON.parse(await req.text());
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const t = pidTime(b.pid);
  const now = Date.now();
  if (t === null || Math.abs(now - t) > 36 * 3600 * 1000) return new Response("Bad request", { status: 400 });
  const d = day(t);
  const s = store();

  if (b.t === "d") {
    const ms = Math.round(Number(b.ms));
    if (!(ms >= 0 && ms <= 6 * 3600 * 1000)) return new Response("Bad request", { status: 400 });
    await s.set(`d/${d}/${b.pid}|${ms}`, "1");
    return ok();
  }
  if (b.t !== "v") return new Response("Bad request", { status: 400 });

  const ua = req.headers.get("user-agent") || "";
  const ip = context.ip || "";
  const salt = await saltFor(d);
  const vh = createHash("sha256").update(`${salt}|${ip}|${ua}`).digest("hex").slice(0, 12);

  const cls = BOT_UA.test(ua) || b.wd === true || !ua ? "bot" : isDatacenter(ip) ? "datacenter" : "human";
  const selfHost = new URL(req.url).hostname;
  let path = String(b.p || "/").split("#")[0].split("?")[0] || "/";
  if (!path.startsWith("/")) path = "/" + path;
  path = path.replace(/\.html$/, "").replace(/\/index$/, "/") || "/";

  const parts = [
    t.toString(36),
    b.pid,
    vh,
    cls,
    enc(context.geo?.country?.code || "", 4),
    enc(context.geo?.city || "", 40),
    device(ua),
    enc(browser(ua), 20),
    enc(os(ua), 12),
    enc(refHost(b.r || "", selfHost), 60),
    enc(b.u || "", 40),
    enc(path, 150),
  ];
  await s.set(`v/${d}/${parts.join("|")}`, "1");
  return ok();
};

export const config = { path: "/api/track" };
