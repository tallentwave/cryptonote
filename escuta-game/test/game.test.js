'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server');
const game = require('../lib/game');

test('conteúdo: ids únicos, uma melhor resposta de 10 pontos por questão', () => {
  const seen = new Set();
  for (const phase of game.phases) {
    for (const it of phase.items) {
      assert.ok(!seen.has(it.id), 'id duplicado ' + it.id);
      seen.add(it.id);
      if (it.type === 'choice') {
        assert.ok(it.options.length >= 2);
        assert.strictEqual(it.options.filter((o) => o.score === 10).length, 1, it.id);
        assert.ok(it.options.every((o) => o.feedback), it.id);
      } else assert.ok(it.steps.length >= 3 && it.explanation);
    }
  }
  assert.strictEqual(game.MAX_XP, seen.size * 10);
});

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'escuta-'));
  const { server, store } = createApp({ dataDir: dir, adminPassword: 'senha-teste-123' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = () => {
    let cookie = '';
    return async (p, method = 'GET', body) => {
      const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const sc = res.headers.get('set-cookie');
      if (sc) cookie = sc.split(';')[0];
      const type = res.headers.get('content-type') || '';
      return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
    };
  };
  return { server, store, client, base, close: () => new Promise((r) => server.close(r)) };
}

test('fluxo completo: código, jogo, ranking e administração', async () => {
  const app = await boot();
  try {
    const admin = app.client();
    const anon = app.client();

    // Sem código/sessão nada funciona
    assert.strictEqual((await anon('/api/state')).status, 401);
    assert.strictEqual((await anon('/api/admin/codes')).status, 401);
    assert.strictEqual((await anon('/api/join', 'POST', { code: 'ESC-AAAA-BBBB', nickname: 'Ana' })).status, 403);

    // Login do admin
    assert.strictEqual((await admin('/api/admin/login', 'POST', { password: 'errada' })).status, 401);
    assert.strictEqual((await admin('/api/admin/login', 'POST', { password: 'senha-teste-123' })).status, 200);
    const created = await admin('/api/admin/codes', 'POST', { label: 'Turma A', count: 1, maxUsers: 2, validDays: 5 });
    assert.strictEqual(created.status, 201);
    const code = created.body.codes[0];
    assert.match(code.code, /^ESC-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    // Participante entra (aceita código em minúsculas e sem hífen)
    const p1 = app.client();
    const bad = await p1('/api/join', 'POST', { code: code.code, nickname: '<b>' });
    assert.strictEqual(bad.status, 400);
    const join = await p1('/api/join', 'POST', { code: code.code.toLowerCase().replace(/-/g, ''), nickname: 'Maria' });
    assert.strictEqual(join.status, 200);
    let st = (await p1('/api/state')).body;
    assert.strictEqual(st.xp, 0);
    assert.strictEqual(st.group, 'Turma A');

    // Fase final bloqueada
    assert.strictEqual((await p1('/api/phase/desafio')).status, 403);

    // Gabarito não vaza e responder pontua uma única vez
    const phase = (await p1('/api/phase/fundamentos')).body;
    assert.ok(!JSON.stringify(phase).includes('"score"'));
    const first = game.phases[0].items[0];
    const best = first.options.find((o) => o.score === 10);
    const r1 = await p1('/api/answer', 'POST', { itemId: first.id, optionId: best.id });
    assert.strictEqual(r1.body.xpGained, 10);
    const r2 = await p1('/api/answer', 'POST', { itemId: first.id, optionId: first.options[1].id });
    assert.strictEqual(r2.body.xpGained, 0);
    assert.strictEqual((await p1('/api/state')).body.xp, 10);
    assert.strictEqual((await p1('/api/answer', 'POST', { itemId: game.phases[0].items[1].id, optionId: 'zzz' })).status, 400);

    // Responde tudo com a melhor opção e conclui a jornada
    for (const ph of game.phases) {
      for (const it of ph.items) {
        const payload = it.type === 'choice' ? { optionId: it.options.find((o) => o.score === 10).id } : { order: it.steps.map((s) => s.id) };
        const r = await p1('/api/answer', 'POST', { itemId: it.id, ...payload });
        assert.strictEqual(r.status, 200, it.id);
      }
    }
    st = (await p1('/api/state')).body;
    assert.strictEqual(st.xp, game.MAX_XP);
    assert.ok(st.complete);
    assert.ok(st.badges.every((b) => b.earned), 'todas as insígnias');

    // Ordenação errada dá nota parcial
    const p2 = app.client();
    await p2('/api/join', 'POST', { code: code.code, nickname: 'João' });
    const ord = game.phases.find((p) => p.id === 'rede').items[0];
    const wrong = await p2('/api/answer', 'POST', { itemId: ord.id, order: ord.steps.map((s) => s.id).reverse() });
    assert.ok(wrong.body.result.score < 10);

    // Limite de participantes
    const p3 = app.client();
    assert.strictEqual((await p3('/api/join', 'POST', { code: code.code, nickname: 'Terceiro' })).status, 403);
    // Mesmo apelido retoma o progresso
    const again = app.client();
    assert.strictEqual((await again('/api/join', 'POST', { code: code.code, nickname: 'maria' })).status, 200);
    assert.strictEqual((await again('/api/state')).body.xp, game.MAX_XP);

    // Ranking
    const rk = (await p1('/api/ranking')).body;
    assert.strictEqual(rk.top[0].nickname, 'Maria');
    assert.strictEqual(rk.total, 2);

    // Admin: lista, estatísticas e CSV
    const people = await admin(`/api/admin/codes/${code.id}/participants`);
    assert.strictEqual(people.body.participants.length, 2);
    assert.ok((await admin('/api/admin/stats')).body.items.length > 30);
    const csv = await admin('/api/admin/export.csv');
    assert.match(csv.body, /Maria/);

    // Revogar derruba as sessões
    await admin(`/api/admin/codes/${code.id}`, 'PATCH', { active: false });
    assert.strictEqual((await p1('/api/state')).status, 401);
    assert.strictEqual((await app.client()('/api/join', 'POST', { code: code.code, nickname: 'Maria' })).status, 403);

    // Reativar e excluir
    await admin(`/api/admin/codes/${code.id}`, 'PATCH', { active: true });
    assert.strictEqual((await p1('/api/state')).status, 200);
    await admin(`/api/admin/codes/${code.id}`, 'DELETE');
    assert.strictEqual((await p1('/api/state')).status, 401);

    // Persistência
    app.store.flush();
    assert.ok(fs.existsSync(path.join(app.store.dir, 'db.json')));
  } finally {
    await app.close();
  }
});

test('segurança: origem cruzada, content-type, traversal e limite de tentativas', async () => {
  const app = await boot();
  try {
    const raw = (p, init) => fetch(app.base + p, init);
    let r = await raw('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{"password":"x"}' });
    assert.strictEqual(r.status, 403);
    r = await raw('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' });
    assert.strictEqual(r.status, 415);
    r = await raw('/..%2f..%2fserver.js');
    assert.ok([403, 404].includes(r.status));
    r = await raw('/');
    assert.strictEqual(r.status, 200);
    assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
    const c = app.client();
    let last;
    for (let i = 0; i < 9; i++) last = await c('/api/admin/login', 'POST', { password: 'errada' + i });
    assert.strictEqual(last.status, 429);
  } finally {
    await app.close();
  }
});
