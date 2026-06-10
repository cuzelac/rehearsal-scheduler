export interface Role {
  id: string;
  name: string;
  paid: boolean; // paid hourly (counts toward cost) vs volunteer
}

// Shared scene library entry: name + which roles appear. No duration —
// duration is per-rehearsal (see RehearsalItem).
export interface Scene {
  id: string;
  name: string;
  roleIds: string[];
}

// A scene resolved for a specific rehearsal (library scene + that rehearsal's
// duration). This is what the scheduler operates on.
export interface ScheduledScene extends Scene {
  duration: number; // minutes
}

export type Objective = 'total' | 'minimax' | 'spread' | 'cost';

// One scene included in a rehearsal, with that rehearsal's duration for it.
export interface RehearsalItem {
  sceneId: string;
  duration: number; // minutes
}

export interface Rehearsal {
  id: string;
  name: string;
  date: string; // ISO 'YYYY-MM-DD' (may be empty)
  items: RehearsalItem[]; // included scenes; array order = the schedule order
  startMinute: number; // minutes from midnight, e.g. 19*60 = 7pm
  objective: Objective; // what Auto-optimize minimizes
}

// Root persisted state.
export interface AppData {
  version: number;
  roles: Role[]; // shared across rehearsals
  scenes: Scene[]; // shared library; array order = stable display/Build order
  rehearsals: Rehearsal[];
  currentRehearsalId: string | null;
}
