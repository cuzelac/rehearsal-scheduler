import type { ScheduledScene, Objective } from './types';

export interface RoleSpan {
  roleId: string;
  firstCall: number; // minutes from start
  lastRelease: number; // minutes from start
  idleMinutes: number;
}

export interface ScheduleMetrics {
  totalDuration: number;
  roleSpans: RoleSpan[];
  totalIdleMinutes: number;
}

export function computeMetrics(orderedScenes: ScheduledScene[]): ScheduleMetrics {
  const roleFirstCall: Record<string, number> = {};
  const roleLastRelease: Record<string, number> = {};
  const roleActiveMinutes: Record<string, number> = {};

  let elapsed = 0;
  for (const scene of orderedScenes) {
    for (const roleId of scene.roleIds) {
      if (roleFirstCall[roleId] === undefined) roleFirstCall[roleId] = elapsed;
      roleLastRelease[roleId] = elapsed + scene.duration;
      roleActiveMinutes[roleId] = (roleActiveMinutes[roleId] ?? 0) + scene.duration;
    }
    elapsed += scene.duration;
  }

  const allRoleIds = Object.keys(roleFirstCall);
  const roleSpans: RoleSpan[] = allRoleIds.map((roleId) => {
    const span = roleLastRelease[roleId] - roleFirstCall[roleId];
    const idle = span - (roleActiveMinutes[roleId] ?? 0);
    return {
      roleId,
      firstCall: roleFirstCall[roleId],
      lastRelease: roleLastRelease[roleId],
      idleMinutes: idle,
    };
  });

  return {
    totalDuration: elapsed,
    roleSpans,
    totalIdleMinutes: roleSpans.reduce((sum, s) => sum + s.idleMinutes, 0),
  };
}

function totalIdle(order: ScheduledScene[]): number {
  return computeMetrics(order).totalIdleMinutes;
}

// Minimize the single largest per-role idle (fairness / minimax).
function maxIdle(order: ScheduledScene[]): number {
  const idles = computeMetrics(order).roleSpans.map((s) => s.idleMinutes);
  return idles.length ? Math.max(...idles) : 0;
}

// Minimize how unevenly idle is spread across roles (population variance),
// with total idle as a tiny tie-breaker so it can't equalize everyone at a
// uniformly high idle.
function idleSpread(order: ScheduledScene[]): number {
  const idles = computeMetrics(order).roleSpans.map((s) => s.idleMinutes);
  const n = idles.length;
  if (n === 0) return 0;
  const total = idles.reduce((a, b) => a + b, 0);
  const mean = total / n;
  const variance = idles.reduce((a, x) => a + (x - mean) ** 2, 0) / n;
  return variance + 1e-6 * total;
}

// Minimize total call time (held hours) across paid roles only.
// Equivalent to minimizing paid roles' idle (their active time is constant).
function paidCallTime(order: ScheduledScene[], paidSet: Set<string>): number {
  return computeMetrics(order).roleSpans.reduce(
    (sum, s) => (paidSet.has(s.roleId) ? sum + (s.lastRelease - s.firstCall) : sum),
    0
  );
}

type CostFn = (order: ScheduledScene[]) => number;

