const crypto = require("crypto");

const CURRENCIES = ["EUR", "USD", "GBP"];
const EVENTS = new Set(["PAYMENT.CAPTURE.COMPLETED", "PAYMENT.SALE.COMPLETED"]);

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const missing = ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "GH_FUNDS_TOKEN"].filter(
    (key) => !process.env[key]
  );
  if (missing.length) {
    res.status(500).json({ error: "server not configured" });
    return;
  }

  const event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  if (!event || typeof event !== "object") {
    res.status(400).json({ error: "invalid body" });
    return;
  }

  try {
    const valid = await verifySignature(req, event);
    if (!valid) {
      res.status(400).json({ error: "invalid signature" });
      return;
    }

    const donation = extractDonation(event);
    if (!donation) {
      res.status(200).json({ ok: true, ignored: true });
      return;
    }

    const result = await recordDonation(donation);
    res.status(200).json({ ok: true, duplicate: result.duplicate });
  } catch (err) {
    console.error("paypal webhook failed", err && err.message ? err.message : "error");
    res.status(500).json({ error: "webhook failed" });
  }
};

async function verifySignature(req, event) {
  const header = (name) => req.headers[name] || req.headers[name.toLowerCase()];
  const certUrl = header("paypal-cert-url");
  const transmissionId = header("paypal-transmission-id");
  const transmissionTime = header("paypal-transmission-time");
  const transmissionSig = header("paypal-transmission-sig");
  const authAlgo = header("paypal-auth-algo");
  if (!certUrl || !transmissionId || !transmissionTime || !transmissionSig || !authAlgo) return false;
  if (!isPaypalCertUrl(certUrl)) return false;

  const { base, token } = await paypalToken();
  const response = await fetch(base + "/v1/notifications/verify-webhook-signature", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transmission_id: transmissionId,
      transmission_time: transmissionTime,
      cert_url: certUrl,
      auth_algo: authAlgo,
      transmission_sig: transmissionSig,
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: event,
    }),
  });
  if (!response.ok) return false;
  const data = await response.json();
  return data.verification_status === "SUCCESS";
}

function isPaypalCertUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      ["api.paypal.com", "api-m.paypal.com", "api.sandbox.paypal.com", "api-m.sandbox.paypal.com"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

async function paypalToken() {
  const sandbox = String(process.env.PAYPAL_MODE || "live").toLowerCase() === "sandbox";
  const base = sandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
  const response = await fetch(base + "/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_CLIENT_SECRET).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error("paypal auth failed");
  const data = await response.json();
  if (!data.access_token) throw new Error("paypal auth failed");
  return { base, token: data.access_token };
}

function extractDonation(event) {
  if (!EVENTS.has(event.event_type)) return null;
  const resource = event.resource || {};
  if (resource.status && resource.status !== "COMPLETED") return null;
  const amount = resource.amount || {};
  const value = Number(amount.value != null ? amount.value : amount.total);
  const currency = String(amount.currency_code || amount.currency || "").toUpperCase();
  const id = resource.id || event.id;
  if (!id || !Number.isFinite(value) || value <= 0 || !CURRENCIES.includes(currency)) return null;
  return { id: String(id), value, currency };
}

async function recordDonation(donation) {
  const fingerprint = crypto.createHash("sha256").update(donation.id).digest("hex").slice(0, 20);
  for (let attempt = 0; attempt < 3; attempt++) {
    const currentFile = await github("GET", "/contents/funds.json?ref=main");
    let funds = { eur: 0, usd: 0, gbp: 0, count: 0, updatedAt: null, seen: [] };
    let sha = null;
    if (currentFile.ok) {
      sha = currentFile.data.sha;
      funds = JSON.parse(Buffer.from(currentFile.data.content, "base64").toString("utf8"));
    } else if (currentFile.status !== 404) {
      throw new Error("could not read funds");
    }
    funds.seen = Array.isArray(funds.seen) ? funds.seen : [];
    if (funds.seen.includes(fingerprint)) return { duplicate: true };
    const key = donation.currency.toLowerCase();
    funds[key] = Math.round(((Number(funds[key]) || 0) + donation.value) * 100) / 100;
    funds.count = (Number(funds.count) || 0) + 1;
    funds.updatedAt = new Date().toISOString();
    funds.seen = funds.seen.concat(fingerprint).slice(-400);
    const saved = await github("PUT", "/contents/funds.json", {
      message: "Record confirmed PayPal payment",
      content: Buffer.from(JSON.stringify(funds, null, 2) + "\n").toString("base64"),
      branch: "main",
      ...(sha ? { sha } : {}),
    });
    if (saved.ok) return { duplicate: false };
    if (saved.status !== 409) throw new Error("could not save funds");
  }
  throw new Error("could not save funds");
}

async function github(method, path, body) {
  const owner = process.env.GH_OWNER || "ownizo";
  const repo = process.env.GH_REPO || "porschefund";
  const response = await fetch("https://api.github.com/repos/" + owner + "/" + repo + path, {
    method,
    headers: {
      Authorization: "Bearer " + process.env.GH_FUNDS_TOKEN,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "porschefund-webhook",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  return { ok: response.ok, status: response.status, data };
}
