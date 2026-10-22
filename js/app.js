import { store } from './store.js';
import { events } from './events.js';
import { voice } from './voice.js';
import { avatarSvg, pharmacistSvg } from './avatar.js';
import { OUTCOMES, summarize, stepMax, stepCompetency, shuffle, newAttempt } from './engine.js';
import { validateProduct, validateDialog } from './validator.js';
import { viewReports } from './reports.js';
import { esc, header, loadScript, downloadBlob, fmtDate, pct } from './util.js';

const HTML2CANVAS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
const app = document.getElementById('app');
const S = { products: [], product: null, chat: null, testResult: null, uploaded: null, actions: {} };

// ---------- Загрузка контента (всё из JSON, движок не знает о препаратах) ----------

async function loadJson(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

async function loadContent() {
  const index = await loadJson('content/index.json');
  return Promise.all(index.products.map(async (id) => {
    const base = `content/${id}/`;
    const [product, avatars] = await Promise.all([loadJson(base + 'product.json'), loadJson(base + 'avatars.json')]);
    const dialogList = await Promise.all(product.dialogs.map((d) => loadJson(`${base}dialogs/${d}.json`)));
    return { ...product, base, avatars, dialogList };
  }));
}

// ---------- Помощники ----------

const compName = (p, id) => p.competencies.find((c) => c.id === id)?.name || id;
const avatarOf = (p, d) => p.avatars.find((a) => a.id === d.avatarId) || { name: '?', look: {} };
const avatarPic = (p, a, mood = 'neutral') => (a.image
  ? `<img src="${esc(p.base + a.image)}" alt="${esc(a.name)}">`
  : avatarSvg(a.look, mood));

function productStats(p) {
  let done = 0, score = 0, max = 0, correct = 0, answers = 0;
  for (const d of p.dialogList) {
    const pr = store.getProgress(p.id, d.id);
    if (pr?.first) {
      done++;
      score += pr.first.score; max += pr.first.max;
      correct += pr.first.correct; answers += pr.first.total;
    }
  }
  return { done, total: p.dialogList.length, score, max, pct: pct(correct, answers) };
}

function durationOf(text) {
  const s = Math.max(2, Math.round(text.length / 14));
  return `0:${String(s).padStart(2, '0')}`;
}

function waveBars(text) {
  let h = 0;
  return Array.from({ length: 26 }, (_, i) => {
    h = (h * 31 + text.charCodeAt(i % text.length) + i) % 997;
    return `<i style="height:${25 + (h % 70)}%"></i>`;
  }).join('');
}

// ---------- Роутер ----------

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [pathPart, query = ''] = h.split('?');
  const [name, ...args] = pathPart.split('/');
  return { name: name || 'menu', args, query: new URLSearchParams(query) };
}

const PUBLIC = ['login', 'check', 'preview', 'reports'];

function router() {
  voice.stop();
  S.actions = {};
  S.chat = null;
  app.classList.remove('wide');
  const r = parseHash();
  const user = store.getUser();
  const isTest = r.name === 'chat' && r.query.get('test') === '1';
  if (!user && !PUBLIC.includes(r.name) && !isTest) { location.hash = '#/login'; return; }
  const pid = store.getProductId();
  S.product = S.products.find((p) => p.id === pid) || S.products[0];
  const views = {
    login: viewLogin, menu: viewMenu, theory: viewTheory, dialogs: viewDialogs, chat: viewChat,
    result: viewResult, video: viewVideo, memo: viewMemo, cert: viewCert, check: viewCheck,
    preview: viewPreview, reports: () => viewReports(app, S),
  };
  (views[r.name] || viewMenu)(r);
  window.scrollTo(0, 0);
}

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !app.contains(el)) return;
  const fn = S.actions[el.dataset.act] || globalActions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});

const globalActions = {
  logout: () => { store.logout(); location.hash = '#/login'; },
  sound: (el) => {
    voice.setEnabled(!voice.enabled);
    el.textContent = voice.enabled ? '🔊' : '🔇';
    el.title = voice.enabled ? 'Выключить звук' : 'Включить звук';
  },
  print: () => window.print(),
};

const soundBtn = () => `<button class="icon-btn" data-act="sound" title="${voice.enabled ? 'Выключить звук' : 'Включить звук'}">${voice.enabled ? '🔊' : '🔇'}</button>`;

// ---------- Вход ----------