function costFor(objective: Objective, paidSet: Set<string>): CostFn {
  switch (objective) {
    case 'minimax':
      return maxIdle;
    case 'spread':
      return idleSpread;
    case 'cost':
      return (order) => paidCallTime(order, paidSet);
    case 'total':
    default:
      return totalIdle;
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function popcount32(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >>> 24;
}

// Limits for the exact Held–Karp DP. Above these, fall back to the heuristic.
const EXACT_MAX_SCENES = 25; // 2^25 states; ~300MB peak, ~1–3s
const EXACT_MAX_ROLES = 32; // single 32-bit role bitmask

/**
 * Exact optimal schedule via Held–Karp bitmask DP over scene subsets.
 *
 * Total idle = Σ_k duration[k] · |roles present-but-not-acting during scene k|.
 * For a fixed *set* S of scenes placed before position k, the marginal idle of
 * placing k next depends only on (S, k): a role waits during k iff it appeared
 * in S, will appear again in the complement (U \ S \ {k}), and is not in k.
 * That subset-decomposable cost is exactly what Held–Karp optimises.
 *
 * When `countRoleIds` is given, only those roles count toward the idle cost
 * (used by the 'cost' objective to minimize paid roles' held time). When
 * omitted, every role counts (the 'total' objective).
 *
 * Returns null if the problem is too large for the exact method.
 */
function exactSchedule(
  scenes: ScheduledScene[],
  onProgress?: ProgressFn,
  countRoleIds?: Set<string>
): string[] | null {
  const N = scenes.length;
  if (N > EXACT_MAX_SCENES) return null;

  // Map roles to bit indices.
  const roleIndex = new Map<string, number>();
  for (const scene of scenes) {
    for (const rid of scene.roleIds) {
      if (!roleIndex.has(rid)) roleIndex.set(rid, roleIndex.size);
    }
  }
  if (roleIndex.size > EXACT_MAX_ROLES) return null;

  // Bitmask of roles that count toward the cost (all roles if unspecified).
  let countMask = 0;
  if (countRoleIds) {
    for (const [rid, bit] of roleIndex) if (countRoleIds.has(rid)) countMask |= 1 << bit;
  } else {
    countMask = roleIndex.size === 32 ? 0xffffffff : (1 << roleIndex.size) - 1;
  }
  countMask = countMask >>> 0;

  const sceneRoleMask = scenes.map((s) => {
    let m = 0;
    for (const rid of s.roleIds) m |= 1 << roleIndex.get(rid)!;
    return m >>> 0;
  });

  const full = N === 32 ? 0xffffffff : (1 << N) - 1;
  const size = full + 1;

  // orMask[S] = union of role masks over the scenes in subset S.
  const orMask = new Int32Array(size);
  for (let S = 1; S <= full; S++) {
    const low = S & -S;
    const k = 31 - Math.clz32(low);
    orMask[S] = orMask[(S ^ low) >>> 0] | sceneRoleMask[k];
  }

  const INF = 0x3fffffff;
  const cost = new Int32Array(size).fill(INF);
  const parent = new Int8Array(size).fill(-1);
  cost[0] = 0;

  const progressEvery = Math.max(1, size >> 7); // ~128 updates over the run

  for (let S = 0; S <= full; S++) {
    if (onProgress && (S & (progressEvery - 1)) === 0) onProgress(S / size);
    const c = cost[S];
    if (c === INF) continue;
    const appeared = orMask[S];
    let avail = (full ^ S) >>> 0;
    while (avail) {
      const low = avail & -avail;
      avail ^= low;
      const k = 31 - Math.clz32(low);
      const newS = (S | low) >>> 0;
      const complement = (full ^ newS) >>> 0;
      const waiting = popcount32(
        (appeared & orMask[complement] & ~sceneRoleMask[k] & countMask) >>> 0
      );
      const nc = c + scenes[k].duration * waiting;
      if (nc < cost[newS]) {
        cost[newS] = nc;
        parent[newS] = k;
      }
    }
  }

  // Reconstruct the order by following parent pointers back from the full set.
  const order: number[] = [];
  let S = full;
  while (S) {
    const k = parent[S];
    order.push(k);
    S = (S ^ (1 << k)) >>> 0;
  }
  order.reverse();
  return order.map((i) => scenes[i].id);
}

// Or-opt + 2-opt local search from a given starting order, minimizing `cost`.
// Returns the locally optimal order.
function localSearch(start: ScheduledScene[], cost: CostFn): ScheduledScene[] {
  let current = [...start];
  let currentCost = cost(current);

  let anyImproved = true;
  while (anyImproved) {
    anyImproved = false;

    // Or-opt: try reinserting each scene at every other position
    for (let i = 0; i < current.length; i++) {
      for (let j = 0; j < current.length; j++) {
        if (i === j || i === j + 1) continue;
        const scene = current[i];
        const without = [...current.slice(0, i), ...current.slice(i + 1)];
        const insertAt = j < i ? j + 1 : j;
        const candidate = [...without.slice(0, insertAt), scene, ...without.slice(insertAt)];
        const c = cost(candidate);
        if (c < currentCost) {
          current = candidate;
          currentCost = c;
          anyImproved = true;
          break;
        }
      }
      if (anyImproved) break;
    }

    // 2-opt: try all pairwise swaps
    let swapImproved = true;
    while (swapImproved) {
      swapImproved = false;
      for (let i = 0; i < current.length - 1; i++) {
        for (let j = i + 1; j < current.length; j++) {
          const candidate = [...current];
          [candidate[i], candidate[j]] = [candidate[j], candidate[i]];
          const c = cost(candidate);
          if (c < currentCost) {
            current = candidate;
            currentCost = c;
            swapImproved = true;
            anyImproved = true;
          }
        }
      }
    }
  }

  return current;
}

export type ProgressFn = (fraction: number) => void;

export function autoSchedule(
  scenes: ScheduledScene[],
  objective: Objective = 'total',
  paidRoleIds: string[] = [],
  onProgress?: ProgressFn
): string[] {
  if (scenes.length <= 1) {
    onProgress?.(1);
    return scenes.map((s) => s.id);
  }

  const paidSet = new Set(paidRoleIds);
  // 'cost' with no paid roles has a flat (all-zero) cost surface; fall back to
  // 'total' so it still produces a sensible schedule.
  const effective: Objective = objective === 'cost' && paidSet.size === 0 ? 'total' : objective;

  // Additive objectives can use the exact Held–Karp DP (N ≤ 25, roles ≤ 32):
  // 'total' counts all roles; 'cost' counts only paid roles (masked waiting).
  if (effective === 'total' || effective === 'cost') {
    const mask = effective === 'cost' ? paidSet : undefined;
    const exact = exactSchedule(scenes, onProgress, mask);
    if (exact) {
      onProgress?.(1);
      return exact;
    }
  }

  // Otherwise (fairness objectives, or additive objectives beyond the exact
  // limits): multi-start Or-opt + 2-opt local search with the matching cost.
  const cost = costFor(effective, paidSet);
  const STARTS = 50;

  // Seeds: the exact total-idle optimum (a strong starting point) when feasible,
  // then a greedy role-count seed; remaining starts are random shuffles.
  const greedySeed = [...scenes].sort((a, b) => b.roleIds.length - a.roleIds.length);
  const exactTotal = exactSchedule(scenes); // null beyond DP limits
  const totalSeed = exactTotal
    ? (exactTotal.map((id) => scenes.find((s) => s.id === id)!) as ScheduledScene[])
    : null;

  let best = localSearch(totalSeed ?? greedySeed, cost);
  let bestCost = cost(best);
  onProgress?.(1 / STARTS);

  for (let s = 1; s < STARTS; s++) {
    const seed = s === 1 && totalSeed ? greedySeed : shuffle(scenes);
    const result = localSearch(seed, cost);
    const c = cost(result);
    if (c < bestCost) {
      best = result;
      bestCost = c;
    }
    onProgress?.((s + 1) / STARTS);
  }

  return best.map((s) => s.id);
}

export type ChipColor = 'green' | 'red' | 'yellow';

/**
 * Returns a map of sceneId → roleId → color for chip coloring in the schedule view.
 *
 * Green  = role's first appearance in the schedule
 * Red    = role's last appearance
 * Yellow = first appearance after a gap (at least one scene in between with no use)
 *
 * Priority when a scene qualifies for multiple: green > red > yellow.
 */
export function computeRoleChipColors(
  orderedScenes: ScheduledScene[]
): Record<string, Record<string, ChipColor>> {
  // Collect ordered appearance indices per role
  const appearances: Record<string, number[]> = {};
  orderedScenes.forEach((scene, i) => {
    for (const rid of scene.roleIds) {
      (appearances[rid] ??= []).push(i);
    }
  });

  // result[sceneId][roleId] = color
  const result: Record<string, Record<string, ChipColor>> = {};

  for (const [rid, indices] of Object.entries(appearances)) {
    for (let k = 0; k < indices.length; k++) {
      const sceneIdx = indices[k];
      const scene = orderedScenes[sceneIdx];
      result[scene.id] ??= {};

      const isFirst = k === 0;
      const isLast = k === indices.length - 1;
      const isReturn = k > 0 && indices[k] - indices[k - 1] > 1;

      if (isFirst) {
        result[scene.id][rid] = 'green';
      } else if (isLast) {
        result[scene.id][rid] = 'red';
      } else if (isReturn) {
        result[scene.id][rid] = 'yellow';
      }
    }
  }

  return result;
}

export function formatTime(startMinute: number, minutesOffset: number): string {
  const total = startMinute + minutesOffset;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
