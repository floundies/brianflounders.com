# Shore House Request Setup

This page uses a free Google stack:

- Google Sheets stores every request.
- Google Calendar stores pending and approved all-day events.
- Google Apps Script receives form submissions and sends approval emails.
- `brianflounders.com/shore` is the public, fake-gated request page.

## 1. Create The Apps Script

1. Go to <https://script.google.com/>.
2. Create a new project named `Shore House Requests`.
3. Delete the starter code.
4. Paste the full contents of `docs/shore-google-apps-script.js`.
5. Save.

## 2. Run Initial Setup

1. In Apps Script, choose the function `setupShoreRequestSystem`.
2. Click Run.
3. Approve Google permissions.
4. The function creates a Google Sheet named `Shore House Requests`.
5. Open Apps Script logs or run output to copy the created spreadsheet URL.

The Sheet will have:

- `Requests`: one row per request.
- `Settings`: helper notes.

## 3. Set Script Properties

In Apps Script:

1. Open Project Settings.
2. Under Script Properties, add:

```text
SHORE_REQUEST_SHEET_ID=<created spreadsheet id>
SHORE_APPROVED_CALENDAR_ID=<calendar id>
SHORE_ADMIN_EMAIL=<your email>
SHORE_PUBLIC_PAGE_URL=https://brianflounders.com/shore
```

Calendar ID is found in Google Calendar:

1. Calendar settings.
2. Choose the family shore calendar.
3. Integrate calendar.
4. Copy Calendar ID.

Use your existing family calendar if you want approved events visible on phones. Pending requests are created there too as `[PENDING]` all-day events.

## 4. Deploy The Web App

In Apps Script:

1. Click Deploy.
2. New deployment.
3. Select type: Web app.
4. Execute as: Me.
5. Who has access: Anyone.
6. Deploy.
7. Copy the Web App URL.

Test it by opening:

```text
<web-app-url>?action=health
```

You should see JSON containing `"ok":true`.

## 5. Connect The Website

Add this environment variable wherever the site is built:

```text
VITE_SHORE_ENDPOINT=<web-app-url>
```

For local testing, add it to `.env`:

```text
VITE_SHORE_ENDPOINT=https://script.google.com/macros/s/.../exec
```

Then restart Vite:

```bash
npm run dev -- --host 127.0.0.1
```

## Behavior

When someone submits a request:

1. The Apps Script validates required fields.
2. Dogs are rejected unless the unit is `Cottage`.
3. The request is written to the Sheet as `pending`.
4. A `[PENDING]` all-day event is created on the configured calendar.
5. Brian receives an email with Approve and Deny links.
6. The requester receives a confirmation email.

The public page also reads this free JSON endpoint to render the custom occupancy board:

```text
<web-app-url>?action=events&start=2026-06-01&end=2026-08-31
```

The board reads the configured Google Calendar and parses shore event titles. By default it displays the event/requester name. If someone wants a family label on the board, put a line like `Family: Marcics` in the event description or request Notes.

When Brian approves:

1. The Sheet status changes to `approved`.
2. The calendar event title changes from `[Unit, PENDING] Name (# people, # dogs)` to `[Unit, exclusive/non-exclusive] Name (# people, # dogs)`.
3. The calendar event color changes by unit: Grammy's Flop House is teal/cyan, Papa's Upper Deck is pink/red, and Cottage is yellow. Pending requests are gray.
4. The requester receives an approval email.

When Brian denies:

1. The Sheet status changes to `denied`.
2. The pending calendar event is deleted.
3. The requester receives a denial email.

## Notes

- Same-day turnover works because dates are all-day calendar events.
- Exclusive use means exclusive use of that unit only.
- Non-exclusive overlapping requests are allowed.
- Overlaps and cottage dog totals above two are warnings to Brian, not hard blocks.
- The site fake gate is intentionally light security. The page also uses `noindex,nofollow` and `robots.txt` disallows `/shore`.
