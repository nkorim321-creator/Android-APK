// ==UserScript==
// @name         Piper Telegram Notifier
// @namespace    https://github.com/nkorim321-creator/android-apk
// @version      3.0.0
// @description  Piper dashboard e notun survey (hit) available hole Telegram e title, pay ar time pathay. Je account jar, message tar kache jay.
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
// ==/UserScript==

(function () {
  'use strict';

  // ===========================================================================
  // SETTINGS: ei 3 ta list tumi nije bhorba. Shob browser e same script paste korba.
  // Script update korar age ei 3 ta list copy kore rekho, notun script e abar boshabe.
  // ===========================================================================

  // 1) MANUSH LIST: naam ar tar Telegram chat ID.
  //    Chat ID pete: oi manush bot e giye Start chapbe, tarpor tumi Tampermonkey menu
  //    theke "2. Chat ID khujo" te click korba. Group er ID minus (-) diye shuru hoy.
  const PEOPLE = {
    'Admin':  '',
    'Navid':  '',
    'Nabila': '',
  };

  // 2) Ei manush ra SOB account er message pabe (tumi nije, ba ekta group).
  const ALL_ACCOUNTS_TO = ['Admin'];

  // 3) ACCOUNT LIST:  'Piper er naam': [number, 'account ta kar'],
  //    Naam ta dashboard er "Afternoon, Rebeca" te je naam dekhay seta.
  //    Malik er naam ta upor er MANUSH LIST er naam er sathe milte hobe.
  //    Ek account koyekjon er hole:  'Rhonda': [1, 'Navid', 'Nabila'],
  //    Malik na dile shudhu ALL_ACCOUNTS_TO er manush ra pabe.
  const ACCOUNTS = {
    'Rhonda': [1, 'Navid'],
    'Rebeca': [2],
    // 'Naam': [7, 'Nabila'],
  };

  const API_BASE = 'https://api.piperpays.com';          // Piper er nijer API
  const CAMPAIGNS_PATH = '/campaigns?status=all';         // dashboard eta-i call kore
  const AVAILABLE_STATUS = 'ASSIGNED';                    // "Available" tab = ASSIGNED
  const ACCESS_TOKEN_KEY = 'access_token';                // site er localStorage key
  const DASHBOARD_URL = 'https://www.piperpays.com/dashboard';
  const MAX_SEEN = 1000;
  const ERROR_ALERT_GAP_MS = 30 * 60 * 1000;              // error hole Telegram e 30 min e ekbar janabe
  const TG_MAX_CHARS = 3500;                              // Telegram er limit 4096, ektu kom rakhi

  const cfg = {
    get botToken() { return GM_getValue('botToken', ''); },
    // Purono version e menu diye add kora chat list. PEOPLE list khali thakle eta-i use hoy.
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
  // Kon account login kora, ar tar message kar kache jabe
  // ---------------------------------------------------------------------------
  function account() {
    const name = GM_getValue('accountName', '');
    const key = Object.keys(ACCOUNTS).find((k) => norm(k) === norm(name));
    const row = key ? [].concat(ACCOUNTS[key]) : [];
    return { name, key, no: row[0], owners: row.slice(1).map((x) => String(x).trim()).filter(Boolean) };
  }

  function accountLabel() {
    const a = account();
    if (!a.name) return 'Account No:??';
    if (!a.key) return a.name + ' No:?? (script er ACCOUNTS list e nai)';
    return a.key + ' No:' + String(a.no).padStart(2, '0');
  }

  // MANUSH LIST theke naam diye chat ID. Na thakle ''.
  function personId(name) {
    const key = Object.keys(PEOPLE).find((k) => norm(k) === norm(name));
    return key ? String(PEOPLE[key] ?? '').trim() : '';
  }
  const personText = (n) => n + (personId(n) ? '' : ' (chat ID nai!)');
  const chatLabel = (c) => (c.name ? c.name + ' (' + c.id + ')' : String(c.id));

  // Ei browser er account er message kara pabe: account er malik + ALL_ACCOUNTS_TO.
  function recipients() {
    const byId = new Map();
    [...account().owners, ...ALL_ACCOUNTS_TO].forEach((n) => {
      const id = personId(n);
      if (id && !byId.has(id)) byId.set(id, n);
    });
    let fromOldList = false;
    if (!byId.size) {
      // PEOPLE list e kono chat ID nai. Purono version er chat list thakle oitay pathai.
      cfg.oldChats.forEach((c) => byId.set(String(c.id), c.name || ''));
      fromOldList = byId.size > 0;
    }
    return { chats: Array.from(byId, ([id, name]) => ({ id, name })), fromOldList };
  }

  function routingText() {
    const cur = account();
    const rows = Object.keys(ACCOUNTS).map((k) => {
      const row = [].concat(ACCOUNTS[k]);
      const owners = row.slice(1).map((x) => String(x).trim()).filter(Boolean);
      return 'No:' + String(row[0]).padStart(2, '0') + ' ' + k + '  →  '
        + (owners.length ? owners.map(personText).join(', ') : '(malik deya nai)')
        + (cur.key === k ? '   ← ei browser' : '');
    });
    const r = recipients();
    return 'Kon account er message kar kache jay:\n\n' + rows.join('\n')
      + '\n\nSob account er message pay: ' + (ALL_ACCOUNTS_TO.map(personText).join(', ') || '(keu na)')
      + '\n\nEi browser e login: ' + accountLabel()
      + '\nEr message jabe: ' + (r.chats.map(chatLabel).join(', ') || '(karo kache na, PEOPLE list e chat ID boshao)')
      + (r.fromOldList ? '\n(PEOPLE list e chat ID nai, tai purono chat list e jacche.)' : '');
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

  // Ei account er malik ar ALL_ACCOUNTS_TO er sobar kache pathay.
  // Ekjon er kache fail holeo baki ra pay, ar baki der janano hoy ke pay nai.
  // Kono ekjon er kache-o na gele error dey, jate porer check e abar try kore.
  async function sendTelegram(html, opts) {
    const chats = recipients().chats;
    if (!chats.length) throw new Error('Kono chat ID nai. Script er upore PEOPLE list e chat ID boshao (menu: "2. Chat ID khujo").');
    // Prothom line e account er naam, number ar malik, jate bojha jay kon account.
    const owners = account().owners.map(personText).join(', ');
    const text = '👤 <b>' + esc(accountLabel()) + '</b>' + (owners ? '  →  ' + esc(owners) : '') + '\n' + html;
    const results = await Promise.allSettled(chats.map((c) => telegram('sendMessage', {
      chat_id: c.id,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[{ text: '👉 Dashboard kholo', url: DASHBOARD_URL }]] },
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

  // Onek survey eksathe ashle koyekta message e bhag kore, jate Telegram er limit par na hoy.
  function buildMessages(list) {
    const head = list.length === 1 ? '🔔 <b>Notun Piper survey available!</b>' : `🔔 <b>${list.length} ta notun Piper survey available!</b>`;
    const groups = [];
    let cur = { items: [], text: '' };
    list.forEach((s) => {
      const block = `📝 <b>${esc(cut(s.title, 300))}</b>\n💰 ${money(s.reward)}  ·  ⏱ ${esc(s.minutes ?? '?')} min\n🏷 ${esc(cut(s.label, 100))}`;
      if (cur.items.length && cur.text.length + block.length + 2 > TG_MAX_CHARS) {
        groups.push(cur);
        cur = { items: [], text: '' };
      }
      cur.text += (cur.items.length ? '\n\n' : '') + block;
      cur.items.push(s);
    });
    if (cur.items.length) groups.push(cur);
    return groups.map((g, i) => ({
      items: g.items,
      html: head + (groups.length > 1 ? ` (${i + 1}/${groups.length})` : '') + '\n\n' + g.text,
    }));
  }

  // ---------------------------------------------------------------------------
  // Upay 1: Piper API theke survey list
  // ---------------------------------------------------------------------------
  async function surveysFromApi(token) {
    if (tokenExpiresSoon(token)) throw Object.assign(new Error('login expire hoyeche'), { code: 'EXPIRED' });

    const r = await gmRequest({
      method: 'GET',
      url: API_BASE + CAMPAIGNS_PATH,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    });
    if (r.status === 401) throw Object.assign(new Error('login expire hoyeche'), { code: 'EXPIRED' });
    if (r.status < 200 || r.status >= 300) throw new Error('Piper API HTTP ' + r.status);

    const data = JSON.parse(r.responseText);
    const campaigns = Array.isArray(data && data.campaigns) ? data.campaigns : [];
    return campaigns
      .filter((c) => c && c.assignmentStatus === AVAILABLE_STATUS)
      .map((c) => ({
        id: String(c.id),
        title: c.topic || c.category || 'A new survey',
        label: c.category || 'Paid opinion',
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
        const labelEl = card.querySelector('span');
        const title = (titleEl ? titleEl.textContent : '').trim() || 'A new survey';
        return {
          id: null,
          title,
          label: (labelEl ? labelEl.textContent : '').trim() || 'Paid opinion',
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
          GM_notification({ title: 'Piper: notun survey · ' + accountLabel(), text: fresh.map((s) => `${s.title} — ${money(s.reward)} · ${s.minutes ?? '?'} min`).join('\n'), timeout: 15000 });
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

      const time = new Date().toLocaleTimeString();
      status(`${accountLabel()} · watching (${source}) · ${list.length} available · ${fresh.length} pathano · ${time}`);
      return (lastResult = `Account: ${accountLabel()}\n${source} theke ${list.length} ta available survey pawa geche. ${fresh.length} ta notun Telegram e pathano hoyeche.`
        + '\nMessage jay: ' + (recipients().chats.map(chatLabel).join(', ') || '(karo kache na)')
        + (fresh.length === 0 && list.length ? '\n(Egulo age-i pathano hoyeche. Abar pete chaile "Seen list clear koro".)' : '')
        + (apiError ? '\nAPI error chilo: ' + apiError.message : ''));
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
  GM_registerMenuCommand('2. Chat ID khujo (bot e Start chapar por)', () => {
    findChats()
      .then((list) => {
        const inList = (id) => Object.keys(PEOPLE).find((k) => String(PEOPLE[k] ?? '').trim() === id);
        const rows = list.map((c) => (c.name || '(naam nai)') + '  =  ' + c.id
          + (inList(c.id) ? '   ✔ list e ache: ' + inList(c.id) : '   ✘ list e nai'));
        const copy = list.map((c) => `'${(c.name || 'Naam').replace(/['\\]/g, '').split(' ')[0]}': '${c.id}',`).join(' ');
        prompt('Bot e jara Start chepeche:\n\n' + rows.join('\n')
          + '\n\nNicher line ta copy kore script er upore PEOPLE list e boshao, tarpor script save koro:', copy);
      })
      .catch((e) => alert(safe(e.message)));
  });
  GM_registerMenuCommand('3. Test message pathao (ei account er manush der)', () => {
    ensureAccount()
      .then(() => sendTelegram('✅ <b>Piper Notifier test message.</b>\nSetup thik ache!', { quiet: true }))
      .then((r) => alert(accountLabel() + '\n' + r.sent + ' jon er kache test message gese:\n'
        + r.chats.map(chatLabel).join('\n') + (r.failed.length ? '\n\nJay nai:\n' + r.failed.join('\n') : '')))
      .catch((e) => alert('Pathano jay nai:\n' + safe(e.message)));
  });
  GM_registerMenuCommand('Kon account kar kache jay dekho', () => {
    ensureAccount().then(() => alert(routingText()));
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
  } else if (!recipients().chats.length) {
    setTimeout(() => status('script er PEOPLE list e chat ID boshao', true), 1500);
  } else {
    setTimeout(() => status('shuru hocche... (' + accountLabel() + ')'), 500);
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