function viewLogin() {
  app.innerHTML = `<div class="screen login">
    <main class="content">
      <div class="brand"><div class="logo">✚</div><h1>Тренажёр диалогов</h1><p class="muted">для сотрудников аптек</p></div>
      <form class="card form" id="loginForm">
        <div class="notice small">Временный вход для тестов. В работе вход выполняется через портал Pharmskills — эти поля придут из портала.</div>
        <label>Логин<input name="login" required value="demo" autocomplete="username"></label>
        <label>Пароль<input name="password" type="password" required value="demo" autocomplete="current-password"></label>
        <label>ФИО<input name="name" required value="Иванова Анна Сергеевна"></label>
        <div class="row2">
          <label>Сеть<input name="network" value="Аптека Плюс"></label>
          <label>Регион<input name="region" value="Москва"></label>
        </div>
        <label>Должность<input name="position" value="Фармацевт-первостольник"></label>
        <button class="btn primary big" type="submit">Войти</button>
      </form>
      <div class="footer-links"><a href="#/check">Проверка контента</a> · <a href="#/reports">Отчёты заказчика</a></div>
    </main></div>`;
  document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    store.setUser({ id: f.login.trim(), name: f.name.trim(), network: f.network.trim(), region: f.region.trim(), position: f.position.trim(), source: 'test-login' });
    location.hash = '#/menu';
  });
}

// ---------- Главное меню ----------

