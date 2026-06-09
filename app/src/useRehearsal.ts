import { useState, useEffect } from 'react';
import type { Rehearsal, Role, Scene } from './types';
import { autoSchedule } from './scheduler';

const STORAGE_KEY = 'rehearsal-scheduler-v1';

function newId() {
  return Math.random().toString(36).slice(2, 9);
}

const DEFAULT: Rehearsal = {
  roles: [],
  scenes: [],
  schedule: [],
  startMinute: 19 * 60,
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rehearsal));
  }, [rehearsal]);

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

  function runAutoSchedule() {
    setRehearsal((r) => {
      const sceneMap = Object.fromEntries(r.scenes.map((s) => [s.id, s]));
      const ordered = autoSchedule(r.scenes);
      // Only include scenes currently in the schedule
      const inSchedule = new Set(r.schedule);
      const result = ordered.filter((id) => inSchedule.has(id));
      // Append any scenes somehow missing
      r.schedule.forEach((id) => { if (!result.includes(id)) result.push(id); });
      void sceneMap;
      return { ...r, schedule: result };
    });
  }

  function setStartMinute(minutes: number) {
    setRehearsal((r) => ({ ...r, startMinute: minutes }));
  }

  function clearAll() {
    setRehearsal(DEFAULT);
  }

  return {
    rehearsal,
    addRole,
    removeRole,
    updateRole,
    addScene,
    removeScene,
    updateScene,
    reorderSchedule,
    runAutoSchedule,
    setStartMinute,
    clearAll,
  };
}
