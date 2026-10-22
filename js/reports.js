// Отчёты для заказчика. Всё считается из журнала событий «по кнопке», без дашбордов.
import { events } from './events.js';
import { generateDemo } from './demo.js';
import { esc, header, loadScript, downloadBlob, pct, fmtDateTime } from './util.js';

const XLSX_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

const F = {
  from: '', to: '', product: '', avatar: '', network: '', region: '', position: '',
  firstOnly: true, tab: 'users', groupBy: 'network',
};

const TABS = { users: 'По пользователям', comps: 'Карта компетенций', steps: 'По шагам диалогов' };
const GROUPS = { network: 'Сеть', region: 'Регион', position: 'Должность' };

function applyFilters(all) {
  const fromTs = F.from ? new Date(F.from + 'T00:00:00').getTime() : -Infinity;
  const toTs = F.to ? new Date(F.to + 'T23:59:59').getTime() : Infinity;
  return all.filter((e) => e.userId && !e.test
    && e.ts >= fromTs && e.ts <= toTs
    && (!F.product || e.productId === F.product)
    && (!F.avatar || e.avatarId === F.avatar)
    && (!F.network || e.network === F.network)
    && (!F.region || e.region === F.region)
    && (!F.position || e.position === F.position));
}

const countsAnswer = (e) => e.type === 'answer' && (!F.firstOnly || e.attempt === 1);

function allCompetencies(products) {
  const map = new Map();
  for (const p of products) {
    if (F.product && p.id !== F.product) continue;
    for (const c of p.competencies) if (!map.has(c.id)) map.set(c.id, c);
  }
  return [...map.values()];
}

function reportUsers(evs, comps) {
  const by = new Map();
  for (const e of evs) {
    let u = by.get(e.userId);
    if (!u) {
      u = { e, dialogs: new Set(), score: 0, max: 0, attempts: 0, comp: {}, theory: 0, memo: 0, video: 0, last: 0 };
      by.set(e.userId, u);
    }
    u.last = Math.max(u.last, e.ts);
    if (e.type === 'dialog_finish') {
      u.attempts++;
      if (e.attempt === 1) { u.dialogs.add(e.productId + '/' + e.dialogId); u.score += e.score; u.max += e.max; }
    } else if (countsAnswer(e)) {
      const c = (u.comp[e.competency] ||= [0, 0]);
      c[1]++;
      if (e.correct) c[0]++;
    } else if (e.type === 'theory_view') u.theory++;
    else if (e.type === 'memo_view') u.memo++;
    else if (e.type === 'video_view') u.video++;
  }
  const rows = [...by.values()]
    .sort((a, b) => b.score - a.score)
    .map((u) => [
      u.e.userName, u.e.network, u.e.region, u.e.position,
      u.dialogs.size, u.score, u.max, u.max ? pct(u.score, u.max) : '', u.attempts,
      ...comps.map((c) => (u.comp[c.id] ? pct(u.comp[c.id][0], u.comp[c.id][1]) : '')),
      u.theory, u.video, u.memo, fmtDateTime(u.last),
    ]);
  return {
    headers: ['Сотрудник', 'Сеть', 'Регион', 'Должность', 'Диалогов пройдено', 'Баллы', 'Максимум', 'Результат, %', 'Попыток всего',
      ...comps.map((c) => c.name + ', %'), 'Карточек теории', 'Видео', 'Памятка', 'Последняя активность'],
    types: ['text', 'text', 'text', 'text', 'num', 'num', 'num', 'pct', 'num', ...comps.map(() => 'pct'), 'num', 'num', 'num', 'text'],
    rows,
  };
}

function reportComps(evs, comps) {
  const groups = new Map([['__all', { name: 'Вся аудитория', users: new Set(), c: {} }]]);
  for (const e of evs) {
    if (!countsAnswer(e)) continue;
    const key = e[F.groupBy] || '—';
    if (!groups.has(key)) groups.set(key, { name: key, users: new Set(), c: {} });
    for (const g of [groups.get('__all'), groups.get(key)]) {
      g.users.add(e.userId);
      const c = (g.c[e.competency] ||= [0, 0]);
      c[1]++;
      if (e.correct) c[0]++;
    }
  }
  const rows = [...groups.values()].map((g, i) => {
    const total = Object.values(g.c).reduce((s, c) => s + c[1], 0);
    const ok = Object.values(g.c).reduce((s, c) => s + c[0], 0);
    return { i, cells: [g.name, g.users.size, total, ...comps.map((c) => (g.c[c.id] ? pct(g.c[c.id][0], g.c[c.id][1]) : '')), total ? pct(ok, total) : ''] };
  });
  rows.sort((a, b) => (a.i === 0 ? -1 : b.i === 0 ? 1 : String(a.cells[0]).localeCompare(String(b.cells[0]), 'ru')));
  return {
    headers: [GROUPS[F.groupBy], 'Сотрудников', 'Ответов', ...comps.map((c) => c.name), 'Итого'],
    types: ['text', 'num', 'num', ...comps.map(() => 'pct'), 'pct'],
    rows: rows.map((r) => r.cells),
  };
}

