'use strict';
// Teste de integração da versão PHP. Uso: node hostinger/test-php.js
// Requer PHP 8.1+ no PATH. Emula as regras de rewrite do .htaccess com um router.
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');

execFileSync('node', [path.join(__dirname, 'build.js')], { stdio: 'ignore' });
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'escuta-php-'));
const dist = path.join(__dirname, 'dist', 'escuta');
fs.cpSync(dist, work, { recursive: true });
fs.writeFileSync(path.join(work, 'config.php'), "<?php return ['admin_password'=>'senha-teste-123','org_name'=>'Inst Teste','data_dir'=>" + JSON.stringify(path.join(work, 'dados')) + "];");
fs.writeFileSync(path.join(work, 'router.php'), `<?php
$p = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (strpos($p, '/api/') === 0) { $_SERVER['SCRIPT_NAME'] = '/api.php'; require __DIR__ . '/api.php'; return true; }
if ($p === '/admin') { readfile(__DIR__ . '/admin.html'); return true; }
return false;`);
const port = 18000 + Math.floor(Math.random() * 1000);
const srv = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', work, path.join(work, 'router.php')], { stdio: 'ignore' });
const base = `http://127.0.0.1:${port}`;
const { phases } = require('../lib/content');

const client = () => {
  let cookies = {};
  return async (p, method = 'GET', body, headers = {}) => {
    const ck = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(ck ? { Cookie: ck } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    for (const sc of res.headers.getSetCookie()) {
      const [kv, ...attrs] = sc.split(';');
      const [k, v] = kv.split('=');
      if (/expires=Thu, 01 Jan 1970|expires=.*1970/i.test(sc) || v === '') delete cookies[k]; else cookies[k] = v;
      assert.ok(/HttpOnly/i.test(sc) && /SameSite=Strict/i.test(sc), 'cookie flags');
    }
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
  };
};

(async () => {
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/config'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  try {
    const anon = client(), admin = client();
    assert.strictEqual((await anon('/api/config')).body.orgName, 'Inst Teste');
    assert.strictEqual((await anon('/api/state')).status, 401);
    assert.strictEqual((await anon('/api/admin/codes')).status, 401);
    assert.strictEqual((await anon('/api/join', 'POST', { code: 'ESC-AAAA-BBBB', nickname: 'Ana' })).status, 403);
    assert.strictEqual((await admin('/api/admin/login', 'POST', { password: 'errada' })).status, 401);
    assert.strictEqual((await admin('/api/admin/login', 'POST', { password: 'senha-teste-123' })).status, 200);
    const created = await admin('/api/admin/codes', 'POST', { label: 'Turma A', count: 1, maxUsers: 2, validDays: 5 });
    assert.strictEqual(created.status, 201);
    const code = created.body.codes[0];
    assert.match(code.code, /^ESC-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const p1 = client();
    assert.strictEqual((await p1('/api/join', 'POST', { code: code.code, nickname: '<b>' })).status, 400);
    assert.strictEqual((await p1('/api/join', 'POST', { code: code.code.toLowerCase().replace(/-/g, ''), nickname: 'Maria Célia' })).status, 200);
    let st = (await p1('/api/state')).body;
    assert.strictEqual(st.xp, 0); assert.strictEqual(st.group, 'Turma A'); assert.strictEqual(st.nickname, 'Maria Célia');
    assert.strictEqual((await p1('/api/phase/desafio')).status, 403);

    const ph = (await p1('/api/phase/fundamentos')).body;
    assert.ok(!JSON.stringify(ph).includes('"score"'), 'gabarito não pode vazar');
    const first = phases[0].items[0];
    const best = first.options.find((o) => o.score === 10);
    assert.strictEqual((await p1('/api/answer', 'POST', { itemId: first.id, optionId: best.id })).body.xpGained, 10);
    assert.strictEqual((await p1('/api/answer', 'POST', { itemId: first.id, optionId: first.options[1].id })).body.xpGained, 0);
    assert.strictEqual((await p1('/api/state')).body.xp, 10);
    assert.strictEqual((await p1('/api/answer', 'POST', { itemId: phases[0].items[1].id, optionId: 'zzz' })).status, 400);

    let max = 0;
    for (const p of phases) for (const it of p.items) {
      max += 10;
      const payload = it.type === 'choice' ? { optionId: it.options.find((o) => o.score === 10).id } : { order: it.steps.map((s) => s.id) };
      assert.strictEqual((await p1('/api/answer', 'POST', { itemId: it.id, ...payload })).status, 200, it.id);
    }
    st = (await p1('/api/state')).body;
    assert.strictEqual(st.xp, max); assert.ok(st.complete); assert.ok(st.badges.every((b) => b.earned));
    // fase respondida volta com resultado
    const again = (await p1('/api/phase/rede')).body;
    assert.ok(again.items.every((i) => i.answered));

    const p2 = client();
    await p2('/api/join', 'POST', { code: code.code, nickname: 'João' });
    const ord = phases.find((p) => p.id === 'rede').items[0];
    const wrong = await p2('/api/answer', 'POST', { itemId: ord.id, order: ord.steps.map((s) => s.id).reverse() });
    assert.ok(wrong.body.result.score < 10);
    assert.strictEqual((await p2('/api/answer', 'POST', { itemId: ord.id.replace('n-1', 'x'), order: [] })).status, 404);
    assert.strictEqual((await client()('/api/join', 'POST', { code: code.code, nickname: 'Terceiro' })).status, 403);
    const back = client();
    assert.strictEqual((await back('/api/join', 'POST', { code: code.code, nickname: 'maria célia' })).status, 200);
    assert.strictEqual((await back('/api/state')).body.xp, max);

    const rk = (await p1('/api/ranking')).body;
    assert.strictEqual(rk.top[0].nickname, 'Maria Célia'); assert.strictEqual(rk.total, 2); assert.strictEqual(rk.myRank, 1);

    const people = await admin(`/api/admin/codes/${code.id}/participants`);
    assert.strictEqual(people.body.participants.length, 2);
    assert.ok((await admin('/api/admin/stats')).body.items.length > 30);
    const csv = await admin('/api/admin/export.csv');
    assert.match(csv.body, /Maria Célia/);
    assert.strictEqual((await admin('/api/admin/codes')).body.codes[0].participants, 2);

    await admin(`/api/admin/codes/${code.id}`, 'PATCH', { active: false });
    assert.strictEqual((await p1('/api/state')).status, 401);
    assert.strictEqual((await client()('/api/join', 'POST', { code: code.code, nickname: 'Maria' })).status, 403);
    await admin(`/api/admin/codes/${code.id}`, 'PATCH', { active: true });
    assert.strictEqual((await p1('/api/state')).status, 200);
    const pid = people.body.participants.find((p) => p.nickname === 'João').id;
    assert.strictEqual((await admin(`/api/admin/participants/${pid}`, 'DELETE')).status, 200);
    assert.strictEqual((await admin(`/api/admin/codes/${code.id}/participants`)).body.participants.length, 1);
    await admin(`/api/admin/codes/${code.id}`, 'DELETE');
    assert.strictEqual((await p1('/api/state')).status, 401);
    assert.strictEqual((await admin('/api/admin/codes')).body.codes.length, 0);

    // Segurança
    assert.strictEqual((await client()('/api/admin/login', 'POST', { password: 'x' }, { Origin: 'https://evil.example' })).status, 403);
    const raw = await fetch(base + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' });
    assert.strictEqual(raw.status, 415);
    assert.match(raw.headers.get('content-security-policy'), /default-src 'self'/);
    const rl = client(); let last;
    for (let i = 0; i < 9; i++) last = await rl('/api/admin/login', 'POST', { password: 'errada' + i });
    assert.strictEqual(last.status, 429);
    // arquivo de dados tem o guarda PHP
    const dbfile = fs.readFileSync(path.join(work, 'dados', 'db.json.php'), 'utf8');
    assert.ok(dbfile.startsWith('<?php http_response_code(404); exit; ?>'));
    console.log('PHP: todos os testes passaram ✔');
  } finally { srv.kill(); fs.rmSync(work, { recursive: true, force: true }); }
})().catch((e) => { console.error('FALHOU:', e.message, e.stack.split('\n')[1]); process.exit(1); });
