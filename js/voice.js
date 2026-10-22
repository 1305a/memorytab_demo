// Озвучка реплик. Если у шага есть audio — играем файл, иначе синтез речи браузера (для макета).
import { store } from './store.js';

let unlocked = false;
let audio = null;
let onEndCb = null;

function pickVoice(cfg = {}) {
  if (!('speechSynthesis' in window)) return null;
  const ru = speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('ru'));
  if (!ru.length) return null;
  const male = /pavel|dmitr|yuri|maxim|male|муж/i;
  const female = /irina|milena|svetlana|katya|ekaterina|anna|female|жен|google/i;
  const pool = ru.filter((v) => (cfg.gender === 'm' ? male : female).test(v.name));
  const list = pool.length ? pool : ru;
  return list[(cfg.index || 0) % list.length];
}

if ('speechSynthesis' in window) speechSynthesis.getVoices();

function finish() {
  const cb = onEndCb;
  onEndCb = null;
  cb?.();
}

export const voice = {
  get enabled() { return store.getSound(); },
  setEnabled(on) { store.setSound(on); if (!on) this.stop(); },
  get unlocked() { return unlocked; },

  // Мобильные браузеры разрешают звук только после действия пользователя
  unlock() {
    if (unlocked) return;
    unlocked = true;
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      speechSynthesis.speak(u);
    }
  },

  play(text, voiceCfg, audioSrc, onEnd) {
    this.stop();
    onEndCb = onEnd;
    if (audioSrc) {
      audio = new Audio(audioSrc);
      audio.onended = audio.onerror = finish;
      audio.play().catch(finish);
      return;
    }
    if (!('speechSynthesis' in window)) { setTimeout(finish, 1500); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ru-RU';
    const v = pickVoice(voiceCfg);
    if (v) u.voice = v;
    u.pitch = voiceCfg?.pitch ?? 1;
    u.rate = voiceCfg?.rate ?? 1;
    u.onend = u.onerror = finish;
    speechSynthesis.speak(u);
  },

  stop() {
    if (audio) { audio.pause(); audio = null; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    finish();
  },
};
