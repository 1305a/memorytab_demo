// Журнал событий. Отчёты строятся только из него.
import { load, save, store } from './store.js';

const KEY = 'ds_events';

export const events = {
  all: () => load(KEY, []),

  log(type, data = {}) {
    const u = store.getUser();
    const e = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: Date.now(),
      type,
      userId: u?.id ?? null,
      userName: u?.name ?? null,
      network: u?.network ?? '',
      region: u?.region ?? '',
      position: u?.position ?? '',
      ...data,
    };
    const list = this.all();
    list.push(e);
    save(KEY, list);
    return e;
  },

  replaceDemo(demoEvents) {
    save(KEY, this.all().filter((e) => !e.demo).concat(demoEvents));
  },

  clearDemo() {
    save(KEY, this.all().filter((e) => !e.demo));
  },
};
