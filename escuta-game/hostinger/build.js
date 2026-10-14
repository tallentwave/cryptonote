'use strict';
// Gera a pasta dist/ pronta para enviar à Hostinger (public_html) e o ZIP.
// Uso: node hostinger/build.js
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { phases } = require('../lib/content');

const root = path.join(__dirname, '..');
const dist = path.join(__dirname, 'dist', 'escuta');
fs.rmSync(path.join(__dirname, 'dist'), { recursive: true, force: true });
fs.rmSync(path.join(__dirname, 'jornada-da-escuta-hostinger.zip'), { force: true });
fs.mkdirSync(path.join(dist, 'data'), { recursive: true });

const copy = (from, to) => fs.copyFileSync(from, path.join(dist, to));
for (const f of ['index.html', 'admin.html', 'style.css', 'app.js', 'admin.js']) copy(path.join(root, 'public', f), f);
for (const f of ['api.php', 'config.php', '.htaccess']) copy(path.join(__dirname, f), f);
copy(path.join(__dirname, 'data', '.htaccess'), 'data/.htaccess');
copy(path.join(__dirname, 'data', 'index.html'), 'data/index.html');
copy(path.join(__dirname, 'LEIA-ME.txt'), 'LEIA-ME.txt');
// Conteúdo (com gabarito) como arquivo PHP: mesmo que o .htaccess falhe, ninguém consegue ler o texto.
const b64 = Buffer.from(JSON.stringify({ phases })).toString('base64');
fs.writeFileSync(path.join(dist, 'content.php'), `<?php\nreturn json_decode(base64_decode('${b64}'), true);\n`);

const zip = path.join(__dirname, 'jornada-da-escuta-hostinger.zip');
execFileSync('zip', ['-qr', zip, '.'], { cwd: dist });
console.log('OK:', zip);