function viewMenu() {
  const user = store.getUser();
  const p = S.product;
  const st = productStats(p);
  const tile = (href, icon, title, sub) => `<a class="tile" href="${href}"><span class="tile-ic">${icon}</span><b>${title}</b><span class="muted small">${sub}</span></a>`;
  app.innerHTML = `<div class="screen">
    <header class="topbar menu-top">
      <div><div class="muted small">Добрый день,</div><div class="h-name">${esc(user.name)}</div></div>
      <button class="icon-btn" data-act="logout" title="Выйти">⎋</button>
    </header>
    <main class="content">
      ${S.products.length > 1 ? `<label class="product-select">Препарат <select id="productSel">${S.products.map((x) => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select></label>` : ''}
      <section class="hero">
        <div class="hero-top"><div><div class="hero-title">${esc(p.title)}</div><div class="hero-sub">${esc(p.subtitle)}</div></div><div class="pill-pack">💊</div></div>
        <div class="stats">
          <div><b>${st.score}</b><span>баллов</span></div>
          <div><b>${st.done}/${st.total}</b><span>диалогов</span></div>
          <div><b>${st.pct}%</b><span>верных ответов</span></div>
        </div>
        <div class="progress"><i style="width:${pct(st.done, st.total)}%"></i></div>
      </section>
      <nav class="tiles">
        ${tile('#/theory', '📚', 'Теория', `${p.theory.length} карточек`)}
        ${tile('#/dialogs', '💬', 'Диалоги', `пройдено ${st.done} из ${st.total}`)}
        ${tile('#/video', '▶️', 'Видео', esc(p.video.duration || 'ролик'))}
        ${tile('#/memo', '📝', 'Памятка', 'шпаргалка')}
      </nav>
      <a class="card cert-link" href="#/cert"><span class="tile-ic">🏅</span><span><b>Сертификат</b><br><span class="muted small">${st.done === st.total ? 'Доступен — можно скачать' : `Откроется после всех ${st.total} диалогов`}</span></span><span class="chev">›</span></a>
      <p class="muted small center">${esc(p.demoNote || '')}</p>
      <div class="footer-links"><a href="#/reports">Отчёты заказчика</a> · <a href="#/check">Проверка контента</a> · <a href="#" data-act="resetProgress">Сбросить мой прогресс</a></div>
    </main></div>`;
  document.getElementById('productSel')?.addEventListener('change', (e) => { store.setProductId(e.target.value); router(); });
  S.actions.resetProgress = () => {
    if (confirm('Сбросить ваш прогресс по всем диалогам? Журнал событий сохранится.')) { store.resetProgress(); router(); }
  };
}

// ---------- Теория: свайп-карточки ----------

function viewTheory() {
  const p = S.product;
  let i = 0;
  const seen = new Set();
  app.innerHTML = `<div class="screen">
    ${header('Теория: ' + p.title)}
    <main class="content theory">
      <div class="cards-viewport" id="vp"><div class="cards-track" id="track">
        ${p.theory.map((c, n) => `<article class="tcard"><div class="tcard-ic">${c.icon || '💡'}</div><div class="tcard-n muted small">${n + 1} / ${p.theory.length}</div><h2>${esc(c.title)}</h2><p>${esc(c.text)}</p>${c.bullets ? `<ul>${c.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}</article>`).join('')}
      </div></div>
      <div class="dots" id="dots">${p.theory.map((_, n) => `<i data-act="goto" data-n="${n}"></i>`).join('')}</div>
      <div class="theory-nav">
        <button class="btn ghost" data-act="prev">‹ Назад</button>
        <button class="btn primary" data-act="next" id="nextBtn">Далее ›</button>
      </div>
      <p class="muted small center">Листайте карточки свайпом</p>
    </main></div>`;
  const track = document.getElementById('track');
  const show = () => {
    track.style.transform = `translateX(-${i * 100}%)`;
    document.querySelectorAll('#dots i').forEach((d, n) => d.classList.toggle('on', n === i));
    document.getElementById('nextBtn').textContent = i === p.theory.length - 1 ? 'К диалогам ›' : 'Далее ›';
    if (!seen.has(i)) { seen.add(i); events.log('theory_view', { productId: p.id, card: i }); }
  };
  S.actions = {
    prev: () => { i = Math.max(0, i - 1); show(); },
    next: () => { if (i === p.theory.length - 1) location.hash = '#/dialogs'; else { i++; show(); } },
    goto: (el) => { i = +el.dataset.n; show(); },
  };
  let x0 = null;
  const vp = document.getElementById('vp');
  vp.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  vp.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (dx < -40 && i < p.theory.length - 1) i++;
    if (dx > 40 && i > 0) i--;
    x0 = null;
    show();
  });
  show();
}

// ---------- Список диалогов ----------

function viewDialogs() {
  const p = S.product;
  const st = productStats(p);
  app.innerHTML = `<div class="screen">
    ${header('Диалоги')}
    <main class="content">
      <p class="muted">Выберите покупателя. В зачёт идёт первая попытка, повторные тоже сохраняются. Диалог занимает 1–2 минуты.</p>
      <div class="progress slim"><i style="width:${pct(st.done, st.total)}%"></i></div>
      <div class="dialog-list">
        ${p.dialogList.map((d) => {
          const a = avatarOf(p, d);
          const pr = store.getProgress(p.id, d.id);
          const inProgress = pr?.current && pr.current.version === d.version;
          const status = inProgress
            ? '<span class="chip mid">В процессе</span>'
            : pr?.first ? `<span class="chip ok">${pr.first.score}/${pr.first.max}</span>` : '<span class="chip">Новый</span>';
          return `<a class="dialog-item" href="#/chat/${d.id}">
            <div class="ava">${avatarPic(p, a, pr?.first ? 'happy' : 'neutral')}</div>
            <div class="di-body"><b>${esc(a.name)}, ${esc(a.age)}</b><div class="di-title">${esc(d.title)}</div><div class="muted small">${esc(a.short || '')}</div></div>
            <div class="di-status">${status}${pr?.started > 1 ? `<span class="muted small">попыток: ${pr.started}</span>` : ''}</div>
          </a>`;
        }).join('')}
      </div>
    </main></div>`;
}

// ---------- Чат с аватаром (ядро) ----------

function viewChat(r) {
  const test = r.query.get('test') === '1';
  const p = S.product;
  const dialog = r.args[0] === 'uploaded' && S.uploaded ? S.uploaded : p.dialogList.find((d) => d.id === r.args[0]);
  if (!dialog) { location.hash = '#/dialogs'; return; }
  const avatar = avatarOf(p, dialog);
  const prog = test ? {} : (store.getProgress(p.id, dialog.id) || {});
  const resumable = prog.current && prog.current.version === dialog.version ? prog.current : null;
  const c = S.chat = { p, dialog, avatar, test, prog, cur: resumable, mood: 'neutral', busy: false, order: null, shownAt: 0 };
  const back = test ? '#/check' : '#/dialogs';
  const nextAttempt = (prog.started || 0) + 1;

  app.innerHTML = `<div class="screen chat-screen">
    ${header(avatar.name, back, soundBtn())}
    ${test ? '<div class="test-banner">Тестовый стенд: события не пишутся, прогресс не сохраняется</div>' : ''}
    <div class="scene">
      <div class="shelves"></div>
      <div class="scene-avatar" id="sceneAva">${avatarPic(p, avatar, 'neutral')}</div>
      <div class="counter"><span>✚ АПТЕКА</span></div>
      <div class="pharmacist">${pharmacistSvg}</div>
      <div class="comic" id="comic" hidden></div>
    </div>
    <div class="chat-log" id="log"></div>
    <div class="answers" id="answers"></div>
    <div class="intro" id="intro">
      <div class="intro-card">
        <div class="ava big">${avatarPic(p, avatar, 'neutral')}</div>
        <h2>${esc(avatar.name)}, ${esc(avatar.age)}</h2>
        <div class="di-title">${esc(dialog.title)}</div>
        <p><b>Легенда.</b> ${esc(avatar.legend)}</p>
        <p><b>Ситуация.</b> ${esc(avatar.situation)}</p>
        <p class="muted small">${resumable ? `Попытка №${resumable.attempt} — продолжите с места, где остановились.` : `Попытка №${test ? 1 : nextAttempt}${!test && nextAttempt > 1 ? ' (в зачёт идёт первая, эта тоже сохранится)' : ''}.`}
        Реплики озвучены, текст показан всегда — можно проходить без звука.</p>
        <button class="btn primary big" data-act="start">${resumable ? 'Продолжить диалог' : 'Начать диалог'}</button>
      </div>
    </div>
  </div>`;

  S.actions = {
    start: () => {
      voice.unlock();
      document.getElementById('intro').remove();
      if (!c.cur) {
        c.cur = newAttempt(dialog, test ? 1 : nextAttempt);
        if (!test) {
          c.prog.started = c.cur.attempt;
          logEvent('dialog_start');
        }
        persist();
      }
      renderLog();
      showStep();
    },
    choose: (el) => choose(el.dataset.opt),
    play: (el) => playMsg(+el.dataset.i, true),
    result: () => { location.hash = `#/result/${dialog.id}${test ? '?test=1' : ''}`; },
    again: () => { router(); },
  };
}

