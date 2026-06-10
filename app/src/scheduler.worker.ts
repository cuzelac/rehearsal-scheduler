import { autoSchedule } from './scheduler';
import type { ScheduledScene, Objective } from './types';

export interface WorkerRequest {
  scenes: ScheduledScene[];
  objective: Objective;
  paidRoleIds: string[];
}

export type WorkerResponse =
  | { type: 'progress'; value: number }
  | { type: 'result'; schedule: string[] };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { scenes, objective, paidRoleIds } = e.data;
  const schedule = autoSchedule(scenes, objective, paidRoleIds, (value) => {
    const msg: WorkerResponse = { type: 'progress', value };
    self.postMessage(msg);
  });
  const done: WorkerResponse = { type: 'result', schedule };
  self.postMessage(done);
};
