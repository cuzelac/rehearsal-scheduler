import { autoSchedule } from './scheduler';
import type { Scene } from './types';

export interface WorkerRequest {
  scenes: Scene[];
}

export type WorkerResponse =
  | { type: 'progress'; value: number }
  | { type: 'result'; schedule: string[] };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { scenes } = e.data;
  const schedule = autoSchedule(scenes, (value) => {
    const msg: WorkerResponse = { type: 'progress', value };
    self.postMessage(msg);
  });
  const done: WorkerResponse = { type: 'result', schedule };
  self.postMessage(done);
};