function logEvent(type, extra = {}) {
  const c = S.chat;
  if (c.test) return;
  events.log(type, {
    productId: c.p.id, avatarId: c.dialog.avatarId, dialogId: c.dialog.id,
    dialogVersion: c.dialog.version, attempt: c.cur.attempt, ...extra,
  });
}

function persist() {
  const c = S.chat;
  if (c.test) return;
  store.setProgress(c.p.id, c.dialog.id, { ...c.prog, current: c.cur });
}

function setMood(mood) {
  const c = S.chat;
  c.mood = mood;
  const el = document.getElementById('sceneAva');
  if (el && !c.avatar.image) el.innerHTML = avatarSvg(c.avatar.look, mood);
}

function setComic(text) {
  const el = document.getElementById('comic');
  if (!el) return;
  el.hidden = !text;
  el.textContent = text || '';
}

function renderLog() {
  const c = S.chat;
  const log = document.getElementById('log');
  if (!log) return;
  const seen = c.rendered ?? c.cur.log.length;
  c.rendered = c.cur.log.length;
  log.innerHTML = c.cur.log.map((m, i) => {
    const html = renderItem(c, m, i);
    return i >= seen ? html.replace('class="', 'class="new ') : html;
  }).join('');
  const lastAvatar = [...c.cur.log].reverse().find((m) => m.t === 'avatar');
  setComic(lastAvatar?.text);
  log.scrollTop = log.scrollHeight;
}

function renderItem(c, m, i) {
  if (m.t === 'avatar') {
    return `<div class="msg msg-in" data-i="${i}">
      <div class="voice"><button class="play" data-act="play" data-i="${i}" aria-label="Прослушать">▶</button><div class="wave">${waveBars(m.text)}</div><span class="dur">${durationOf(m.text)}</span></div>
      <div class="msg-text">${esc(m.text)}</div></div>`;
  }
  if (m.t === 'me') return `<div class="msg msg-out">${esc(m.text)}</div>`;
  if (m.t === 'fb') {
    const cls = m.ok ? 'ok' : m.score > 0 ? 'mid' : 'bad';
    const title = m.ok ? 'Верно' : m.score > 0 ? 'Частично верно' : 'Ошибка';
    return `<div class="feedback ${cls}"><div class="fb-head"><b>${title}</b><span>+${m.score} из ${m.max} · ${esc(compName(c.p, m.competency))}</span></div><div>${esc(m.text)}</div></div>`;
  }
  if (m.t === 'final') {
    const f = c.dialog.finals[m.finalId];
    const o = OUTCOMES[f.outcome];
    return `<div class="final-card ${o.cls}"><div class="chip ${o.cls}">${o.label}</div><h3>${esc(f.title)}</h3><p>${esc(f.text)}</p></div>`;
  }
  return '';
}

function playMsg(i, manual) {
  const c = S.chat;
  const m = c.cur.log[i];
  if (!m) return;
  if (!voice.enabled && manual) voice.setEnabled(true), document.querySelector('[data-act="sound"]').textContent = '🔊';
  if (!voice.enabled) return;
  const box = document.querySelector(`.msg[data-i="${i}"] .voice`);
  document.querySelectorAll('.voice.playing').forEach((v) => v.classList.remove('playing'));
  box?.classList.add('playing');
  const audio = c.dialog.steps[m.stepId]?.audio;
  voice.play(m.text, c.avatar.voice, audio ? c.p.base + audio : null, () => box?.classList.remove('playing'));
}

