// Простая векторная иллюстрация покупателя по параметрам из карточки аватара (look).
export function avatarSvg(look = {}, mood = 'neutral') {
  const {
    skin = '#f1c7a5', hair = '#4a3426', hairStyle = 'short', shirt = '#5b8def',
    glasses = false, beard = false, wrinkles = false,
  } = look;

  const back = {
    long: `<path d="M33 60 Q30 26 60 26 Q90 26 87 60 L90 104 L30 104Z" fill="${hair}"/>`,
    bun: `<circle cx="60" cy="25" r="10" fill="${hair}"/>`,
  }[hairStyle] || '';

  const front = {
    short: `<path d="M37 56 Q36 31 60 31 Q84 31 83 56 Q79 41 60 41 Q42 41 37 56Z" fill="${hair}"/>`,
    long: `<path d="M37 58 Q37 31 60 31 Q83 31 83 58 Q76 40 60 42 Q46 41 37 58Z" fill="${hair}"/>`,
    bun: `<path d="M37 56 Q37 32 60 32 Q83 32 83 56 Q78 40 60 40 Q42 40 37 56Z" fill="${hair}"/>`,
    curly: [[42, 40], [50, 34], [60, 32], [70, 34], [78, 40], [38, 50], [82, 50]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="${hair}"/>`).join(''),
    bald: `<path d="M37 60 Q37 48 41 44 L41 58Z M83 60 Q83 48 79 44 L79 58Z" fill="${hair}"/>`,
  }[hairStyle] || '';

  const mouth = {
    happy: '<path d="M51 74 Q60 83 69 74" stroke="#7a3b2e" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
    sad: '<path d="M52 80 Q60 73 68 80" stroke="#7a3b2e" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
    neutral: '<path d="M53 77 H67" stroke="#7a3b2e" stroke-width="2.6" stroke-linecap="round"/>',
  }[mood] || '';

  const brows = mood === 'sad'
    ? '<path d="M46 52 L55 50 M65 50 L74 52" stroke="#3b2a20" stroke-width="2.2" stroke-linecap="round"/>'
    : '<path d="M46 50 Q50 47 55 49 M65 49 Q70 47 74 50" stroke="#3b2a20" stroke-width="2.2" fill="none" stroke-linecap="round"/>';

  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    ${back}
    <path d="M22 120 Q22 92 60 90 Q98 92 98 120Z" fill="${shirt}"/>
    <path d="M52 86 H68 V96 Q60 101 52 96Z" fill="${skin}"/>
    <ellipse cx="37" cy="62" rx="4" ry="6" fill="${skin}"/>
    <ellipse cx="83" cy="62" rx="4" ry="6" fill="${skin}"/>
    <ellipse cx="60" cy="61" rx="23" ry="26" fill="${skin}"/>
    ${front}
    ${brows}
    <circle cx="51" cy="59" r="2.6" fill="#2b2b2b"/>
    <circle cx="69" cy="59" r="2.6" fill="#2b2b2b"/>
    ${wrinkles ? '<path d="M43 66 Q45 68 44 70 M77 66 Q75 68 76 70" stroke="#b98a6c" stroke-width="1.4" fill="none"/>' : ''}
    ${beard ? `<path d="M38 66 Q40 90 60 92 Q80 90 82 66 Q78 80 60 82 Q42 80 38 66Z" fill="${hair}" opacity=".9"/>` : ''}
    ${mouth}
    ${glasses ? '<g stroke="#333" stroke-width="2" fill="rgba(255,255,255,.25)"><circle cx="51" cy="59" r="7"/><circle cx="69" cy="59" r="7"/><path d="M58 59 H62"/></g>' : ''}
  </svg>`;
}

// Фармацевт со спины — передний план сцены «у прилавка»
export const pharmacistSvg = `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M10 120 Q12 84 60 80 Q108 84 110 120Z" fill="#ffffff" stroke="#d5e3df" stroke-width="2"/>
  <path d="M56 82 L60 100 L64 82" fill="none" stroke="#0f9d76" stroke-width="3"/>
  <ellipse cx="60" cy="52" rx="24" ry="27" fill="#5a3d2b"/>
  <path d="M36 44 Q38 22 60 22 Q82 22 84 44 Z" fill="#ffffff" stroke="#d5e3df" stroke-width="2"/>
  <rect x="55" y="28" width="10" height="3" fill="#0f9d76"/><rect x="58.5" y="24.5" width="3" height="10" fill="#0f9d76"/>
</svg>`;
