// ==UserScript==
// @name         Piper Telegram Notifier
// @namespace    https://github.com/nkorim321-creator/android-apk
// @version      2.0.0
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
// ==/UserScript==

(function () {
  'use strict';

  const API_BASE = 'https://api.piperpays.com';          // Piper er nijer API
  const CAMPAIGNS_PATH = '/campaigns?status=all';         // dashboard eta-i call kore
  const AVAILABLE_STATUS = 'ASSIGNED';                    // "Available" tab = ASSIGNED
  const ACCESS_TOKEN_KEY = 'access_token';                // site er localStorage key
  const DASHBOARD_URL = 'https://www.piperpays.com/dashboard';
  const MAX_SEEN = 500;

  const cfg = {
    get botToken() { return GM_getValue('botToken', ''); },
    get chatId() { return GM_getValue('chatId', ''); },
    get intervalSec() { return Math.max(30, Number(GM_getValue('intervalSec', 60)) || 60); },
    get desktopNotify() { return GM_getValue('desktopNotify', true); },
  };

  // ---------------------------------------------------------------------------
  // Telegram
  // ---------------------------------------------------------------------------
  function telegram(method, payload) {
    return new Promise((resolve, reject) => {
      if (!cfg.botToken) { reject(new Error('Bot token set kora nai. Tampermonkey menu theke set koro.')); return; }
      GM_xmlhttpRequest({
        method: 'POST',
        url: `https://api.telegram.org/bot${cfg.botToken}/${method}`,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(payload || {}),
        timeout: 20000,
        onload: (r) => {
          let body = null;
          try { body = JSON.parse(r.responseText); } catch (_) { /* ignore */ }
          if (body && body.ok) resolve(body.result);
          else reject(new Error('Telegram: ' + ((body && body.description) || ('HTTP ' + r.status))));
        },
        onerror: () => reject(new Error('Telegram network error')),
        ontimeout: () => reject(new Error('Telegram timeout')),
      });
    });
  }

  function sendTelegram(html) {
    if (!cfg.chatId) return Promise.reject(new Error('Chat ID nai. Bot ke /start pathiye menu theke "Chat ID auto detect" koro.'));
    return telegram('sendMessage', {
      chat_id: cfg.chatId,
      text: html,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[{ text: '👉 Dashboard kholo', url: DASHBOARD_URL }]] },
    });
  }

  async function detectChatId() {
    const updates = await telegram('getUpdates', { limit: 100 });
    const msgs = (updates || []).map((u) => u.message || u.edited_message).filter(Boolean);
    const last = msgs[msgs.length - 1];
    if (!last) throw new Error('Kono message pawa jay nai. Telegram e tomar bot ke /start pathao, tarpor abar try koro.');
    GM_setValue('chatId', String(last.chat.id));
    return last.chat;
  }

  // ---------------------------------------------------------------------------
  // Tampermonkey menu
  // ---------------------------------------------------------------------------
  GM_registerMenuCommand('1. Telegram bot token set koro', () => {
    const v = prompt('@BotFather theke pawa bot token (jemon 123456789:ABCdef...):', cfg.botToken);
    if (v !== null) { GM_setValue('botToken', v.trim()); status('Bot token saved'); }
  });
  GM_registerMenuCommand('2. Chat ID auto detect koro', () => {
    detectChatId()
      .then((chat) => alert('Chat ID pawa geche: ' + chat.id + ' (' + (chat.first_name || chat.title || '') + ')\nEkhon "3. Test message" e click koro.'))
      .catch((e) => alert(e.message));
  });
  GM_registerMenuCommand('3. Test Telegram message pathao', () => {
    sendTelegram('✅ <b>Piper Notifier test message.</b>\nSetup thik ache!')
      .then(() => alert('Test message pathano hoyeche. Telegram check koro.'))
      .catch((e) => alert('Pathano jay nai: ' + e.message));
  });
  GM_registerMenuCommand('Chat ID nije set koro', () => {
    const v = prompt('Telegram chat ID:', cfg.chatId);
    if (v !== null) { GM_setValue('chatId', v.trim()); status('Chat ID saved'); }
  });
  GM_registerMenuCommand('Check interval (seconds) bodlao', () => {
    const v = prompt('Koto second por por check korbe? (minimum 30)', String(cfg.intervalSec));
    if (v !== null) { GM_setValue('intervalSec', Number(v) || 60); location.reload(); }
  });
  GM_registerMenuCommand('Desktop notification on/off', () => {
    GM_setValue('desktopNotify', !cfg.desktopNotify);
    alert('Desktop notification: ' + (cfg.desktopNotify ? 'ON' : 'OFF'));
  });
  GM_registerMenuCommand('Seen list clear koro (abar sob notify korbe)', () => {
    GM_setValue('seenIds', []);
    alert('Clear hoyeche. Porer check e current available survey gulo abar notify hobe.');
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);
  const titleOf = (c) => c.topic || c.category || 'A new survey';
  const labelOf = (c) => c.category || 'Paid opinion';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
    const body = list.map((c) =>
      `📝 <b>${esc(titleOf(c))}</b>\n💰 ${money(c.reward)}  ·  ⏱ ${esc(c.estimatedTimeMinutes ?? '?')} min\n🏷 ${esc(labelOf(c))}`
    ).join('\n\n');
    return `${head}\n\n${body}`;
  }

  // Page e chhoto status label, jate bojha jay script cholche.
  let pill;
  function status(text, isError) {
    if (!document.body) return;
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'piper-tg-notifier';
      Object.assign(pill.style, {
        position: 'fixed', left: '12px', bottom: '84px', zIndex: 2147483647,
        font: '12px/1.3 system-ui, sans-serif', padding: '6px 10px', borderRadius: '999px',
        background: 'rgba(20,20,20,.85)', color: '#fff', pointerEvents: 'none',
        maxWidth: 'calc(100vw - 24px)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      });
      document.body.appendChild(pill);
    }
    pill.style.background = isError ? 'rgba(160,30,30,.92)' : 'rgba(20,20,20,.85)';
    pill.textContent = '📲 TG Notifier: ' + text;
  }

  function reloadForLogin() {
    const last = Number(GM_getValue('lastReloadAt', 0));
    if (Date.now() - last > 60000) {
      GM_setValue('lastReloadAt', Date.now());
      status('login refresh er jonno reload...');
      location.reload();
    }
  }

  // ---------------------------------------------------------------------------
  // Main check
  // ---------------------------------------------------------------------------
  let busy = false;

  async function check() {
    if (busy) return;
    busy = true;
    try {
      if (!location.pathname.startsWith('/dashboard')) {
        status('dashboard e na, wait korchi');
        return;
      }

      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (!token) {
        status('login nai', true);
        if (!GM_getValue('loggedOutWarned', false)) {
          GM_setValue('loggedOutWarned', true);
          sendTelegram('⚠️ <b>Piper theke logout hoye gecho.</b>\nNotification pete abar login koro.').catch(() => {});
        }
        return;
      }
      GM_setValue('loggedOutWarned', false);

      // Token expire hole site nijei page load er somoy refresh kore.
      // Tai amra nije refresh na kore page reload kori, jate site er login nosto na hoy.
      if (tokenExpiresSoon(token)) { reloadForLogin(); return; }

      const res = await fetch(API_BASE + CAMPAIGNS_PATH, {
        headers: { Authorization: 'Bearer ' + token },
        cache: 'no-store',
      });
      if (res.status === 401) { reloadForLogin(); return; }
      if (!res.ok) throw new Error('Piper API HTTP ' + res.status);

      const data = await res.json();
      const campaigns = Array.isArray(data && data.campaigns) ? data.campaigns : [];
      const available = campaigns.filter((c) => c && c.assignmentStatus === AVAILABLE_STATUS);

      const seen = new Set(GM_getValue('seenIds', []));
      const fresh = available.filter((c) => !seen.has(String(c.id)));

      if (fresh.length) {
        if (cfg.desktopNotify) {
          GM_notification({ title: 'Piper: notun survey', text: fresh.map((c) => `${titleOf(c)} — ${money(c.reward)} · ${c.estimatedTimeMinutes} min`).join('\n'), timeout: 15000 });
        }
        await sendTelegram(buildMessage(fresh)); // fail hole seen e jabe na, porer bar abar try korbe
        fresh.forEach((c) => seen.add(String(c.id)));
        GM_setValue('seenIds', Array.from(seen).slice(-MAX_SEEN));
      }

      status(`watching · ${available.length} available · last check ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      console.error('[Piper TG Notifier]', e);
      status('error: ' + e.message, true);
    } finally {
      busy = false;
    }
  }

  if (!cfg.botToken || !cfg.chatId) {
    setTimeout(() => status('Tampermonkey menu theke bot token ar chat ID set koro', true), 1500);
  }

  setTimeout(check, 3000);
  setInterval(check, cfg.intervalSec * 1000);
})();
