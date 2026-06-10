# Rehearsal Scheduler

A browser tool for planning the order to work scenes during a single rehearsal.
It optimizes the running order to **minimize the time actors spend waiting around**,
and produces a clean call sheet you can paste into an email.

Everything runs locally in your browser — there's no server or account, and all
data is stored on your device (with manual export/import for backup and transfer).

## Running it

The app lives in the `app/` directory.

```bash
cd app
npm install
npm run dev
```

Open the printed URL (default http://localhost:5173).

Other commands (run from `app/`):

- `npm run build` — type-check and build for production (output in `app/dist/`)
- `npm run preview` — serve the production build locally

## Using it

The app is organized into four tabs. **Roles** and **Scenes** describe your whole
show and are shared across rehearsals; **Build** and **Schedule** are per-rehearsal.

1. **Roles** — Add every role/performer. Mark each **Paid** or **Volunteer** (used
   for the cost view and the "Lowest paid cost" objective).
2. **Scenes** — Build your scene library: each scene's name and which roles appear
   in it. Durations are *not* set here (they're per-rehearsal). Drag to reorder for
   readability; this order is stable and never changes when you optimize.
3. **Build** — Pick a rehearsal from the header (or **+ New**), then choose which
   scenes it covers and how long to spend on each (slider for 5–60 min, or type any
   value). Set the rehearsal's **name, date, and start time** here.
4. **Schedule** — See the running order with each scene's clock times and who's
   called. Click **Auto-optimize** to compute an order that reduces idle time:
   - **Total idle** — least combined waiting across everyone (provably optimal).
   - **Worst-off role** — minimize the longest any single person waits.
   - **Even spread** — even out waiting across the cast.
   - **Lowest paid cost** — minimize held time for paid roles (ignores volunteers).

   You can also drag scenes to reorder manually. Toggle **12h/24h** clock display.

### Sending the call sheet

In the Schedule tab, **Preview email** opens an editable preview with two layouts:

- **Detail** — scene order with roles, plus per-role arrive/done times.
- **By call** — a stage-manager timeline of when each person is called and dismissed.

Edit if needed, then **Copy** and paste into your email. (Edits in the preview are
copied as-is but not saved.)

### Multiple rehearsals & backups

Use the header rehearsal switcher to create and move between rehearsals — they share
the same roles and scene library but each have their own scenes, durations, order,
and start time. Use **Export** to download all your data as a JSON file, and
**Import** to restore it (replaces current data) or move it to another device.