function reportSteps(evs, products) {
  const dialogs = new Map();
  for (const p of products) for (const d of p.dialogList) dialogs.set(p.id + '/' + d.id, { p, d });
  const by = new Map();
  for (const e of evs) {
    if (!countsAnswer(e)) continue;
    const key = `${e.productId}/${e.dialogId}/${e.stepId}`;
    let s = by.get(key);
    if (!s) { s = { e, total: 0, wrong: 0, opts: {} }; by.set(key, s); }
    s.total++;
    if (!e.correct) { s.wrong++; s.opts[e.optionId] = (s.opts[e.optionId] || 0) + 1; }
  }
  const rows = [];
  for (const s of by.values()) {
    const ref = dialogs.get(s.e.productId + '/' + s.e.dialogId);
    const step = ref?.d.steps[s.e.stepId];
    if (!step || s.total < 3) continue;
    const avatar = ref.p.avatars.find((a) => a.id === ref.d.avatarId);
    const [topId, topN] = Object.entries(s.opts).sort((a, b) => b[1] - a[1])[0] || [];
    const topOpt = step.options.find((o) => o.id === topId);
    const comp = step.options.find((o) => o.correct)?.competency;
    rows.push([
      ref.d.title, avatar?.name || '', s.e.stepId, step.text,
      ref.p.competencies.find((c) => c.id === comp)?.name || '',
      s.total, pct(s.wrong, s.total), topOpt?.text || '—', topN ? pct(topN, s.total) : '',
    ]);
  }
  rows.sort((a, b) => b[6] - a[6]);
  return {
    headers: ['Диалог', 'Аватар', 'Шаг', 'Реплика покупателя', 'Компетенция шага', 'Ответов', 'Ошибок, %', 'Самый частый неверный ответ', 'Его выбирают, %'],
    types: ['text', 'text', 'text', 'long', 'text', 'num', 'err', 'long', 'num'],
    rows,
  };
}

function heat(v, invert) {
  if (v === '' || v === null || v === undefined) return '';
  const x = invert ? 100 - v : v;
  const h = Math.round(Math.max(0, Math.min(100, (x - 30) / 60 * 100)) * 1.3);
  return `style="background:hsl(${h} 70% 88%)"`;
}

function tableHtml(rep) {
  if (!rep.rows.length) return '<div class="empty">Нет данных по выбранным фильтрам</div>';
  const th = rep.headers.map((h) => `<th>${esc(h)}</th>`).join('');
  const tr = rep.rows.map((r) => `<tr>${r.map((v, i) => {
    const t = rep.types[i];
    if (t === 'pct') return `<td class="num" ${heat(v)}>${v === '' ? '—' : v + '%'}</td>`;
    if (t === 'err') return `<td class="num" ${heat(v, true)}>${v}%</td>`;
    if (t === 'num') return `<td class="num">${esc(v)}</td>`;
    if (t === 'long') return `<td class="long">${esc(v)}</td>`;
    return `<td>${esc(v)}</td>`;
  }).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table class="report"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

function options(values, selected, allLabel) {
  return `<option value="">${allLabel}</option>` + values
    .map(([v, l]) => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(l)}</option>`).join('');
}

