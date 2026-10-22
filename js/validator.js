// Автопроверка структуры контента: тупики, битые переходы, пустые поля, недостижимые шаги.
import { OUTCOMES } from './engine.js';

const empty = (v) => v === undefined || v === null || (typeof v === 'string' && !v.trim());

export function validateDialog(d, product) {
  const errors = [];
  const warnings = [];
  const compIds = new Set((product.competencies || []).map((c) => c.id));
  const avatarIds = new Set((product.avatars || []).map((a) => a.id));

  for (const f of ['id', 'version', 'avatarId', 'title', 'start']) {
    if (empty(d[f])) errors.push(`Не заполнено поле «${f}»`);
  }
  if (!empty(d.avatarId) && !avatarIds.has(d.avatarId)) errors.push(`Аватар «${d.avatarId}» не найден в avatars.json`);

  const steps = d.steps || {};
  const finals = d.finals || {};
  if (!Object.keys(steps).length) errors.push('Нет ни одного шага (steps)');
  if (!Object.keys(finals).length) errors.push('Нет ни одного финала (finals)');
  if (!empty(d.start) && !steps[d.start]) errors.push(`Стартовый шаг «${d.start}» не существует`);

  for (const id of Object.keys(steps)) {
    if (finals[id]) errors.push(`Идентификатор «${id}» используется и как шаг, и как финал`);
  }

  for (const [sid, step] of Object.entries(steps)) {
    const where = `Шаг ${sid}`;
    if (empty(step.text)) errors.push(`${where}: пустая реплика покупателя`);
    const opts = step.options || [];
    if (opts.length < 2 || opts.length > 4) errors.push(`${where}: вариантов ${opts.length}, нужно от 2 до 4`);
    if (!opts.some((o) => o.correct)) warnings.push(`${where}: нет ни одного верного варианта`);
    const seen = new Set();
    opts.forEach((o, i) => {
      const ow = `${where}, вариант ${o.id || i + 1}`;
      if (empty(o.id)) errors.push(`${ow}: нет id`);
      else if (seen.has(o.id)) errors.push(`${ow}: повторяющийся id`);
      seen.add(o.id);
      if (empty(o.text)) errors.push(`${ow}: пустой текст ответа`);
      if (empty(o.feedback)) errors.push(`${ow}: пустой разбор`);
      if (typeof o.score !== 'number') errors.push(`${ow}: баллы должны быть числом`);
      if (typeof o.correct !== 'boolean') errors.push(`${ow}: поле correct должно быть true/false`);
      if (empty(o.competency)) errors.push(`${ow}: не указана компетенция`);
      else if (!compIds.has(o.competency)) errors.push(`${ow}: неизвестная компетенция «${o.competency}»`);
      if (empty(o.next)) errors.push(`${ow}: не указан следующий шаг (next)`);
      else if (!steps[o.next] && !finals[o.next]) errors.push(`${ow}: битый переход → «${o.next}»`);
    });
  }

  for (const [fid, f] of Object.entries(finals)) {
    if (!OUTCOMES[f.outcome]) errors.push(`Финал ${fid}: неизвестный исход «${f.outcome}»`);
    if (empty(f.title) || empty(f.text)) errors.push(`Финал ${fid}: пустой заголовок или текст`);
  }

  // Достижимость от старта
  const reach = new Set();
  const queue = steps[d.start] ? [d.start] : [];
  while (queue.length) {
    const id = queue.shift();
    if (reach.has(id)) continue;
    reach.add(id);
    for (const o of steps[id]?.options || []) {
      if ((steps[o.next] || finals[o.next]) && !reach.has(o.next)) queue.push(o.next);
    }
  }
  for (const id of Object.keys(steps)) if (!reach.has(id)) warnings.push(`Шаг ${id} недостижим от старта`);
  for (const id of Object.keys(finals)) if (!reach.has(id)) warnings.push(`Финал ${id} недостижим от старта`);

  // Тупики: шаги, из которых нельзя прийти ни к одному финалу (циклы)
  const canFinish = new Set(Object.keys(finals));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [sid, step] of Object.entries(steps)) {
      if (!canFinish.has(sid) && (step.options || []).some((o) => canFinish.has(o.next))) {
        canFinish.add(sid);
        changed = true;
      }
    }
  }
  for (const id of Object.keys(steps)) {
    if (reach.has(id) && !canFinish.has(id)) errors.push(`Шаг ${id}: тупик — из него не дойти до финала`);
  }

  // Число путей и длина самого длинного (для оценки «1–2 минуты»)
  let paths = 0, longest = 0;
  const walk = (id, depth, seen) => {
    if (finals[id]) { paths++; longest = Math.max(longest, depth); return; }
    if (!steps[id] || seen.has(id) || paths > 500) return;
    seen.add(id);
    for (const o of steps[id].options || []) walk(o.next, depth + 1, seen);
    seen.delete(id);
  };
  walk(d.start, 0, new Set());

  return {
    errors,
    warnings,
    stats: { steps: Object.keys(steps).length, finals: Object.keys(finals).length, paths, longest },
  };
}

export function validateProduct(p) {
  const errors = [];
  for (const f of ['id', 'title']) if (empty(p[f])) errors.push(`Препарат: не заполнено «${f}»`);
  if (!p.competencies?.length) errors.push('Препарат: пустой список компетенций');
  if (!p.theory?.length) errors.push('Препарат: нет карточек теории');
  if (!p.memo?.sections?.length) errors.push('Препарат: пустая памятка');
  if (empty(p.video?.src)) errors.push('Препарат: не указано видео');
  for (const a of p.avatars || []) {
    for (const f of ['id', 'name', 'legend', 'situation']) {
      if (empty(a[f])) errors.push(`Аватар ${a.id || '?'}: не заполнено «${f}»`);
    }
  }
  const ids = new Set();
  for (const d of p.dialogList || []) {
    if (ids.has(d.id)) errors.push(`Повторяющийся id диалога «${d.id}»`);
    ids.add(d.id);
  }
  return {
    errors,
    dialogs: (p.dialogList || []).map((d) => ({ dialog: d, ...validateDialog(d, p) })),
  };
}
