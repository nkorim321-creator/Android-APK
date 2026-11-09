// ==UserScript==
// @name         Piper Telegram Notifier
// @namespace    https://github.com/nkorim321-creator/android-apk
// @version      2.2.0
// @description  Piper dashboard e notun survey (hit) available hole Telegram e title, pay ar time pathay.
// @match        https://www.piperpays.com/*
// @match        https://piperpays.com/*
// @run-at       document-idle
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

  const API_BASE = 'https://api.piperpays.com';          // Piper er nijer API
  const CAMPAIGNS_PATH = '/campaigns?status=all';         // dashboard eta-i call kore
  const AVAILABLE_STATUS = 'ASSIGNED';                    // "Available" tab = ASSIGNED
  const ACCESS_TOKEN_KEY = 'access_token';                // site er localStorage key
  const DASHBOARD_URL = 'https://www.piperpays.com/dashboard';
  const MAX_SEEN = 1000;
  const ERROR_ALERT_GAP_MS = 30 * 60 * 1000;              // error hole Telegram e 30 min e ekbar janabe

  const cfg = {
    get botToken() { return GM_getValue('botToken', ''); },
    // Eksathe koyekjon ke pathano jay. Purono version er single chatId o chalbe.
    get chats() {
      const list = GM_getValue('chats', null);
      if (Array.isArray(list)) return list;
      const old = GM_getValue('chatId', '');
      return old ? [{ id: String(old), name: '' }] : [];
    },
    set chats(list) { GM_setValue('chats', list); },
    get intervalSec() { return Math.max(30, Number(GM_getValue('intervalSec', 60)) || 60); },
    get desktopNotify() { return GM_getValue('desktopNotify', true); },
  };

  // ---------------------------------------------------------------------------
  // HTTP (Tampermonkey er nijer request, tai browser er CORS block e atkay na)
  // ---------------------------------------------------------------------------
  function gmRequest(opts) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        timeout: 20000,
        ...opts,
        onload: (r) => resolve(r),
        onerror: () => reject(new Error('network error: ' + opts.url.split('?')[0])),
        ontimeout: () => reject(new Error('timeout: ' + opts.url.split('?')[0])),
      });
    });
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

  const chatLabel = (c) => (c.name ? c.name + ' (' + c.id + ')' : String(c.id));

  // List er sobar kache pathay. Ekjon er kache fail holeo baki ra pay.
  // Kono ekjon er kache-o na gele error dey, jate porer check e abar try kore.
  async function sendTelegram(html) {
    const chats = cfg.chats;
    if (!chats.length) throw new Error('Kono chat add kora nai. Bot ke /start pathiye menu theke "Chat add koro" e click koro.');
    const results = await Promise.allSettled(chats.map((c) => telegram('sendMessage', {
      chat_id: c.id,
      text: html,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[{ text: '👉 Dashboard kholo', url: DASHBOARD_URL }]] },
    })));
    const failed = results
      .map((r, i) => (r.status === 'rejected' ? chatLabel(chats[i]) + ': ' + r.reason.message : null))
      .filter(Boolean);
    if (failed.length === chats.length) throw new Error(failed.join('\n'));
    if (failed.length) console.warn('[Piper TG Notifier] kichu chat e jay nai:', failed);
    return { sent: chats.length - failed.length, failed };
  }

  // Bot ke jara /start pathiyeche tader khuje, jiggesh kore list e add kore.
  async function addChatsFromUpdates() {
    const updates = await telegram('getUpdates', { limit: 100 });
    const found = new Map();
    (updates || [])
      .map((u) => u.message || u.edited_message || u.channel_post)
      .filter(Boolean)
      .forEach((m) => {
        const c = m.chat;
        const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.title || (c.username ? '@' + c.username : '');
        found.set(String(c.id), { id: String(c.id), name });
      });
    if (!found.size) throw new Error('Kono message pawa jay nai. Je add hobe, take bot e giye Start chapte bolo, tarpor abar try koro.');

    const chats = cfg.chats;
    const have = new Set(chats.map((c) => c.id));
    const added = [];
    for (const c of found.values()) {
      if (have.has(c.id)) continue;
      if (confirm('Ei chat ke notification list e add korbo?\n\n' + chatLabel(c))) { chats.push(c); added.push(c); }
    }
    cfg.chats = chats;
    return { added, chats };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  // Same survey API ar page dui jaygay theke pele jeno duibar na jay, tai content diye o chini.
  const contentKey = (s) => 'k:' + norm(s.title) + '|' + money(s.reward) + '|' + (s.minutes ?? '');

  function tokenExpiresSoon(token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload.exp === 'number' && payload.exp * 1000 - 30000 <= Date.now();
    } catch (_) {
      return false;
    }
  }

  function buildMessage(list) {
    const head = list.length === 1 ? '🔔 <b>Notun Piper survey available!</b>' : `🔔 <b>${list.length} ta notun Piper survey available!</b>`;
    const body = list.map((s) =>
      `📝 <b>${esc(s.title)}</b>\n💰 ${money(s.reward)}  ·  ⏱ ${esc(s.minutes ?? '?')} min\n🏷 ${esc(s.label)}`
    ).join('\n\n');
    return `${head}\n\n${body}`;
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
    pill.textContent = '📲 TG Notifier: ' + text;
  }

  // ---------------------------------------------------------------------------
  // Upay 1: Piper API theke survey list
  // ---------------------------------------------------------------------------
  async function surveysFromApi() {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) throw Object.assign(new Error('login nai'), { code: 'NO_LOGIN' });
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
  // Main check
  // ---------------------------------------------------------------------------
  let busy = false;
  let lastResult = 'ekhono check hoy nai';

  function reloadForLogin() {
    const last = Number(GM_getValue('lastReloadAt', 0));
    if (Date.now() - last > 60000) {
      GM_setValue('lastReloadAt', Date.now());
      status('login refresh er jonno reload...');
      location.reload();
      return true;
    }
    return false;
  }

  async function reportError(msg) {
    const last = Number(GM_getValue('lastErrorAlertAt', 0));
    if (Date.now() - last < ERROR_ALERT_GAP_MS) return;
    GM_setValue('lastErrorAlertAt', Date.now());
    try { await sendTelegram('⚠️ <b>Piper Notifier e problem:</b>\n' + esc(msg)); } catch (_) { /* ignore */ }
  }

  async function check() {
    if (busy) return lastResult;
    busy = true;
    try {
      if (!location.pathname.startsWith('/dashboard')) {
        status('dashboard e na, wait korchi');
        return (lastResult = 'Dashboard page e na');
      }

      let list = null;
      let source = 'API';
      let apiError = null;
      try {
        list = await surveysFromApi();
        GM_setValue('loggedOutWarned', false);
      } catch (e) {
        apiError = e;
        if (e.code === 'NO_LOGIN') {
          status('login nai', true);
          if (!GM_getValue('loggedOutWarned', false)) {
            GM_setValue('loggedOutWarned', true);
            sendTelegram('⚠️ <b>Piper theke logout hoye gecho.</b>\nNotification pete abar login koro.').catch(() => {});
          }
          return (lastResult = 'Piper e login nai');
        }
        if (e.code === 'EXPIRED' && reloadForLogin()) return (lastResult = 'Login refresh er jonno reload korchi');
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

      const seen = new Set(GM_getValue('seenIds', []));
      const fresh = list.filter((s) => !(s.id && seen.has(s.id)) && !seen.has(contentKey(s)));

      if (fresh.length) {
        if (cfg.desktopNotify) {
          try {
            GM_notification({ title: 'Piper: notun survey', text: fresh.map((s) => `${s.title} — ${money(s.reward)} · ${s.minutes} min`).join('\n'), timeout: 15000 });
          } catch (_) { /* ignore */ }
        }
        await sendTelegram(buildMessage(fresh)); // fail hole seen e jabe na, porer bar abar try korbe
        fresh.forEach((s) => { if (s.id) seen.add(s.id); seen.add(contentKey(s)); });
        GM_setValue('seenIds', Array.from(seen).slice(-MAX_SEEN));
      }

      // Page theke porle page ta purono thakte pare, tai porer check er age reload kori.
      if (source === 'page') {
        setTimeout(() => location.reload(), Math.max(10000, cfg.intervalSec * 1000 - 8000));
      }

      const time = new Date().toLocaleTimeString();
      status(`watching (${source}) · ${list.length} available · ${fresh.length} pathano · ${time}`);
      return (lastResult = `${source} theke ${list.length} ta available survey pawa geche. ${fresh.length} ta notun Telegram e pathano hoyeche.`
        + (fresh.length === 0 && list.length ? '\n(Egulo age-i pathano hoyeche. Abar pete chaile "Seen list clear koro".)' : '')
        + (apiError ? '\nAPI error chilo: ' + apiError.message : ''));
    } catch (e) {
      console.error('[Piper TG Notifier]', e);
      status('error: ' + e.message, true);
      reportError(e.message);
      return (lastResult = 'Error: ' + e.message);
    } finally {
      busy = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Tampermonkey menu
  // ---------------------------------------------------------------------------
  GM_registerMenuCommand('1. Telegram bot token set koro', () => {
    const v = prompt('@BotFather theke pawa bot token (jemon 123456789:ABCdef...):', cfg.botToken);
    if (v !== null) { GM_setValue('botToken', v.trim()); status('Bot token saved'); }
  });
  GM_registerMenuCommand('2. Chat add koro (bot e Start chapar por)', () => {
    addChatsFromUpdates()
      .then(({ added, chats }) => {
        alert((added.length ? added.length + ' ta notun chat add hoyeche.' : 'Notun kono chat add hoy nai.')
          + '\n\nEkhon ' + chats.length + ' jon message pabe:\n' + chats.map((c, i) => (i + 1) + '. ' + chatLabel(c)).join('\n'));
        check();
      })
      .catch((e) => alert(e.message));
  });
  GM_registerMenuCommand('3. Test Telegram message pathao (sobar kache)', () => {
    sendTelegram('✅ <b>Piper Notifier test message.</b>\nSetup thik ache!')
      .then((r) => alert(r.sent + ' jon er kache test message gese.' + (r.failed.length ? '\n\nJay nai:\n' + r.failed.join('\n') : '')))
      .catch((e) => alert('Pathano jay nai:\n' + e.message));
  });
  GM_registerMenuCommand('Chat list dekho / remove koro', () => {
    const chats = cfg.chats;
    if (!chats.length) { alert('List khali. "2. Chat add koro" diye add koro.'); return; }
    const v = prompt('Ei chat gulo message pay:\n\n' + chats.map((c, i) => (i + 1) + '. ' + chatLabel(c)).join('\n')
      + '\n\nKauke remove korte tar number lekho. Kichu na korte Cancel chapo.');
    const n = Number(v);
    if (v === null || !n || n < 1 || n > chats.length) return;
    const [gone] = chats.splice(n - 1, 1);
    cfg.chats = chats;
    alert(chatLabel(gone) + ' remove hoyeche.');
  });
  GM_registerMenuCommand('🔍 Ekhon check koro', () => {
    check().then((r) => alert(r));
  });
  GM_registerMenuCommand('Seen list clear koro (abar sob notify korbe)', () => {
    GM_setValue('seenIds', []);
    check().then((r) => alert('Seen list clear hoyeche.\n\n' + r));
  });
  GM_registerMenuCommand('Chat ID nije lekho (comma diye koyekta)', () => {
    const v = prompt('Telegram chat ID, koyekta hole comma diye (jemon 111111,222222):', cfg.chats.map((c) => c.id).join(','));
    if (v === null) return;
    const old = new Map(cfg.chats.map((c) => [c.id, c]));
    cfg.chats = v.split(',').map((x) => x.trim()).filter(Boolean).map((id) => old.get(id) || { id, name: '' });
    status('Chat list saved: ' + cfg.chats.length + ' jon');
  });
  GM_registerMenuCommand('Check interval (seconds) bodlao', () => {
    const v = prompt('Koto second por por check korbe? (minimum 30)', String(cfg.intervalSec));
    if (v !== null) { GM_setValue('intervalSec', Number(v) || 60); location.reload(); }
  });
  GM_registerMenuCommand('Desktop notification on/off', () => {
    GM_setValue('desktopNotify', !cfg.desktopNotify);
    alert('Desktop notification: ' + (cfg.desktopNotify ? 'ON' : 'OFF'));
  });

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------
  if (!cfg.botToken || !cfg.chats.length) {
    setTimeout(() => status('Tampermonkey menu theke bot token ar chat ID set koro', true), 1500);
  } else {
    setTimeout(() => status('shuru hocche...'), 500);
  }

  setTimeout(check, 4000);
  setInterval(check, cfg.intervalSec * 1000);
})();
