import { adminConfigured, passwordOk, slow, json } from "../lib/auth.mjs";
import { store, FIELDS, dec, day } from "../lib/visits.mjs";

const SESSION_GAP = 30 * 60 * 1000;
const hourFmt = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Lisbon" });
const lisbonHour = (ts) => Number(hourFmt.format(new Date(ts))) % 24;

function parseView(key) {
  const raw = key.split("/").slice(2).join("/").split("|");
  if (raw.length !== FIELDS.length) return null;
  const v = {};
  FIELDS.forEach((f, i) => (v[f] = dec(raw[i])));
  v.ts = parseInt(v.ts, 36);
  return v;
}

const top = (map, n = 15) =>
  [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));

export default async (req) => {
  if (!adminConfigured()) return json({ error: "not configured" }, 503);
  if (!passwordOk(req.headers.get("x-admin-password"))) {
    await slow();
    return json({ error: "wrong password" }, 401);
  }

  const url = new URL(req.url);
  const today = day(Date.now());
  const from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("from") || "") ? url.searchParams.get("from") : today;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("to") || "") ? url.searchParams.get("to") : today;
  const traffic = url.searchParams.get("traffic") === "all" ? "all" : "human";

  const days = [];
  for (let d = new Date(from + "T00:00:00Z"); day(d) <= to && days.length < 93; d.setUTCDate(d.getUTCDate() + 1)) days.push(day(d));

  const s = store();
  const all = [];
  const dur = new Map();
  await Promise.all(
    days.map(async (d) => {
      const [views, durs] = await Promise.all([s.list({ prefix: `v/${d}/` }), s.list({ prefix: `d/${d}/` })]);
      for (const b of views.blobs) {
        const v = parseView(b.key);
        if (v) all.push(v);
      }
      for (const b of durs.blobs) {
        const [pid, ms] = b.key.split("/")[2].split("|");
        const n = Number(ms);
        if (!(dur.get(pid) >= n)) dur.set(pid, n);
      }
    })
  );

  // Traffic class breakdown always covers everything.
  const classes = { human: new Set(), bot: new Set(), datacenter: new Set() };
  const classViews = { human: 0, bot: 0, datacenter: 0 };
  for (const v of all) {
    if (classes[v.cls]) {
      classes[v.cls].add(v.vh + day(v.ts));
      classViews[v.cls]++;
    }
  }

  const views = all.filter((v) => traffic === "all" || v.cls === "human").sort((a, b) => a.ts - b.ts);
  for (const v of views) v.ms = dur.has(v.pid) ? dur.get(v.pid) : null;

  // Sessions: same visitor, same day, gaps under 30 minutes.
  const sessions = [];
  const open = new Map();
  for (const v of views) {
    const k = v.vh + day(v.ts);
    let sess = open.get(k);
    if (!sess || v.ts - sess.last > SESSION_GAP) {
      sess = { start: v.ts, last: v.ts, vh: v.vh, cls: v.cls, cc: v.cc, city: v.city, dev: v.dev, br: v.br, os: v.os, ref: v.ref, utm: v.utm, pages: [] };
      sessions.push(sess);
      open.set(k, sess);
    }
    sess.last = v.ts;
    sess.pages.push({ path: v.path, ts: v.ts, ms: v.ms });
  }
  for (const s2 of sessions) {
    const known = s2.pages.filter((p) => p.ms !== null);
    s2.ms = known.length ? known.reduce((a, p) => a + p.ms, 0) : null;
  }

  const visitors = new Set(views.map((v) => v.vh + day(v.ts)));
  const timed = sessions.filter((x) => x.ms !== null);
  const pageTimed = views.filter((v) => v.ms !== null);

  const byDay = new Map(days.map((d) => [d, { date: d, visitors: new Set(), views: 0 }]));
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, visitors: new Set(), views: 0 }));
  for (const v of views) {
    const d = byDay.get(day(v.ts));
    if (d) { d.visitors.add(v.vh); d.views++; }
    const h = byHour[lisbonHour(v.ts)];
    h.visitors.add(v.vh + day(v.ts)); h.views++;
  }

  const pages = new Map();
  for (const v of views) {
    const p = pages.get(v.path) || { path: v.path, views: 0, visitors: new Set(), msSum: 0, msN: 0 };
    p.views++; p.visitors.add(v.vh + day(v.ts));
    if (v.ms !== null) { p.msSum += v.ms; p.msN++; }
    pages.set(v.path, p);
  }

  const count = (fn) => {
    const m = new Map();
    for (const x of sessions) { const k = fn(x) || "(none)"; m.set(k, (m.get(k) || 0) + 1); }
    return m;
  };

  return json({
    from, to, traffic, generatedAt: new Date().toISOString(),
    totals: {
      visitors: visitors.size,
      sessions: sessions.length,
      pageviews: views.length,
      avgSessionMs: timed.length ? Math.round(timed.reduce((a, x) => a + x.ms, 0) / timed.length) : null,
      avgPageMs: pageTimed.length ? Math.round(pageTimed.reduce((a, v) => a + v.ms, 0) / pageTimed.length) : null,
      bounceRate: sessions.length ? sessions.filter((x) => x.pages.length === 1).length / sessions.length : null,
    },
    classes: {
      human: { visitors: classes.human.size, views: classViews.human },
      bot: { visitors: classes.bot.size, views: classViews.bot },
      datacenter: { visitors: classes.datacenter.size, views: classViews.datacenter },
    },
    byDay: [...byDay.values()].map((d) => ({ date: d.date, visitors: d.visitors.size, views: d.views })),
    byHour: byHour.map((h) => ({ hour: h.hour, visitors: h.visitors.size, views: h.views })),
    pages: [...pages.values()]
      .sort((a, b) => b.views - a.views)
      .slice(0, 30)
      .map((p) => ({ path: p.path, views: p.views, visitors: p.visitors.size, avgMs: p.msN ? Math.round(p.msSum / p.msN) : null })),
    sources: top(count((x) => x.utm ? (x.ref ? `${x.utm} (via ${x.ref})` : x.utm) : x.ref || "Direct / typed")),
    countries: top(count((x) => x.cc)),
    cities: top(count((x) => (x.city ? `${x.city}${x.cc ? ", " + x.cc : ""}` : ""))),
    devices: top(count((x) => x.dev)),
    browsers: top(count((x) => x.br)),
    systems: top(count((x) => x.os)),
    recent: sessions.slice(-60).reverse().map(({ vh, last, ...rest }) => rest),
  });
};

export const config = { path: "/api/stats" };
