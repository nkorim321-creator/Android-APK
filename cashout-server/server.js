#!/usr/bin/env node
/*
 * Piper Cash-out Monitor server
 *
 * Protita RDP er Tampermonkey script ei server e cash-out er data pathay.
 * Browser e server er link khulle (password diye) monitor page dekhay.
 *
 * Chalao:
 *   node server.js --port 3200 --password tomar-password --admin-password admin-er-password
 *
 * --password: monitor dekhar password.
 * --admin-password: shudhu admin; cash-out "Settled" tick dite lage. Na dile tick kora jay na.
 *
 * Taka bhag (default): Worker 50%, Buyer 25%, VPS 25%.
 * Protita cash-out e $0.50 fee shudhu Worker theke kate. Buyer ar VPS puro bhag pay.
 * Bodlate chaile:  --worker 50 --buyer 25 --vps 25 --fee 0.50
 *
 * Kono npm package lage na, shudhu Node.js (16 ba notun).
 * Data ei folder er cashout-data.json file e thake.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Setting: command line (--port 3200 --password xyz) ba environment (PORT, PASSWORD)
// ---------------------------------------------------------------------------
function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const PORT = Number(arg('port') || process.env.PORT || 3200);
const PASSWORD = String(arg('password') || process.env.PASSWORD || '');
const ADMIN_PASSWORD = String(arg('admin-password') || process.env.ADMIN_PASSWORD || '');
const DATA_FILE = arg('data') || process.env.DATA_FILE || path.join(__dirname, 'cashout-data.json');
const STALE_HOURS = 3;              // ei koto ghonta data na ashle lal ⚠
const MAX_BODY = 1024 * 1024;       // 1 MB
const COMING = ['PENDING', 'PROCESSING', 'FLAGGED'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Taka bhag
function pct(name, def) {
  const v = arg(name);
  return v === undefined ? def : Number(v);
}
const SPLIT = { worker: pct('worker', 50), buyer: pct('buyer', 25), vps: pct('vps', 25), fee: pct('fee', 0.5) };
const FEE_CENTS = Math.round(SPLIT.fee * 100);

if (!PASSWORD) {
  console.error('Password dao. Jemon:  node server.js --port 3200 --password tomar-password');
  process.exit(1);
}
if (ADMIN_PASSWORD && ADMIN_PASSWORD === PASSWORD) {
  console.error('Admin password ar monitor password alada hote hobe, na hole je monitor dekhe se-o tick dite parbe.');
  process.exit(1);
}
if (['worker', 'buyer', 'vps', 'fee'].some((k) => !isFinite(SPLIT[k]) || SPLIT[k] < 0)
    || Math.abs(SPLIT.worker + SPLIT.buyer + SPLIT.vps - 100) > 1e-9) {
  console.error('Taka bhag thik na: --worker + --buyer + --vps mile 100 hote hobe, ar --fee 0 ba beshi. Ekhon: '
    + `worker ${SPLIT.worker}, buyer ${SPLIT.buyer}, vps ${SPLIT.vps}, fee ${SPLIT.fee}`);
  process.exit(1);
}
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error('Port thik na: ' + PORT);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Data (JSON file)
// ---------------------------------------------------------------------------
let db = { accounts: {}, cashouts: {} };
try {
  db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch (e) {
  if (e.code !== 'ENOENT') {
    console.error('Data file porte parchi na (' + DATA_FILE + '): ' + e.message);
    process.exit(1);
  }
}
db.accounts = db.accounts || {};
db.cashouts = db.cashouts || {};
db.settled = db.settled || {};     // cash-out id -> kokhon "Settled" tick deya hoyeche

function save() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DATA_FILE);   // adha lekha file theke bachay
}

const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const badKey = (k) => k === '__proto__' || k === 'constructor' || k === 'prototype';
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// RDP theke asha data sheet e boshai. Ek-i cash-out (id) abar ashle update hoy, duplicate hoy na.
function upsert(data) {
  const account = str(data && data.account, 60);
  if (!account || !Array.isArray(data.payouts)) throw Object.assign(new Error('account ba cash-out list nai'), { status: 400 });
  const key = account.toLowerCase();
  if (badKey(key)) throw Object.assign(new Error('account er naam thik na'), { status: 400 });
  const rdp = str(data.rdp, 30) || 'RDP ??';
  data.payouts.slice(0, 5000).forEach((p) => {
    const id = str(p && p.id, 100);
    if (!id || badKey(id)) return;
    db.cashouts[id] = {
      id, key, rdp, account,
      day: /^\d{4}-\d{2}-\d{2}$/.test(String(p.day)) ? p.day : '',
      amount: num(p.amount) || 0,
      status: str(p.status, 20),
      statusText: str(p.statusText || p.status, 40),
      method: str(p.method, 60),
    };
  });
  const b = data.balance || {};
  db.accounts[key] = {
    rdp, account,
    balance: num(b.available), pending: num(b.pending), lifetime: num(b.lifetime),
    lastSync: new Date().toISOString(),
  };
  save();
  return data.payouts.length;
}

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const PASS_HASH = sha(PASSWORD);
const keyOk = (k) => typeof k === 'string' && k.length > 0 && crypto.timingSafeEqual(sha(k), PASS_HASH);
const COOKIE = 'piper_cashout';
const COOKIE_VALUE = crypto.createHmac('sha256', PASSWORD).update('piper-cashout-monitor').digest('hex');

function cookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function cookieOk(req) {
  const c = cookies(req)[COOKIE] || '';
  return c.length === COOKIE_VALUE.length && crypto.timingSafeEqual(Buffer.from(c), Buffer.from(COOKIE_VALUE));
}

// Admin: alada password ar alada cookie. Cookie te password thake na, thake tar HMAC.
const ADMIN_HASH = ADMIN_PASSWORD ? sha(ADMIN_PASSWORD) : null;
const adminKeyOk = (k) => !!ADMIN_HASH && typeof k === 'string' && k.length > 0 && crypto.timingSafeEqual(sha(k), ADMIN_HASH);
const ADMIN_COOKIE = 'piper_admin';
const ADMIN_VALUE = ADMIN_PASSWORD ? crypto.createHmac('sha256', ADMIN_PASSWORD).update('piper-admin|' + PASSWORD).digest('hex') : '';
function adminOk(req) {
  if (!ADMIN_VALUE) return false;
  const c = cookies(req)[ADMIN_COOKIE] || '';
  return c.length === ADMIN_VALUE.length && crypto.timingSafeEqual(Buffer.from(c), Buffer.from(ADMIN_VALUE));
}
// Onno website theke admin er hoye request pathano atkay.
function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch (_) { return false; }
}

// Bhul password onekbar dile oi IP ke 15 minute atkai: monitor password e 20 bar, admin e 5 bar.
const FAIL_WINDOW = 15 * 60 * 1000;
const fails = new Map();
const adminFails = new Map();
function blocked(ip, map = fails, limit = 20) {
  const f = map.get(ip);
  if (f && Date.now() - f.since > FAIL_WINDOW) { map.delete(ip); return false; }
  return !!f && f.n >= limit;
}
function failed(ip, map = fails) {
  const f = map.get(ip);
  if (!f || Date.now() - f.since > FAIL_WINDOW) map.set(ip, { n: 1, since: Date.now() });
  else f.n += 1;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function send(res, status, body, type, extra) {
  res.writeHead(status, Object.assign({
    'Content-Type': type || 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  }, extra || {}));
  res.end(body);
}
const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8');

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('data onek boro'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const loginCookie = () => `${COOKIE}=${COOKIE_VALUE}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`;
const adminCookie = () => `${ADMIN_COOKIE}=${ADMIN_VALUE}; Path=/; Max-Age=43200; HttpOnly; SameSite=Strict`;
const clearAdminCookie = `${ADMIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function money(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const [i, d] = Math.abs(v).toFixed(2).split('.');
  return (v < 0 ? '-' : '') + '$' + i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + d;
}
function fmtDay(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : '–';
}
function agoText(hours) {
  if (!isFinite(hours)) return '–';
  if (hours < 1) return Math.max(1, Math.round(hours * 60)) + ' min ago';
  if (hours < 48) { const h = Math.round(hours); return h + (h === 1 ? ' hour ago' : ' hours ago'); }
  const d = Math.round(hours / 24);
  return d + (d === 1 ? ' day ago' : ' days ago');
}
const rdpNo = (s) => { const m = /(\d+)/.exec(String(s)); return m ? Number(m[1]) : 9999; };
const sum = (arr) => arr.reduce((t, c) => t + (Number(c.amount) || 0), 0);
const cents = (n) => money(n / 100);

// Ek cash-out er bhag, cent e. Buyer ar VPS puro bhag pay; fee shudhu Worker theke kate.
// Baki cent Worker pay, tai sob mile sob somoy cash-out er shoman hoy.
function splitCents(amount) {
  const gross = Math.round((Number(amount) || 0) * 100);
  const fee = Math.min(FEE_CENTS, gross);
  const vps = Math.round(gross * SPLIT.vps / 100);
  const buyer = Math.round(gross * SPLIT.buyer / 100);
  const worker = gross - fee - vps - buyer;
  return { gross, fee, worker, buyer, vps };
}
const addSplit = (t, s) => { ['gross', 'fee', 'worker', 'buyer', 'vps'].forEach((k) => { t[k] += s[k]; }); return t; };
const zeroSplit = () => ({ gross: 0, fee: 0, worker: 0, buyer: 0, vps: 0 });
const pillClass = (st) => (st === 'DELIVERED' ? 'ok' : st === 'CANCELED' || st === 'FAILED' ? 'bad' : 'wait');

const CSS = `
:root{--bg:#f6f4ef;--card:#fff;--fg:#1d1b19;--muted:#6f6a64;--line:#e4dfd7;--ok:#2f7a3e;--okbg:#e3f1e5;--bad:#b3261e;--badbg:#fbe4e2;--wait:#7a5a00;--waitbg:#fbf0cf;--btn:#1d1b19;--btnfg:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#181412;--card:#231e1b;--fg:#f1eee7;--muted:#a59d94;--line:#3a332e;--ok:#9fd3a6;--okbg:#22382a;--bad:#f2a49d;--badbg:#3d2321;--wait:#e8cf86;--waitbg:#3a3220;--btn:#f1eee7;--btnfg:#181412}}
*{box-sizing:border-box}body{margin:0;padding:20px 16px 40px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1200px;margin:0 auto}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 10px}a{color:inherit}
.muted{color:var(--muted)}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:18px}
@media (max-width:820px){.cards{grid-template-columns:repeat(2,1fr)}}@media (max-width:480px){.card{padding:12px}.big{font-size:22px}}@media (max-width:340px){.cards{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.label{color:var(--muted);font-size:12.5px}
.big{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;margin:2px 0}
.wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:12px}.wrap.fit{display:inline-block;max-width:100%}
table{width:100%;border-collapse:collapse;white-space:nowrap}table.narrow{width:auto;min-width:320px}
th,td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--line)}th{font-size:12px;color:var(--muted);font-weight:600}
tbody tr:last-child td{border-bottom:0}tr.total td{border-top:2px solid var(--line)}.num{text-align:right;font-variant-numeric:tabular-nums}
.stale{color:var(--bad);font-weight:600}.exp{color:var(--muted);font-style:italic}.share{font-weight:600}.pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600}
.pill.ok{background:var(--okbg);color:var(--ok)}.pill.bad{background:var(--badbg);color:var(--bad)}.pill.wait{background:var(--waitbg);color:var(--wait)}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px}.row h2{margin-bottom:10px}
select,input,button{font:inherit;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg)}
button{background:var(--btn);color:var(--btnfg);border-color:var(--btn);font-weight:600;cursor:pointer}
.login{max-width:360px;margin:12vh auto 0;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:22px}
.login form{display:flex;flex-direction:column;gap:10px;margin-top:14px}.err{color:var(--bad);margin:10px 0 0}
.links{display:flex;gap:14px;align-items:center;white-space:nowrap}.admin{color:var(--ok);font-weight:700}
.filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center}tr.done td{opacity:.55}
.tick{display:inline-flex;gap:6px;align-items:center;cursor:pointer}.tick input{width:18px;height:18px;padding:0;margin:0;accent-color:var(--ok);cursor:pointer}`;

function page(title, body, refresh) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`
    + (refresh ? '<meta http-equiv="refresh" content="60">' : '')
    + `<meta name="robots" content="noindex"><title>${esc(title)}</title><style>${CSS}</style></head><body><main>${body}</main></body></html>`;
}

function loginPage(error) {
  return page('Piper Cash-out Monitor', `<div class="login"><h1>Piper Cash-out Monitor</h1><p class="muted">Enter your password</p>
<form method="post" action="/login"><input type="password" name="password" autocomplete="current-password" autofocus required aria-label="Password"><button type="submit">Login</button></form>
${error ? `<p class="err">${esc(error)}</p>` : ''}</div>`);
}

function adminLoginPage(error) {
  return page('Admin login', `<div class="login"><h1>Admin login</h1><p class="muted">Admin can mark cash-outs as settled.</p>
<form method="post" action="/admin/login"><input type="password" name="password" autocomplete="off" autofocus required aria-label="Admin password"><button type="submit">Login</button></form>
${error ? `<p class="err">${esc(error)}</p>` : ''}<p><a class="muted" href="/">Back to monitor</a></p></div>`);
}

function monitorPage(isAdmin) {
  const now = Date.now();
  const all = Object.values(db.cashouts).map((c) => Object.assign({}, c, {
    split: c.status === 'DELIVERED' || COMING.includes(c.status) ? splitCents(c.amount) : null,
    settledAt: c.status === 'DELIVERED' && has(db.settled, c.id) ? db.settled[c.id] : '',
  }));
  const isOpen = (c) => c.status === 'DELIVERED' && !c.settledAt;   // paid, kintu ekhono bhag kore deya hoy nai
  const accounts = Object.entries(db.accounts).map(([key, a]) => {
    const list = all.filter((c) => c.key === key);
    const open = list.filter(isOpen);
    const coming = list.filter((c) => COMING.includes(c.status));
    return Object.assign({}, a, {
      openN: open.length, comingSum: sum(coming),
      split: open.reduce((t, c) => addSplit(t, c.split), zeroSplit()),
      settled: list.filter((c) => c.settledAt).reduce((t, c) => t + c.split.gross, 0),
      last: list.map((c) => c.day).filter(Boolean).sort().pop() || '',
      ago: a.lastSync ? (now - Date.parse(a.lastSync)) / 3600000 : Infinity,
    });
  }).sort((x, y) => rdpNo(x.rdp) - rdpNo(y.rdp) || x.account.localeCompare(y.account));

  const links = (ADMIN_PASSWORD ? (isAdmin
    ? '<span class="admin">Admin</span><a class="muted" href="/admin/logout">Exit admin</a>'
    : '<a class="muted" href="/admin">Admin login</a>') : '') + '<a class="muted" href="/logout">Logout</a>';

  if (!accounts.length) {
    return page('Piper Cash-out Monitor', `<div class="top"><h1>Piper Cash-out Monitor</h1><div class="links">${links}</div></div><p class="muted">No data yet. On each RDP, open piperpays.com, open the userscript menu (Tampermonkey or Violentmonkey) and click "💵 Cash-out monitor link set koro". Enter this server's address and password.</p>`, true);
  }

  const T = accounts.reduce((t, a) => addSplit(t, a.split), zeroSplit());
  const openN = accounts.reduce((t, a) => t + a.openN, 0);
  const settledAll = accounts.reduce((t, a) => t + a.settled, 0);
  const balance = accounts.reduce((t, a) => t + (Number(a.balance) || 0), 0);
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const cards = [
    ['To settle (all accounts)', cents(T.gross), plural(openN, 'cash-out', 'cash-outs') + ' · ' + cents(settledAll) + ' settled'],
    [`Worker to pay (${SPLIT.worker}%)`, cents(T.worker), `After the ${cents(FEE_CENTS)} fee per cash-out`],
    [`Buyer to pay (${SPLIT.buyer}%)`, cents(T.buyer), 'Full share, no fee'],
    [`VPS to pay (${SPLIT.vps}%)`, cents(T.vps), 'Full share, no fee'],
    ['On the way', money(accounts.reduce((t, a) => t + a.comingSum, 0)), 'Not split until paid'],
    ['Balance (all accounts)', money(balance), plural(accounts.length, 'account', 'accounts')],
  ].map((c) => `<div class="card"><div class="label">${c[0]}</div><div class="big">${c[1]}</div><div class="muted">${c[2]}</div></div>`).join('');

  const splitTds = (sp, cls) => ['fee', 'worker', 'buyer', 'vps']
    .map((k) => `<td class="num${k === 'fee' ? '' : ' share'}${cls ? ' ' + cls : ''}">${sp ? cents(sp[k]) : '–'}</td>`).join('');
  const SPLIT_TH = `<th class="num">Fee</th><th class="num">Worker</th><th class="num">Buyer</th><th class="num">VPS</th>`;

  const idRows = accounts.map((a) => {
    const stale = a.ago > STALE_HOURS;
    return `<tr><td><b>${esc(a.rdp)}</b></td><td>${esc(a.account)}</td><td class="num">${cents(a.split.gross)}</td><td class="num">${a.openN}</td>`
      + splitTds(a.openN ? a.split : null)
      + `<td class="num">${a.settled ? cents(a.settled) : '–'}</td>`
      + `<td class="num">${a.comingSum ? money(a.comingSum) : '–'}</td><td class="num">${a.balance == null ? '–' : money(a.balance)}</td>`
      + `<td>${fmtDay(a.last)}</td>`
      + `<td class="${stale ? 'stale' : 'muted'}" title="${esc(a.lastSync || '')}">${agoText(a.ago)}${stale ? ' ⚠' : ''}</td></tr>`;
  }).join('');
  const idTotal = `<tr class="total"><td colspan="2"><b>Total</b></td><td class="num"><b>${cents(T.gross)}</b></td><td class="num"><b>${openN}</b></td>`
    + ['fee', 'worker', 'buyer', 'vps'].map((k) => `<td class="num"><b>${cents(T[k])}</b></td>`).join('')
    + `<td class="num"><b>${cents(settledAll)}</b></td><td colspan="4"></td></tr>`;

  const months = {};
  all.filter((c) => c.status === 'DELIVERED' && c.day).forEach((c) => {
    const k = c.day.slice(0, 7);
    months[k] = months[k] || Object.assign(zeroSplit(), { n: 0 });
    addSplit(months[k], c.split);
    months[k].n += 1;
  });
  const monthRows = Object.keys(months).sort().reverse().map((k) => {
    const [y, m] = k.split('-');
    return `<tr><td>${MONTHS[Number(m) - 1]} ${y}</td><td class="num">${cents(months[k].gross)}</td><td class="num">${months[k].n}</td>${splitTds(months[k])}</tr>`;
  }).join('');

  const shortDay = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : `${MONTHS[d.getMonth()]} ${d.getDate()}`; };
  const settleCell = (c) => {
    if (c.status !== 'DELIVERED') return '<td class="muted">–</td>';
    if (isAdmin) {
      return `<td><label class="tick"><input type="checkbox" class="settle" data-id="${esc(c.id)}"${c.settledAt ? ' checked' : ''} aria-label="Settled">`
        + `<span class="muted">${c.settledAt ? shortDay(c.settledAt) : ''}</span></label></td>`;
    }
    return c.settledAt ? `<td><span class="pill ok">✓ ${shortDay(c.settledAt)}</span></td>` : '<td class="muted">Not yet</td>';
  };
  const list = all.slice().sort((x, y) => (y.day || '').localeCompare(x.day || '') || rdpNo(x.rdp) - rdpNo(y.rdp));
  const rdps = Array.from(new Set(list.map((c) => c.rdp))).sort((x, y) => rdpNo(x) - rdpNo(y));
  const options = rdps.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
  const cashRows = list.map((c) => `<tr data-rdp="${esc(c.rdp)}" data-state="${c.settledAt ? 'done' : isOpen(c) ? 'open' : ''}"${c.settledAt ? ' class="done"' : ''}>`
    + `<td>${fmtDay(c.day)}</td><td><b>${esc(c.rdp)}</b></td><td>${esc(c.account)}</td>`
    + `<td class="num">${money(c.amount)}</td>${splitTds(c.split, c.status === 'DELIVERED' ? '' : 'exp')}`
    + `<td><span class="pill ${pillClass(c.status)}">${esc(c.statusText)}</span></td>${settleCell(c)}</tr>`).join('');

  const rule = `Split: Worker ${SPLIT.worker}% · Buyer ${SPLIT.buyer}% · VPS ${SPLIT.vps}% · ${cents(FEE_CENTS)} fee per cash-out, taken from Worker only`;
  const adminJs = !isAdmin ? '' : `
  function save(ids, settled) {
    document.querySelectorAll('input.settle, #bulk').forEach(function (x) { x.disabled = true; });
    fetch('/api/settle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ids, settled: settled }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status)); }); })
      .then(function () { location.reload(); })
      .catch(function (e) { alert('Could not save: ' + e.message); location.reload(); });
  }
  document.querySelectorAll('input.settle').forEach(function (cb) {
    cb.addEventListener('change', function () { save([cb.getAttribute('data-id')], cb.checked); });
  });
  document.getElementById('bulk').addEventListener('click', function () {
    var ids = [];
    document.querySelectorAll('#list tbody tr').forEach(function (tr) {
      var cb = tr.querySelector('input.settle');
      if (cb && !cb.checked && tr.style.display !== 'none') ids.push(cb.getAttribute('data-id'));
    });
    if (!ids.length) { alert('Nothing to mark. All shown paid cash-outs are already settled.'); return; }
    if (confirm('Mark ' + ids.length + ' shown cash-out' + (ids.length === 1 ? '' : 's') + ' as settled?')) save(ids, true);
  });`;
  const body = `
<div class="top"><div><h1>Piper Cash-out Monitor</h1><p class="muted">${esc(rule)}<br>Settled cash-outs are not counted in the amounts to pay. Refreshes automatically every minute.</p></div><div class="links">${links}</div></div>
<section class="cards">${cards}</section>
<h2>By account (to settle)</h2>
<div class="wrap"><table><thead><tr><th>RDP</th><th>Account</th><th class="num">To settle</th><th class="num">Count</th>${SPLIT_TH}<th class="num">Settled</th><th class="num">On the way</th><th class="num">Balance</th><th>Last cash-out</th><th>Last sync</th></tr></thead><tbody>${idRows}${accounts.length > 1 ? idTotal : ''}</tbody></table></div>
${monthRows ? `<h2>By month (all paid, settled or not)</h2><div class="wrap fit"><table class="narrow"><thead><tr><th>Month</th><th class="num">Paid</th><th class="num">Count</th>${SPLIT_TH}</tr></thead><tbody>${monthRows}</tbody></table></div>` : ''}
<div class="row"><h2>All cash-outs</h2><div class="filters">${isAdmin ? '<button type="button" id="bulk">Mark shown as settled</button>' : ''}<select id="s" aria-label="Settled"><option value="">All cash-outs</option><option value="open">Not settled</option><option value="done">Settled</option></select><select id="f" aria-label="RDP"><option value="">All RDPs</option>${options}</select></div></div>
<div class="wrap"><table id="list"><thead><tr><th>Date</th><th>RDP</th><th>Account</th><th class="num">Amount</th>${SPLIT_TH}<th>Status</th><th>Settled</th></tr></thead><tbody>${cashRows || '<tr><td colspan="10" class="muted">No cash-outs yet</td></tr>'}</tbody></table></div>
<p class="muted">Italic amounts are not paid yet. Canceled and failed cash-outs are not split.${isAdmin ? ' Tick a paid cash-out once you have paid Worker, Buyer and VPS for it.' : ''}</p>
<script>
(function () {
  var f = document.getElementById('f'), st = document.getElementById('s');
  function apply() {
    var v = f.value, w = st.value;
    document.querySelectorAll('#list tbody tr[data-rdp]').forEach(function (tr) {
      var show = (!v || tr.getAttribute('data-rdp') === v) && (!w || tr.getAttribute('data-state') === w);
      tr.style.display = show ? '' : 'none';
    });
  }
  function restore(el, key) {
    try { var saved = localStorage.getItem(key); if (saved !== null && el.querySelector('option[value="' + saved.replace(/"/g, '') + '"]')) el.value = saved; } catch (e) {}
    el.addEventListener('change', function () { try { localStorage.setItem(key, el.value); } catch (e) {} apply(); });
  }
  restore(f, 'rdpFilter');
  restore(st, 'settledFilter');
  apply();${adminJs}
})();
</script>`;
  return page('Piper Cash-out Monitor', body, true);
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = req.socket.remoteAddress || '';
  try {
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, 'ok', 'text/plain; charset=utf-8');

    // RDP er Tampermonkey script data pathay
    if (req.method === 'POST' && url.pathname === '/api/cashouts') {
      if (blocked(ip)) return sendJson(res, 429, { ok: false, error: 'onekbar bhul password, 15 minute por try koro' });
      if (!keyOk(req.headers['x-monitor-key'])) { failed(ip); return sendJson(res, 401, { ok: false, error: 'password bhul' }); }
      let data;
      try { data = JSON.parse(await readBody(req)); } catch (e) {
        if (e.status) throw e;
        return sendJson(res, 400, { ok: false, error: 'data bujhi nai' });
      }
      const n = upsert(data);
      console.log(new Date().toISOString(), str(data.rdp, 30), str(data.account, 60) + ':', n, 'ta cash-out');
      return sendJson(res, 200, { ok: true, saved: n });
    }

    if (req.method === 'POST' && url.pathname === '/login') {
      if (blocked(ip)) return send(res, 429, loginPage('Too many wrong attempts. Try again in 15 minutes.'));
      const pw = new URLSearchParams(await readBody(req)).get('password') || '';
      if (!keyOk(pw)) { failed(ip); return send(res, 401, loginPage('Wrong password')); }
      return send(res, 303, '', 'text/plain', { Location: '/', 'Set-Cookie': loginCookie() });
    }

    if (req.method === 'GET' && url.pathname === '/logout') {
      return send(res, 303, '', 'text/plain', { Location: '/', 'Set-Cookie': [`${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`, clearAdminCookie] });
    }

    // Admin: shudhu admin password diye "Settled" tick deya jay
    if (url.pathname === '/admin' && req.method === 'GET') {
      if (!cookieOk(req) || !ADMIN_PASSWORD) return send(res, 303, '', 'text/plain', { Location: '/' });
      return send(res, 200, adminLoginPage(''));
    }
    if (url.pathname === '/admin/login' && req.method === 'POST') {
      if (!cookieOk(req) || !ADMIN_PASSWORD) return send(res, 303, '', 'text/plain', { Location: '/' });
      if (blocked(ip, adminFails, 5)) return send(res, 429, adminLoginPage('Too many wrong attempts. Try again in 15 minutes.'));
      const pw = new URLSearchParams(await readBody(req)).get('password') || '';
      if (!adminKeyOk(pw)) { failed(ip, adminFails); return send(res, 401, adminLoginPage('Wrong admin password')); }
      console.log(new Date().toISOString(), 'admin login', ip);
      return send(res, 303, '', 'text/plain', { Location: '/', 'Set-Cookie': adminCookie() });
    }
    if (url.pathname === '/admin/logout' && req.method === 'GET') {
      return send(res, 303, '', 'text/plain', { Location: '/', 'Set-Cookie': clearAdminCookie });
    }
    if (url.pathname === '/api/settle' && req.method === 'POST') {
      if (!adminOk(req) || !cookieOk(req)) return sendJson(res, 403, { ok: false, error: 'Admin only' });
      if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'Bad origin' });
      let data;
      try { data = JSON.parse(await readBody(req)); } catch (e) {
        if (e.status) throw e;
        return sendJson(res, 400, { ok: false, error: 'Bad data' });
      }
      const ids = Array.isArray(data && data.ids) ? data.ids.slice(0, 5000).map((x) => String(x)) : [];
      if (!ids.length || typeof data.settled !== 'boolean') return sendJson(res, 400, { ok: false, error: 'Bad data' });
      const at = new Date().toISOString();
      let changed = 0;
      ids.forEach((id) => {
        if (badKey(id) || !has(db.cashouts, id) || db.cashouts[id].status !== 'DELIVERED') return;
        if (data.settled && !has(db.settled, id)) { db.settled[id] = at; changed++; }
        if (!data.settled && has(db.settled, id)) { delete db.settled[id]; changed++; }
      });
      if (changed) save();
      console.log(at, data.settled ? 'settled' : 'unsettled', changed, 'ta cash-out');
      return sendJson(res, 200, { ok: true, changed });
    }

    if (req.method === 'GET' && url.pathname === '/') {
      // http://server:port/?key=password link o chole
      if (url.searchParams.has('key')) {
        if (blocked(ip)) return send(res, 429, loginPage('Too many wrong attempts. Try again in 15 minutes.'));
        if (keyOk(url.searchParams.get('key'))) return send(res, 303, '', 'text/plain', { Location: '/', 'Set-Cookie': loginCookie() });
        failed(ip);
        return send(res, 401, loginPage('Wrong password'));
      }
      if (!cookieOk(req)) return send(res, 200, loginPage(''));
      return send(res, 200, monitorPage(adminOk(req)));
    }

    if (req.method === 'GET' && url.pathname === '/api/data') {
      if (!cookieOk(req) && !keyOk(req.headers['x-monitor-key'])) return sendJson(res, 401, { ok: false, error: 'password bhul' });
      return sendJson(res, 200, db);
    }

    return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) sendJson(res, status, { ok: false, error: status === 500 ? 'server e somossa' : e.message });
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} e already onno kichu cholche (jemon BP monitor). Onno port dao, jemon: --port ${PORT + 1}`);
  else console.error('Server chalu hoy nai: ' + e.message);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Piper Cash-out Monitor cholche: http://0.0.0.0:${PORT}  (data: ${DATA_FILE})`);
  console.log(`Taka bhag: Worker ${SPLIT.worker}%, Buyer ${SPLIT.buyer}%, VPS ${SPLIT.vps}%, fee $${(FEE_CENTS / 100).toFixed(2)} (shudhu Worker theke)`);
  console.log(ADMIN_PASSWORD ? 'Admin: chalu (admin password diye Settled tick deya jabe)' : 'Admin: bondho (--admin-password na dile Settled tick deya jabe na)');
});
