<?php
/*
 * Jornada da Escuta: API em PHP para hospedagem compartilhada (Hostinger).
 * Mesmas rotas do servidor Node.js. Sem banco de dados: os dados ficam em
 * data/db.json.php (protegido) com bloqueio de arquivo (flock).
 */
declare(strict_types=1);

$config = require __DIR__ . '/config.php';
$content = require __DIR__ . '/content.php';
$PHASES = $content['phases'];

/** Lançada por out()/fail() para encerrar a requisição após gravar o banco. */
class Done extends Exception
{
}

const PLAYER_COOKIE = 'sid';
const ADMIN_COOKIE = 'asid';
const PLAYER_TTL = 30 * 24 * 3600;
const ADMIN_TTL = 8 * 3600;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PHP_GUARD = "<?php http_response_code(404); exit; ?>\n";

$LEVELS = [
    ['min' => 0, 'name' => 'Semente', 'emoji' => '🌱'],
    ['min' => 60, 'name' => 'Ouvido Atento', 'emoji' => '👂'],
    ['min' => 140, 'name' => 'Ponte de Confiança', 'emoji' => '🌉'],
    ['min' => 240, 'name' => 'Guardião da Rede', 'emoji' => '🛡️'],
    ['min' => 340, 'name' => 'Escuta Mestra', 'emoji' => '🌟'],
];
$BADGES = [
    'primeiro-passo' => ['name' => 'Primeiro passo', 'emoji' => '👣', 'desc' => 'Respondeu a primeira pergunta.'],
    'fundamentos' => ['name' => 'Base sólida', 'emoji' => '📚', 'desc' => 'Concluiu a fase Fundamentos.'],
    'sem-promessas' => ['name' => 'Sem promessas vazias', 'emoji' => '🤐', 'desc' => 'Não prometeu sigilo na revelação do Lucas.'],
    'sem-inducao' => ['name' => 'Pergunta aberta', 'emoji' => '🗝️', 'desc' => 'Acertou 9 ou mais das 11 questões de Perguntas que Protegem.'],
    'sequencia-5' => ['name' => 'Sequência de 5', 'emoji' => '🔥', 'desc' => 'Cinco respostas seguidas com 8+ pontos.'],
    'rede' => ['name' => 'Guardião da rede', 'emoji' => '🕸️', 'desc' => 'Concluiu a fase Rede de Proteção.'],
    'campeao' => ['name' => 'Jornada completa', 'emoji' => '🏆', 'desc' => 'Concluiu todas as fases.'],
    'perfeito' => ['name' => 'Pontuação máxima', 'emoji' => '💎', 'desc' => 'Fez todos os pontos possíveis.'],
];

$ITEMS = []; // id => [phaseIndex, item]
foreach ($PHASES as $pi => $ph) {
    foreach ($ph['items'] as $it) {
        $ITEMS[$it['id']] = [$pi, $it];
    }
}
$MAX_XP = count($ITEMS) * 10;

