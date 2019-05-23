import { sortedLastIndexBy } from 'lodash';
import { clamp } from './utils';

export class TaskQueue {
  constructor() {
    this.tasks = [];
  }
  once(f, delay) {
    const task = {
      time: Date.now() + delay,
      job: f,
    };
    const idx = sortedLastIndexBy(this.tasks, task, task => task.time);
    this.tasks.splice(idx, 0, task);
  }
  repeat(f, delay) {
    this.once(f, delay);
    this.once(() => this.repeat(f, delay), delay);
  }
  async *[Symbol.asyncIterator]() {
    let timer = NaN;
    const sleepUntil = async when =>
      new Promise(done => (timer = setTimeout(done, clamp(when - Date.now(), [ 0 ]))));
    try {
      while (this.tasks.length) {
        const next = this.tasks.shift();
        await sleepUntil(next.time);
        yield next.job;
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
