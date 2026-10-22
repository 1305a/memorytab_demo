export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export function header(title, back = '#/menu', right = '') {
  const backHtml = back
    ? `<a class="icon-btn" href="${back}" aria-label="Назад">‹</a>`
    : '<span class="icon-btn"></span>';
  return `<header class="topbar">${backHtml}<h1>${esc(title)}</h1>${right || '<span class="icon-btn"></span>'}</header>`;
}

export function loadScript(src, globalName) {
  if (globalName && window[globalName]) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Не удалось загрузить ' + src));
    document.head.appendChild(s);
  });
}

export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export const fmtDate = (ts) => new Date(ts).toLocaleDateString('ru-RU');
export const fmtDateTime = (ts) => new Date(ts).toLocaleString('ru-RU');
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
