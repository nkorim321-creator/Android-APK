/**
 * Piper Cash-out Monitor (Google Apps Script)
 *
 * Protita RDP er Tampermonkey script cash-out er data ei script e pathay.
 * Data ei Google Sheet er "Cash-outs" ar "Summary" tab e jay.
 * Web app link ta browser e khulle (sheshe ?key=PASSWORD) HTML monitor dekhay.
 *
 * Setup: README er "Cash-out monitor" ongsho dekho.
 */

// Eta bodlao. Tampermonkey menu te o ei ek-i password dibe.
const PASSWORD = 'ekta-password-dao';

const CASH_SHEET = 'Cash-outs';
const SUM_SHEET = 'Summary';
const CASH_HEAD = ['Tarikh', 'RDP', 'Account', 'Dollar', 'Status', 'Method', 'Payout ID'];
const SUM_HEAD = ['RDP', 'Account', 'Mot paid', 'Paid koyta', 'Ashche', 'Balance', 'Lifetime', 'Shesh cash-out', 'Shesh sync'];
const STALE_HOURS = 3;   // ei koto ghonta sync na hole monitor e lal dekhay
const PAID = 'DELIVERED';
const COMING = ['PENDING', 'PROCESSING', 'FLAGGED'];

// ---------------------------------------------------------------------------
// Tampermonkey script theke data ashe
// ---------------------------------------------------------------------------
function doPost(e) {
  const p = (e && e.parameter) || {};
  if (!passwordSet_()) return json_({ ok: false, error: 'Apps Script code e PASSWORD bodlao' });
  if (String(p.key || '') !== PASSWORD) return json_({ ok: false, error: 'password bhul' });

  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'data bujhi nai' });
  }
  const account = String((data && data.account) || '').trim();
  if (!account || !Array.isArray(data.payouts)) return json_({ ok: false, error: 'account ba cash-out list nai' });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);   // koyekta RDP eksathe pathale ekta ekta kore likhi
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rdp = String(data.rdp || 'RDP ??');
    saveCashouts_(ss, rdp, account, data.payouts);
    saveSummary_(ss, rdp, account, data.payouts, data.balance || null);
    return json_({ ok: true, saved: data.payouts.length });
  } finally {
    lock.releaseLock();
  }
}

function saveCashouts_(ss, rdp, account, payouts) {
  const sh = sheet_(ss, CASH_SHEET, CASH_HEAD);
  const rows = readRows_(sh, CASH_HEAD.length);
  const idCol = CASH_HEAD.indexOf('Payout ID');
  const at = new Map(rows.map((r, i) => [String(r[idCol]), i]));
  payouts.forEach((po) => {
    const id = String(po.id || '');
    if (!id) return;
    const row = [toDay_(po.day), rdp, account, Number(po.amount) || 0, String(po.statusText || po.status || ''), String(po.method || ''), id];
    if (at.has(id)) rows[at.get(id)] = row;
    else { at.set(id, rows.length); rows.push(row); }
  });
  rows.sort((a, b) => time_(b[0]) - time_(a[0]));
  writeRows_(sh, rows, CASH_HEAD.length, { 1: 'mmm d, yyyy', 4: '$#,##0.00' });
}

function saveSummary_(ss, rdp, account, payouts, balance) {
  const sh = sheet_(ss, SUM_SHEET, SUM_HEAD);
  const rows = readRows_(sh, SUM_HEAD.length);
  const sum = (arr) => Math.round(arr.reduce((t, po) => t + (Number(po.amount) || 0), 0) * 100) / 100;
  const paid = payouts.filter((po) => po.status === PAID);
  const coming = payouts.filter((po) => COMING.indexOf(po.status) >= 0);
  const days = payouts.map((po) => toDay_(po.day)).filter((d) => d instanceof Date);
  const last = days.length ? new Date(Math.max.apply(null, days.map((d) => d.getTime()))) : '';
  const bal = (k) => (balance && balance[k] != null && !isNaN(Number(balance[k])) ? Number(balance[k]) : '');
  const row = [rdp, account, sum(paid), paid.length, sum(coming), bal('available'), bal('lifetime'), last, new Date()];
  const i = rows.findIndex((r) => String(r[1]).trim().toLowerCase() === account.toLowerCase());
  if (i >= 0) rows[i] = row; else rows.push(row);
  rows.sort((a, b) => rdpNo_(a[0]) - rdpNo_(b[0]) || String(a[1]).localeCompare(String(b[1])));
  writeRows_(sh, rows, SUM_HEAD.length, { 3: '$#,##0.00', 5: '$#,##0.00', 6: '$#,##0.00', 7: '$#,##0.00', 8: 'mmm d, yyyy', 9: 'mmm d, h:mm am/pm' });
}