function showStep() {
  const c = S.chat;
  const step = c.dialog.steps[c.cur.stepId];
  const last = c.cur.log[c.cur.log.length - 1];
  const answers = document.getElementById('answers');
  answers.innerHTML = '';

  const renderOptions = () => {
    c.order = shuffle(step.options);
    c.shownAt = Date.now();
    c.busy = false;
    answers.innerHTML = `<div class="answers-title muted small">Выберите ответ</div>` + c.order
      .map((o) => `<button class="answer" data-act="choose" data-opt="${esc(o.id)}">${esc(o.text)}</button>`).join('');
  };

  if (last?.t === 'avatar' && last.stepId === c.cur.stepId) { renderOptions(); return; }

  const log = document.getElementById('log');
  log.insertAdjacentHTML('beforeend', '<div class="msg msg-in typing"><span></span><span></span><span></span></div>');
  log.scrollTop = log.scrollHeight;
  setTimeout(() => {
    if (S.chat !== c) return;
    c.cur.log.push({ t: 'avatar', stepId: c.cur.stepId, text: step.text });
    persist();
    renderLog();
    renderOptions();
    if (voice.unlocked && voice.enabled) playMsg(c.cur.log.length - 1, false);
  }, 900);
}

function choose(optId) {
  const c = S.chat;
  if (c.busy) return;
  c.busy = true;
  voice.stop();
  const step = c.dialog.steps[c.cur.stepId];
  const opt = step.options.find((o) => o.id === optId);
  const max = stepMax(step);
  const competency = stepCompetency(step);
  const responseMs = Date.now() - c.shownAt;
  c.cur.answers.push({ stepId: c.cur.stepId, optionId: opt.id, score: opt.score, max, correct: opt.correct, competency, optionCompetency: opt.competency, responseMs });
  c.cur.log.push({ t: 'me', text: opt.text });
  c.cur.log.push({ t: 'fb', ok: opt.correct, score: opt.score, max, competency: opt.competency, text: opt.feedback });
  logEvent('answer', { stepId: c.cur.stepId, optionId: opt.id, correct: opt.correct, score: opt.score, max, competency, optionCompetency: opt.competency, responseMs });
  setMood(opt.correct ? 'happy' : opt.score > 0 ? 'neutral' : 'sad');
  document.getElementById('answers').innerHTML = '';

  if (c.dialog.finals[opt.next]) { finish(opt.next); return; }
  c.cur.stepId = opt.next;
  persist();
  renderLog();
  showStep();
}

function finish(finalId) {
  const c = S.chat;
  const f = c.dialog.finals[finalId];
  c.cur.log.push({ t: 'final', finalId });
  const sum = { ...summarize(c.cur.answers), finalId, outcome: f.outcome, attempt: c.cur.attempt, answers: c.cur.answers, version: c.dialog.version, at: Date.now() };
  if (c.test) {
    S.testResult = sum;
  } else {
    logEvent('dialog_finish', { finalId, outcome: f.outcome, score: sum.score, max: sum.max });
    const prog = { ...c.prog, current: null, last: sum, completed: (c.prog.completed || 0) + 1 };
    if (!prog.first) prog.first = sum;
    store.setProgress(c.p.id, c.dialog.id, prog);
  }
  setMood(f.outcome === 'sale' || f.outcome === 'safe' ? 'happy' : f.outcome === 'doubt' ? 'neutral' : 'sad');
  renderLog();
  document.getElementById('answers').innerHTML = `<div class="final-actions">
    <button class="btn primary big" data-act="result">Итоги диалога</button></div>`;
}

// ---------- Итоги диалога ----------

