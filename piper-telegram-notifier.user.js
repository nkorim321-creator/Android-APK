// ==UserScript==
// @name         Piper Telegram Notifier
// @namespace    https://github.com/nkorim321-creator/android-apk
// @version      3.3.0
// @description  Piper dashboard e notun survey (hit) available hole Telegram e RDP number, title, pay ar time pathay. Je account jar, message tar kache jay. Cash-out er hisab Google Sheet monitor e pathay.
// @match        https://www.piperpays.com/*
// @match        https://piperpays.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @connect      api.telegram.org
// @connect      api.piperpays.com
// @connect      script.google.com
// @connect      script.googleusercontent.com
// ==/UserScript==

(function () {
  'use strict';

  // ===========================================================================
  // Code e kichu bodlate hobe na. Sob kichu Tampermonkey menu theke set hoy:
  //   1. Telegram bot token set koro
  //   2. Account add koro:  PiperNaam,RDP,User,ChatID   jemon  Rhonda,1,Navid,6405530876
  //   3. Admin chat ID set koro (sob RDP er kaj pabe)
  //   💵 Cash-out sheet link set koro (cash-out er alada monitor, Telegram e jay na)
  // Egulo Tampermonkey e save thake, script update korleo muche jay na.
  // ===========================================================================

  const API_BASE = 'https://api.piperpays.com';          // Piper er nijer API
  const CAMPAIGNS_PATH = '/campaigns?status=all';         // dashboard eta-i call kore
  const AVAILABLE_STATUS = 'ASSIGNED';                    // "Available" tab = ASSIGNED
  const ACCESS_TOKEN_KEY = 'access_token';                // site er localStorage key
  const DASHBOARD_URL = 'https://www.piperpays.com/dashboard';
  const MAX_SEEN = 1000;
  const ERROR_ALERT_GAP_MS = 30 * 60 * 1000;              // error hole Telegram e 30 min e ekbar janabe
  const TG_MAX_CHARS = 3500;                              // Telegram er limit 4096, ektu kom rakhi
  const CHAT_ID_RE = /^-?\d{4,}$/;

  // Cash-out monitor: Earnings page er "Cash-outs" list ar balance pore Google Sheet e pathay.
  // Cash-out request (POST /payouts) ba "Redeem your reward" script kokhono chape na.
  const PAYOUTS_PATH = '/payouts';
  const BALANCE_PATH = '/earnings/balance';
  const CASHOUT_GAP_MIN = [45, 90];                       // ei koto minute por por sheet e pathay
  const CASHOUT_RETRY_MIN = [10, 15];                     // fail hole abar try
  // Piper site e je lekha dekhay
  const PAYOUT_STATUS = {
    PENDING: 'On its way', PROCESSING: 'On its way', DELIVERED: 'Paid',
    FLAGGED: 'Under review', CANCELED: 'Canceled', FAILED: 'Didn’t go through',
  };
  const PAYOUT_METHOD = { GIFT_CARD: 'Gift card', CASH: 'PayPal, Venmo or bank' };

  const cfg = {
    get botToken() { return GM_getValue('botToken', ''); },
    // [{ name: 'Rhonda', rdp: '1', to: [{ user: 'Navid', id: '6405530876' }] }]
    get accounts() {
      const list = GM_getValue('accounts', []);
      return Array.isArray(list) ? list.filter((a) => a && a.name && a.rdp && Array.isArray(a.to)) : [];
    },
    set accounts(list) { GM_setValue('accounts', list); },
    // Ei chat ID gulo sob RDP er kaj pay.
    get admins() {
      const list = GM_getValue('adminChats', []);
      return Array.isArray(list) ? list.map(String).filter((x) => CHAT_ID_RE.test(x)) : [];
    },
    set admins(list) { GM_setValue('adminChats', list); },
    // Purono version (2.x) e menu diye add kora chat list. Kono account/admin set na thakle eta-i use hoy.
    get oldChats() {
      const list = GM_getValue('chats', null);
      if (Array.isArray(list)) return list;
      const old = GM_getValue('chatId', '');
      return old ? [{ id: String(old), name: '' }] : [];
    },
    // Protibar check er majhe random somoy: minSec theke maxSec er moddhe je kono second.
    get minSec() { return Math.max(30, Number(GM_getValue('minSec', 60)) || 60); },
    get maxSec() { return Math.max(this.minSec, Number(GM_getValue('maxSec', 300)) || 300); },
    get desktopNotify() { return GM_getValue('desktopNotify', true); },
    // Cash-out monitor: Apps Script er web app link ar password
    get sheetUrl() { return GM_getValue('sheetUrl', ''); },
    get sheetKey() { return GM_getValue('sheetKey', ''); },
  };

  // ---------------------------------------------------------------------------
  // HTTP (Tampermonkey er nijer request, tai browser er CORS block e atkay na)
  // ---------------------------------------------------------------------------
  function gmRequest(opts) {
    // Error e shudhu site er naam dei. Puro URL dile Telegram bot token ber hoye jay.
    let where = 'request';
    try { where = new URL(opts.url).host; } catch (_) { /* ignore */ }
    const fail = (what) => Object.assign(new Error(what + ': ' + where), { network: true });
    return new Promise((resolve, reject) => {
      // Kono karone uttor na ashle o jeno check chirotore atke na thake.
      const guard = setTimeout(() => reject(fail('kono uttor nai')), (opts.timeout || 20000) + 10000);
      const done = (fn, v) => { clearTimeout(guard); fn(v); };
      GM_xmlhttpRequest({
        timeout: 20000,
        ...opts,
        onload: (r) => done(resolve, r),
        onerror: () => done(reject, fail('network error')),
        ontimeout: () => done(reject, fail('timeout')),
        onabort: () => done(reject, fail('request bondho hoye geche')),
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const cut = (s, n) => (String(s).length > n ? String(s).slice(0, n - 3) + '...' : String(s));
  const fmtMin = (sec) => String(Math.round(sec / 6) / 10);
  // Kono lekha te jeno bot token na thake (page, alert ba Telegram e jawar age).
  const safe = (s) => { const t = cfg.botToken; return t ? String(s).split(t).join('***') : String(s); };
  // Page theke pora survey er id thake na, tai title + pay + time diye chini.
  const contentKey = (s) => 'k:' + norm(s.title) + '|' + money(s.reward) + '|' + (s.minutes ?? '');
  const countKeys = (list) => {
    const m = {};
    list.forEach((s) => { const k = contentKey(s); m[k] = (m[k] || 0) + 1; });
    return m;
  };

  function tokenExpiresSoon(token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload.exp === 'number' && payload.exp * 1000 - 30000 <= Date.now();
    } catch (_) {
      return false;
    }
  }

  // Page e chhoto status label, jate bojha jay script cholche.
  let pill;
  function status(text, isError) {
    if (!document.body) return;
    if (!pill || !pill.isConnected) {
      pill = document.createElement('div');
      pill.id = 'piper-tg-notifier';
      Object.assign(pill.style, {
        position: 'fixed', left: '12px', bottom: '84px', zIndex: 2147483647,
        font: '12px/1.3 system-ui, sans-serif', padding: '6px 10px', borderRadius: '999px',
        background: 'rgba(20,20,20,.9)', color: '#fff', pointerEvents: 'none',
        maxWidth: 'calc(100vw - 24px)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        boxShadow: '0 2px 8px rgba(0,0,0,.4)',
      });
      document.body.appendChild(pill);
    }
    pill.style.background = isError ? 'rgba(170,30,30,.95)' : 'rgba(20,20,20,.9)';
    pill.textContent = '📲 TG Notifier: ' + safe(text);
  }

  // ---------------------------------------------------------------------------
  // Account list: kon Piper account kon RDP te, ar tar kaj kar Telegram e jabe
  // ---------------------------------------------------------------------------
  const rdpText = (r) => 'RDP ' + (/^\d$/.test(String(r)) ? '0' + r : r);
  const chatLabel = (c) => (c.name ? c.name + ' (' + c.id + ')' : String(c.id));
  const toText = (a) => (a.to.length ? a.to.map((t) => t.user + ' (' + t.id + ')').join(', ') : '(shudhu admin)');
  const accountLine = (a) => [a.name, a.rdp, ...a.to.flatMap((t) => [t.user, t.id])].join(',');
  const accountRow = (a) => a.name + ' · ' + rdpText(a.rdp) + '  →  ' + toText(a);

  // "Rhonda,1,Navid,6405530876" theke account. Koyekta eksathe dite ";" diye alada koro.
  // Ek account koyekjon er hole:  Rhonda,1,Navid,6405530876,Nabila,7012345678
  // Malik na thakle (shudhu admin pabe):  Rebeca,2
  function parseAccounts(text) {
    const ok = [], bad = [];
    String(text || '')
      // ";" ba notun line e alada. Copy-paste e line bhenge space hoye gele, number er porer space e o alada.
      .split(/[;\n|]+|(?<=\d)\s+(?=[^\d\s,])/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((line) => {
        const f = line.split(',').map((x) => x.trim());
        while (f.length && !f[f.length - 1]) f.pop();
        const [name, rawRdp, ...rest] = f;
        const rdp = String(rawRdp || '').replace(/^rdp\s*[-:]?\s*/i, '');
        if (!name || !rdp) return bad.push(line + '   ← Piper naam ar RDP number lagbe');
        if (/^-?\d+$/.test(name)) return bad.push(line + '   ← prothome Piper er naam lekho');
        if (!/^[A-Za-z0-9-]{1,6}$/.test(rdp)) return bad.push(line + '   ← RDP number bujhi nai: ' + rdp);
        if (rest.length % 2) return bad.push(line + '   ← User naam ar chat ID duitai lagbe');
        const to = [];
        for (let i = 0; i < rest.length; i += 2) {
          const user = rest[i], id = rest[i + 1].replace(/\s/g, '');
          if (!user) return bad.push(line + '   ← User naam nai');
          if (!CHAT_ID_RE.test(id)) return bad.push(line + '   ← chat ID shudhu number hoy: ' + id);
          to.push({ user, id });
        }
        ok.push({ name, rdp, to });
      });
    return { ok, bad };
  }

  function account() {
    const name = GM_getValue('accountName', '');
    const row = cfg.accounts.find((a) => norm(a.name) === norm(name)) || null;
    return { name, row, to: row ? row.to : [] };
  }

  // Telegram e jay: shudhu RDP number.
  function accountLabel() {
    const a = account();
    if (!a.name) return 'RDP ??';
    if (!a.row) return 'RDP ?? (' + a.name + ' list e nai)';
    return rdpText(a.row.rdp);
  }

  // Page ar menu te: RDP number ar Piper naam.
  function pageLabel() {
    const a = account();
    return a.row ? rdpText(a.row.rdp) + ' (' + a.row.name + ')' : accountLabel();
  }

  // Ei browser er account er kaj kara pabe: account er user + admin.
  function recipients() {
    const byId = new Map();
    account().to.forEach((t) => { if (!byId.has(t.id)) byId.set(t.id, t.user); });
    cfg.admins.forEach((id) => { if (!byId.has(id)) byId.set(id, 'Admin'); });
    let fromOldList = false;
    if (!byId.size) {
      // Kono account/admin set nai. Purono version er chat list thakle oitay pathai.
      cfg.oldChats.forEach((c) => byId.set(String(c.id), c.name || ''));
      fromOldList = byId.size > 0;
    }
    return { chats: Array.from(byId, ([id, name]) => ({ id, name })), fromOldList };
  }

  function overviewText() {
    const cur = account();
    const list = cfg.accounts;
    const r = recipients();
    return 'Account list:\n'
      + (list.length ? list.map((a, i) => (i + 1) + '. ' + accountRow(a) + (cur.row === null || norm(cur.row.name) !== norm(a.name) ? '' : '   ← ei browser')).join('\n') : '(khali)')
      + '\n\nAdmin (sob RDP er kaj pay): ' + (cfg.admins.join(', ') || '(keu na)')
      + '\n\nEi browser e login: ' + (cur.name ? cur.name + ' → ' + accountLabel() : '(jana nai)')
      + '\nEr kaj jabe: ' + (r.chats.map(chatLabel).join(', ') || '(karo kache na)')
      + (r.fromOldList ? '\n(Kono account/admin set nai, tai purono chat list e jacche.)' : '')
      + '\n\n' + syncStatusText();
  }

  let accountToken = null;
  async function loadAccountName(token) {
    if (accountToken === token) return;
    let name = '';
    try {
      const r = await gmRequest({
        method: 'GET',
        url: API_BASE + '/auth/me',
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      });
      if (r.status >= 200 && r.status < 300) name = (JSON.parse(r.responseText).firstName || '').trim();
    } catch (_) { /* niche page theke try kori */ }
    if (!name) {
      const h1 = document.querySelector('main h1');
      const m = h1 && h1.textContent.match(/(?:Morning|Afternoon|Evening),\s*([^.]+)\./i);
      if (m) name = m[1].trim();
    }
    if (name) {
      GM_setValue('accountName', name);
      accountToken = token;
    }
  }

  // ---------------------------------------------------------------------------
  // Telegram
  // ---------------------------------------------------------------------------
  async function telegram(method, payload) {
    if (!cfg.botToken) throw new Error('Bot token set kora nai. Tampermonkey menu theke set koro.');
    const r = await gmRequest({
      method: 'POST',
      url: `https://api.telegram.org/bot${cfg.botToken}/${method}`,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify(payload || {}),
    });
    let body = null;
    try { body = JSON.parse(r.responseText); } catch (_) { /* ignore */ }
    if (body && body.ok) return body.result;
    throw new Error('Telegram: ' + ((body && body.description) || ('HTTP ' + r.status)));
  }

  // Ei account er user ar admin der kache pathay. Prothom line e shudhu RDP number.
  // Ekjon er kache fail holeo baki ra pay, ar baki der janano hoy ke pay nai.
  // Kono ekjon er kache-o na gele error dey, jate porer check e abar try kore.
  async function sendTelegram(html, opts) {
    const chats = recipients().chats;
    if (!chats.length) throw new Error('Ei RDP er kaj kauke pathano jacche na. Menu theke "2. Account add koro" ba "3. Admin chat ID set koro".');
    const text = '🖥 <b>' + esc(accountLabel()) + '</b>\n' + html;
    const results = await Promise.allSettled(chats.map((c) => telegram('sendMessage', {
      chat_id: c.id,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    })));
    const failed = results
      .map((r, i) => (r.status === 'rejected' ? chatLabel(chats[i]) + ': ' + safe(r.reason.message) : null))
      .filter(Boolean);
    if (failed.length === chats.length) throw new Error(failed.join('\n'));
    if (failed.length) {
      console.warn('[Piper TG Notifier] kichu chat e jay nai:', failed);
      if (!(opts && opts.quiet)) {
        reportError('Ei chat e message jay nai:\n' + failed.join('\n') + '\n\nOi manush ke bot e giye Start chapte bolo, ba tar chat ID thik ache kina dekho.');
      }
    }
    return { sent: chats.length - failed.length, failed, chats };
  }

  // Bot ke jara Start chepeche (ba bot je group e add hoyeche) tader naam ar chat ID.
  async function findChats() {
    const updates = await telegram('getUpdates', { limit: 100 });
    const found = new Map();
    (updates || []).forEach((u) => {
      const m = u.message || u.edited_message || u.channel_post || u.my_chat_member;
      const c = m && m.chat;
      if (!c) return;
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.title || (c.username ? '@' + c.username : '');
      found.set(String(c.id), { id: String(c.id), name });
    });
    if (!found.size) throw new Error('Kono message pawa jay nai. Jar chat ID lagbe, take bot e giye Start chapte bolo, tarpor abar try koro.');
    return Array.from(found.values());
  }

  // Telegram message e shudhu title, reward ar time. Onek survey hole koyekta message e bhag kori.
  function buildMessages(list) {
    const groups = [];
    let cur = { items: [], text: '' };
    list.forEach((s) => {
      const block = `📝 <b>${esc(cut(s.title, 300))}</b>\n💰 ${money(s.reward)}  ·  ⏱ ${esc(s.minutes ?? '?')} min`;
      if (cur.items.length && cur.text.length + block.length + 2 > TG_MAX_CHARS) {
        groups.push(cur);
        cur = { items: [], text: '' };
      }
      cur.text += (cur.items.length ? '\n\n' : '') + block;
      cur.items.push(s);
    });
    if (cur.items.length) groups.push(cur);
    return groups.map((g) => ({ items: g.items, html: g.text }));
  }

  // ---------------------------------------------------------------------------
  // Upay 1: Piper API theke survey list
  // ---------------------------------------------------------------------------
  // Piper API theke GET. Shudhu pora, kichu bodlay na.
  async function apiGet(token, path) {
    const r = await gmRequest({
      method: 'GET',
      url: API_BASE + path,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    });
    if (r.status === 401) throw Object.assign(new Error('login expire hoyeche'), { code: 'EXPIRED' });
    if (r.status < 200 || r.status >= 300) throw new Error('Piper API HTTP ' + r.status + ' (' + path.split('?')[0] + ')');
    return JSON.parse(r.responseText);
  }

  async function surveysFromApi(token) {
    if (tokenExpiresSoon(token)) throw Object.assign(new Error('login expire hoyeche'), { code: 'EXPIRED' });

    const data = await apiGet(token, CAMPAIGNS_PATH);
    const campaigns = Array.isArray(data && data.campaigns) ? data.campaigns : [];
    return campaigns
      .filter((c) => c && c.assignmentStatus === AVAILABLE_STATUS)
      .map((c) => ({
        id: String(c.id),
        title: c.topic || c.category || 'A new survey',
        reward: c.reward,
        minutes: c.estimatedTimeMinutes,
      }));
  }

  // ---------------------------------------------------------------------------
  // Upay 2: dashboard page er card theke pora (API kaj na korle)
  // ---------------------------------------------------------------------------
  function pageReady() {
    return !document.querySelector('main .animate-pulse');
  }

  function surveysFromPage() {
    const cards = Array.from(document.querySelectorAll('[data-testid="poll-card"]'));
    return cards
      .filter((card) => Array.from(card.querySelectorAll('button')).some((b) => /share your take/i.test(b.textContent)))
      .map((card) => {
        const text = card.textContent.replace(/\s+/g, ' ');
        const price = text.match(/\$\s?([\d,]+(?:\.\d+)?)/);
        const mins = text.match(/(\d+)\s*min/i);
        const titleEl = card.querySelector('p.font-serif') || card.querySelector('p');
        const title = (titleEl ? titleEl.textContent : '').trim() || 'A new survey';
        return {
          id: null,
          title,
          reward: price ? Number(price[1].replace(/,/g, '')) : 0,
          minutes: mins ? Number(mins[1]) : null,
        };
      });
  }

  // ---------------------------------------------------------------------------
  // Kon survey age pathano hoyeche
  //   API theke porle: shudhu id diye chini. Same title/pay er notun survey o notun id pay,
  //   tai seta miss hoy na.
  //   Page theke porle: id nai, tai same title/pay/time er koyta card ekhon ache seta guni.
  // ---------------------------------------------------------------------------
  function loadSeen() {
    const st = GM_getValue('seenState', null) || {};
    const known = st.known || {};
    const ids = new Set();
    GM_getValue('seenIds', []).forEach((x) => {
      // Purono version id ar title-key eksathe rakhto. Title-key gulo alada kori.
      if (typeof x === 'string' && x.startsWith('k:')) { if (!(x in known)) known[x] = 1; } else ids.add(String(x));
    });
    return { ids, known, lastSource: st.lastSource || '', emptyStreak: st.emptyStreak || 0 };
  }

  function pickFresh(list, source, st) {
    if (source === 'API') {
      // Thik age page theke porle, okhane pathano survey gulo ke ekhon id diye chine nei,
      // jate API fire ashar por duibar na jay.
      const credit = {};
      if (st.lastSource === 'page') {
        const seenNow = countKeys(list.filter((s) => st.ids.has(s.id)));
        Object.keys(st.known).forEach((k) => { credit[k] = st.known[k] - (seenNow[k] || 0); });
      }
      return list.filter((s) => {
        if (st.ids.has(s.id)) return false;
        const k = contentKey(s);
        if (credit[k] > 0) { credit[k]--; st.ids.add(s.id); return false; }
        return true;
      });
    }
    const used = {};
    return list.filter((s) => {
      const k = contentKey(s);
      used[k] = (used[k] || 0) + 1;
      return used[k] > (st.known[k] || 0);
    });
  }

  // unsent = je survey gulo Telegram e jay nai. Egulo mone rakhi na, porer check e abar try hobe.
  function saveSeen(st, list, unsent, source) {
    const done = list.filter((s) => !unsent.includes(s));
    if (source === 'API') {
      const cur = done.map((s) => s.id);
      const older = Array.from(st.ids).filter((id) => !cur.includes(id));
      GM_setValue('seenIds', older.concat(cur).slice(-MAX_SEEN));
      GM_setValue('seenState', { known: countKeys(done), lastSource: 'API', emptyStreak: 0 });
      return;
    }
    // Page ekbar khali dekhale sathe sathe bhule jai na, page thik moto load na-o hote pare.
    const keepOld = !list.length && Object.keys(st.known).length > 0 && st.emptyStreak < 1;
    GM_setValue('seenIds', Array.from(st.ids).slice(-MAX_SEEN));
    GM_setValue('seenState', {
      known: keepOld ? st.known : countKeys(done),
      lastSource: 'page',
      emptyStreak: list.length ? 0 : st.emptyStreak + 1,
    });
  }

  // ---------------------------------------------------------------------------
  // Ek browser e koyekta dashboard tab khola thakle shudhu ekta tab check kore.
  // ---------------------------------------------------------------------------
  const TAB_ID = (() => {
    try {
      let id = sessionStorage.getItem('piper-tg-tab');
      if (!id) { id = Math.random().toString(36).slice(2); sessionStorage.setItem('piper-tg-tab', id); }
      return id;
    } catch (_) {
      return Math.random().toString(36).slice(2);
    }
  })();

  function takeLock(force) {
    const l = GM_getValue('tabLock', null);
    const ttl = cfg.maxSec * 1000 + 120000;   // ei somoy e kono check na hole onno tab dayitto ney
    if (!force && l && l.id !== TAB_ID && Date.now() - l.ts < ttl) return false;
    GM_setValue('tabLock', { id: TAB_ID, ts: Date.now() });
    return true;
  }

  function releaseLock() {
    const l = GM_getValue('tabLock', null);
    if (l && l.id === TAB_ID) GM_setValue('tabLock', null);
  }

  // ---------------------------------------------------------------------------
  // Reload: internet na thakle reload kori na. Tokhon browser "No internet" page dekhay,
  // okhane script chole na, ar notification chupchap bondho hoye jay.
  // ---------------------------------------------------------------------------
  async function networkUp() {
    if (navigator.onLine === false) return false;
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    try {
      await gmRequest({
        method: 'GET',
        url: API_BASE + '/auth/me',
        timeout: 10000,
        headers: token ? { Authorization: 'Bearer ' + token, Accept: 'application/json' } : { Accept: 'application/json' },
      });
      return true;   // je kono uttor ashlei bujhi internet ache
    } catch (_) {
      return false;
    }
  }

  async function safeReload(why) {
    if (!(await networkUp())) {
      status('internet nai, tai reload korchi na', true);
      return false;
    }
    GM_setValue('lastReloadAt', Date.now());
    status(why);
    location.reload();
    return true;
  }

  async function reloadForLogin() {
    if (Date.now() - Number(GM_getValue('lastReloadAt', 0)) <= 60000) return false;
    return safeReload('login refresh er jonno reload...');
  }

  // ---------------------------------------------------------------------------
  // Cash-out monitor (Google Sheet)
  //   Ei account er cash-out list ar balance Google Sheet e pathay. Telegram e kichu jay na.
  //   Sheet link set na thakle Piper er cash-out pora-i hoy na.
  // ---------------------------------------------------------------------------
  const statusText = (s) => PAYOUT_STATUS[s] || String(s || '?');
  const pad2 = (n) => String(n).padStart(2, '0');
  // Piper site je tarikh dekhay (ei computer er time zone e), "2026-11-18" hisebe.
  const localDay = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  };
  const SHEET_URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
  const monitorLink = () => (cfg.sheetUrl ? cfg.sheetUrl + '?key=' + encodeURIComponent(cfg.sheetKey) : '');

  async function fetchCashouts(token) {
    const data = await apiGet(token, PAYOUTS_PATH);
    const list = (Array.isArray(data && data.payouts) ? data.payouts : [])
      .filter((p) => p && p.id != null)
      .map((p) => ({
        id: String(p.id),
        amount: Number(p.amount) || 0,
        status: String(p.status || ''),
        statusText: statusText(p.status),
        method: PAYOUT_METHOD[p.method] || String(p.method || ''),
        day: localDay(p.deliveredAt || p.createdAt),   // site o ei tarikh dekhay
      }));
    let balance = null;
    try { balance = await apiGet(token, BALANCE_PATH); } catch (_) { /* balance chara-o pathai */ }
    return { list, balance };
  }

  async function syncCashouts(token) {
    if (!cfg.sheetUrl) throw new Error('Cash-out sheet link set kora nai. Menu theke "💵 Cash-out sheet link set koro".');
    const name = GM_getValue('accountName', '');
    if (!name) throw new Error('kon account login seta ekhono jana nai, ektu por abar try koro');
    const { list, balance } = await fetchCashouts(token);
    const row = account().row;
    const payload = {
      rdp: row ? rdpText(row.rdp) : 'RDP ??',
      account: row ? row.name : name,
      payouts: list,
      balance: balance ? { available: balance.available, pending: balance.pending, lifetime: balance.lifetime } : null,
    };
    const r = await gmRequest({
      method: 'POST',
      url: monitorLink(),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      data: JSON.stringify(payload),
    });
    let body = null;
    try { body = JSON.parse(r.responseText); } catch (_) { /* niche dekhi */ }
    if (body && body.ok) return { list, balance, payload };
    if (body && body.error) throw new Error('Sheet: ' + body.error);
    if (/<html|accounts\.google\.com/i.test(r.responseText || '')) {
      throw new Error('Sheet link e dhukte parchi na. Apps Script deploy e "Who has access: Anyone" dao.');
    }
    throw new Error('Sheet theke thik uttor ashe nai (HTTP ' + r.status + ')');
  }

  async function runSync(token) {
    try {
      const r = await syncCashouts(token);
      GM_setValue('cashoutSync', { at: Date.now(), ok: true, msg: r.list.length + ' ta cash-out' });
      return r;
    } catch (e) {
      GM_setValue('cashoutSync', { at: Date.now(), ok: false, msg: safe(e.message) });
      throw e;
    }
  }

  function syncStatusText() {
    if (!cfg.sheetUrl) return 'Cash-out sheet: set kora nai';
    const st = GM_getValue('cashoutSync', null);
    if (!st) return 'Cash-out sheet: ekhono pathano hoy nai';
    const t = new Date(st.at).toLocaleString();
    return st.ok ? 'Cash-out sheet: shesh pathano ' + t + ' (' + st.msg + ')' : 'Cash-out sheet e error (' + t + '): ' + st.msg;
  }

  // 45-90 minute e ekbar. Error holeo survey alert er kono khoti hoy na, Telegram e o kichu jay na.
  async function maybeSyncCashouts(token) {
    if (!cfg.sheetUrl || Date.now() < Number(GM_getValue('cashoutNextAt', 0))) return;
    let ok = false;
    try {
      await runSync(token);
      ok = true;
    } catch (e) {
      console.warn('[Piper TG Notifier] cash-out sheet:', safe(e.message));
    }
    const [a, b] = ok ? CASHOUT_GAP_MIN : CASHOUT_RETRY_MIN;
    GM_setValue('cashoutNextAt', Date.now() + Math.round((a + Math.random() * (b - a)) * 60000));
  }

  // ---------------------------------------------------------------------------
  // Main check
  // ---------------------------------------------------------------------------
  let busy = false;
  let reloadOnNextTick = false;
  let lastResult = 'ekhono check hoy nai';

  async function reportError(msg) {
    const last = Number(GM_getValue('lastErrorAlertAt', 0));
    if (Date.now() - last < ERROR_ALERT_GAP_MS) return;
    GM_setValue('lastErrorAlertAt', Date.now());
    try {
      await sendTelegram('⚠️ <b>Piper Notifier e problem:</b>\n' + esc(cut(safe(msg), 1500)), { quiet: true });
    } catch (_) {
      GM_setValue('lastErrorAlertAt', last);   // jay nai, porer error e abar try korbe
    }
  }

  function loggedOut() {
    status('login nai', true);
    // Ei browser e age kokhono login chilo, tokhon-i janai. Ekbar-i janai.
    if (GM_getValue('accountName', '') && !GM_getValue('loggedOutWarned', false)) {
      GM_setValue('loggedOutWarned', true);
      sendTelegram('⚠️ <b>Piper theke logout hoye gecho.</b>\nNotification pete abar login koro.', { quiet: true })
        .catch(() => GM_setValue('loggedOutWarned', false));
    }
    return (lastResult = 'Piper e login nai');
  }

  async function check(opts) {
    if (busy) return lastResult;
    busy = true;
    try {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY);

      if (!location.pathname.startsWith('/dashboard')) {
        releaseLock();
        // Logout hole site login page e niye jay. Tokhon o jeno warning jay.
        if (!token && location.host === new URL(DASHBOARD_URL).host) return loggedOut();
        status('dashboard e na, wait korchi');
        return (lastResult = 'Dashboard page e na');
      }

      if (!takeLock(opts && opts.force)) {
        status('onno tab e check cholche, ei tab bose ache');
        return (lastResult = 'Onno ekta dashboard tab check korche, tai ei tab bose ache.');
      }

      let list = null;
      let source = 'API';
      let apiError = null;
      try {
        if (!token) throw Object.assign(new Error('login nai'), { code: 'NO_LOGIN' });
        await loadAccountName(token);
        list = await surveysFromApi(token);
        GM_setValue('loggedOutWarned', false);
      } catch (e) {
        apiError = e;
        if (e.code === 'NO_LOGIN') return loggedOut();
        if (e.code === 'EXPIRED' && await reloadForLogin()) return (lastResult = 'Login refresh er jonno reload korchi');
      }

      if (!list) {
        // API kaj kore nai, page er card theke pori.
        if (!pageReady()) {
          status('page load hocche...');
          return (lastResult = 'API error: ' + apiError.message + '. Page o ekhono load hoy nai.');
        }
        list = surveysFromPage();
        source = 'page';
        console.warn('[Piper TG Notifier] API fail, page theke porchi:', apiError);
      }

      // Page theke porle page ta purono thakte pare, tai porer random somoy e reload kori.
      reloadOnNextTick = source === 'page';

      const st = loadSeen();
      const fresh = pickFresh(list, source, st);

      if (fresh.length && cfg.desktopNotify) {
        try {
          GM_notification({ title: 'Piper: notun survey · ' + pageLabel(), text: fresh.map((s) => `${s.title} — ${money(s.reward)} · ${s.minutes ?? '?'} min`).join('\n'), timeout: 15000 });
        } catch (_) { /* ignore */ }
      }

      // Je message ta jay, tar survey gulo-i "pathano" dhori. Fail hole baki gulo porer bar abar try hobe.
      let unsent = fresh.slice();
      try {
        for (const m of buildMessages(fresh)) {
          await sendTelegram(m.html);
          unsent = unsent.filter((s) => !m.items.includes(s));
        }
      } finally {
        saveSeen(st, list, unsent, source);
      }

      // Cash-out monitor (45-90 minute e ekbar Google Sheet e). Telegram e kichu jay na.
      if (source === 'API') await maybeSyncCashouts(token);

      const time = new Date().toLocaleTimeString();
      status(`${pageLabel()} · watching (${source}) · ${list.length} available · ${fresh.length} pathano · ${time}`);
      return (lastResult = `Account: ${pageLabel()}\n${source} theke ${list.length} ta available survey pawa geche. ${fresh.length} ta notun Telegram e pathano hoyeche.`
        + '\nKaj jay: ' + (recipients().chats.map(chatLabel).join(', ') || '(karo kache na)')
        + (fresh.length === 0 && list.length ? '\n(Egulo age-i pathano hoyeche. Abar pete chaile "Seen list clear koro".)' : '')
        + (apiError ? '\nAPI error chilo: ' + apiError.message : '')
        + '\n' + syncStatusText());
    } catch (e) {
      console.error('[Piper TG Notifier]', safe(e.message));
      status('error: ' + e.message, true);
      reportError(e.message);
      return (lastResult = 'Error: ' + safe(e.message));
    } finally {
      busy = false;
    }
  }

  // Menu theke kichu korar age account er naam jeno jana thake.
  async function ensureAccount() {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (token) await loadAccountName(token);
  }

  // ---------------------------------------------------------------------------
  // Tampermonkey menu
  // ---------------------------------------------------------------------------
  GM_registerMenuCommand('1. Telegram bot token set koro', () => {
    const v = prompt('@BotFather theke pawa bot token (jemon 123456789:ABCdef...):', cfg.botToken);
    if (v !== null) { GM_setValue('botToken', v.trim()); status('Bot token saved'); }
  });

  GM_registerMenuCommand('2. Account add koro (Naam,RDP,User,ChatID)', () => {
    const v = prompt('Emon lekho:  PiperNaam,RDP number,User naam,Telegram chat ID\n'
      + 'Jemon:  Rhonda,1,Navid,6405530876\n\n'
      + 'Koyekta eksathe dite ";" diye alada koro:\n'
      + 'Rhonda,1,Navid,6405530876; Rebeca,2,Nabila,7012345678\n\n'
      + 'Same Piper naam age theke thakle notun ta diye bodle jabe.', '');
    if (v === null || !v.trim()) return;
    const { ok, bad } = parseAccounts(v);
    if (bad.length) {
      alert('Kichu save kori nai. Ei line gulo bujhi nai:\n\n' + bad.join('\n') + '\n\nEmon lekho: Rhonda,1,Navid,6405530876');
      return;
    }
    // Ek-i input e same naam duibar thakle shesh ta rakhi.
    const incoming = new Map();
    ok.forEach((a) => incoming.set(norm(a.name), a));
    const list = cfg.accounts;
    const rows = Array.from(incoming.values()).map((a) => {
      const old = list.find((x) => norm(x.name) === norm(a.name));
      return '• ' + accountRow(a) + (old ? '\n     (age chilo: ' + accountRow(old) + ')' : '');
    });
    if (!confirm('Ei account gulo save korbo?\n\n' + rows.join('\n'))) return;
    const merged = list.filter((x) => !incoming.has(norm(x.name))).concat(Array.from(incoming.values()));
    merged.sort((x, y) => String(x.rdp).localeCompare(String(y.rdp), undefined, { numeric: true }));
    cfg.accounts = merged;
    ensureAccount().then(() => {
      alert(incoming.size + ' ta account save hoyeche.\n\n' + overviewText());
      status('account save hoyeche · ' + pageLabel());
    });
  });

  GM_registerMenuCommand('3. Admin chat ID set koro (sob RDP er kaj pabe)', () => {
    const v = prompt('Sob RDP er kaj kara pabe? Telegram chat ID lekho, koyekta hole comma diye.\n'
      + 'Jemon: 6405530876, 7012345678\nKauke na dite khali kore OK chapo.', cfg.admins.join(', '));
    if (v === null) return;
    const ids = v.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    const bad = ids.filter((x) => !CHAT_ID_RE.test(x));
    if (bad.length) { alert('Ei gulo chat ID na (shudhu number hoy):\n' + bad.join(', ')); return; }
    cfg.admins = Array.from(new Set(ids));
    alert('Admin: ' + (cfg.admins.join(', ') || '(keu na)') + '\n\nEra sob RDP er kaj pabe.');
  });

  GM_registerMenuCommand('4. Test message pathao (ei RDP er manush der)', () => {
    ensureAccount()
      .then(() => sendTelegram('✅ <b>Piper Notifier test message.</b>\nSetup thik ache!', { quiet: true }))
      .then((r) => alert(pageLabel() + '\n' + r.sent + ' jon er kache test message gese:\n'
        + r.chats.map(chatLabel).join('\n') + (r.failed.length ? '\n\nJay nai:\n' + r.failed.join('\n') : '')))
      .catch((e) => alert('Pathano jay nai:\n' + safe(e.message)));
  });

  GM_registerMenuCommand('Chat ID khujo (bot e Start chapar por)', () => {
    findChats()
      .then((list) => {
        const used = (id) => {
          const where = cfg.accounts
            .filter((a) => a.to.some((t) => t.id === id))
            .map((a) => a.to.find((t) => t.id === id).user + ' · ' + rdpText(a.rdp));
          if (cfg.admins.includes(id)) where.push('Admin');
          return where;
        };
        const rows = list.map((c) => {
          const w = used(c.id);
          return (c.name || '(naam nai)') + '  =  ' + c.id + (w.length ? '   ✔ ' + w.join(', ') : '   ✘ kothao nai');
        });
        const copy = list.map((c) => (c.name || 'Naam').replace(/[,;|]/g, '').split(' ')[0] + ',' + c.id).join('; ');
        prompt('Bot e jara Start chepeche:\n\n' + rows.join('\n')
          + '\n\nAccount add korte: PiperNaam,RDP,User,ChatID  (jemon Rhonda,1,Navid,6405530876)\nNicher lekha theke chat ID copy korte paro:', copy);
      })
      .catch((e) => alert(safe(e.message)));
  });

  GM_registerMenuCommand('Account list dekho / remove koro', () => {
    ensureAccount().then(() => {
      const list = cfg.accounts;
      const v = prompt(overviewText() + (list.length ? '\n\nKono account remove korte tar number lekho. Kichu na korte Cancel chapo.' : ''));
      const n = Number(v);
      if (v === null || !list.length || !n || n < 1 || n > list.length) return;
      const [gone] = list.splice(n - 1, 1);
      cfg.accounts = list;
      alert(accountRow(gone) + '\nremove hoyeche.');
    });
  });

  GM_registerMenuCommand('Account list copy koro (onno RDP er jonno)', () => {
    const list = cfg.accounts;
    if (!list.length) { alert('List khali. "2. Account add koro" diye add koro.'); return; }
    prompt('Ei lekha ta copy kore onno RDP er "2. Account add koro" te paste koro:', list.map(accountLine).join('; '));
  });

  GM_registerMenuCommand('💵 Cash-out sheet link set koro', () => {
    const v = prompt('Google Apps Script er "Web app" link paste koro (sheshe /exec thake).\n'
      + 'Cash-out monitor bondho korte khali kore OK chapo.', monitorLink());
    if (v === null) return;
    if (!v.trim()) {
      GM_setValue('sheetUrl', '');
      GM_setValue('sheetKey', '');
      alert('Cash-out sheet bondho. Piper er cash-out ar pora hobe na.');
      return;
    }
    const m = v.trim().match(/^([^?#]+)(?:\?([^#]*))?/);
    const url = m[1];
    let key = new URLSearchParams(m[2] || '').get('key') || '';
    if (!SHEET_URL_RE.test(url)) {
      alert('Link ta thik na. Emon hobe:\nhttps://script.google.com/macros/s/AKfy.../exec');
      return;
    }
    if (!key) {
      const k = prompt('Apps Script code er upore je PASSWORD diyecho seta lekho:', cfg.sheetKey);
      if (k === null || !k.trim()) return;
      key = k.trim();
    }
    GM_setValue('sheetUrl', url);
    GM_setValue('sheetKey', key);
    GM_setValue('cashoutNextAt', 0);
    const done = (txt) => prompt(txt + '\n\nMonitor dekhte ei link browser e kholo (bookmark kore rakho):', monitorLink());
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) { done('Saved. Piper e login korle cash-out sheet e jabe.'); return; }
    ensureAccount()
      .then(() => runSync(token))
      .then((r) => done('Saved. ' + pageLabel() + ': ' + r.list.length + ' ta cash-out sheet e gese.'))
      .catch((e) => done('Link saved, kintu pathano jay nai:\n' + safe(e.message)));
  });

  GM_registerMenuCommand('💵 Cash-out sheet e ekhon pathao', () => {
    if (!cfg.sheetUrl) { alert('Age "💵 Cash-out sheet link set koro".'); return; }
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) { alert('Piper e login nai.'); return; }
    ensureAccount()
      .then(() => runSync(token))
      .then((r) => alert(pageLabel() + ': ' + r.list.length + ' ta cash-out sheet e gese.\n\nMonitor: ' + monitorLink()))
      .catch((e) => alert('Sheet e pathano jay nai:\n' + safe(e.message)));
  });

  GM_registerMenuCommand('🔍 Ekhon check koro', () => {
    check({ force: true }).then((r) => alert(r));
  });
  GM_registerMenuCommand('Seen list clear koro (abar sob notify korbe)', () => {
    GM_setValue('seenIds', []);
    GM_setValue('seenState', null);
    check({ force: true }).then((r) => alert('Seen list clear hoyeche.\n\n' + r));
  });
  GM_registerMenuCommand('Random check time bodlao (minute)', () => {
    const cur = fmtMin(cfg.minSec) + '-' + fmtMin(cfg.maxSec);
    const v = prompt('Koto minute er moddhe random check korbe? "kom-beshi" lekho, jemon 1-5.\n(Minimum 0.5 minute)', cur);
    if (v === null) return;
    const m = v.replace(/\s/g, '').match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
    if (!m) { alert('Bujhte pari nai. Emon lekho: 1-5'); return; }
    const a = Math.round(Number(m[1]) * 60), b = Math.round(Number(m[2]) * 60);
    GM_setValue('minSec', Math.max(30, Math.min(a, b)));
    GM_setValue('maxSec', Math.max(30, Math.max(a, b)));
    alert('Ekhon theke ' + fmtMin(cfg.minSec) + ' theke ' + fmtMin(cfg.maxSec) + ' minute er moddhe random somoy e check hobe.');
    scheduleNext();
  });
  GM_registerMenuCommand('Desktop notification on/off', () => {
    GM_setValue('desktopNotify', !cfg.desktopNotify);
    alert('Desktop notification: ' + (cfg.desktopNotify ? 'ON' : 'OFF'));
  });

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------
  if (!cfg.botToken) {
    setTimeout(() => status('Tampermonkey menu theke bot token set koro', true), 1500);
  } else if (!recipients().chats.length && !cfg.accounts.length) {
    setTimeout(() => status('Tampermonkey menu theke "2. Account add koro"', true), 1500);
  } else {
    setTimeout(() => status('shuru hocche... (' + pageLabel() + ')'), 500);
  }

  // Tab bondho ba reload hole dayitto chere dei, jate onno tab sathe sathe nite pare.
  window.addEventListener('pagehide', releaseLock);

  // Fixed interval er bodole protibar notun random somoy. Second er sathe millisecond o random.
  let timer = null;
  function randomDelayMs() {
    const min = cfg.minSec * 1000, max = cfg.maxSec * 1000;
    return Math.floor(min + Math.random() * (max - min + 1));
  }
  function scheduleNext() {
    clearTimeout(timer);
    const delay = randomDelayMs();
    const at = new Date(Date.now() + delay).toLocaleTimeString();
    timer = setTimeout(tick, delay);
    if (pill) pill.textContent = pill.textContent.replace(/ · porer .*$/, '') + ' · porer ' + (reloadOnNextTick ? 'reload' : 'check') + ' ' + at;
  }
  async function tick() {
    try {
      if (reloadOnNextTick) {
        reloadOnNextTick = false;
        if (await safeReload('page refresh er jonno reload...')) {
          // Reload kono karone na holeo jeno check bondho na hoy.
          timer = setTimeout(tick, 30000);
          return;
        }
      }
      await check();
    } catch (e) {
      console.error('[Piper TG Notifier]', safe(e && e.message));
    }
    scheduleNext();
  }

  // Page khular por o ekta random chhoto deri (3-9 second), tarpor prothom check.
  timer = setTimeout(tick, 3000 + Math.floor(Math.random() * 6000));
})();
