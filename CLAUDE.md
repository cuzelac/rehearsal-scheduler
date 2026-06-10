# Rehearsal Scheduler

Vite + React + TypeScript. **All code is in `app/`** — run npm from there (repo
root has no package.json). Build / typecheck: `npm run build` (`tsc -b && vite build`).

## State & persistence
- Single store hook: `app/src/useAppData.ts`. Persisted to localStorage key
  `rehearsal-scheduler-v1` as a versioned `AppData` (currently v2).
- On schema change, bump `CURRENT_VERSION` and extend `normalize()` /
  `migrateLegacy()` so existing saves migrate. Export/import round-trips through `normalize()`.

## Data model (`app/src/types.ts`)
- `Scene` is the shared library entry (name + roleIds), no duration. Per-rehearsal
  inclusion + duration live in `Rehearsal.items` (`RehearsalItem`); resolve to
  `ScheduledScene` before scheduling.
- Two independent orderings: `AppData.scenes[]` = stable library/Build order;
  `Rehearsal.items[]` = optimized Schedule order. Build edits must not reorder the
  schedule, and vice versa.

## Scheduling (`app/src/scheduler.ts`, runs in `scheduler.worker.ts`)
- Auto-optimize runs in a Web Worker. Objectives: `total` and `cost` are additive →
  exact Held–Karp bitmask DP (≤25 scenes / ≤32 roles); `minimax` and `spread` are
  non-additive → multi-start Or-opt + 2-opt heuristic.
- A new additive objective can reuse the exact DP by masking the per-scene "waiting"
  count (see `cost`). Verify scheduler changes with a brute-force cross-check on small N.

## Verifying UI
- Preview via Claude Preview MCP; `.claude/launch.json` runs `npm run --prefix app dev`
  on port 5173.
