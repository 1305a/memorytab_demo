// Хранилище макета: пользователь, прогресс, настройки. Вместо БД — localStorage.
const K = { user: 'ds_user', progress: 'ds_progress', sound: 'ds_sound', product: 'ds_product' };

export function load(key, def) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : def;
  } catch { return def; }
}

export function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* приватный режим */ }
}

export const store = {
  getUser: () => load(K.user, null),
  setUser: (u) => save(K.user, u),
  logout: () => { try { localStorage.removeItem(K.user); } catch { /* */ } },

  getProductId: () => load(K.product, null),
  setProductId: (id) => save(K.product, id),

  getSound: () => load(K.sound, true),
  setSound: (on) => save(K.sound, on),

  // Прогресс хранится по пользователю → препарату → диалогу
  getProgress(productId, dialogId) {
    const u = this.getUser();
    if (!u) return null;
    return load(K.progress, {})[u.id]?.[productId]?.[dialogId] || null;
  },
  setProgress(productId, dialogId, value) {
    const u = this.getUser();
    if (!u) return;
    const all = load(K.progress, {});
    ((all[u.id] ||= {})[productId] ||= {})[dialogId] = value;
    save(K.progress, all);
  },
  resetProgress() {
    const u = this.getUser();
    if (!u) return;
    const all = load(K.progress, {});
    delete all[u.id];
    save(K.progress, all);
  },
};
