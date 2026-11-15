# Porsche Fund

Humorous crowdfunding page for a regular Portuguese guy trying to buy a Porsche Taycan by his 42nd birthday (August 2, 2027).

## Files
- `index.html` — homepage
- `funds.json` — public totals, updated by the PayPal webhook
- `api/paypal-webhook.js` — PayPal webhook endpoint (needs a host such as Vercel, not GitHub Pages)
- `admin.html` — local preview of the counter

## PayPal webhook
PayPal.me links do not call this webhook. It runs only for payments made through a PayPal REST app (Checkout or a button on that app).

1. In the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications/live), create an app.
2. Add a webhook. URL: `https://YOUR-VERCEL-DOMAIN/api/paypal-webhook`
3. Subscribe to `PAYMENT.CAPTURE.COMPLETED` and `PAYMENT.SALE.COMPLETED`.
4. Copy the Webhook ID.
5. Deploy this repo on Vercel and set:
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
   - `PAYPAL_WEBHOOK_ID`
   - `PAYPAL_MODE` = `live` (or `sandbox`)
   - `GH_FUNDS_TOKEN` — fine-grained GitHub token with Contents: Read and write on this repo only
6. Open `https://YOUR-VERCEL-DOMAIN/api/paypal-webhook` and confirm it returns `{"ok":true}`.
7. Send a webhook test from the PayPal dashboard.

The endpoint checks the PayPal signature before it adds the amount to `funds.json`. It does not store the payer's name or email. The homepage reads `funds.json` and counts euros toward the goal.

If the goal is not reached by the deadline, funds go to a charity of the organizer’s choice.
