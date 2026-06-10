import { autoSchedule } from './scheduler';
import type { Scene, Objective } from './types';

export interface WorkerRequest {
  scenes: Scene[];
  objective: Objective;
}

export type WorkerResponse =
  | { type: 'progress'; value: number }
  | { type: 'result'; schedule: string[] };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { scenes, objective } = e.data;
  const schedule = autoSchedule(scenes, objective, (value) => {
    const msg: WorkerResponse = { type: 'progress', value };
    self.postMessage(msg);
  });
  const done: WorkerResponse = { type: 'result', schedule };
  self.postMessage(done);
};
