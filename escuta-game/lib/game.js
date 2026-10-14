'use strict';
const { phases, itemIndex } = require('./content');

const LEVELS = [
  { min: 0, name: 'Semente', emoji: '🌱' },
  { min: 60, name: 'Ouvido Atento', emoji: '👂' },
  { min: 140, name: 'Ponte de Confiança', emoji: '🌉' },
  { min: 240, name: 'Guardião da Rede', emoji: '🛡️' },
  { min: 340, name: 'Escuta Mestra', emoji: '🌟' },
];

const MAX_XP = [...itemIndex.keys()].length * 10;

const BADGES = {
  'primeiro-passo': { name: 'Primeiro passo', emoji: '👣', desc: 'Respondeu a primeira pergunta.' },
  fundamentos: { name: 'Base sólida', emoji: '📚', desc: 'Concluiu a fase Fundamentos.' },
  'sem-promessas': { name: 'Sem promessas vazias', emoji: '🤐', desc: 'Não prometeu sigilo na revelação do Lucas.' },
  'sem-inducao': { name: 'Pergunta aberta', emoji: '🗝️', desc: 'Acertou 9 ou mais das 11 questões de Perguntas que Protegem.' },
  'sequencia-5': { name: 'Sequência de 5', emoji: '🔥', desc: 'Cinco respostas seguidas com 8+ pontos.' },
  rede: { name: 'Guardião da rede', emoji: '🕸️', desc: 'Concluiu a fase Rede de Proteção.' },
  campeao: { name: 'Jornada completa', emoji: '🏆', desc: 'Concluiu todas as fases.' },
  perfeito: { name: 'Pontuação máxima', emoji: '💎', desc: 'Fez todos os pontos possíveis.' },
};

function levelFor(xp) {
  let idx = 0;
  LEVELS.forEach((l, i) => {
    if (xp >= l.min) idx = i;
  });
  const cur = LEVELS[idx];
  const next = LEVELS[idx + 1] || null;
  return { index: idx + 1, name: cur.name, emoji: cur.emoji, min: cur.min, nextMin: next ? next.min : null, nextName: next ? next.name : null };
}

function phaseProgress(participant, phase) {
  const total = phase.items.length;
  let done = 0;
  let xp = 0;
  for (const it of phase.items) {
    const a = participant.answers[it.id];
    if (a) {
      done++;
      xp += a.score;
    }
  }
  return { id: phase.id, total, done, xp, maxXp: total * 10, complete: done === total };
}

function isUnlocked(participant, phase) {
  if (!phase.requires) return true;
  return phase.requires.every((id) => {
    const p = phases.find((x) => x.id === id);
    return phaseProgress(participant, p).complete;
  });
}

function computeBadges(participant) {
  const earned = new Set();
  const answers = participant.answers;
  const answered = Object.keys(answers).length;
  if (answered > 0) earned.add('primeiro-passo');
  const prog = Object.fromEntries(phases.map((p) => [p.id, phaseProgress(participant, p)]));
  if (prog.fundamentos.complete) earned.add('fundamentos');
  if (answers['r-a1'] && answers['r-a1'].score === 10) earned.add('sem-promessas');
  if (prog.perguntas.complete) {
    const hits = phases.find((p) => p.id === 'perguntas').items.filter((it) => answers[it.id] && answers[it.id].score === 10).length;
    if (hits >= 9) earned.add('sem-inducao');
  }
  if ((participant.maxStreak || 0) >= 5) earned.add('sequencia-5');
  if (prog.rede.complete) earned.add('rede');
  if (phases.every((p) => prog[p.id].complete)) earned.add('campeao');
  if (participant.xp >= MAX_XP) earned.add('perfeito');
  return earned;
}

function badgeList(ids) {
  return Object.entries(BADGES).map(([id, b]) => ({ id, ...b, earned: ids.includes(id) }));
}

function summarize(participant) {
  const progress = phases.map((p) => {
    const pr = phaseProgress(participant, p);
    return {
      id: p.id,
      title: p.title,
      emoji: p.emoji,
      summary: p.summary,
      locked: !isUnlocked(participant, p),
      requires: p.requires || [],
      ...pr,
    };
  });
  const complete = progress.every((p) => p.complete);
  return {
    nickname: participant.nickname,
    xp: participant.xp,
    maxXp: MAX_XP,
    level: levelFor(participant.xp),
    phases: progress,
    badges: badgeList(participant.badges),
    streak: participant.streak || 0,
    complete,
    completedAt: participant.completedAt || null,
  };
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Item sem gabarito, seguro para enviar ao navegador.
function publicItem(item) {
  const out = {
    id: item.id,
    type: item.type,
    prompt: item.prompt,
    quote: item.quote,
    narration: item.narration,
    speaker: item.speaker,
    says: item.says,
    sceneId: item.sceneId,
    sceneTitle: item.sceneTitle,
    sceneIntro: item.sceneIntro,
  };
  if (item.type === 'choice') {
    const opts = item.options.map((o) => ({ id: o.id, text: o.text }));
    out.options = item.keepOrder ? opts : shuffle(opts);
  } else {
    out.steps = shuffle(item.steps.map((s) => ({ id: s.id, text: s.text })));
  }
  return out;
}

// Avalia uma resposta. Retorna null se inválida.
function evaluate(item, payload) {
  if (item.type === 'choice') {
    const chosen = item.options.find((o) => o.id === payload.optionId);
    if (!chosen) return null;
    const best = item.options.reduce((a, b) => (b.score > a.score ? b : a));
    return {
      score: chosen.score,
      answer: chosen.id,
      result: { type: 'choice', score: chosen.score, max: 10, chosenId: chosen.id, bestId: best.id, feedback: chosen.feedback, bestFeedback: best.feedback, options: item.options.map((o) => ({ id: o.id, text: o.text, score: o.score })) },
    };
  }
  const ids = item.steps.map((s) => s.id);
  const seq = payload.order;
  if (!Array.isArray(seq) || seq.length !== ids.length || new Set(seq).size !== ids.length || !seq.every((s) => ids.includes(s))) return null;
  const right = seq.filter((s, i) => s === ids[i]).length;
  const score = right === ids.length ? 10 : Math.round((10 * right) / ids.length);
  return {
    score: right === ids.length ? 10 : Math.min(score, 9),
    answer: seq,
    result: {
      type: 'order',
      score: right === ids.length ? 10 : Math.min(score, 9),
      max: 10,
      mine: seq,
      correct: item.steps.map((s) => ({ id: s.id, text: s.text })),
      feedback: item.explanation,
    },
  };
}

// Reconstrói o resultado de uma resposta já registrada.
function resultFor(item, stored) {
  const payload = item.type === 'choice' ? { optionId: stored.a } : { order: stored.a };
  const ev = evaluate(item, payload);
  return ev ? ev.result : null;
}

module.exports = { LEVELS, MAX_XP, BADGES, levelFor, phaseProgress, isUnlocked, computeBadges, summarize, publicItem, evaluate, resultFor, itemIndex, phases };
