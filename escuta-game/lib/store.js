'use strict';
const fs = require('node:fs');
const path = require('node:path');

/**
 * Armazenamento simples em arquivo JSON (sem dependências).
 * Adequado para centenas de participantes em um servidor compartilhado.
 * Gravação atômica (arquivo temporário + rename) e "debounce" para não
 * regravar o arquivo a cada clique.
 */
class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'db.json');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.db = { version: 1, codes: {}, participants: {}, sessions: {} };
    if (fs.existsSync(this.file)) {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.db = Object.assign(this.db, parsed);
    }
    this.timer = null;
  }

  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 300);
    this.timer.unref();
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.db), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store };
