export interface Role {
  id: string;
  name: string;
  paid: boolean; // paid hourly (counts toward cost) vs volunteer
}

export interface Scene {
  id: string;
  name: string;
  duration: number; // minutes
  roleIds: string[];
}

export type Objective = 'total' | 'minimax' | 'spread' | 'cost';

export interface Rehearsal {
  roles: Role[];
  scenes: Scene[];
  schedule: string[]; // ordered scene ids
  startMinute: number; // minutes from midnight, e.g. 19*60 = 7pm
  objective: Objective; // what Auto-optimize minimizes
}
