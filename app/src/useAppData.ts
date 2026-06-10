import { useState, useEffect, useRef } from 'react';
import type {
  AppData,
  Rehearsal,
  Role,
  Scene,
  ScheduledScene,
  Objective,
} from './types';
import type { WorkerRequest, WorkerResponse } from './scheduler.worker';

const STORAGE_KEY = 'rehearsal-scheduler-v1';
const CURRENT_VERSION = 2;
export const DEFAULT_SCENE_MINUTES = 15;

function newId() {
  return Math.random().toString(36).slice(2, 9);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY: AppData = {
  version: CURRENT_VERSION,
  roles: [],
  scenes: [],
  rehearsals: [],
  currentRehearsalId: null,
};

// Migrate the legacy single-rehearsal shape into the multi-rehearsal AppData.
function migrateLegacy(parsed: any): AppData {
  const roles: Role[] = (parsed.roles ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    paid: r.paid ?? true,
  }));
  const legacyScenes: any[] = parsed.scenes ?? [];
  const scenes: Scene[] = legacyScenes.map((s) => ({
    id: s.id,
    name: s.name,
    roleIds: s.roleIds ?? [],
  }));
  const durationById = Object.fromEntries(legacyScenes.map((s) => [s.id, s.duration ?? DEFAULT_SCENE_MINUTES]));
  const order: string[] = parsed.schedule ?? legacyScenes.map((s) => s.id);
  const rehearsal: Rehearsal = {
    id: newId(),
    name: 'Rehearsal 1',
    date: today(),
    items: order
      .filter((id) => durationById[id] !== undefined)
      .map((id) => ({ sceneId: id, duration: durationById[id] })),
    startMinute: parsed.startMinute ?? 19 * 60,
    objective: parsed.objective ?? 'total',
  };
  return {
    version: CURRENT_VERSION,
    roles,
    scenes,
    rehearsals: [rehearsal],
    currentRehearsalId: rehearsal.id,
  };
}

// Normalize any parsed blob (current, legacy, or imported) into valid AppData.
function normalize(parsed: any): AppData {
  if (!parsed || typeof parsed !== 'object') return EMPTY;
  if (parsed.version === CURRENT_VERSION && Array.isArray(parsed.rehearsals)) {
    return {
      version: CURRENT_VERSION,
      roles: parsed.roles ?? [],
      scenes: parsed.scenes ?? [],
      rehearsals: parsed.rehearsals,
      currentRehearsalId:
        parsed.currentRehearsalId ?? parsed.rehearsals[0]?.id ?? null,
    };
  }
  // Legacy shape (no version, has top-level scenes/schedule).
  if (parsed.scenes || parsed.schedule || parsed.roles) return migrateLegacy(parsed);
  return EMPTY;
}

function load(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {}
  return EMPTY;
}

