// Генератор демонстрационного журнала: вымышленные сотрудники «проходят» реальные диалоги из контента.
import { stepMax, stepCompetency } from './engine.js';

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_F = ['Анна', 'Елена', 'Ольга', 'Мария', 'Наталья', 'Ирина', 'Светлана', 'Татьяна', 'Юлия', 'Екатерина', 'Дарья', 'Ксения'];
const FIRST_M = ['Алексей', 'Дмитрий', 'Сергей', 'Андрей', 'Павел', 'Иван', 'Максим', 'Роман'];
const LAST = ['Иванов', 'Смирнов', 'Кузнецов', 'Попов', 'Васильев', 'Петров', 'Соколов', 'Михайлов', 'Новиков', 'Фёдоров', 'Морозов', 'Волков', 'Алексеев', 'Лебедев', 'Семёнов', 'Егоров', 'Павлов', 'Козлов'];
const PATR_F = ['Александровна', 'Сергеевна', 'Игоревна', 'Владимировна', 'Николаевна', 'Андреевна'];
const PATR_M = ['Александрович', 'Сергеевич', 'Игоревич', 'Владимирович', 'Николаевич', 'Андреевич'];

export const NETWORKS = ['Аптека Плюс', 'Здоровье+', 'Фарма-Дом', 'МедЛайн'];
export const REGIONS = ['Москва', 'Санкт-Петербург', 'Казань', 'Екатеринбург', 'Новосибирск', 'Краснодар'];
export const POSITIONS = ['Фармацевт-первостольник', 'Провизор', 'Заведующий аптекой'];

// Насколько компетенция «даётся» аудитории — чтобы карта компетенций была показательной
const COMP_MOD = { contact: 0.15, needs: 0, presentation: 0.05, objections: -0.22, cross: -0.15, closing: 0.08, ethics: -0.1 };
const NET_MOD = { 'Аптека Плюс': 0.06, 'Здоровье+': 0, 'Фарма-Дом': -0.1, 'МедЛайн': 0.03 };

export function generateDemo(products, count = 42) {
  const r = rng(20261019);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const DAY = 86400000;
  const now = Date.now();
  const out = [];
  let seq = 0;

  for (let i = 0; i < count; i++) {
    const female = r() < 0.8;
    const last = pick(LAST);
    const user = {
      userId: `demo${String(i + 1).padStart(3, '0')}`,
      userName: female
        ? `${last}а ${pick(FIRST_F)} ${pick(PATR_F)}`
        : `${last} ${pick(FIRST_M)} ${pick(PATR_M)}`,
      network: pick(NETWORKS),
      region: pick(REGIONS),
      position: r() < 0.7 ? POSITIONS[0] : pick(POSITIONS),
    };
    const skill = 0.45 + r() * 0.4 + (NET_MOD[user.network] || 0);
    let t = now - (3 + r() * 40) * DAY;
    const ev = (type, data) => out.push({ id: `d${seq++}`, ts: Math.round(Math.min(t, now)), type, demo: true, ...user, ...data });

    for (const p of products) {
      if (r() < 0.85) {
        p.theory.forEach((_, idx) => { if (r() < 0.8) { ev('theory_view', { productId: p.id, card: idx }); t += 20000; } });
      }
      if (r() < 0.6) { ev('video_view', { productId: p.id }); t += 200000; }
      if (r() < 0.5) { ev('memo_view', { productId: p.id }); t += 60000; }

      const dialogs = p.dialogList.slice().sort(() => r() - 0.5).slice(0, 3 + Math.floor(r() * (p.dialogList.length - 2)));
      for (const d of dialogs) {
        const attempts = r() < 0.25 ? 2 : 1;
        for (let attempt = 1; attempt <= attempts; attempt++) {
          const base = { productId: p.id, avatarId: d.avatarId, dialogId: d.id, dialogVersion: d.version, attempt };
          ev('dialog_start', base);
          let stepId = d.start, score = 0, max = 0, finalId = null;
          for (let guard = 0; guard < 20 && d.steps[stepId]; guard++) {
            const step = d.steps[stepId];
            const best = step.options.filter((o) => o.correct);
            const rest = step.options.filter((o) => !o.correct);
            const comp = stepCompetency(step);
            const p0 = Math.min(0.95, Math.max(0.05, skill + (COMP_MOD[comp] || 0) + (attempt - 1) * 0.12));
            // Самая «популярная» ошибка — первый неверный вариант, выбирается в 2 раза чаще
            const opt = r() < p0 || !rest.length
              ? pick(best.length ? best : step.options)
              : (r() < 0.66 ? rest[0] : pick(rest));
            const responseMs = Math.round(3000 + r() * 14000);
            t += responseMs;
            const m = stepMax(step);
            score += opt.score; max += m;
            ev('answer', { ...base, stepId, optionId: opt.id, correct: !!opt.correct, score: opt.score, max: m, competency: comp, optionCompetency: opt.competency, responseMs });
            if (d.finals[opt.next]) { finalId = opt.next; break; }
            stepId = opt.next;
          }
          ev('dialog_finish', { ...base, finalId, outcome: d.finals[finalId]?.outcome, score, max });
          t += (0.5 + r() * 30) * 3600000;
        }
      }
    }
  }
  return out;
}
