# Porsche Fund

Humorous crowdfunding page for a regular Portuguese guy trying to buy a Porsche Taycan by his 42nd birthday (August 2, 2027).

## Files
- `index.html` — homepage. Reads the totals from `/api/funds` (falls back to `funds.json`).
- `admin.html` — backoffice at porschefund.com/admin. Log in and set the totals everyone sees.
- `netlify/functions/funds.mjs` — `/api/funds`: GET returns the totals; POST saves them (password required). Stored in Netlify Blobs.
- `funds.json` — fallback totals, only used if the function is unavailable.

## Backoffice password
Set it in Netlify: Site configuration → Environment variables → add `ADMIN_PASSWORD` (scope: Functions), then redeploy (Deploys → Trigger deploy). To change it later, edit the variable and redeploy.

If the goal is not reached by the deadline, funds go to a charity of the organizer’s choice.


## Background image
- `img/taycan-desktop-v2.webp` (2560×1440) and `img/taycan-mobile-v2.webp` (1080×1920) — stills rendered from the 2025 Taycan Turbo GT Weissach Package 3D model by Ddiaz Design (Sketchfab, CC BY-NC-SA 4.0). Shared under the same licence.
