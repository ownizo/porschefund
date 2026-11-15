# Porsche Fund

Humorous crowdfunding page for a regular Portuguese guy trying to buy a Porsche Taycan by his 42nd birthday (August 2, 2027).

## Files
- `index.html` — homepage
- `funds.json` — public totals shown on the homepage, updated by hand
- `admin.html` — local preview of the counter (changes only the browser you use it in)

## Updating the counter
The donate buttons are PayPal.me links, which do not notify the site. Update the total by hand:

1. Open `funds.json` on GitHub and click the pencil (Edit).
2. Change `eur` (and `usd` / `gbp` if any), `count` if you track it, and set `updatedAt` to the current date and time, e.g. `"2026-11-20T18:00:00Z"`.
3. Commit to `main`. Netlify publishes the new total in about a minute.

`eur` is the number the progress bar uses. `usd` and `gbp` are shown as extra lines.

If the goal is not reached by the deadline, funds go to a charity of the organizer’s choice.


## Background image
- `img/taycan-desktop-v2.webp` (2560×1440) and `img/taycan-mobile-v2.webp` (1080×1920) — stills rendered from the 2025 Taycan Turbo GT Weissach Package 3D model by Ddiaz Design (Sketchfab, CC BY-NC-SA 4.0). Shared under the same licence.