// ---------------------------------------------------------------------------
// Browser e monitor page
// ---------------------------------------------------------------------------
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!passwordSet_()) return page_('<p class="msg">Apps Script code er upore <b>PASSWORD</b> bodlao, tarpor notun version deploy koro.</p>');
  if (String(p.key || '') !== PASSWORD) return page_('<p class="msg">Password bhul. Link er sheshe <b>?key=tomar-password</b> dao.</p>');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const sums = readRows_(ss.getSheetByName(SUM_SHEET), SUM_HEAD.length);
  const cash = readRows_(ss.getSheetByName(CASH_SHEET), CASH_HEAD.length);
  if (!sums.length) return page_('<p class="msg">Ekhono kono data ashe nai. RDP er Tampermonkey menu theke "Cash-out sheet e ekhon pathao" dao.</p>');

  const total = (col) => sums.reduce((t, r) => t + (Number(r[col]) || 0), 0);
  const fmt = (d, f) => (d instanceof Date ? Utilities.formatDate(d, tz, f) : '');

  const cards = [
    ['Mot paid (sob ID)', money_(total(2)), total(3) + ' ta cash-out'],
    ['Ashche', money_(total(4)), 'On its way / review'],
    ['Balance (sob ID)', money_(total(5)), sums.length + ' ta ID'],
  ].map((c) => `<div class="card"><div class="label">${c[0]}</div><div class="big">${c[1]}</div><div class="muted">${c[2]}</div></div>`).join('');

  const idRows = sums.map((r) => {
    const ago = r[8] instanceof Date ? (now - r[8]) / 3600000 : Infinity;
    const stale = ago > STALE_HOURS;
    return `<tr><td><b>${esc_(r[0])}</b></td><td>${esc_(r[1])}</td><td class="num">${money_(r[2])}</td><td class="num">${esc_(r[3])}</td>`
      + `<td class="num">${Number(r[4]) ? money_(r[4]) : '–'}</td><td class="num">${r[5] === '' ? '–' : money_(r[5])}</td>`
      + `<td class="num">${r[6] === '' ? '–' : money_(r[6])}</td><td>${fmt(r[7], 'MMM d, yyyy') || '–'}</td>`
      + `<td class="${stale ? 'stale' : 'muted'}">${agoText_(ago)}${stale ? ' ⚠' : ''}</td></tr>`;
  }).join('');

  const months = {};
  cash.filter((r) => r[4] === 'Paid' && r[0] instanceof Date).forEach((r) => {
    const k = fmt(r[0], 'yyyy-MM');
    months[k] = months[k] || { label: fmt(r[0], 'MMM yyyy'), sum: 0, n: 0 };
    months[k].sum += Number(r[3]) || 0;
    months[k].n += 1;
  });
  const monthRows = Object.keys(months).sort().reverse()
    .map((k) => `<tr><td>${months[k].label}</td><td class="num">${money_(months[k].sum)}</td><td class="num">${months[k].n}</td></tr>`).join('');

  const rdps = Array.from(new Set(cash.map((r) => String(r[1])))).sort((a, b) => rdpNo_(a) - rdpNo_(b));
  const options = rdps.map((x) => `<option value="${esc_(x)}">${esc_(x)}</option>`).join('');
  const cashRows = cash.map((r) => `<tr data-rdp="${esc_(r[1])}"><td>${fmt(r[0], 'MMM d, yyyy')}</td><td><b>${esc_(r[1])}</b></td><td>${esc_(r[2])}</td>`
    + `<td class="num">${money_(r[3])}</td><td><span class="pill ${pillClass_(r[4])}">${esc_(r[4])}</span></td></tr>`).join('');

  const body = `
<header><h1>Piper Cash-out Monitor</h1><p class="muted">Update: ${fmt(now, 'MMM d, yyyy h:mm a')} · notun data dekhte page refresh koro</p></header>
<section class="cards">${cards}</section>
<h2>ID onujayi</h2>
<div class="wrap"><table><thead><tr><th>RDP</th><th>Account</th><th class="num">Mot paid</th><th class="num">Koyta</th><th class="num">Ashche</th><th class="num">Balance</th><th class="num">Lifetime</th><th>Shesh cash-out</th><th>Shesh sync</th></tr></thead><tbody>${idRows}</tbody></table></div>
${monthRows ? `<h2>Mash onujayi (Paid)</h2><div class="wrap fit"><table class="narrow"><thead><tr><th>Mash</th><th class="num">Dollar</th><th class="num">Koyta</th></tr></thead><tbody>${monthRows}</tbody></table></div>` : ''}
<div class="row"><h2>Sob cash-out</h2><select id="f" aria-label="RDP"><option value="">Sob RDP</option>${options}</select></div>
<div class="wrap"><table id="list"><thead><tr><th>Tarikh</th><th>RDP</th><th>Account</th><th class="num">Dollar</th><th>Status</th></tr></thead><tbody>${cashRows || '<tr><td colspan="5" class="muted">Ekhono kono cash-out nai</td></tr>'}</tbody></table></div>
<script>
document.getElementById('f').addEventListener('change', function (ev) {
  var v = ev.target.value;
  document.querySelectorAll('#list tbody tr[data-rdp]').forEach(function (tr) { tr.style.display = !v || tr.getAttribute('data-rdp') === v ? '' : 'none'; });
});
</script>`;
  return page_(body);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function passwordSet_() {
  return PASSWORD && PASSWORD !== 'ekta-password-dao';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_(ss, name, head) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(head);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
  }
  return sh;
}