function viewResult(r) {
  const test = r.query.get('test') === '1';
  const p = S.product;
  const dialog = r.args[0] === 'uploaded' && S.uploaded ? S.uploaded : p.dialogList.find((d) => d.id === r.args[0]);
  const prog = test ? null : store.getProgress(p.id, dialog?.id);
  const sum = test ? S.testResult : prog?.last;
  if (!dialog || !sum) { location.hash = '#/dialogs'; return; }
  const a = avatarOf(p, dialog);
  const f = dialog.finals[sum.finalId];
  const o = OUTCOMES[f.outcome];
  const mistakes = sum.answers.filter((x) => !x.correct);

  app.innerHTML = `<div class="screen">
    ${header('Итоги диалога', test ? '#/check' : '#/dialogs')}
    <main class="content">
      <section class="card result-head">
        <div class="ava big">${avatarPic(p, a, o.cls === 'ok' ? 'happy' : o.cls === 'mid' ? 'neutral' : 'sad')}</div>
        <div class="chip ${o.cls}">${o.label}</div>
        <h2>${esc(f.title)}</h2>
        <p class="muted">${esc(f.text)}</p>
        <div class="score-ring" style="--p:${pct(sum.score, sum.max)}"><b>${sum.score}</b><span>из ${sum.max}</span></div>
        <p class="small muted">Попытка №${sum.attempt}. ${!test && prog.first && sum.attempt > 1 ? `В зачёт идёт первая попытка: ${prog.first.score} из ${prog.first.max}.` : !test ? 'Эта попытка идёт в зачёт.' : ''}</p>
      </section>

      <section class="card">
        <h3>Результат по компетенциям</h3>
        ${Object.entries(sum.comps).map(([id, v]) => `<div class="comp-row">
          <div class="comp-name">${esc(compName(p, id))}<span>${v.correct}/${v.total}</span></div>
          <div class="bar"><i class="${v.correct === v.total ? 'ok' : v.correct ? 'mid' : 'bad'}" style="width:${pct(v.correct, v.total)}%"></i></div></div>`).join('')}
      </section>

      <section class="card">
        <h3>Разбор ошибок</h3>
        ${mistakes.length ? mistakes.map((m) => {
          const step = dialog.steps[m.stepId];
          const opt = step.options.find((x) => x.id === m.optionId);
          const best = step.options.find((x) => x.correct);
          return `<div class="mistake">
            <div class="muted small">Покупатель: «${esc(step.text)}»</div>
            <div class="mk-bad">Ваш ответ: ${esc(opt.text)}</div>
            <div class="mk-why">${esc(opt.feedback)}</div>
            ${best ? `<div class="mk-good">Лучший ответ: ${esc(best.text)}</div>` : ''}
          </div>`;
        }).join('') : '<p>Ошибок нет — отличная работа! 🎉</p>'}
      </section>

      <div class="btn-row">
        <a class="btn ghost" href="${test ? '#/check' : '#/dialogs'}">${test ? 'К проверке' : 'К списку'}</a>
        <a class="btn primary" href="#/chat/${dialog.id}${test ? '?test=1' : ''}">Пройти ещё раз</a>
      </div>
    </main></div>`;
}

// ---------- Видео ----------

function viewVideo() {
  const p = S.product;
  const v = p.video;
  app.innerHTML = `<div class="screen">
    ${header('Видео')}
    <main class="content">
      <div class="video-wrap"><video id="vid" controls playsinline preload="metadata" ${v.poster ? `poster="${esc(p.base + v.poster)}"` : ''} src="${esc(/^https?:/.test(v.src) ? v.src : p.base + v.src)}"></video></div>
      <h2>${esc(v.title)}</h2>
      <p class="muted">${esc(v.description || '')}</p>
      ${v.chapters ? `<div class="card"><h3>Содержание</h3><ol class="chapters">${v.chapters.map((ch) => `<li><span class="muted">${esc(ch.time)}</span> ${esc(ch.title)}</li>`).join('')}</ol></div>` : ''}
    </main></div>`;
  let logged = false;
  document.getElementById('vid').addEventListener('play', () => {
    if (!logged) { logged = true; events.log('video_view', { productId: p.id }); }
  });
}

// ---------- Памятка ----------

function viewMemo() {
  const p = S.product;
  const m = p.memo;
  events.log('memo_view', { productId: p.id });
  app.innerHTML = `<div class="screen">
    ${header('Памятка')}
    <main class="content">
      <article class="memo printable" id="memo">
        <div class="memo-head"><div class="logo small">✚</div><div><h2>${esc(m.title)}</h2><div class="muted small">${esc(p.title)} · шпаргалка первостольника</div></div></div>
        ${m.sections.map((s) => `<section class="memo-sec ${s.tone || ''}"><h3>${s.icon || ''} ${esc(s.title)}</h3><ul>${s.items.map((it) => `<li>${esc(it)}</li>`).join('')}</ul></section>`).join('')}
      </article>
      <div class="btn-row no-print">
        <button class="btn ghost" data-act="png">🖼 Сохранить картинкой</button>
        <button class="btn primary" data-act="print">📄 Сохранить в PDF</button>
      </div>
      <p class="muted small center no-print">PDF: в окне печати выберите «Сохранить как PDF».</p>
    </main></div>`;
  S.actions.png = async (el) => {
    el.disabled = true;
    try {
      await loadScript(HTML2CANVAS_SRC, 'html2canvas');
      const canvas = await window.html2canvas(document.getElementById('memo'), { scale: 2, backgroundColor: '#ffffff' });
      canvas.toBlob((b) => downloadBlob(b, `pamyatka_${p.id}.png`));
    } catch (e) {
      alert('Не удалось сохранить картинку: ' + e.message);
    } finally { el.disabled = false; }
  };
}

// ---------- Сертификат ----------