/* ---------------- HTTP ---------------- */
function send_headers(): void
{
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header('X-Robots-Tag: noindex, nofollow');
    header("Content-Security-Policy: default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    header('Cache-Control: no-store');
}

function out(int $status, $data, array $headers = []): void
{
    http_response_code($status);
    foreach ($headers as $h) {
        header($h);
    }
    if (is_string($data)) {
        echo $data;
    } else {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
    }
    throw new Done();
}

function fail(int $status, string $msg): void
{
    out($status, ['error' => $msg]);
}

function read_body(): array
{
    $raw = file_get_contents('php://input', false, null, 0, 32 * 1024 + 1);
    if ($raw === false || $raw === '') {
        return [];
    }
    if (strlen($raw) > 32 * 1024) {
        fail(413, 'Requisição muito grande.');
    }
    $v = json_decode($raw, true);
    if (!is_array($v)) {
        fail(400, 'JSON inválido.');
    }
    return $v;
}

function client_ip(): string
{
    global $config;
    if (!empty($config['trust_proxy']) && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        return trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
    }
    return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}

function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function set_cookie_safe(string $name, string $value, int $ttl): void
{
    global $config;
    $mode = (string)($config['cookie_secure'] ?? 'auto');
    $secure = $mode === '1' || ($mode === 'auto' && is_https());
    setcookie($name, $value, [
        'expires' => $ttl > 0 ? time() + $ttl : time() - 3600,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

/* ---------------- Banco (arquivo JSON com flock) ---------------- */
function db_path(): string
{
    global $config;
    $dir = $config['data_dir'] ?? (__DIR__ . '/data');
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    return rtrim($dir, '/\\') . '/db.json.php';
}

/** Executa $fn(&$db) com bloqueio exclusivo; grava se $fn retornar dirty=true via $db['_dirty']. */
function with_db(callable $fn)
{
    $path = db_path();
    $fh = @fopen($path, 'c+');
    if (!$fh) {
        fail(500, 'Não foi possível abrir a pasta de dados. Verifique as permissões de /data.');
    }
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $db = ['codes' => [], 'participants' => [], 'sessions' => [], 'admin_sessions' => [], 'limits' => []];
    if ($raw !== '' && $raw !== false) {
        $json = substr($raw, strlen(PHP_GUARD));
        $parsed = json_decode($json, true);
        if (is_array($parsed)) {
            $db = array_merge($db, $parsed);
        }
    }
    $db['_dirty'] = false;
    $thrown = null;
    $result = null;
    try {
        $result = $fn($db);
    } catch (Done $d) {
        $thrown = $d; // resposta pronta: ainda grava as alterações
    } catch (Throwable $e) {
        flock($fh, LOCK_UN);
        fclose($fh);
        throw $e;
    }
    if ($db['_dirty']) {
        unset($db['_dirty']);
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, PHP_GUARD . json_encode($db, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        fflush($fh);
    }
    flock($fh, LOCK_UN);
    fclose($fh);
    if ($thrown) {
        throw $thrown;
    }
    return $result;
}

/* ---------------- Utilidades ---------------- */
function new_token(): string
{
    return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
}
function new_id(): string
{
    return bin2hex(random_bytes(8));
}
function hash_token(string $t): string
{
    return hash('sha256', $t);
}
function generate_code(): string
{
    $s = '';
    for ($i = 0; $i < 8; $i++) {
        $s .= CODE_ALPHABET[random_int(0, strlen(CODE_ALPHABET) - 1)];
    }
    return $s;
}
function format_code(string $c): string
{
    return 'ESC-' . substr($c, 0, 4) . '-' . substr($c, 4);
}
function normalize_code($input): string
{
    $c = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)$input));
    if (strlen($c) === 11 && strpos($c, 'ESC') === 0) {
        $c = substr($c, 3);
    }
    return $c;
}
function clean_nickname($input): ?string
{
    $n = trim(preg_replace('/\s+/u', ' ', (string)$input));
    if (class_exists('Normalizer')) {
        $n = Normalizer::normalize($n, Normalizer::FORM_C) ?: $n;
    }
    $len = mb_strlen($n);
    if ($len < 2 || $len > 30) {
        return null;
    }
    if (!preg_match('/^[\p{L}\p{N} ._\'-]+$/u', $n)) {
        return null;
    }
    return $n;
}
function clean_label($input, string $fallback): string
{
    $s = trim(preg_replace('/[\x00-\x1f]/', ' ', (string)($input ?? '')));
    $s = mb_substr($s, 0, 80);
    return $s !== '' ? $s : $fallback;
}
function csv_cell($v): string
{
    $s = (string)($v ?? '');
    if (preg_match('/^[=+\-@\t\r]/', $s)) {
        $s = "'" . $s;
    }
    return preg_match('/[",\n;]/', $s) ? '"' . str_replace('"', '""', $s) . '"' : $s;
}
function code_usable(?array $c): bool
{
    return $c && !empty($c['active']) && !($c['expiresAt'] && time() * 1000 > $c['expiresAt']);
}
function now_ms(): int
{
    return (int)floor(microtime(true) * 1000);
}

/* Limite de tentativas (guardado no banco) */
function limiter_blocked(array &$db, string $key, int $max): bool
{
    $e = $db['limits'][$key] ?? null;
    if (!$e) {
        return false;
    }
    if (time() > $e['reset']) {
        unset($db['limits'][$key]);
        $db['_dirty'] = true;
        return false;
    }
    return $e['count'] >= $max;
}
function limiter_fail(array &$db, string $key, int $windowSec = 900): void
{
    $e = $db['limits'][$key] ?? null;
    if (!$e || time() > $e['reset']) {
        $db['limits'][$key] = ['count' => 1, 'reset' => time() + $windowSec];
    } else {
        $db['limits'][$key]['count']++;
    }
    // limpeza simples
    if (count($db['limits']) > 500) {
        foreach ($db['limits'] as $k => $v) {
            if (time() > $v['reset']) {
                unset($db['limits'][$k]);
            }
        }
    }
    $db['_dirty'] = true;
}
function limiter_clear(array &$db, string $key): void
{
    if (isset($db['limits'][$key])) {
        unset($db['limits'][$key]);
        $db['_dirty'] = true;
    }
}

/* ---------------- Lógica do jogo ---------------- */
function level_for(int $xp): array
{
    global $LEVELS;
    $idx = 0;
    foreach ($LEVELS as $i => $l) {
        if ($xp >= $l['min']) {
            $idx = $i;
        }
    }
    $cur = $LEVELS[$idx];
    $next = $LEVELS[$idx + 1] ?? null;
    return ['index' => $idx + 1, 'name' => $cur['name'], 'emoji' => $cur['emoji'], 'min' => $cur['min'],
        'nextMin' => $next ? $next['min'] : null, 'nextName' => $next ? $next['name'] : null];
}

function phase_progress(array $p, array $phase): array
{
    $total = count($phase['items']);
    $done = 0;
    $xp = 0;
    foreach ($phase['items'] as $it) {
        if (isset($p['answers'][$it['id']])) {
            $done++;
            $xp += $p['answers'][$it['id']]['score'];
        }
    }
    return ['id' => $phase['id'], 'total' => $total, 'done' => $done, 'xp' => $xp, 'maxXp' => $total * 10, 'complete' => $done === $total];
}

function phase_by_id(string $id): ?array
{
    global $PHASES;
    foreach ($PHASES as $ph) {
        if ($ph['id'] === $id) {
            return $ph;
        }
    }
    return null;
}

function is_unlocked(array $p, array $phase): bool
{
    foreach ($phase['requires'] ?? [] as $rid) {
        $req = phase_by_id($rid);
        if (!phase_progress($p, $req)['complete']) {
            return false;
        }
    }
    return true;
}

function compute_badges(array $p): array
{
    global $PHASES, $MAX_XP;
    $earned = [];
    $a = $p['answers'];
    if (count($a) > 0) {
        $earned[] = 'primeiro-passo';
    }
    $prog = [];
    foreach ($PHASES as $ph) {
        $prog[$ph['id']] = phase_progress($p, $ph);
    }
    if ($prog['fundamentos']['complete']) {
        $earned[] = 'fundamentos';
    }
    if (isset($a['r-a1']) && $a['r-a1']['score'] === 10) {
        $earned[] = 'sem-promessas';
    }
    if ($prog['perguntas']['complete']) {
        $hits = 0;
        foreach (phase_by_id('perguntas')['items'] as $it) {
            if (isset($a[$it['id']]) && $a[$it['id']]['score'] === 10) {
                $hits++;
            }
        }
        if ($hits >= 9) {
            $earned[] = 'sem-inducao';
        }
    }
    if (($p['maxStreak'] ?? 0) >= 5) {
        $earned[] = 'sequencia-5';
    }
    if ($prog['rede']['complete']) {
        $earned[] = 'rede';
    }
    $all = true;
    foreach ($prog as $pr) {
        $all = $all && $pr['complete'];
    }
    if ($all) {
        $earned[] = 'campeao';
    }
    if ($p['xp'] >= $MAX_XP) {
        $earned[] = 'perfeito';
    }
    return $earned;
}

function summarize(array $p): array
{
    global $PHASES, $BADGES, $MAX_XP;
    $progress = [];
    $complete = true;
    foreach ($PHASES as $ph) {
        $pr = phase_progress($p, $ph);
        $complete = $complete && $pr['complete'];
        $progress[] = array_merge([
            'id' => $ph['id'], 'title' => $ph['title'], 'emoji' => $ph['emoji'], 'summary' => $ph['summary'],
            'locked' => !is_unlocked($p, $ph), 'requires' => $ph['requires'] ?? [],
        ], $pr);
    }
    $badges = [];
    foreach ($BADGES as $id => $b) {
        $badges[] = array_merge(['id' => $id], $b, ['earned' => in_array($id, $p['badges'] ?? [], true)]);
    }
    return [
        'nickname' => $p['nickname'], 'xp' => $p['xp'], 'maxXp' => $MAX_XP, 'level' => level_for($p['xp']),
        'phases' => $progress, 'badges' => $badges, 'streak' => $p['streak'] ?? 0,
        'complete' => $complete, 'completedAt' => $p['completedAt'] ?? null,
    ];
}

function public_item(array $item): array
{
    $out = [];
    foreach (['id', 'type', 'prompt', 'quote', 'narration', 'speaker', 'says', 'sceneId', 'sceneTitle', 'sceneIntro'] as $k) {
        if (isset($item[$k])) {
            $out[$k] = $item[$k];
        }
    }
    if ($item['type'] === 'choice') {
        $opts = array_map(fn($o) => ['id' => $o['id'], 'text' => $o['text']], $item['options']);
        if (empty($item['keepOrder'])) {
            shuffle($opts);
        }
        $out['options'] = $opts;
    } else {
        $steps = array_map(fn($s) => ['id' => $s['id'], 'text' => $s['text']], $item['steps']);
        shuffle($steps);
        $out['steps'] = $steps;
    }
    return $out;
}

/** Retorna ['score','answer','result'] ou null se inválida. */
function evaluate(array $item, array $payload): ?array
{
    if ($item['type'] === 'choice') {
        $chosen = null;
        foreach ($item['options'] as $o) {
            if ($o['id'] === ($payload['optionId'] ?? null)) {
                $chosen = $o;
            }
        }
        if (!$chosen) {
            return null;
        }
        $best = $item['options'][0];
        foreach ($item['options'] as $o) {
            if ($o['score'] > $best['score']) {
                $best = $o;
            }
        }
        return [
            'score' => $chosen['score'], 'answer' => $chosen['id'],
            'result' => [
                'type' => 'choice', 'score' => $chosen['score'], 'max' => 10, 'chosenId' => $chosen['id'], 'bestId' => $best['id'],
                'feedback' => $chosen['feedback'], 'bestFeedback' => $best['feedback'],
                'options' => array_map(fn($o) => ['id' => $o['id'], 'text' => $o['text'], 'score' => $o['score']], $item['options']),
            ],
        ];
    }
    $ids = array_map(fn($s) => $s['id'], $item['steps']);
    $seq = $payload['order'] ?? null;
    if (!is_array($seq) || !array_is_list($seq) || count($seq) !== count($ids) || count(array_unique($seq)) !== count($ids)) {
        return null;
    }
    foreach ($seq as $s) {
        if (!is_string($s) || !in_array($s, $ids, true)) {
            return null;
        }
    }
    $right = 0;
    foreach ($seq as $i => $s) {
        if ($s === $ids[$i]) {
            $right++;
        }
    }
    $score = $right === count($ids) ? 10 : min((int)round(10 * $right / count($ids)), 9);
    return [
        'score' => $score, 'answer' => $seq,
        'result' => [
            'type' => 'order', 'score' => $score, 'max' => 10, 'mine' => $seq,
            'correct' => array_map(fn($s) => ['id' => $s['id'], 'text' => $s['text']], $item['steps']),
            'feedback' => $item['explanation'],
        ],
    ];
}

function result_for(array $item, array $stored): ?array
{
    $payload = $item['type'] === 'choice' ? ['optionId' => $stored['a']] : ['order' => $stored['a']];
    $ev = evaluate($item, $payload);
    return $ev ? $ev['result'] : null;
}

/* ---------------- Autenticação ---------------- */
function cookie_val(string $name): ?string
{
    return isset($_COOKIE[$name]) && is_string($_COOKIE[$name]) ? $_COOKIE[$name] : null;
}

/** Retorna [participantId, codeId] ou null (já dentro de with_db). */
function find_player(array &$db): ?array
{
    $tok = cookie_val(PLAYER_COOKIE);
    if (!$tok) {
        return null;
    }
    $key = hash_token($tok);
    $s = $db['sessions'][$key] ?? null;
    if (!$s) {
        return null;
    }
    if (time() > $s['exp']) {
        unset($db['sessions'][$key]);
        $db['_dirty'] = true;
        return null;
    }
    $p = $db['participants'][$s['pid']] ?? null;
    $c = $p ? ($db['codes'][$p['codeId']] ?? null) : null;
    if (!$p || !code_usable($c)) {
        return null;
    }
    if (now_ms() - ($p['lastSeen'] ?? 0) > 60000) {
        $db['participants'][$p['id']]['lastSeen'] = now_ms();
        $db['_dirty'] = true;
    }
    return [$p['id'], $c['id']];
}

function admin_ok(array &$db): bool
{
    $tok = cookie_val(ADMIN_COOKIE);
    if (!$tok) {
        return false;
    }
    $key = hash_token($tok);
    $exp = $db['admin_sessions'][$key] ?? null;
    if (!$exp) {
        return false;
    }
    if (time() > $exp) {
        unset($db['admin_sessions'][$key]);
        $db['_dirty'] = true;
        return false;
    }
    return true;
}

/* ---------------- API do participante ---------------- */
function player_api(string $method, string $path): void
{
    global $config, $ITEMS, $PHASES, $MAX_XP, $BADGES;
    $org = (string)($config['org_name'] ?? '');

    if ($method === 'GET' && $path === '/api/config') {
        out(200, ['orgName' => $org, 'title' => 'Jornada da Escuta']);
    }

    if ($method === 'POST' && $path === '/api/join') {
        $body = read_body();
        $ip = client_ip();
        with_db(function (&$db) use ($body, $ip) {
            if (limiter_blocked($db, 'join:' . $ip, 10)) {
                fail(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
            }
            $nick = clean_nickname($body['nickname'] ?? '');
            $codeStr = normalize_code($body['code'] ?? '');
            $code = null;
            foreach ($db['codes'] as $c) {
                if (hash_equals($c['code'], $codeStr)) {
                    $code = $c;
                }
            }
            if (!$code || !code_usable($code)) {
                limiter_fail($db, 'join:' . $ip);
                fail(403, 'Código inválido, expirado ou desativado. Confira com quem organiza a capacitação.');
            }
            if (!$nick) {
                fail(400, 'Informe um nome ou apelido de 2 a 30 caracteres (letras, números, espaço, ponto, hífen).');
            }
            $members = array_filter($db['participants'], fn($p) => $p['codeId'] === $code['id']);
            $found = null;
            foreach ($members as $p) {
                if (mb_strtolower($p['nickname']) === mb_strtolower($nick)) {
                    $found = $p;
                }
            }
            if (!$found) {
                if (!empty($code['maxUsers']) && count($members) >= $code['maxUsers']) {
                    limiter_fail($db, 'join:' . $ip);
                    fail(403, 'Este código atingiu o limite de participantes.');
                }
                $found = ['id' => new_id(), 'codeId' => $code['id'], 'nickname' => $nick, 'createdAt' => now_ms(), 'lastSeen' => now_ms(),
                    'answers' => [], 'xp' => 0, 'badges' => [], 'streak' => 0, 'maxStreak' => 0];
                $db['participants'][$found['id']] = $found;
            }
            limiter_clear($db, 'join:' . $ip);
            $token = new_token();
            $db['sessions'][hash_token($token)] = ['pid' => $found['id'], 'exp' => time() + PLAYER_TTL];
            $db['participants'][$found['id']]['lastSeen'] = now_ms();
            // limpa sessões expiradas ocasionalmente
            if (count($db['sessions']) > 2000) {
                foreach ($db['sessions'] as $k => $s) {
                    if (time() > $s['exp']) {
                        unset($db['sessions'][$k]);
                    }
                }
            }
            $db['_dirty'] = true;
            set_cookie_safe(PLAYER_COOKIE, $token, PLAYER_TTL);
        });
        out(200, ['ok' => true]);
    }

    if ($method === 'POST' && $path === '/api/logout') {
        with_db(function (&$db) {
            $tok = cookie_val(PLAYER_COOKIE);
            if ($tok) {
                unset($db['sessions'][hash_token($tok)]);
                $db['_dirty'] = true;
            }
        });
        set_cookie_safe(PLAYER_COOKIE, '', 0);
        out(200, ['ok' => true]);
    }

    // Demais rotas exigem sessão válida.
    $body = $method === 'POST' ? read_body() : [];
    with_db(function (&$db) use ($method, $path, $body, $org, $ITEMS, $MAX_XP, $BADGES) {
        $auth = find_player($db);
        if (!$auth) {
            fail(401, 'Sessão inválida. Entre novamente com o seu código.');
        }
        [$pid, $cid] = $auth;
        $p = $db['participants'][$pid];
        $code = $db['codes'][$cid];

        if ($method === 'GET' && $path === '/api/state') {
            out(200, array_merge(summarize($p), ['group' => $code['label'], 'orgName' => $org]));
        }

        if ($method === 'GET' && preg_match('#^/api/phase/([a-z-]+)$#', $path, $m)) {
            $phase = phase_by_id($m[1]);
            if (!$phase) {
                fail(404, 'Fase não encontrada.');
            }
            if (!is_unlocked($p, $phase)) {
                fail(403, 'Conclua as fases anteriores para liberar esta.');
            }
            $items = [];
            foreach ($phase['items'] as $it) {
                $pub = public_item($it);
                if (isset($p['answers'][$it['id']])) {
                    $pub['answered'] = result_for($it, $p['answers'][$it['id']]);
                }
                $items[] = $pub;
            }
            out(200, ['id' => $phase['id'], 'title' => $phase['title'], 'emoji' => $phase['emoji'], 'intro' => $phase['intro'], 'items' => $items]);
        }

        if ($method === 'POST' && $path === '/api/answer') {
            $iid = (string)($body['itemId'] ?? '');
            if (!isset($ITEMS[$iid])) {
                fail(404, 'Questão não encontrada.');
            }
            [$pi, $item] = $ITEMS[$iid];
            $phase = $GLOBALS['PHASES'][$pi];
            if (!is_unlocked($p, $phase)) {
                fail(403, 'Fase bloqueada.');
            }
            if (isset($p['answers'][$iid])) {
                out(200, ['result' => result_for($item, $p['answers'][$iid]), 'xpGained' => 0, 'repeated' => true, 'state' => summarize($p), 'newBadges' => []]);
            }
            $ev = evaluate($item, $body);
            if (!$ev) {
                fail(400, 'Resposta inválida.');
            }
            $p['answers'][$iid] = ['score' => $ev['score'], 'a' => $ev['answer'], 'at' => now_ms()];
            $p['xp'] += $ev['score'];
            $p['streak'] = $ev['score'] >= 8 ? ($p['streak'] ?? 0) + 1 : 0;
            $p['maxStreak'] = max($p['maxStreak'] ?? 0, $p['streak']);
            $before = $p['badges'] ?? [];
            $p['badges'] = compute_badges($p);
            $newBadges = [];
            foreach (array_diff($p['badges'], $before) as $b) {
                $newBadges[] = array_merge(['id' => $b], $BADGES[$b]);
            }
            if (summarize($p)['complete'] && empty($p['completedAt'])) {
                $p['completedAt'] = now_ms();
            }
            $db['participants'][$pid] = $p;
            $db['_dirty'] = true;
            out(200, ['result' => $ev['result'], 'xpGained' => $ev['score'], 'state' => summarize($p), 'newBadges' => $newBadges]);
        }

        if ($method === 'GET' && $path === '/api/ranking') {
            $group = array_values(array_filter($db['participants'], fn($x) => $x['codeId'] === $cid));
            $last = function ($x) {
                $m = 0;
                foreach ($x['answers'] as $a) {
                    $m = max($m, $a['at']);
                }
                return $m;
            };
            usort($group, fn($a, $b) => $b['xp'] <=> $a['xp'] ?: $last($a) <=> $last($b));
            $top = [];
            $myRank = 0;
            foreach ($group as $i => $x) {
                if ($x['id'] === $pid) {
                    $myRank = $i + 1;
                }
                if ($i < 20) {
                    $top[] = ['rank' => $i + 1, 'nickname' => $x['nickname'], 'xp' => $x['xp'], 'level' => level_for($x['xp'])['name'], 'me' => $x['id'] === $pid];
                }
            }
            out(200, ['group' => $code['label'], 'total' => count($group), 'top' => $top, 'myRank' => $myRank]);
        }

        fail(404, 'Rota não encontrada.');
    });
}

/* ---------------- API do administrador ---------------- */
function code_view(array &$db, array $c): array
{
    $members = array_filter($db['participants'], fn($p) => $p['codeId'] === $c['id']);
    $completed = count(array_filter($members, fn($p) => !empty($p['completedAt'])));
    return [
        'id' => $c['id'], 'code' => format_code($c['code']), 'label' => $c['label'], 'active' => (bool)$c['active'],
        'maxUsers' => $c['maxUsers'] ?? 0, 'createdAt' => $c['createdAt'], 'expiresAt' => $c['expiresAt'] ?? null,
        'expired' => (bool)(($c['expiresAt'] ?? null) && now_ms() > $c['expiresAt']),
        'participants' => count($members), 'completed' => $completed,
    ];
}

function participant_row(array $p, ?array $code): array
{
    global $MAX_XP, $ITEMS;
    return [
        'id' => $p['id'], 'group' => $code ? $code['label'] : '', 'code' => $code ? format_code($code['code']) : '',
        'nickname' => $p['nickname'], 'xp' => $p['xp'], 'maxXp' => $MAX_XP, 'percent' => (int)round(100 * $p['xp'] / $MAX_XP),
        'answered' => count($p['answers']), 'items' => count($ITEMS), 'level' => level_for($p['xp'])['name'],
        'badges' => count($p['badges'] ?? []), 'createdAt' => $p['createdAt'], 'lastSeen' => $p['lastSeen'] ?? null,
        'completedAt' => $p['completedAt'] ?? null,
    ];
}

function delete_participant(array &$db, string $pid): void
{
    unset($db['participants'][$pid]);
    foreach ($db['sessions'] as $k => $s) {
        if ($s['pid'] === $pid) {
            unset($db['sessions'][$k]);
        }
    }
}

function admin_api(string $method, string $path): void
{
    global $config, $PHASES;
    $adminPw = (string)($config['admin_password'] ?? '');
    $query = $_GET;
    $body = in_array($method, ['POST', 'PATCH'], true) ? read_body() : [];

    with_db(function (&$db) use ($method, $path, $body, $adminPw, $query, $PHASES) {
        if ($method === 'POST' && $path === '/api/admin/login') {
            $ip = client_ip();
            if ($adminPw === '' || $adminPw === 'TROQUE-ESTA-SENHA' || strlen($adminPw) < 8) {
                fail(503, 'Defina uma senha com 8+ caracteres em config.php (admin_password) antes de usar o painel.');
            }
            if (limiter_blocked($db, 'admin:' . $ip, 8)) {
                fail(429, 'Muitas tentativas. Aguarde alguns minutos.');
            }
            if (!isset($body['password']) || !is_string($body['password']) || !hash_equals(hash('sha256', $adminPw), hash('sha256', $body['password']))) {
                limiter_fail($db, 'admin:' . $ip);
                fail(401, 'Senha incorreta.');
            }
            limiter_clear($db, 'admin:' . $ip);
            $token = new_token();
            foreach ($db['admin_sessions'] as $k => $exp) {
                if (time() > $exp) {
                    unset($db['admin_sessions'][$k]);
                }
            }
            $db['admin_sessions'][hash_token($token)] = time() + ADMIN_TTL;
            $db['_dirty'] = true;
            set_cookie_safe(ADMIN_COOKIE, $token, ADMIN_TTL);
            out(200, ['ok' => true]);
        }
        if ($method === 'POST' && $path === '/api/admin/logout') {
            $tok = cookie_val(ADMIN_COOKIE);
            if ($tok) {
                unset($db['admin_sessions'][hash_token($tok)]);
                $db['_dirty'] = true;
            }
            set_cookie_safe(ADMIN_COOKIE, '', 0);
            out(200, ['ok' => true]);
        }
        if (!admin_ok($db)) {
            fail(401, 'Acesso restrito ao administrador.');
        }

        if ($method === 'GET' && $path === '/api/admin/me') {
            out(200, ['ok' => true]);
        }

        if ($method === 'GET' && $path === '/api/admin/codes') {
            $list = array_values($db['codes']);
            usort($list, fn($a, $b) => $b['createdAt'] <=> $a['createdAt']);
            out(200, ['codes' => array_map(fn($c) => code_view($db, $c), $list)]);
        }

        if ($method === 'POST' && $path === '/api/admin/codes') {
            $count = min(max((int)($body['count'] ?? 1), 1), 200);
            $maxUsers = min(max((int)($body['maxUsers'] ?? 0), 0), 100000);
            $days = (int)($body['validDays'] ?? 0);
            $label = clean_label($body['label'] ?? '', 'Turma');
            $created = [];
            $existing = array_map(fn($c) => $c['code'], $db['codes']);
            for ($i = 0; $i < $count; $i++) {
                do {
                    $value = generate_code();
                } while (in_array($value, $existing, true));
                $existing[] = $value;
                $c = ['id' => new_id(), 'code' => $value, 'label' => $count > 1 ? $label . ' ' . ($i + 1) : $label, 'active' => true,
                    'maxUsers' => $maxUsers, 'createdAt' => now_ms(), 'expiresAt' => $days > 0 ? now_ms() + $days * 86400000 : null];
                $db['codes'][$c['id']] = $c;
                $created[] = code_view($db, $c);
            }
            $db['_dirty'] = true;
            out(201, ['codes' => $created]);
        }

        if (preg_match('#^/api/admin/codes/([0-9a-f]+)$#', $path, $m)) {
            $c = $db['codes'][$m[1]] ?? null;
            if (!$c) {
                fail(404, 'Código não encontrado.');
            }
            if ($method === 'PATCH') {
                if (isset($body['active']) && is_bool($body['active'])) {
                    $c['active'] = $body['active'];
                }
                if (isset($body['label'])) {
                    $c['label'] = clean_label($body['label'], $c['label']);
                }
                if (isset($body['maxUsers'])) {
                    $c['maxUsers'] = min(max((int)$body['maxUsers'], 0), 100000);
                }
                if (isset($body['validDays'])) {
                    $d = (int)$body['validDays'];
                    $c['expiresAt'] = $d > 0 ? now_ms() + $d * 86400000 : null;
                }
                $db['codes'][$c['id']] = $c;
                $db['_dirty'] = true;
                out(200, ['code' => code_view($db, $c)]);
            }
            if ($method === 'DELETE') {
                foreach ($db['participants'] as $pid => $p) {
                    if ($p['codeId'] === $c['id']) {
                        delete_participant($db, $pid);
                    }
                }
                unset($db['codes'][$c['id']]);
                $db['_dirty'] = true;
                out(200, ['ok' => true]);
            }
        }

        if ($method === 'GET' && preg_match('#^/api/admin/codes/([0-9a-f]+)/participants$#', $path, $m)) {
            $c = $db['codes'][$m[1]] ?? null;
            if (!$c) {
                fail(404, 'Código não encontrado.');
            }
            $rows = [];
            foreach ($db['participants'] as $p) {
                if ($p['codeId'] === $c['id']) {
                    $rows[] = participant_row($p, $c);
                }
            }
            usort($rows, fn($a, $b) => $b['xp'] <=> $a['xp']);
            out(200, ['code' => code_view($db, $c), 'participants' => $rows]);
        }

        if ($method === 'DELETE' && preg_match('#^/api/admin/participants/([0-9a-f]+)$#', $path, $m)) {
            if (!isset($db['participants'][$m[1]])) {
                fail(404, 'Participante não encontrado.');
            }
            delete_participant($db, $m[1]);
            $db['_dirty'] = true;
            out(200, ['ok' => true]);
        }

        if ($method === 'GET' && $path === '/api/admin/export.csv') {
            $only = $query['code'] ?? null;
            $header = ['Grupo', 'Código', 'Nome/apelido', 'XP', 'XP máximo', '% de acerto', 'Questões respondidas', 'Total de questões', 'Nível', 'Insígnias', 'Primeiro acesso', 'Último acesso', 'Concluiu'];
            $lines = [implode(';', array_map('csv_cell', $header))];
            $fmt = fn($t) => $t ? gmdate('Y-m-d H:i:s', (int)($t / 1000)) : '';
            foreach ($db['participants'] as $p) {
                $c = $db['codes'][$p['codeId']] ?? null;
                if ($only && (!$c || $c['id'] !== $only)) {
                    continue;
                }
                $r = participant_row($p, $c);
                $lines[] = implode(';', array_map('csv_cell', [$r['group'], $r['code'], $r['nickname'], $r['xp'], $r['maxXp'], $r['percent'], $r['answered'], $r['items'], $r['level'], $r['badges'], $fmt($r['createdAt']), $fmt($r['lastSeen']), $r['completedAt'] ? $fmt($r['completedAt']) : 'Não']));
            }
            out(200, "\xEF\xBB\xBF" . implode("\r\n", $lines) . "\r\n", ['Content-Type: text/csv; charset=utf-8', 'Content-Disposition: attachment; filename="participantes.csv"']);
        }

        if ($method === 'GET' && $path === '/api/admin/stats') {
            $only = $query['code'] ?? null;
            $people = array_values(array_filter($db['participants'], fn($p) => !$only || $p['codeId'] === $only));
            $items = [];
            foreach ($PHASES as $ph) {
                foreach ($ph['items'] as $it) {
                    $given = [];
                    foreach ($people as $p) {
                        if (isset($p['answers'][$it['id']])) {
                            $given[] = $p['answers'][$it['id']]['score'];
                        }
                    }
                    $n = count($given);
                    $items[] = ['id' => $it['id'], 'phase' => $ph['title'], 'prompt' => $it['quote'] ?? $it['prompt'], 'answers' => $n,
                        'avgScore' => $n ? round(array_sum($given) / $n, 1) : null,
                        'perfectPercent' => $n ? (int)round(100 * count(array_filter($given, fn($s) => $s === 10)) / $n) : null];
                }
            }
            out(200, ['participants' => count($people), 'items' => $items]);
        }

        fail(404, 'Rota não encontrada.');
    });
}

/* ---------------- Entrada ---------------- */
ob_start();
send_headers();
try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
    $path = ($base !== '' && strpos($uri, $base) === 0) ? substr($uri, strlen($base)) : $uri;
    if ($path === '/api.php' || strpos($path, '/api/') !== 0) {
        fail(404, 'Rota não encontrada.');
    }
    if ($method !== 'GET' && $method !== 'HEAD') {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
        if ($origin) {
            $oh = parse_url($origin, PHP_URL_HOST);
            $op = parse_url($origin, PHP_URL_PORT);
            $host = ($oh ?? '') . ($op ? ':' . $op : '');
            if (!$oh || strcasecmp($host, $_SERVER['HTTP_HOST'] ?? '') !== 0) {
                fail(403, 'Origem não permitida.');
            }
        }
        if (in_array($method, ['POST', 'PATCH'], true) && strpos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) {
            fail(415, 'Content-Type deve ser application/json.');
        }
    }
    if (strpos($path, '/api/admin/') === 0) {
        admin_api($method, $path);
    } else {
        player_api($method, $path);
    }
    fail(404, 'Rota não encontrada.');
} catch (Done $d) {
    // resposta já enviada ao buffer
} catch (Throwable $e) {
    error_log('escuta: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    ob_clean();
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo '{"error":"Erro interno."}';
}
ob_end_flush();