export function viewReports(app, S) {
  // Демо-журнал создаётся при первом открытии (и пересоздаётся при смене формата событий)
  if (!events.all().some((e) => e.demo && e.type === 'answer' && 'optionCompetency' in e)) {
    events.replaceDemo(generateDemo(S.products));
  }
  app.classList.add('wide');

  const build = () => {
    const all = events.all();
    const evs = applyFilters(all);
    const comps = allCompetencies(S.products);
    return {
      all, evs,
      users: reportUsers(evs, comps),
      comps: reportComps(evs, comps),
      steps: reportSteps(evs, S.products),
    };
  };

  const render = () => {
    const r = build();
    const uniq = (k) => [...new Set(r.all.map((e) => e[k]).filter(Boolean))].sort().map((v) => [v, v]);
    const avatars = S.products.filter((p) => !F.product || p.id === F.product).flatMap((p) => p.avatars.map((a) => [a.id, `${a.name} — ${a.short || ''}`]));
    const realCount = r.all.filter((e) => !e.demo).length;
    const usersCount = new Set(r.evs.map((e) => e.userId)).size;

    app.innerHTML = `<div class="screen">
      ${header('Отчёты заказчика', '#/menu')}
      <main class="content reports">
        <section class="card filters">
          <div class="filter-grid">
            <label>Период с<input type="date" data-f="from" value="${F.from}"></label>
            <label>по<input type="date" data-f="to" value="${F.to}"></label>
            <label>Препарат<select data-f="product">${options(S.products.map((p) => [p.id, p.title]), F.product, 'Все')}</select></label>
            <label>Аватар<select data-f="avatar">${options(avatars, F.avatar, 'Все')}</select></label>
            <label>Сеть<select data-f="network">${options(uniq('network'), F.network, 'Все')}</select></label>
            <label>Регион<select data-f="region">${options(uniq('region'), F.region, 'Все')}</select></label>
            <label>Должность<select data-f="position">${options(uniq('position'), F.position, 'Все')}</select></label>
            <label class="check"><input type="checkbox" data-f="firstOnly" ${F.firstOnly ? 'checked' : ''}> Только первая попытка (в зачёт)</label>
          </div>
          <div class="filter-actions">
            <button class="btn primary" data-act="export">⬇ Выгрузить в Excel</button>
            <button class="btn ghost" data-act="reset">Сбросить фильтры</button>
            <span class="muted small">Событий: ${r.evs.length} · сотрудников: ${usersCount} · в журнале ваших событий: ${realCount}</span>
          </div>
        </section>

        <nav class="tabs">${Object.entries(TABS).map(([k, l]) => `<button class="tab ${F.tab === k ? 'active' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</nav>

        ${F.tab === 'comps' ? `<div class="groupby">Строки: ${Object.entries(GROUPS).map(([k, l]) => `<button class="chip ${F.groupBy === k ? 'active' : ''}" data-act="group" data-g="${k}">${l}</button>`).join('')}</div>` : ''}
        <p class="muted small">${{
          users: 'Пройденные диалоги, баллы первой попытки и доля верных ответов по каждой компетенции.',
          comps: 'Доля верных ответов по аудитории: где не хватает компетенций для продаж препарата.',
          steps: 'Где чаще ошибаются и какой неверный вариант выбирают. Отсортировано по доле ошибок.',
        }[F.tab]}</p>
        ${tableHtml(r[F.tab])}

        <section class="card demo-box">
          <b>Демо-журнал.</b> Чтобы отчёты не были пустыми, в журнал добавлены действия 42 вымышленных сотрудников.
          Ваши собственные прохождения тоже попадают в отчёты.
          <div class="filter-actions">
            <button class="btn ghost" data-act="regen">Пересоздать демо-журнал</button>
            <button class="btn ghost" data-act="cleardemo">Убрать демо-данные</button>
          </div>
        </section>
      </main></div>`;

    app.querySelectorAll('[data-f]').forEach((el) => el.addEventListener('change', () => {
      F[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
      if (el.dataset.f === 'product') F.avatar = '';
      render();
    }));
  };

  S.actions = {
    tab: (el) => { F.tab = el.dataset.tab; render(); },
    group: (el) => { F.groupBy = el.dataset.g; render(); },
    reset: () => { Object.assign(F, { from: '', to: '', product: '', avatar: '', network: '', region: '', position: '', firstOnly: true }); render(); },
    regen: () => { events.replaceDemo(generateDemo(S.products)); render(); },
    cleardemo: () => { events.clearDemo(); render(); },
    export: async (el) => {
      const r = build();
      const stamp = new Date().toISOString().slice(0, 10);
      const params = [
        ['Сформирован', fmtDateTime(Date.now())],
        ['Период', `${F.from || 'начало'} — ${F.to || 'сегодня'}`],
        ['Препарат', S.products.find((p) => p.id === F.product)?.title || 'Все'],
        ['Аватар', F.avatar || 'Все'], ['Сеть', F.network || 'Все'], ['Регион', F.region || 'Все'],
        ['Должность', F.position || 'Все'], ['Учитываются', F.firstOnly ? 'Только первые попытки' : 'Все попытки'],
      ];
      const journalCols = ['ts', 'type', 'userId', 'userName', 'network', 'region', 'position', 'productId', 'avatarId', 'dialogId', 'dialogVersion', 'stepId', 'optionId', 'correct', 'score', 'competency', 'optionCompetency', 'responseMs', 'attempt', 'finalId', 'outcome'];
      const journal = [journalCols, ...r.evs.map((e) => journalCols.map((c) => (c === 'ts' ? fmtDateTime(e.ts) : e[c] ?? '')))];
      el.disabled = true;
      try {
        await loadScript(XLSX_SRC, 'XLSX');
        const X = window.XLSX;
        const wb = X.utils.book_new();
        X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(params), 'Параметры');
        X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([r.users.headers, ...r.users.rows]), 'По пользователям');
        X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([r.comps.headers, ...r.comps.rows]), 'Карта компетенций');
        X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([r.steps.headers, ...r.steps.rows]), 'По шагам');
        X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(journal), 'Журнал событий');
        X.writeFile(wb, `otchet_trenazher_${stamp}.xlsx`);
      } catch {
        // Нет доступа к CDN — отдаём текущий отчёт в CSV
        const rep = r[F.tab];
        const csv = [rep.headers, ...rep.rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
        downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `otchet_${F.tab}_${stamp}.csv`);
      } finally {
        el.disabled = false;
      }
    },
  };

  render();
}
