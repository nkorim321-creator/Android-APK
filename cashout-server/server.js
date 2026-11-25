#!/usr/bin/env node
/*
 * Piper Cash-out Monitor server
 *
 * Protita RDP er Tampermonkey script ei server e cash-out er data pathay.
 * Browser e server er link khulle (password diye) monitor page dekhay.
 *
 * Chalao:
 *   node server.js --port 3200 --password tomar-password
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
const DATA_FILE = arg('data') || process.env.DATA_FILE || path.join(__dirname, 'cashout-data.json');
const STALE_HOURS = 3;              // ei koto ghonta data na ashle lal ⚠
const MAX_BODY = 1024 * 1024;       // 1 MB
const COMING = ['PENDING', 'PROCESSING', 'FLAGGED'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

if (!PASSWORD) {
  console.error('Password dao. Jemon:  node server.js --port 3200 --password tomar-password');
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

function save() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DATA_FILE);   // adha lekha file theke bachay
}

const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

// RDP theke asha data sheet e boshai. Ek-i cash-out (id) abar ashle update hoy, duplicate hoy na.
function upsert(data) {
  const account = str(data && data.account, 60);
  if (!account || !Array.isArray(data.payouts)) throw Object.assign(new Error('account ba cash-out list nai'), { status: 400 });
  const key = account.toLowerCase();
  const rdp = str(data.rdp, 30) || 'RDP ??';
  data.payouts.slice(0, 5000).forEach((p) => {
    const id = str(p && p.id, 100);
    if (!id) return;
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

// Bhul password onekbar dile (15 minute e 20 bar) oi IP ke kichukkhon atkai.
const fails = new Map();
const FAIL_WINDOW = 15 * 60 * 1000;
function blocked(ip) {
  const f = fails.get(ip);
  if (f && Date.now() - f.since > FAIL_WINDOW) { fails.delete(ip); return false; }
  return !!f && f.n >= 20;
}
function failed(ip) {
  const f = fails.get(ip);
  if (!f || Date.now() - f.since > FAIL_WINDOW) fails.set(ip, { n: 1, since: Date.now() });
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
const pillClass = (st) => (st === 'DELIVERED' ? 'ok' : st === 'CANCELED' || st === 'FAILED' ? 'bad' : 'wait');

const CSS = `
:root{--bg:#f6f4ef;--card:#fff;--fg:#1d1b19;--muted:#6f6a64;--line:#e4dfd7;--ok:#2f7a3e;--okbg:#e3f1e5;--bad:#b3261e;--badbg:#fbe4e2;--wait:#7a5a00;--waitbg:#fbf0cf;--btn:#1d1b19;--btnfg:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#181412;--card:#231e1b;--fg:#f1eee7;--muted:#a59d94;--line:#3a332e;--ok:#9fd3a6;--okbg:#22382a;--bad:#f2a49d;--badbg:#3d2321;--wait:#e8cf86;--waitbg:#3a3220;--btn:#f1eee7;--btnfg:#181412}}
*{box-sizing:border-box}body{margin:0;padding:20px 16px 40px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1000px;margin:0 auto}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 10px}a{color:inherit}
.muted{color:var(--muted)}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.label{color:var(--muted);font-size:12.5px}
.big{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;margin:2px 0}
.wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:12px}.wrap.fit{display:inline-block;max-width:100%}
table{width:100%;border-collapse:collapse;white-space:nowrap}table.narrow{width:auto;min-width:320px}
th,td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--line)}th{font-size:12px;color:var(--muted);font-weight:600}
tbody tr:last-child td{border-bottom:0}.num{text-align:right;font-variant-numeric:tabular-nums}
.stale{color:var(--bad);font-weight:600}.pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600}
.pill.ok{background:var(--okbg);color:var(--ok)}.pill.bad{background:var(--badbg);color:var(--bad)}.pill.wait{background:var(--waitbg);color:var(--wait)}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px}.row h2{margin-bottom:10px}
select,input,button{font:inherit;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg)}
button{background:var(--btn);color:var(--btnfg);border-color:var(--btn);font-weight:600;cursor:pointer}
.login{max-width:360px;margin:12vh auto 0;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:22px}
.login form{display:flex;flex-direction:column;gap:10px;margin-top:14px}.err{color:var(--bad);margin:10px 0 0}`;

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

function monitorPage() {
  const now = Date.now();
  const all = Object.values(db.cashouts);
  const accounts = Object.entries(db.accounts).map(([key, a]) => {
    const list = all.filter((c) => c.key === key);
    const paid = list.filter((c) => c.status === 'DELIVERED');
    const coming = list.filter((c) => COMING.includes(c.status));
    return Object.assign({}, a, {
      paidSum: sum(paid), paidN: paid.length, comingSum: sum(coming),
      last: list.map((c) => c.day).filter(Boolean).sort().pop() || '',
      ago: a.lastSync ? (now - Date.parse(a.lastSync)) / 3600000 : Infinity,
    });
  }).sort((x, y) => rdpNo(x.rdp) - rdpNo(y.rdp) || x.account.localeCompare(y.account));

  if (!accounts.length) {
    return page('Piper Cash-out Monitor', `<h1>Piper Cash-out Monitor</h1><p class="muted">No data yet. On each RDP, open piperpays.com, open the userscript menu (Tampermonkey or Violentmonkey) and click "💵 Cash-out monitor link set koro". Enter this server's address and password.</p><p><a href="/logout">Logout</a></p>`, true);
  }

  const tot = (f) => accounts.reduce((t, a) => t + (Number(a[f]) || 0), 0);
  const cards = [
    ['Total paid (all accounts)', money(tot('paidSum')), tot('paidN') + (tot('paidN') === 1 ? ' cash-out' : ' cash-outs')],
    ['On the way', money(tot('comingSum')), 'On its way / under review'],
    ['Balance (all accounts)', money(tot('balance')), accounts.length + (accounts.length === 1 ? ' account' : ' accounts')],
  ].map((c) => `<div class="card"><div class="label">${c[0]}</div><div class="big">${c[1]}</div><div class="muted">${c[2]}</div></div>`).join('');

  const idRows = accounts.map((a) => {
    const stale = a.ago > STALE_HOURS;
    return `<tr><td><b>${esc(a.rdp)}</b></td><td>${esc(a.account)}</td><td class="num">${money(a.paidSum)}</td><td class="num">${a.paidN}</td>`
      + `<td class="num">${a.comingSum ? money(a.comingSum) : '–'}</td><td class="num">${a.balance == null ? '–' : money(a.balance)}</td>`
      + `<td class="num">${a.lifetime == null ? '–' : money(a.lifetime)}</td><td>${fmtDay(a.last)}</td>`
      + `<td class="${stale ? 'stale' : 'muted'}" title="${esc(a.lastSync || '')}">${agoText(a.ago)}${stale ? ' ⚠' : ''}</td></tr>`;
  }).join('');

  const months = {};
  all.filter((c) => c.status === 'DELIVERED' && c.day).forEach((c) => {
    const k = c.day.slice(0, 7);
    months[k] = months[k] || { sum: 0, n: 0 };
    months[k].sum += Number(c.amount) || 0;
    months[k].n += 1;
  });
  const monthRows = Object.keys(months).sort().reverse().map((k) => {
    const [y, m] = k.split('-');
    return `<tr><td>${MONTHS[Number(m) - 1]} ${y}</td><td class="num">${money(months[k].sum)}</td><td class="num">${months[k].n}</td></tr>`;
  }).join('');

  const list = all.slice().sort((x, y) => (y.day || '').localeCompare(x.day || '') || rdpNo(x.rdp) - rdpNo(y.rdp));
  const rdps = Array.from(new Set(list.map((c) => c.rdp))).sort((x, y) => rdpNo(x) - rdpNo(y));
  const options = rdps.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
  const cashRows = list.map((c) => `<tr data-rdp="${esc(c.rdp)}"><td>${fmtDay(c.day)}</td><td><b>${esc(c.rdp)}</b></td><td>${esc(c.account)}</td>`
    + `<td class="num">${money(c.amount)}</td><td><span class="pill ${pillClass(c.status)}">${esc(c.statusText)}</span></td></tr>`).join('');

  const body = `
<div class="top"><div><h1>Piper Cash-out Monitor</h1><p class="muted">Refreshes automatically every minute</p></div><a class="muted" href="/logout">Logout</a></div>
<section class="cards">${cards}</section>
<h2>By account</h2>
<div class="wrap"><table><thead><tr><th>RDP</th><th>Account</th><th class="num">Total paid</th><th class="num">Count</th><th class="num">On the way</th><th class="num">Balance</th><th class="num">Lifetime</th><th>Last cash-out</th><th>Last sync</th></tr></thead><tbody>${idRows}</tbody></table></div>
${monthRows ? `<h2>By month (paid)</h2><div class="wrap fit"><table class="narrow"><thead><tr><th>Month</th><th class="num">Amount</th><th class="num">Count</th></tr></thead><tbody>${monthRows}</tbody></table></div>` : ''}
<div class="row"><h2>All cash-outs</h2><select id="f" aria-label="RDP"><option value="">All RDPs</option>${options}</select></div>
<div class="wrap"><table id="list"><thead><tr><th>Date</th><th>RDP</th><th>Account</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>${cashRows || '<tr><td colspan="5" class="muted">No cash-outs yet</td></tr>'}</tbody></table></div>
<script>
(function () {
  var f = document.getElementById('f');
  function apply() {
    var v = f.value;
    document.querySelectorAll('#list tbody tr[data-rdp]').forEach(function (tr) { tr.style.display = !v || tr.getAttribute('data-rdp') === v ? '' : 'none'; });
  }
  try { var saved = localStorage.getItem('rdpFilter'); if (saved && f.querySelector('option[value="' + saved.replace(/"/g, '') + '"]')) f.value = saved; } catch (e) {}
  apply();
  f.addEventListener('change', function () { try { localStorage.setItem('rdpFilter', f.value); } catch (e) {} apply(); });
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
      return send(res, 303, '', 'text/plain', { Location: '/', 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax` });
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
      return send(res, 200, monitorPage());
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
});
