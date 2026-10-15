'use strict';
(function () {
  const app = document.getElementById('app');
  const top = document.getElementById('top');
  const toasts = document.getElementById('toasts');
  let config = { orgName: '', title: 'Jornada da Escuta' };
  let state = null;

  /* ---------- utilidades ---------- */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  async function api(path, method, body) {
    const res = await fetch(path, {
      method: method || 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    let data = {};
    try {
      data = await res.json();
    } catch (_) {}
    if (!res.ok) {
      const err = new Error(data.error || 'Erro inesperado.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function toast(msg, ms) {
    const t = h('div', { class: 'toast', role: 'status' }, msg);
    toasts.append(t);
    setTimeout(() => t.remove(), ms || 4500);
  }

  function mount(...nodes) {
    app.replaceChildren(...nodes.flat().filter(Boolean));
    window.scrollTo(0, 0);
    app.focus({ preventScroll: true });
  }

  const verdict = (score) => (score >= 8 ? 'good' : score >= 4 ? 'mid' : 'bad');
  const verdictText = { good: '✅ Muito bem!', mid: '⚠️ Quase lá', bad: '❌ Vale rever' };

  /* ---------- barra superior ---------- */
  function renderTop() {
    if (!state) {
      top.hidden = true;
      return;
    }
    top.hidden = false;
    top.replaceChildren(
      h('button', { class: 'brand', onclick: showHome }, '👂 Jornada da Escuta'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'chip', title: 'Pontos de experiência' }, `⭐ ${state.xp} XP`),
      h('span', { class: 'chip' }, `${state.level.emoji} ${state.level.name}`),
      h('button', { class: 'btn ghost small', onclick: logout }, 'Sair')
    );
  }

  async function logout() {
    try {
      await api('api/logout', 'POST', {});
    } catch (_) {}
    state = null;
    renderTop();
    showJoin();
  }

  /* ---------- entrada ---------- */
  function showJoin(message) {
    const codeIn = h('input', { id: 'code', class: 'code-input', placeholder: 'ESC-XXXX-XXXX', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '20', required: true });
    const nickIn = h('input', { id: 'nick', placeholder: 'Seu nome ou apelido', autocomplete: 'nickname', maxlength: '30', required: true });
    const err = h('div', { class: 'error', hidden: !message, role: 'alert' }, message || '');
    const btn = h('button', { class: 'btn block', type: 'submit' }, 'Entrar na jornada');
    const form = h(
      'form',
      {
        class: 'card',
        onsubmit: async (e) => {
          e.preventDefault();
          err.hidden = true;
          btn.disabled = true;
          try {
            await api('api/join', 'POST', { code: codeIn.value, nickname: nickIn.value });
            await showHome();
          } catch (ex) {
            err.textContent = ex.message;
            err.hidden = false;
          } finally {
            btn.disabled = false;
          }
        },
      },
      h('label', { for: 'code' }, 'Código de acesso'),
      codeIn,
      h('p', { class: 'muted small' }, 'O código é fornecido por quem organiza a capacitação.'),
      h('label', { for: 'nick' }, 'Nome ou apelido'),
      nickIn,
      h('p', { class: 'muted small' }, 'Use sempre o mesmo nome para continuar de onde parou. Não escreva dados de casos reais.'),
      err,
      btn
    );
    mount(
      h('div', { class: 'hero' }, h('div', { class: 'logo' }, '👂'), h('h1', {}, config.title), h('p', { class: 'muted' }, 'Capacitação gamificada em escuta especializada e revelação espontânea' + (config.orgName ? ` · ${config.orgName}` : ''))),
      form,
      h('div', { class: 'notice small' }, 'Aviso de conteúdo: os casos são fictícios e não descrevem detalhes da violência, mas o tema pode ser sensível. Faça pausas quando precisar e procure apoio da sua equipe se algo mexer com você.')
    );
    codeIn.focus();
  }

  /* ---------- início ---------- */
  async function loadState() {
    state = await api('api/state');
    renderTop();
    return state;
  }

  async function showHome() {
    try {
      await loadState();
    } catch (e) {
      state = null;
      renderTop();
      return showJoin(e.status === 401 ? '' : e.message);
    }
    const lv = state.level;
    const levelBox = h(
      'section',
      { class: 'card levelbox' },
      h('div', { class: 'big', 'aria-hidden': 'true' }, lv.emoji),
      h(
        'div',
        { class: 'grow' },
        h('h2', {}, `Nível ${lv.index}: ${lv.name}`),
        h('progress', { max: lv.nextMin ? lv.nextMin - lv.min : 1, value: lv.nextMin ? state.xp - lv.min : 1, 'aria-label': 'Progresso até o próximo nível' }),
        h('div', { class: 'muted small' }, lv.nextMin ? `${lv.nextMin - state.xp} XP para "${lv.nextName}"` : 'Nível máximo alcançado!')
      )
    );

    const phaseCards = state.phases.map((p) => {
      const cls = 'card phase' + (p.locked ? ' locked' : '') + (p.complete ? ' done' : '');
      const need = p.locked ? 'Conclua as 4 primeiras fases para liberar' : p.complete ? `Concluída · ${p.xp}/${p.maxXp} XP` : `${p.done}/${p.total} questões`;
      return h(
        'button',
        { class: cls, disabled: p.locked, onclick: () => showPhase(p.id) },
        h('div', { class: 'emoji', 'aria-hidden': 'true' }, p.locked ? '🔒' : p.emoji),
        h('div', {}, h('h3', {}, p.title), h('div', { class: 'muted small' }, p.summary), h('progress', { max: p.total, value: p.done, 'aria-label': `Progresso em ${p.title}` }), h('div', { class: 'meta' }, h('span', {}, need), h('span', {}, p.complete ? '✅' : p.done ? 'Continuar ▶' : p.locked ? '' : 'Começar ▶')))
      );
    });

    const badges = h('div', { class: 'badges' }, state.badges.map((b) => h('div', { class: 'badge' + (b.earned ? '' : ' off'), title: b.desc }, h('span', { 'aria-hidden': 'true' }, b.emoji), h('span', {}, b.name))));

    mount(
      h('h1', {}, `Olá, ${state.nickname}!`),
      h('p', { class: 'muted' }, `Grupo: ${state.group}`),
      levelBox,
      state.complete ? h('div', { class: 'card center' }, h('h2', {}, '🏆 Jornada concluída!'), h('p', {}, 'Você completou todas as fases.'), h('button', { class: 'btn', onclick: showCertificate }, 'Ver certificado')) : null,
      h('h2', {}, 'Fases'),
      phaseCards,
      h('h2', {}, 'Insígnias'),
      h('div', { class: 'card' }, badges),
      h('div', { class: 'center' }, h('button', { class: 'btn ghost', onclick: showRanking }, '🏅 Ver ranking do grupo'))
    );
  }

  /* ---------- fase ---------- */
  async function showPhase(id) {
    let phase;
    try {
      phase = await api('api/phase/' + id);
    } catch (e) {
      if (e.status === 401) return logout();
      toast(e.message);
      return showHome();
    }
    const items = phase.items;
    let idx = items.findIndex((i) => !i.answered);
    const fresh = idx === 0; // ainda não respondeu nada
    const answers = items.map((i) => i.answered || null);
    const alreadyDone = idx === -1;
    if (alreadyDone) idx = items.length;

    if (fresh) {
      mount(
        h('h1', {}, `${phase.emoji} ${phase.title}`),
        h('div', { class: 'card' }, h('p', {}, phase.intro), h('p', { class: 'muted small' }, `${items.length} questões · até ${items.length * 10} XP`)),
        h('button', { class: 'btn block', onclick: () => step() }, 'Começar'),
        h('p', { class: 'center' }, h('button', { class: 'btn ghost small', onclick: showHome }, 'Voltar'))
      );
    } else {
      step();
    }

    function bondFor(item) {
      if (!item.sceneId) return null;
      const sceneItems = items.filter((i) => i.sceneId === item.sceneId);
      const scores = sceneItems.map((i) => answers[items.indexOf(i)]).filter(Boolean).map((a) => a.score);
      const pct = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) : 50;
      return h('div', { class: 'bond' }, `Vínculo de confiança: ${pct}%`, h('progress', { max: 100, value: pct, 'aria-label': 'Vínculo de confiança' }));
    }

    function header() {
      return h('div', {}, h('div', { class: 'progressline' }, h('button', { class: 'btn ghost small', onclick: showHome }, '← Fases'), h('span', {}, `${Math.min(idx + 1, items.length)}/${items.length}`), h('progress', { max: items.length, value: idx, 'aria-label': 'Progresso na fase' })));
    }

    function step() {
      if (idx >= items.length) return summary();
      const item = items[idx];
      // Introdução da cena (apenas quando muda de cena e é a 1ª questão da cena)
      if (item.sceneIntro && !item._introSeen) {
        item._introSeen = true;
        return mount(
          header(),
          h('div', { class: 'card scene' }, h('h2', {}, item.sceneTitle), h('p', {}, item.sceneIntro)),
          h('button', { class: 'btn block', onclick: step }, 'Entrar na cena')
        );
      }
      renderItem(item);
    }

    function renderItem(item) {
      const feedbackBox = h('div', { 'aria-live': 'polite' });
      const nextBtn = h('button', { class: 'btn block', hidden: true, onclick: () => { idx++; step(); } }, idx === items.length - 1 ? 'Ver resultado da fase' : 'Continuar');
      const parts = [header(), bondFor(item)];
      if (item.narration) parts.push(h('p', { class: 'narration' }, item.narration));
      if (item.says) parts.push(h('div', { class: 'bubble' }, h('div', { class: 'who' }, item.speaker || ''), item.says));
      if (item.quote) parts.push(h('div', { class: 'bubble quote' }, item.quote));
      parts.push(h('h2', {}, item.prompt));

      async function submit(payload, onDone) {
        try {
          const r = await api('api/answer', 'POST', Object.assign({ itemId: item.id }, payload));
          answers[idx] = r.result;
          state = r.state;
          renderTop();
          onDone(r);
          const v = verdict(r.result.score);
          feedbackBox.replaceChildren(
            h('div', { class: 'feedback ' + v }, h('strong', {}, verdictText[v]), ' ', r.xpGained ? h('span', { class: 'xp' }, `+${r.xpGained} XP`) : null, h('p', {}, r.result.type === 'choice' && r.result.chosenId !== r.result.bestId ? [r.result.feedback, h('br'), h('br'), h('strong', {}, 'Melhor resposta: '), r.result.bestFeedback] : r.result.feedback))
          );
          for (const b of r.newBadges || []) toast(`${b.emoji} Nova insígnia: ${b.name}`);
          nextBtn.hidden = false;
          nextBtn.focus();
        } catch (e) {
          if (e.status === 401) return logout();
          toast(e.message);
        }
      }

      if (item.type === 'choice') {
        const cat = item.options.length === 4 && item.quote;
        const buttons = item.options.map((o) =>
          h('button', {
            class: 'opt' + (cat ? ' cat' : ''),
            type: 'button',
            'data-id': o.id,
            onclick: () => {
              buttons.forEach((b) => (b.disabled = true));
              submit({ optionId: o.id }, (r) => {
                const res = r.result;
                const byId = Object.fromEntries(res.options.map((x) => [x.id, x]));
                buttons.forEach((b) => {
                  const id = b.getAttribute('data-id');
                  if (id === res.bestId) b.classList.add('best');
                  else if (id === res.chosenId) b.classList.add(verdict(byId[id].score) === 'mid' ? 'chosen-mid' : 'chosen-bad');
                });
              });
            },
          }, o.text)
        );
        parts.push(h('div', { class: 'opts' + (cat ? ' cats' : '') }, buttons));
      } else {
        const chosen = [];
        const pool = h('ul', { class: 'order-list' });
        const mine = h('ol', { class: 'order-list mine', 'aria-label': 'Sua ordem' });
        const confirm = h('button', { class: 'btn', disabled: true, onclick: send }, 'Confirmar ordem');
        const clear = h('button', { class: 'btn ghost', onclick: () => { chosen.length = 0; paint(); } }, 'Limpar');
        function paint() {
          pool.replaceChildren(...item.steps.map((s) => h('li', {}, h('button', { class: 'opt', type: 'button', disabled: chosen.includes(s.id), onclick: () => { chosen.push(s.id); paint(); } }, s.text))));
          mine.replaceChildren(...chosen.map((id, i) => h('li', {}, h('span', { class: 'pos' }, `${i + 1}.`), item.steps.find((s) => s.id === id).text)));
          confirm.disabled = chosen.length !== item.steps.length;
        }
        function send() {
          confirm.disabled = true;
          clear.disabled = true;
          [...pool.querySelectorAll('button')].forEach((b) => (b.disabled = true));
          submit({ order: chosen }, (r) => {
            const res = r.result;
            const correct = res.correct;
            const text = Object.fromEntries(correct.map((s) => [s.id, s.text]));
            // Sua ordem: verde onde acertou a posição, vermelho onde errou
            mine.className = 'order-list result';
            mine.replaceChildren(...res.mine.map((id, i) => h('li', { class: correct[i].id === id ? 'ok' : 'no' }, h('span', { class: 'pos' }, `${i + 1}.`), text[id])));
            // Ordem correta
            pool.className = 'order-list result';
            pool.replaceChildren(...correct.map((s, i) => h('li', { class: 'ok' }, h('span', { class: 'pos' }, `${i + 1}.`), s.text)));
            pool.before(h('h3', {}, 'Ordem correta'));
            confirm.hidden = true;
            clear.hidden = true;
          });
        }
        parts.push(h('p', { class: 'muted small' }, 'Toque nos itens na ordem em que devem acontecer.'), h('h3', {}, 'Sua ordem'), mine, pool, h('div', { class: 'actions' }, confirm, clear));
        paint();
      }
      parts.push(feedbackBox, nextBtn);
      mount(...parts);
    }

    function summary() {
      const total = answers.reduce((s, a) => s + (a ? a.score : 0), 0);
      const max = items.length * 10;
      const pct = Math.round((100 * total) / max);
      const stars = pct >= 90 ? '⭐⭐⭐' : pct >= 70 ? '⭐⭐' : '⭐';
      mount(
        h('h1', {}, `${phase.emoji} ${phase.title}: concluída!`),
        h('div', { class: 'card center' }, h('div', { class: 'xl' }, stars), h('h2', {}, `${total} / ${max} XP (${pct}%)`), h('p', { class: 'muted' }, pct >= 90 ? 'Excelente domínio do tema!' : pct >= 70 ? 'Bom trabalho! Releia os feedbacks para consolidar.' : 'Você pode revisar os conceitos e conversar com sua equipe sobre os pontos difíceis.')),
        h('div', { class: 'card' }, h('h3', {}, 'Suas respostas'), h('div', { class: 'tablewrap' }, h('table', {}, h('tbody', {}, items.map((it, i) => h('tr', {}, h('td', {}, `${i + 1}`), h('td', {}, (it.quote || it.prompt).slice(0, 90) + ((it.quote || it.prompt).length > 90 ? '…' : '')), h('td', {}, answers[i] ? `${answers[i].score}/10` : '—'))))))),
        h('button', { class: 'btn block', onclick: showHome }, 'Voltar às fases')
      );
    }
  }

  /* ---------- ranking ---------- */
  async function showRanking() {
    try {
      const r = await api('api/ranking');
      mount(
        h('h1', {}, '🏅 Ranking'),
        h('p', { class: 'muted' }, `${r.group} · ${r.total} participante(s)${r.myRank ? ` · você está em ${r.myRank}º` : ''}`),
        h('div', { class: 'card tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Participante'), h('th', {}, 'Nível'), h('th', {}, 'XP'))), h('tbody', {}, r.top.map((p) => h('tr', { class: p.me ? 'me' : '' }, h('td', {}, p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : p.rank), h('td', {}, p.nickname + (p.me ? ' (você)' : '')), h('td', {}, p.level), h('td', {}, p.xp)))))),
        h('button', { class: 'btn ghost', onclick: showHome }, '← Voltar')
      );
    } catch (e) {
      if (e.status === 401) return logout();
      toast(e.message);
    }
  }

  /* ---------- certificado ---------- */
  function showCertificate() {
    const date = new Date(state.completedAt || Date.now()).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    mount(
      h('div', { class: 'cert' }, h('div', { class: 'xxl' }, '🏆'), h('h1', {}, 'Certificado de conclusão'), config.orgName ? h('p', {}, config.orgName) : null, h('p', {}, 'Certificamos que'), h('div', { class: 'name' }, state.nickname), h('p', {}, 'concluiu a capacitação gamificada'), h('h2', {}, 'Jornada da Escuta: escuta especializada e revelação espontânea'), h('p', {}, `Pontuação: ${state.xp} de ${state.maxXp} XP · Nível: ${state.level.name}`), h('p', { class: 'muted' }, date)),
      h('p', { class: 'center noprint' }, h('button', { class: 'btn', onclick: () => window.print() }, '🖨️ Imprimir / salvar PDF'), ' ', h('button', { class: 'btn ghost', onclick: showHome }, '← Voltar'))
    );
  }

  /* ---------- início ---------- */
  (async function init() {
    try {
      config = Object.assign(config, await api('api/config'));
    } catch (_) {}
    document.title = config.title;
    await showHome();
  })();
})();
