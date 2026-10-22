// Движок диалогов: ничего не знает о конкретном препарате, работает с любым диалогом из данных.

export const OUTCOMES = {
  sale: { label: 'Продажа', cls: 'ok' },
  safe: { label: 'Безопасная консультация', cls: 'ok' },
  doubt: { label: 'Покупатель сомневается', cls: 'mid' },
  leave: { label: 'Покупатель ушёл', cls: 'bad' },
  risk: { label: 'Опасная рекомендация', cls: 'bad' },
};

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const stepMax = (step) => Math.max(...step.options.map((o) => o.score));

// Компетенция, которую проверяет шаг, — метка верного варианта. Ответ засчитывается в неё,
// а метка выбранного варианта (optionCompetency) показывает, в чём именно ошибка.
export const stepCompetency = (step) => (step.options.find((o) => o.correct) || step.options[0]).competency;
export const isFinal = (dialog, id) => Boolean(dialog.finals?.[id]);

// answers: [{ stepId, optionId, score, max, correct, competency }]
export function summarize(answers) {
  let score = 0, max = 0, correct = 0;
  const comps = {};
  for (const a of answers) {
    score += a.score;
    max += a.max;
    if (a.correct) correct++;
    const c = (comps[a.competency] ||= { correct: 0, total: 0 });
    c.total++;
    if (a.correct) c.correct++;
  }
  return { score, max, correct, total: answers.length, comps };
}

export function newAttempt(dialog, attempt) {
  return {
    attempt,
    version: dialog.version,
    stepId: dialog.start,
    answers: [],
    log: [],
    startedAt: Date.now(),
  };
}