export function useAppData() {
  const [data, setData] = useState<AppData>(load);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeProgress, setOptimizeProgress] = useState(0);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const currentRehearsal =
    data.rehearsals.find((r) => r.id === data.currentRehearsalId) ?? null;

  // Helper: update the current rehearsal immutably.
  function patchCurrent(fn: (r: Rehearsal) => Rehearsal) {
    setData((d) => {
      if (!d.currentRehearsalId) return d;
      return {
        ...d,
        rehearsals: d.rehearsals.map((r) => (r.id === d.currentRehearsalId ? fn(r) : r)),
      };
    });
  }

  // ---- Global: roles ----
  function addRole(name: string) {
    const role: Role = { id: newId(), name: name.trim(), paid: true };
    setData((d) => ({ ...d, roles: [...d.roles, role] }));
  }
  function setRolePaid(id: string, paid: boolean) {
    setData((d) => ({ ...d, roles: d.roles.map((r) => (r.id === id ? { ...r, paid } : r)) }));
  }
  function removeRole(id: string) {
    setData((d) => ({
      ...d,
      roles: d.roles.filter((r) => r.id !== id),
      scenes: d.scenes.map((s) => ({ ...s, roleIds: s.roleIds.filter((rid) => rid !== id) })),
    }));
  }
  function updateRole(id: string, name: string) {
    setData((d) => ({ ...d, roles: d.roles.map((r) => (r.id === id ? { ...r, name } : r)) }));
  }

  // ---- Global: scene library ----
  function addScene(name: string, roleIds: string[]) {
    const scene: Scene = { id: newId(), name: name.trim(), roleIds };
    setData((d) => ({ ...d, scenes: [...d.scenes, scene] }));
  }
  function removeScene(id: string) {
    setData((d) => ({
      ...d,
      scenes: d.scenes.filter((s) => s.id !== id),
      rehearsals: d.rehearsals.map((r) => ({
        ...r,
        items: r.items.filter((it) => it.sceneId !== id),
      })),
    }));
  }
  function updateScene(id: string, patch: Partial<Omit<Scene, 'id'>>) {
    setData((d) => ({ ...d, scenes: d.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  }
  function reorderScenes(newOrder: string[]) {
    setData((d) => {
      const byId = Object.fromEntries(d.scenes.map((s) => [s.id, s]));
      return { ...d, scenes: newOrder.map((id) => byId[id]).filter(Boolean) as Scene[] };
    });
  }

  // ---- Rehearsal management ----
  function createRehearsal(name: string, date: string) {
    const rehearsal: Rehearsal = {
      id: newId(),
      name: name.trim() || 'Untitled rehearsal',
      date,
      items: [],
      startMinute: 19 * 60,
      objective: 'total',
    };
    setData((d) => ({
      ...d,
      rehearsals: [...d.rehearsals, rehearsal],
      currentRehearsalId: rehearsal.id,
    }));
  }
  function deleteRehearsal(id: string) {
    setData((d) => {
      const rehearsals = d.rehearsals.filter((r) => r.id !== id);
      const currentRehearsalId =
        d.currentRehearsalId === id ? (rehearsals[0]?.id ?? null) : d.currentRehearsalId;
      return { ...d, rehearsals, currentRehearsalId };
    });
  }
  function selectRehearsal(id: string) {
    setData((d) => ({ ...d, currentRehearsalId: id }));
  }
  function renameRehearsal(id: string, name: string) {
    setData((d) => ({ ...d, rehearsals: d.rehearsals.map((r) => (r.id === id ? { ...r, name } : r)) }));
  }
  function setRehearsalDate(id: string, date: string) {
    setData((d) => ({ ...d, rehearsals: d.rehearsals.map((r) => (r.id === id ? { ...r, date } : r)) }));
  }

  // ---- Current rehearsal: scene inclusion / durations / order ----
  function toggleScene(sceneId: string) {
    patchCurrent((r) => {
      const included = r.items.some((it) => it.sceneId === sceneId);
      return included
        ? { ...r, items: r.items.filter((it) => it.sceneId !== sceneId) }
        : { ...r, items: [...r.items, { sceneId, duration: DEFAULT_SCENE_MINUTES }] };
    });
  }
  function setItemDuration(sceneId: string, duration: number) {
    patchCurrent((r) => ({
      ...r,
      items: r.items.map((it) => (it.sceneId === sceneId ? { ...it, duration } : it)),
    }));
  }
  function reorderSchedule(newOrder: string[]) {
    patchCurrent((r) => {
      const byId = Object.fromEntries(r.items.map((it) => [it.sceneId, it]));
      return { ...r, items: newOrder.map((id) => byId[id]).filter(Boolean) };
    });
  }
  function setStartMinute(minutes: number) {
    patchCurrent((r) => ({ ...r, startMinute: minutes }));
  }
  function setObjective(objective: Objective) {
    patchCurrent((r) => ({ ...r, objective }));
  }

  // Resolve the current rehearsal's items into ScheduledScene[] (schedule order).
  function resolvedScenes(): ScheduledScene[] {
    if (!currentRehearsal) return [];
    const libById = Object.fromEntries(data.scenes.map((s) => [s.id, s]));
    return currentRehearsal.items
      .map((it) => {
        const lib = libById[it.sceneId];
        return lib ? { ...lib, duration: it.duration } : null;
      })
      .filter(Boolean) as ScheduledScene[];
  }

  function runAutoSchedule() {
    if (optimizing || !currentRehearsal) return;
    const scenes = resolvedScenes();
    if (scenes.length <= 1) return;

    setOptimizing(true);
    setOptimizeProgress(0);

    workerRef.current?.terminate();
    const worker = new Worker(new URL('./scheduler.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        setOptimizeProgress(msg.value);
        return;
      }
      // Reorder the current rehearsal's items into the optimized order.
      patchCurrent((r) => {
        const byId = Object.fromEntries(r.items.map((it) => [it.sceneId, it]));
        const reordered = msg.schedule.map((id) => byId[id]).filter(Boolean);
        r.items.forEach((it) => { if (!reordered.includes(it)) reordered.push(it); });
        return { ...r, items: reordered };
      });
      setOptimizeProgress(1);
      setOptimizing(false);
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };

    const paidRoleIds = data.roles.filter((r) => r.paid).map((r) => r.id);
    const req: WorkerRequest = { scenes, objective: currentRehearsal.objective, paidRoleIds };
    worker.postMessage(req);
  }

  // ---- Data import / export ----
  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rehearsal-data-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function importData(file: File): Promise<boolean> {
    let parsed: any;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      alert('That file isn’t valid JSON.');
      return false;
    }
    const next = normalize(parsed);
    if (next.roles.length === 0 && next.scenes.length === 0 && next.rehearsals.length === 0) {
      alert('That file doesn’t look like rehearsal data.');
      return false;
    }
    if (!confirm('Import will replace all current roles, scenes, and rehearsals. Continue?')) {
      return false;
    }
    setData(next);
    return true;
  }

  return {
    data,
    currentRehearsal,
    optimizing,
    optimizeProgress,
    resolvedScenes,
    // roles
    addRole,
    removeRole,
    updateRole,
    setRolePaid,
    // scene library
    addScene,
    removeScene,
    updateScene,
    reorderScenes,
    // rehearsal management
    createRehearsal,
    deleteRehearsal,
    selectRehearsal,
    renameRehearsal,
    setRehearsalDate,
    // current rehearsal
    toggleScene,
    setItemDuration,
    reorderSchedule,
    setStartMinute,
    setObjective,
    runAutoSchedule,
    // data io
    exportData,
    importData,
  };
}
