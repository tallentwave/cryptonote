'use strict';
/*
 * Jornada da Escuta: servidor (Node.js >= 18, sem dependências).
 * O acesso dos participantes só é possível com um código gerado pelo
 * administrador. O painel do administrador exige senha.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Store } = require('./lib/store');
const game = require('./lib/game');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I
const PLAYER_COOKIE = 'sid';
const ADMIN_COOKIE = 'asid';
const PLAYER_TTL = 30 * 24 * 3600 * 1000;
const ADMIN_TTL = 8 * 3600 * 1000;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const newId = () => crypto.randomBytes(8).toString('hex');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function generateCode() {
  let s = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return s;
}
const formatCode = (c) => `ESC-${c.slice(0, 4)}-${c.slice(4)}`;
function normalizeCode(input) {
  let c = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length === 11 && c.startsWith('ESC')) c = c.slice(3);
  return c;
}

function cleanNickname(input) {
  const n = String(input || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (n.length < 2 || n.length > 30) return null;
  if (!/^[\p{L}\p{N} ._'-]+$/u.test(n)) return null;
  return n;
}

function cleanLabel(input, fallback) {
  const s = String(input == null ? '' : input).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80);
  return s || fallback;
}

function csvCell(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita injeção de fórmulas no Excel
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

class RateLimiter {
  constructor(max, windowMs) {
    this.max = max;
    this.windowMs = windowMs;
    this.map = new Map();
  }
  blocked(key) {
    const e = this.map.get(key);
    if (!e) return false;
    if (Date.now() > e.reset) {
      this.map.delete(key);
      return false;
    }
    return e.count >= this.max;
  }
  fail(key) {
    const e = this.map.get(key);
    if (!e || Date.now() > e.reset) this.map.set(key, { count: 1, reset: Date.now() + this.windowMs });
    else e.count++;
  }
  clear(key) {
    this.map.delete(key);
  }
}

function createApp(options = {}) {
  const dataDir = options.dataDir || process.env.DATA_DIR || path.join(__dirname, 'data');
  const orgName = options.orgName || process.env.ORG_NAME || '';
  const trustProxy = options.trustProxy != null ? options.trustProxy : process.env.TRUST_PROXY === '1';
  const cookieSecure = options.cookieSecure || process.env.COOKIE_SECURE || 'auto';
  const store = new Store(dataDir);
  const db = store.db;

  // Senha do administrador: variável de ambiente ou arquivo gerado na 1ª execução.
  let adminPassword = options.adminPassword || process.env.ADMIN_PASSWORD;
  let generatedPassword = null;
  if (!adminPassword) {
    const pwFile = path.join(dataDir, 'admin-password.txt');
    if (fs.existsSync(pwFile)) adminPassword = fs.readFileSync(pwFile, 'utf8').trim();
    else {
      adminPassword = crypto.randomBytes(12).toString('base64url');
      fs.writeFileSync(pwFile, adminPassword + '\n', { mode: 0o600 });
      generatedPassword = { password: adminPassword, file: pwFile };
    }
  }

  const adminSessions = new Map(); // hash do token -> expiração
  const joinLimiter = new RateLimiter(10, 15 * 60 * 1000);
  const adminLimiter = new RateLimiter(8, 15 * 60 * 1000);
  const apiLimiter = new RateLimiter(1500, 60 * 1000); // geral, por IP (com proxy, defina TRUST_PROXY=1)

  const clientIp = (req) => {
    if (trustProxy) {
      const xff = req.headers['x-forwarded-for'];
      if (xff) return String(xff).split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
  };

  /* -------------------- helpers HTTP -------------------- */
  function send(res, status, body, headers = {}) {
    const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
    const data = isObj ? JSON.stringify(body) : body;
    res.writeHead(status, Object.assign({ 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, headers));
    res.end(data);
  }
  const fail = (res, status, error) => send(res, status, { error });

  function parseCookies(req) {
    const out = {};
    for (const part of String(req.headers.cookie || '').split(';')) {
      const i = part.indexOf('=');
      if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
  }

  function cookieHeader(req, name, value, maxAgeSec) {
    const secure = cookieSecure === '1' || (cookieSecure === 'auto' && (req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https'));
    return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
  }

  function readJson(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > 32 * 1024) {
          reject(Object.assign(new Error('too large'), { status: 413 }));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        if (!size) return resolve({});
        try {
          const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(v && typeof v === 'object' ? v : {});
        } catch {
          reject(Object.assign(new Error('bad json'), { status: 400 }));
        }
      });
      req.on('error', reject);
    });
  }

  /* -------------------- autenticação -------------------- */
  function codeIsUsable(code) {
    return !!code && code.active && !(code.expiresAt && Date.now() > code.expiresAt);
  }

  function getPlayer(req) {
    const tok = parseCookies(req)[PLAYER_COOKIE];
    if (!tok) return null;
    const key = sha256(tok);
    const sess = db.sessions[key];
    if (!sess) return null;
    if (Date.now() > sess.exp) {
      delete db.sessions[key];
      return null;
    }
    const participant = db.participants[sess.pid];
    const code = participant && db.codes[participant.codeId];
    if (!participant || !codeIsUsable(code)) return null;
    const now = Date.now();
    if (now - (participant.lastSeen || 0) > 60000) {
      participant.lastSeen = now;
      store.save();
    }
    return { participant, code };
  }

  function isAdmin(req) {
    const tok = parseCookies(req)[ADMIN_COOKIE];
    if (!tok) return false;
    const key = sha256(tok);
    const exp = adminSessions.get(key);
    if (!exp) return false;
    if (Date.now() > exp) {
      adminSessions.delete(key);
      return false;
    }
    return true;
  }

  /* -------------------- API do participante -------------------- */
  async function playerApi(req, res, url) {
    const { pathname } = url;
    const method = req.method;

    if (method === 'GET' && pathname === '/api/config') {
      return send(res, 200, { orgName, title: 'Jornada da Escuta' });
    }

    if (method === 'POST' && pathname === '/api/join') {
      const ip = clientIp(req);
      if (joinLimiter.blocked(ip)) return fail(res, 429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
      const body = await readJson(req);
      const nickname = cleanNickname(body.nickname);
      const codeStr = normalizeCode(body.code);
      const code = Object.values(db.codes).find((c) => c.code === codeStr);
      if (!code || !codeIsUsable(code)) {
        joinLimiter.fail(ip);
        return fail(res, 403, 'Código inválido, expirado ou desativado. Confira com quem organiza a capacitação.');
      }
      if (!nickname) return fail(res, 400, 'Informe um nome ou apelido de 2 a 30 caracteres (letras, números, espaço, ponto, hífen).');
      const members = Object.values(db.participants).filter((p) => p.codeId === code.id);
      let participant = members.find((p) => p.nickname.toLocaleLowerCase('pt-BR') === nickname.toLocaleLowerCase('pt-BR'));
      if (!participant) {
        if (code.maxUsers && members.length >= code.maxUsers) {
          joinLimiter.fail(ip);
          return fail(res, 403, 'Este código atingiu o limite de participantes.');
        }
        participant = { id: newId(), codeId: code.id, nickname, createdAt: Date.now(), lastSeen: Date.now(), answers: {}, xp: 0, badges: [], streak: 0, maxStreak: 0 };
        db.participants[participant.id] = participant;
      }
      joinLimiter.clear(ip);
      const token = newToken();
      db.sessions[sha256(token)] = { pid: participant.id, exp: Date.now() + PLAYER_TTL };
      participant.lastSeen = Date.now();
      store.save();
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req, PLAYER_COOKIE, token, PLAYER_TTL / 1000) });
    }

    if (method === 'POST' && pathname === '/api/logout') {
      const tok = parseCookies(req)[PLAYER_COOKIE];
      if (tok) {
        delete db.sessions[sha256(tok)];
        store.save();
      }
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req, PLAYER_COOKIE, '', 0) });
    }

    const auth = getPlayer(req);
    if (!auth) return fail(res, 401, 'Sessão inválida. Entre novamente com o seu código.');
    const { participant, code } = auth;

    if (method === 'GET' && pathname === '/api/state') {
      return send(res, 200, Object.assign(game.summarize(participant), { group: code.label, orgName }));
    }

    let m;
    if (method === 'GET' && (m = pathname.match(/^\/api\/phase\/([a-z-]+)$/))) {
      const phase = game.phases.find((p) => p.id === m[1]);
      if (!phase) return fail(res, 404, 'Fase não encontrada.');
      if (!game.isUnlocked(participant, phase)) return fail(res, 403, 'Conclua as fases anteriores para liberar esta.');
      const items = phase.items.map((it) => {
        const pub = game.publicItem(it);
        const stored = participant.answers[it.id];
        if (stored) pub.answered = game.resultFor(it, stored);
        return pub;
      });
      return send(res, 200, { id: phase.id, title: phase.title, emoji: phase.emoji, intro: phase.intro, items });
    }

    if (method === 'POST' && pathname === '/api/answer') {
      const body = await readJson(req);
      const found = game.itemIndex.get(String(body.itemId));
      if (!found) return fail(res, 404, 'Questão não encontrada.');
      if (!game.isUnlocked(participant, found.phase)) return fail(res, 403, 'Fase bloqueada.');
      const item = found.item;
      const stored = participant.answers[item.id];
      if (stored) {
        // Já respondida: devolve o resultado sem pontuar de novo.
        return send(res, 200, { result: game.resultFor(item, stored), xpGained: 0, repeated: true, state: game.summarize(participant), newBadges: [] });
      }
      const ev = game.evaluate(item, body);
      if (!ev) return fail(res, 400, 'Resposta inválida.');
      participant.answers[item.id] = { score: ev.score, a: ev.answer, at: Date.now() };
      participant.xp += ev.score;
      participant.streak = ev.score >= 8 ? (participant.streak || 0) + 1 : 0;
      participant.maxStreak = Math.max(participant.maxStreak || 0, participant.streak);
      const before = new Set(participant.badges);
      participant.badges = [...game.computeBadges(participant)];
      const newBadges = participant.badges.filter((b) => !before.has(b)).map((b) => ({ id: b, ...game.BADGES[b] }));
      const summary = game.summarize(participant);
      if (summary.complete && !participant.completedAt) participant.completedAt = Date.now();
      store.save();
      return send(res, 200, { result: ev.result, xpGained: ev.score, state: game.summarize(participant), newBadges });
    }

    if (method === 'GET' && pathname === '/api/ranking') {
      const group = Object.values(db.participants).filter((p) => p.codeId === code.id);
      const lastAt = (p) => Math.max(0, ...Object.values(p.answers).map((a) => a.at));
      group.sort((a, b) => b.xp - a.xp || lastAt(a) - lastAt(b));
      const top = group.slice(0, 20).map((p, i) => ({ rank: i + 1, nickname: p.nickname, xp: p.xp, level: game.levelFor(p.xp).name, me: p.id === participant.id }));
      const myRank = group.findIndex((p) => p.id === participant.id) + 1;
      return send(res, 200, { group: code.label, total: group.length, top, myRank });
    }

    return fail(res, 404, 'Rota não encontrada.');
  }

  /* -------------------- API do administrador -------------------- */
  function codeView(c) {
    const members = Object.values(db.participants).filter((p) => p.codeId === c.id);
    return {
      id: c.id,
      code: formatCode(c.code),
      label: c.label,
      active: c.active,
      maxUsers: c.maxUsers || 0,
      createdAt: c.createdAt,
      expiresAt: c.expiresAt || null,
      expired: !!(c.expiresAt && Date.now() > c.expiresAt),
      participants: members.length,
      completed: members.filter((p) => p.completedAt).length,
    };
  }

  function participantRow(p, code) {
    const total = game.MAX_XP;
    const done = Object.keys(p.answers).length;
    const items = game.itemIndex.size;
    return {
      id: p.id,
      group: code ? code.label : '',
      code: code ? formatCode(code.code) : '',
      nickname: p.nickname,
      xp: p.xp,
      maxXp: total,
      percent: Math.round((100 * p.xp) / total),
      answered: done,
      items,
      level: game.levelFor(p.xp).name,
      badges: p.badges.length,
      createdAt: p.createdAt,
      lastSeen: p.lastSeen,
      completedAt: p.completedAt || null,
    };
  }

  async function adminApi(req, res, url) {
    const { pathname } = url;
    const method = req.method;

    if (method === 'POST' && pathname === '/api/admin/login') {
      const ip = clientIp(req);
      if (adminLimiter.blocked(ip)) return fail(res, 429, 'Muitas tentativas. Aguarde alguns minutos.');
      const body = await readJson(req);
      if (!body.password || !safeEqual(body.password, adminPassword)) {
        adminLimiter.fail(ip);
        return fail(res, 401, 'Senha incorreta.');
      }
      adminLimiter.clear(ip);
      const token = newToken();
      adminSessions.set(sha256(token), Date.now() + ADMIN_TTL);
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req, ADMIN_COOKIE, token, ADMIN_TTL / 1000) });
    }
    if (method === 'POST' && pathname === '/api/admin/logout') {
      const tok = parseCookies(req)[ADMIN_COOKIE];
      if (tok) adminSessions.delete(sha256(tok));
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req, ADMIN_COOKIE, '', 0) });
    }
    if (!isAdmin(req)) return fail(res, 401, 'Acesso restrito ao administrador.');

    if (method === 'GET' && pathname === '/api/admin/me') return send(res, 200, { ok: true });

    if (method === 'GET' && pathname === '/api/admin/codes') {
      const list = Object.values(db.codes).sort((a, b) => b.createdAt - a.createdAt).map(codeView);
      return send(res, 200, { codes: list });
    }

    if (method === 'POST' && pathname === '/api/admin/codes') {
      const body = await readJson(req);
      const count = Math.min(Math.max(parseInt(body.count, 10) || 1, 1), 200);
      const maxUsers = Math.min(Math.max(parseInt(body.maxUsers, 10) || 0, 0), 100000);
      const days = parseInt(body.validDays, 10) || 0;
      const label = cleanLabel(body.label, 'Turma');
      const created = [];
      for (let i = 0; i < count; i++) {
        let value;
        do value = generateCode();
        while (Object.values(db.codes).some((c) => c.code === value));
        const c = {
          id: newId(),
          code: value,
          label: count > 1 ? `${label} ${i + 1}` : label,
          active: true,
          maxUsers,
          createdAt: Date.now(),
          expiresAt: days > 0 ? Date.now() + days * 24 * 3600 * 1000 : null,
        };
        db.codes[c.id] = c;
        created.push(codeView(c));
      }
      store.save();
      return send(res, 201, { codes: created });
    }

    let m;
    if ((m = pathname.match(/^\/api\/admin\/codes\/([0-9a-f]+)$/))) {
      const c = db.codes[m[1]];
      if (!c) return fail(res, 404, 'Código não encontrado.');
      if (method === 'PATCH') {
        const body = await readJson(req);
        if (typeof body.active === 'boolean') c.active = body.active;
        if (body.label != null) c.label = cleanLabel(body.label, c.label);
        if (body.maxUsers != null) c.maxUsers = Math.min(Math.max(parseInt(body.maxUsers, 10) || 0, 0), 100000);
        if (body.validDays != null) {
          const d = parseInt(body.validDays, 10) || 0;
          c.expiresAt = d > 0 ? Date.now() + d * 24 * 3600 * 1000 : null;
        }
        store.save();
        return send(res, 200, { code: codeView(c) });
      }
      if (method === 'DELETE') {
        for (const p of Object.values(db.participants)) {
          if (p.codeId === c.id) {
            delete db.participants[p.id];
            for (const [k, s] of Object.entries(db.sessions)) if (s.pid === p.id) delete db.sessions[k];
          }
        }
        delete db.codes[c.id];
        store.save();
        return send(res, 200, { ok: true });
      }
    }

    if (method === 'GET' && (m = pathname.match(/^\/api\/admin\/codes\/([0-9a-f]+)\/participants$/))) {
      const c = db.codes[m[1]];
      if (!c) return fail(res, 404, 'Código não encontrado.');
      const rows = Object.values(db.participants).filter((p) => p.codeId === c.id).map((p) => participantRow(p, c)).sort((a, b) => b.xp - a.xp);
      return send(res, 200, { code: codeView(c), participants: rows });
    }

    if (method === 'DELETE' && (m = pathname.match(/^\/api\/admin\/participants\/([0-9a-f]+)$/))) {
      const p = db.participants[m[1]];
      if (!p) return fail(res, 404, 'Participante não encontrado.');
      delete db.participants[p.id];
      for (const [k, s] of Object.entries(db.sessions)) if (s.pid === p.id) delete db.sessions[k];
      store.save();
      return send(res, 200, { ok: true });
    }

    if (method === 'GET' && pathname === '/api/admin/export.csv') {
      const only = url.searchParams.get('code');
      const header = ['Grupo', 'Código', 'Nome/apelido', 'XP', 'XP máximo', '% de acerto', 'Questões respondidas', 'Total de questões', 'Nível', 'Insígnias', 'Primeiro acesso', 'Último acesso', 'Concluiu'];
      const lines = [header.map(csvCell).join(';')];
      const fmt = (t) => (t ? new Date(t).toISOString().replace('T', ' ').slice(0, 19) : '');
      for (const p of Object.values(db.participants)) {
        const c = db.codes[p.codeId];
        if (only && (!c || c.id !== only)) continue;
        const r = participantRow(p, c);
        lines.push([r.group, r.code, r.nickname, r.xp, r.maxXp, r.percent, r.answered, r.items, r.level, r.badges, fmt(r.createdAt), fmt(r.lastSeen), r.completedAt ? fmt(r.completedAt) : 'Não'].map(csvCell).join(';'));
      }
      return send(res, 200, '﻿' + lines.join('\r\n') + '\r\n', {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="participantes.csv"',
      });
    }

    if (method === 'GET' && pathname === '/api/admin/stats') {
      const only = url.searchParams.get('code');
      const people = Object.values(db.participants).filter((p) => !only || p.codeId === only);
      const items = [];
      for (const phase of game.phases) {
        for (const it of phase.items) {
          const given = people.map((p) => p.answers[it.id]).filter(Boolean);
          const avg = given.length ? given.reduce((s, a) => s + a.score, 0) / given.length : null;
          const perfect = given.filter((a) => a.score === 10).length;
          items.push({ id: it.id, phase: phase.title, prompt: it.quote ? `${it.quote}` : it.prompt, answers: given.length, avgScore: avg == null ? null : Math.round(avg * 10) / 10, perfectPercent: given.length ? Math.round((100 * perfect) / given.length) : null });
        }
      }
      return send(res, 200, { participants: people.length, items });
    }

    return fail(res, 404, 'Rota não encontrada.');
  }

  /* -------------------- arquivos estáticos -------------------- */
  function serveStatic(req, res, url) {
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    if (rel === '/admin') rel = '/admin.html';
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Proibido');
    fs.readFile(file, (err, data) => {
      if (err) return send(res, 404, 'Não encontrado');
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  }

  /* -------------------- servidor -------------------- */
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        const ip = clientIp(req);
        if (apiLimiter.blocked(ip)) return fail(res, 429, 'Muitas requisições. Aguarde um instante.');
        apiLimiter.fail(ip); // conta toda requisição na janela
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          const origin = req.headers.origin;
          if (origin) {
            let ok = false;
            try {
              ok = new URL(origin).host === req.headers.host;
            } catch {
              ok = false;
            }
            if (!ok) return fail(res, 403, 'Origem não permitida.');
          }
          if (['POST', 'PATCH'].includes(req.method) && !String(req.headers['content-type'] || '').startsWith('application/json')) {
            return fail(res, 415, 'Content-Type deve ser application/json.');
          }
        }
        if (url.pathname.startsWith('/api/admin/')) return await adminApi(req, res, url);
        return await playerApi(req, res, url);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Método não permitido');
      return serveStatic(req, res, url);
    } catch (err) {
      if (err && err.status) return fail(res, err.status, err.message);
      console.error(err);
      if (!res.headersSent) return fail(res, 500, 'Erro interno.');
      res.end();
    }
  });

  server.on('close', () => store.flush());
  return { server, store, generatedPassword };
}

if (require.main === module) {
  const port = parseInt(process.env.PORT, 10) || 3000;
  const host = process.env.HOST || '0.0.0.0';
  const { server, store, generatedPassword } = createApp();
  server.listen(port, host, () => {
    console.log(`Jornada da Escuta em http://${host}:${port}  (painel do administrador: /admin)`);
    if (generatedPassword) {
      console.log('\n*** Senha do administrador gerada automaticamente ***');
      console.log(`    ${generatedPassword.password}`);
      console.log(`    (salva em ${generatedPassword.file}; defina ADMIN_PASSWORD para usar outra)\n`);
    }
  });
  const stop = () => {
    store.flush();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

module.exports = { createApp, normalizeCode, formatCode };
