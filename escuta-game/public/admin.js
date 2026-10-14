'use strict';
(function () {
  const app = document.getElementById('app');
  const toasts = document.getElementById('toasts');
  let selected = null; // id do código em exibição
  let tab = 'codes';
  let lastCreated = [];

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

  function toast(msg) {
    const t = h('div', { class: 'toast', role: 'status' }, msg);
    toasts.append(t);
    setTimeout(() => t.remove(), 4000);
  }

  const fmtDate = (t) => (t ? new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copiado!');
    } catch (_) {
      toast('Não foi possível copiar automaticamente. Selecione e copie manualmente.');
    }
  }

  /* ---------- login ---------- */
  function showLogin(msg) {
    const pw = h('input', { type: 'password', id: 'pw', autocomplete: 'current-password', required: true });
    const err = h('div', { class: 'error', hidden: !msg, role: 'alert' }, msg || '');
    app.replaceChildren(
      h('div', { class: 'hero' }, h('div', { class: 'logo' }, '🔑'), h('h1', {}, 'Administração')),
      h(
        'form',
        {
          class: 'card',
          style: null,
          onsubmit: async (e) => {
            e.preventDefault();
            try {
              await api('/api/admin/login', 'POST', { password: pw.value });
              showPanel();
            } catch (ex) {
              err.textContent = ex.message;
              err.hidden = false;
            }
          },
        },
        h('label', { for: 'pw' }, 'Senha do administrador'),
        pw,
        err,
        h('p', {}),
        h('button', { class: 'btn block', type: 'submit' }, 'Entrar')
      )
    );
    pw.focus();
  }

  /* ---------- painel ---------- */
  async function showPanel() {
    let codes;
    try {
      codes = (await api('/api/admin/codes')).codes;
    } catch (e) {
      return showLogin(e.status === 401 ? '' : e.message);
    }
    const tabBtn = (id, label) => h('button', { class: 'btn ghost small', role: 'tab', 'aria-selected': String(tab === id), onclick: () => { tab = id; showPanel(); } }, label);
    const body = h('div', {});
    app.replaceChildren(
      h('div', { class: 'actions' }, h('h1', {}, '🔑 Administração · Jornada da Escuta'), h('span', { class: 'spacer' }), h('button', { class: 'btn ghost small', onclick: async () => { await api('/api/admin/logout', 'POST', {}); showLogin(); } }, 'Sair')),
      h('div', { class: 'tabs', role: 'tablist' }, tabBtn('codes', 'Códigos de acesso'), tabBtn('people', 'Participantes'), tabBtn('stats', 'Análise por questão')),
      body
    );
    if (tab === 'codes') renderCodes(body, codes);
    else if (tab === 'people') await renderPeople(body, codes);
    else await renderStats(body, codes);
  }

  function renderCodes(body, codes) {
    const label = h('input', { id: 'label', placeholder: 'Ex.: Turma Educação Infantil', maxlength: '80' });
    const count = h('input', { id: 'count', type: 'number', min: '1', max: '200', value: '1' });
    const maxUsers = h('input', { id: 'max', type: 'number', min: '0', value: '0' });
    const days = h('input', { id: 'days', type: 'number', min: '0', value: '0' });
    const form = h(
      'form',
      {
        class: 'card',
        onsubmit: async (e) => {
          e.preventDefault();
          try {
            const r = await api('/api/admin/codes', 'POST', { label: label.value, count: count.value, maxUsers: maxUsers.value, validDays: days.value });
            lastCreated = r.codes;
            showPanel();
          } catch (ex) {
            toast(ex.message);
          }
        },
      },
      h('h2', {}, 'Gerar novos códigos'),
      h('div', { class: 'grid2' }, h('div', {}, h('label', { for: 'label' }, 'Nome da turma/grupo'), label), h('div', {}, h('label', { for: 'count' }, 'Quantidade de códigos'), count), h('div', {}, h('label', { for: 'max' }, 'Máx. participantes (0 = sem limite)'), maxUsers), h('div', {}, h('label', { for: 'days' }, 'Validade em dias (0 = sem prazo)'), days)),
      h('p', { class: 'muted small' }, 'Cada código forma um grupo com ranking próprio. Gere um código por turma, ou vários códigos de uso individual (máx. participantes = 1).'),
      h('button', { class: 'btn', type: 'submit' }, 'Gerar')
    );
    body.append(form);

    if (lastCreated.length) {
      const text = lastCreated.map((c) => `${c.label}: ${c.code}`).join('\n');
      body.append(h('div', { class: 'newcodes' }, h('strong', {}, `✅ ${lastCreated.length} código(s) gerado(s). Copie e distribua:`), h('pre', {}, text), h('div', { class: 'actions' }, h('button', { class: 'btn small', onclick: () => copy(text) }, 'Copiar tudo'), h('button', { class: 'btn ghost small', onclick: () => { lastCreated = []; showPanel(); } }, 'Dispensar')), h('p', { class: 'small muted' }, `Endereço do jogo: ${location.origin}/`)));
    }

    const rows = codes.map((c) =>
      h(
        'tr',
        {},
        h('td', { class: 'codecell' }, c.code),
        h('td', {}, c.label),
        h('td', {}, h('span', { class: 'pill ' + (c.active && !c.expired ? 'on' : 'off') }, c.expired ? 'Expirado' : c.active ? 'Ativo' : 'Revogado')),
        h('td', {}, `${c.participants}${c.maxUsers ? ' / ' + c.maxUsers : ''}`),
        h('td', {}, c.completed),
        h('td', {}, c.expiresAt ? fmtDate(c.expiresAt) : 'Sem prazo'),
        h(
          'td',
          {},
          h(
            'div',
            { class: 'actions' },
            h('button', { class: 'btn small ghost', onclick: () => copy(c.code) }, 'Copiar'),
            h('button', { class: 'btn small ghost', onclick: () => { selected = c.id; tab = 'people'; showPanel(); } }, 'Ver'),
            h('button', { class: 'btn small ghost', onclick: async () => { await api('/api/admin/codes/' + c.id, 'PATCH', { active: !c.active }); showPanel(); } }, c.active ? 'Revogar' : 'Reativar'),
            h('button', { class: 'btn small danger', onclick: async () => { if (confirm(`Excluir o código ${c.code} e TODOS os dados dos ${c.participants} participante(s)? Esta ação não pode ser desfeita.`)) { await api('/api/admin/codes/' + c.id, 'DELETE'); showPanel(); } } }, 'Excluir')
          )
        )
      )
    );
    body.append(
      h('div', { class: 'card tablewrap' }, h('h2', {}, 'Códigos'), codes.length ? h('table', {}, h('thead', {}, h('tr', {}, ['Código', 'Grupo', 'Situação', 'Participantes', 'Concluíram', 'Validade', 'Ações'].map((t) => h('th', {}, t)))), h('tbody', {}, rows)) : h('p', { class: 'muted' }, 'Nenhum código ainda. Gere o primeiro acima.'))
    );
  }

  function codeSelect(codes, allowAll, onChange) {
    const sel = h('select', { 'aria-label': 'Grupo', onchange: () => { selected = sel.value || null; onChange(); } }, allowAll ? h('option', { value: '' }, 'Todos os grupos') : null, codes.map((c) => h('option', { value: c.id }, `${c.label} (${c.code})`)));
    if (selected && codes.some((c) => c.id === selected)) sel.value = selected;
    else if (!allowAll && codes.length) {
      selected = codes[0].id;
      sel.value = selected;
    } else selected = null;
    return sel;
  }

  async function renderPeople(body, codes) {
    if (!codes.length) return body.append(h('div', { class: 'card muted' }, 'Gere um código para começar.'));
    const sel = codeSelect(codes, false, showPanel);
    const data = await api(`/api/admin/codes/${selected}/participants`);
    body.append(
      h('div', { class: 'card' }, h('div', { class: 'grid2' }, h('div', {}, h('label', {}, 'Grupo'), sel), h('div', { class: 'actions' }, h('a', { class: 'btn ghost small', href: `/api/admin/export.csv?code=${selected}` }, '⬇️ Exportar CSV (grupo)'), h('a', { class: 'btn ghost small', href: '/api/admin/export.csv' }, '⬇️ Exportar CSV (todos)')))),
      h(
        'div',
        { class: 'card tablewrap' },
        h('h2', {}, `${data.code.label}: ${data.participants.length} participante(s)`),
        data.participants.length
          ? h(
              'table',
              {},
              h('thead', {}, h('tr', {}, ['Participante', 'XP', '%', 'Respondidas', 'Nível', 'Último acesso', 'Concluiu', ''].map((t) => h('th', {}, t)))),
              h('tbody', {}, data.participants.map((p) => h('tr', {}, h('td', {}, p.nickname), h('td', {}, `${p.xp}/${p.maxXp}`), h('td', {}, `${p.percent}%`), h('td', {}, `${p.answered}/${p.items}`), h('td', {}, p.level), h('td', {}, fmtDate(p.lastSeen)), h('td', {}, p.completedAt ? '✅' : '—'), h('td', {}, h('button', { class: 'btn small danger', onclick: async () => { if (confirm(`Remover ${p.nickname} e seu progresso?`)) { await api('/api/admin/participants/' + p.id, 'DELETE'); showPanel(); } } }, 'Remover')))))
            )
          : h('p', { class: 'muted' }, 'Ninguém entrou com este código ainda.')
      )
    );
  }

  async function renderStats(body, codes) {
    const sel = codeSelect(codes, true, showPanel);
    const data = await api('/api/admin/stats' + (selected ? '?code=' + selected : ''));
    const rows = data.items.map((it) => h('tr', {}, h('td', {}, it.phase), h('td', {}, it.prompt.length > 80 ? it.prompt.slice(0, 80) + '…' : it.prompt), h('td', {}, it.answers), h('td', {}, it.avgScore == null ? '—' : it.avgScore.toFixed(1)), h('td', {}, it.perfectPercent == null ? '—' : it.perfectPercent + '%')));
    body.append(
      h('div', { class: 'card' }, h('label', {}, 'Grupo'), sel, h('p', { class: 'muted small' }, `${data.participants} participante(s). Questões com menor % de acerto pleno indicam temas para reforçar na capacitação presencial.`)),
      h('div', { class: 'card tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Fase', 'Questão', 'Respostas', 'Média (0-10)', 'Acerto pleno'].map((t) => h('th', {}, t)))), h('tbody', {}, rows)))
    );
  }

  (async function init() {
    try {
      await api('/api/admin/me');
      showPanel();
    } catch (_) {
      showLogin();
    }
  })();
})();