function viewCert(r) {
  const p = S.product;
  const user = store.getUser();
  const st = productStats(p);
  const ready = st.done === st.total;
  const sample = r.query.get('sample') === '1';
  if (!ready && !sample) {
    app.innerHTML = `<div class="screen">${header('Сертификат')}
      <main class="content center">
        <div class="lock">🔒</div>
        <h2>Сертификат пока закрыт</h2>
        <p class="muted">Пройдите все диалоги по препарату «${esc(p.title)}». Пройдено ${st.done} из ${st.total}.</p>
        <div class="progress"><i style="width:${pct(st.done, st.total)}%"></i></div>
        <div class="btn-row"><a class="btn primary" href="#/dialogs">К диалогам</a><a class="btn ghost" href="#/cert?sample=1">Посмотреть образец</a></div>
      </main></div>`;
    return;
  }
  const num = `${p.id.slice(0, 3).toUpperCase()}-${String(Math.abs([...user.id].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7)) % 100000).padStart(5, '0')}`;
  app.innerHTML = `<div class="screen">${header('Сертификат')}
    <main class="content">
      <div class="cert printable ${ready ? '' : 'sample'}">
        <div class="cert-inner">
          <div class="logo">✚</div>
          <div class="cert-title">СЕРТИФИКАТ</div>
          <div class="muted">подтверждает, что</div>
          <div class="cert-name">${esc(user.name)}</div>
          <div>успешно прошёл(а) обучающий тренажёр диалогов<br>по препарату <b>«${esc(p.title)}»</b></div>
          <div class="cert-stats"><div><b>${st.done}</b> диалогов</div><div><b>${st.score}</b> из ${st.max} баллов</div><div><b>${st.pct}%</b> верных ответов</div></div>
          <div class="cert-foot"><span>№ ${num}</span><span>${fmtDate(Date.now())}</span></div>
          ${ready ? '' : '<div class="watermark">ОБРАЗЕЦ</div>'}
        </div>
      </div>
      <div class="btn-row no-print"><button class="btn primary" data-act="print">📄 Скачать PDF</button></div>
      <p class="muted small center no-print">В окне печати выберите «Сохранить как PDF», ориентация — альбомная.</p>
    </main></div>`;
}

// ---------- Тестовый стенд: проверка контента ----------