function readRows_(sh, width) {
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues().filter((r) => r.some((v) => v !== ''));
}

function writeRows_(sh, rows, width, formats) {
  if (!rows.length) return;
  sh.getRange(2, 1, rows.length, width).setValues(rows);
  Object.keys(formats).forEach((col) => sh.getRange(2, Number(col), rows.length, 1).setNumberFormat(formats[col]));
}

// "2026-11-18" -> oi diner dupur 12 ta (time zone er karone tarikh bodlay na)
function toDay_(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0) : '';
}

function time_(d) {
  return d instanceof Date ? d.getTime() : 0;
}

function rdpNo_(s) {
  const m = /(\d+)/.exec(String(s));
  return m ? Number(m[1]) : 9999;
}

function money_(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const parts = Math.abs(v).toFixed(2).split('.');
  return (v < 0 ? '-' : '') + '$' + parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + parts[1];
}

function agoText_(hours) {
  if (!isFinite(hours)) return '–';
  if (hours < 1) return Math.max(1, Math.round(hours * 60)) + ' min age';
  if (hours < 48) return Math.round(hours) + ' ghonta age';
  return Math.round(hours / 24) + ' din age';
}

function pillClass_(status) {
  if (status === 'Paid') return 'ok';
  if (status === 'Canceled' || /go through/i.test(status)) return 'bad';
  return 'wait';
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function page_(body) {
  const css = `
:root{--bg:#f6f4ef;--card:#fff;--fg:#1d1b19;--muted:#6f6a64;--line:#e4dfd7;--ok:#2f7a3e;--okbg:#e3f1e5;--bad:#b3261e;--badbg:#fbe4e2;--wait:#7a5a00;--waitbg:#fbf0cf}
@media (prefers-color-scheme:dark){:root{--bg:#181412;--card:#231e1b;--fg:#f1eee7;--muted:#a59d94;--line:#3a332e;--ok:#9fd3a6;--okbg:#22382a;--bad:#f2a49d;--badbg:#3d2321;--wait:#e8cf86;--waitbg:#3a3220}}
*{box-sizing:border-box}body{margin:0;padding:20px 16px 40px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1000px;margin:0 auto}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 10px}
.muted{color:var(--muted)}.msg{max-width:560px;margin:60px auto;padding:20px;background:var(--card);border:1px solid var(--line);border-radius:12px}
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
select{font:inherit;padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg)}`;
  return HtmlService.createHtmlOutput(`<style>${css}</style><main>${body}</main>`)
    .setTitle('Piper Cash-out Monitor')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
