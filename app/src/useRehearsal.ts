import { useState, useEffect, useRef } from 'react';
import type { Rehearsal, Role, Scene, Objective } from './types';
import type { WorkerRequest, WorkerResponse } from './scheduler.worker';

const STORAGE_KEY = 'rehearsal-scheduler-v1';

function newId() {
  return Math.random().toString(36).slice(2, 9);
}

const DEFAULT: Rehearsal = {
  roles: [],
  scenes: [],
  schedule: [],
  startMinute: 19 * 60,
  objective: 'total',
};

function load(): Rehearsal {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT, ...parsed };
    }
  } catch {}
  return DEFAULT;
}

export function useRehearsal() {
  const [rehearsal, setRehearsal] = useState<Rehearsal>(load);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeProgress, setOptimizeProgress] = useState(0);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rehearsal));
  }, [rehearsal]);

  // Tear down any running worker when the hook unmounts.
  useEffect(() => {
    return () => workerRef.current?.terminate();
  }, []);

  function addRole(name: string) {
    const role: Role = { id: newId(), name: name.trim() };
    setRehearsal((r) => ({ ...r, roles: [...r.roles, role] }));
  }

  function removeRole(id: string) {
    setRehearsal((r) => ({
      ...r,
      roles: r.roles.filter((ro) => ro.id !== id),
      scenes: r.scenes.map((s) => ({
        ...s,
        roleIds: s.roleIds.filter((rid) => rid !== id),
      })),
    }));
  }

  function updateRole(id: string, name: string) {
    setRehearsal((r) => ({
      ...r,
      roles: r.roles.map((ro) => (ro.id === id ? { ...ro, name } : ro)),
    }));
  }

  function addScene(name: string, duration: number, roleIds: string[]) {
    const scene: Scene = { id: newId(), name: name.trim(), duration, roleIds };
    setRehearsal((r) => ({
      ...r,
      scenes: [...r.scenes, scene],
      schedule: [...r.schedule, scene.id],
    }));
  }

  function removeScene(id: string) {
    setRehearsal((r) => ({
      ...r,
      scenes: r.scenes.filter((s) => s.id !== id),
      schedule: r.schedule.filter((sid) => sid !== id),
    }));
  }

  function updateScene(id: string, patch: Partial<Omit<Scene, 'id'>>) {
    setRehearsal((r) => ({
      ...r,
      scenes: r.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  }

  function reorderSchedule(newOrder: string[]) {
    setRehearsal((r) => ({ ...r, schedule: newOrder }));
  }

  // Reorder the scenes list for display only; does not affect the schedule.
  function reorderScenes(newOrder: string[]) {
    setRehearsal((r) => {
      const byId = Object.fromEntries(r.scenes.map((s) => [s.id, s]));
      return { ...r, scenes: newOrder.map((id) => byId[id]).filter(Boolean) as Scene[] };
    });
  }

  function runAutoSchedule() {
    if (optimizing) return;

    // Optimize the scenes currently in the schedule, in their present order.
    const sceneMap = Object.fromEntries(rehearsal.scenes.map((s) => [s.id, s]));
    const orderedScenes = rehearsal.schedule
      .map((id) => sceneMap[id])
      .filter(Boolean) as Scene[];
    if (orderedScenes.length <= 1) return;

    setOptimizing(true);
    setOptimizeProgress(0);

    workerRef.current?.terminate();
    const worker = new Worker(new URL('./scheduler.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        setOptimizeProgress(msg.value);
        return;
      }
      // result: merge the optimized order back into the latest schedule
      setRehearsal((r) => {
        const inSchedule = new Set(r.schedule);
        const result = msg.schedule.filter((id) => inSchedule.has(id));
        r.schedule.forEach((id) => { if (!result.includes(id)) result.push(id); });
        return { ...r, schedule: result };
      });
      setOptimizeProgress(1);
      setOptimizing(false);
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };

    const req: WorkerRequest = { scenes: orderedScenes, objective: rehearsal.objective };
    worker.postMessage(req);
  }

  function setStartMinute(minutes: number) {
    setRehearsal((r) => ({ ...r, startMinute: minutes }));
  }

  function setObjective(objective: Objective) {
    setRehearsal((r) => ({ ...r, objective }));
  }

  function clearAll() {
    setRehearsal(DEFAULT);
  }

  return {
    rehearsal,
    optimizing,
    optimizeProgress,
    addRole,
    removeRole,
    updateRole,
    addScene,
    removeScene,
    updateScene,
    reorderSchedule,
    reorderScenes,
    runAutoSchedule,
    setStartMinute,
    setObjective,
    clearAll,
  };
}