function viewCheck() {
  const p = S.product;
  const res = validateProduct(p);
  const errCount = res.errors.length + res.dialogs.reduce((s, d) => s + d.errors.length, 0);
  const warnCount = res.dialogs.reduce((s, d) => s + d.warnings.length, 0);
  const up = S.uploaded ? { dialog: S.uploaded, ...validateDialog(S.uploaded, p) } : null;
  if (up && S.uploaded._parseError) up.errors.unshift('Ошибка JSON: ' + S.uploaded._parseError);
  const row = (d, idOverride) => {
    const st = d.errors.length ? 'bad' : d.warnings.length ? 'mid' : 'ok';
    const id = idOverride || d.dialog.id;
    return `<details class="check-row ${st}">
      <summary><span class="dot ${st}"></span><b>${esc(d.dialog.id)}</b> ${esc(d.dialog.title)} <span class="muted small">v${esc(d.dialog.version)} · шагов ${d.stats.steps} · путей ${d.stats.paths} · до ${d.stats.longest} ответов</span></summary>
      ${d.errors.length ? `<ul class="errs">${d.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
      ${d.warnings.length ? `<ul class="warns">${d.warnings.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
      ${!d.errors.length && !d.warnings.length ? '<p class="small muted">Структура в порядке: нет тупиков, битых переходов и пустых полей.</p>' : ''}
      <div class="btn-row"><a class="btn ghost small" href="#/preview/${id}">Схема диалога</a>${d.errors.length ? '' : `<a class="btn primary small" href="#/chat/${id}?test=1">Пройти на стенде</a>`}</div>
    </details>`;
  };
  app.innerHTML = `<div class="screen">
    ${header('Проверка контента', store.getUser() ? '#/menu' : '#/login')}
    <main class="content">
      <section class="card">
        <h3>${esc(p.title)} — автопроверка структуры</h3>
        <div class="stats small-stats">
          <div><b>${p.dialogList.length}</b><span>диалогов</span></div>
          <div><b>${p.avatars.length}</b><span>аватаров</span></div>
          <div><b class="${errCount ? 'bad-t' : 'ok-t'}">${errCount}</b><span>ошибок</span></div>
          <div><b class="${warnCount ? 'mid-t' : 'ok-t'}">${warnCount}</b><span>предупреждений</span></div>
        </div>
        ${res.errors.length ? `<ul class="errs">${res.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
        <p class="small muted">Контент лежит в <code>${esc(p.base)}</code>. Формат описан в <a href="content/schema.md" target="_blank">content/schema.md</a>. Опубликованный диалог при изменении получает новую версию (поле <code>version</code>) — старая статистика не ломается.</p>
      </section>

      <section class="card">
        <h3>Проверить новый диалог до выкладки</h3>
        <p class="small muted">Загрузите JSON-файл диалога по шаблону — он будет проверен и доступен для прохождения на стенде без изменения кода.</p>
        <input type="file" accept=".json,application/json" id="upload">
        ${up ? row(up, 'uploaded') : ''}
      </section>

      <h3>Диалоги</h3>
      ${res.dialogs.map((d) => row(d)).join('')}
    </main></div>`;
  document.getElementById('upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      S.uploaded = JSON.parse(await file.text());
    } catch (err) {
      S.uploaded = { id: file.name, title: 'Файл не является корректным JSON', version: '?', steps: {}, finals: {}, _parseError: err.message };
    }
    router();
  });
}

function viewPreview(r) {
  const p = S.product;
  const d = r.args[0] === 'uploaded' ? S.uploaded : p.dialogList.find((x) => x.id === r.args[0]);
  if (!d) { location.hash = '#/check'; return; }
  const a = avatarOf(p, d);
  const order = [];
  const q = [d.start];
  while (q.length) {
    const id = q.shift();
    if (order.includes(id) || !d.steps?.[id]) continue;
    order.push(id);
    d.steps[id].options.forEach((o) => q.push(o.next));
  }
  Object.keys(d.steps || {}).forEach((id) => { if (!order.includes(id)) order.push(id); });
  const target = (id) => (d.finals?.[id] ? `<span class="chip ${OUTCOMES[d.finals[id].outcome]?.cls || ''}">финал: ${esc(d.finals[id].title)}</span>` : d.steps?.[id] ? `<a href="#step-${esc(id)}" class="chip">→ ${esc(id)}</a>` : `<span class="chip bad">битый: ${esc(id)}</span>`);
  app.innerHTML = `<div class="screen">
    ${header('Схема: ' + (d.title || d.id), '#/check')}
    <main class="content">
      <div class="card preview-head"><div class="ava">${avatarPic(p, a)}</div><div><b>${esc(a.name)}</b> · ${esc(d.id)} · v${esc(d.version)}<div class="muted small">${esc(a.situation || '')}</div></div></div>
      ${order.map((id) => {
        const s = d.steps[id];
        return `<section class="card step-card" id="step-${esc(id)}">
          <div class="step-id">${esc(id)}${id === d.start ? ' · старт' : ''}</div>
          <div class="step-text">«${esc(s.text)}»</div>
          ${(s.options || []).map((o) => `<div class="opt ${o.correct ? 'ok' : o.score > 0 ? 'mid' : 'bad'}">
            <div><b>${esc(o.id)}.</b> ${esc(o.text)}</div>
            <div class="opt-meta"><span>${o.score} б.</span><span>${esc(compName(p, o.competency))}</span>${target(o.next)}</div>
            <div class="muted small">${esc(o.feedback)}</div></div>`).join('')}
        </section>`;
      }).join('')}
      <section class="card"><h3>Финалы</h3>${Object.entries(d.finals || {}).map(([id, f]) => `<p><span class="chip ${OUTCOMES[f.outcome]?.cls || ''}">${esc(id)} · ${esc(OUTCOMES[f.outcome]?.label || f.outcome)}</span> <b>${esc(f.title)}</b> — ${esc(f.text)}</p>`).join('')}</section>
      <div class="btn-row"><a class="btn primary" href="#/chat/${r.args[0]}?test=1">Пройти на стенде</a></div>
    </main></div>`;
}

// ---------- Старт ----------

async function boot() {
  if (window.self !== window.top) document.body.classList.add('embedded');
  // Имитация входа из портала: ?uid=...&fio=...&network=...&region=...&position=...
  const qp = new URLSearchParams(location.search);
  if (qp.get('uid')) {
    store.setUser({
      id: qp.get('uid'), name: qp.get('fio') || qp.get('uid'), network: qp.get('network') || '',
      region: qp.get('region') || '', position: qp.get('position') || '', source: 'portal',
    });
  }
  try {
    S.products = await loadContent();
  } catch (e) {
    app.innerHTML = `<div class="screen"><main class="content"><h2>Не удалось загрузить контент</h2><p>${esc(e.message)}</p><p class="muted">Запустите макет через <code>node server.js</code> и откройте http://localhost:3000</p></main></div>`;
    return;
  }
  window.addEventListener('hashchange', router);
  router();
}

boot();
