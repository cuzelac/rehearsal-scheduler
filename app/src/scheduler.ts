import type { Scene } from './types';

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

export function computeMetrics(orderedScenes: Scene[]): ScheduleMetrics {
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

// 2-opt local search to minimize total idle time
function totalIdle(order: Scene[]): number {
  return computeMetrics(order).totalIdleMinutes;
}

export function autoSchedule(scenes: Scene[]): string[] {
  if (scenes.length <= 1) return scenes.map((s) => s.id);

  // Start with a greedy seed: sort by number of roles desc so complex scenes go first
  let best = [...scenes].sort((a, b) => b.roleIds.length - a.roleIds.length);
  let bestCost = totalIdle(best);

  // 2-opt: try all pairwise swaps until no improvement
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [...best];
        [candidate[i], candidate[j]] = [candidate[j], candidate[i]];
        const cost = totalIdle(candidate);
        if (cost < bestCost) {
          best = candidate;
          bestCost = cost;
          improved = true;
        }
      }
    }
  }

  // Also try segment reversals (standard 2-opt)
  improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 2; j <= best.length; j++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j).reverse(),
          ...best.slice(j),
        ];
        const cost = totalIdle(candidate);
        if (cost < bestCost) {
          best = candidate;
          bestCost = cost;
          improved = true;
        }
      }
    }
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
  orderedScenes: Scene[]
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
