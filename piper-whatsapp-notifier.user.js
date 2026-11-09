// ==UserScript==
// @name         Piper WhatsApp Notifier
// @namespace    https://github.com/nkorim321-creator/android-apk
// @version      1.0.0
// @description  Piper dashboard e notun survey (hit) available hole WhatsApp e title, pay ar time pathay.
// @match        https://www.piperpays.com/*
// @match        https://piperpays.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @connect      api.callmebot.com
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Settings. Phone ar API key Tampermonkey menu theke set kora jay, code edit
  // korar dorkar nei. Ekhane default value gulo.
  // ---------------------------------------------------------------------------
  const API_BASE = 'https://api.piperpays.com';          // Piper er nijer API
  const CAMPAIGNS_PATH = '/campaigns?status=all';         // dashboard eta-i call kore
  const AVAILABLE_STATUS = 'ASSIGNED';                    // "Available" tab = ASSIGNED
  const ACCESS_TOKEN_KEY = 'access_token';                // site er localStorage key
  const DASHBOARD_URL = 'https://www.piperpays.com/dashboard';
  const MAX_SEEN = 500;

  const cfg = {
    get phone() { return GM_getValue('phone', ''); },
    get apiKey() { return GM_getValue('apiKey', ''); },
    get intervalSec() { return Math.max(30, Number(GM_getValue('intervalSec', 60)) || 60); },
    get desktopNotify() { return GM_getValue('desktopNotify', true); },
  };

  // ---------------------------------------------------------------------------
  // Tampermonkey menu
  // ---------------------------------------------------------------------------
  GM_registerMenuCommand('1. WhatsApp number set koro', () => {
    const v = prompt('Tomar WhatsApp number, country code shoho (jemon +8801712345678):', cfg.phone);
    if (v !== null) { GM_setValue('phone', v.replace(/[^\d+]/g, '')); status('Number saved'); }
  });
  GM_registerMenuCommand('2. CallMeBot API key set koro', () => {
    const v = prompt('CallMeBot theke pawa APIKEY:', cfg.apiKey);
    if (v !== null) { GM_setValue('apiKey', v.trim()); status('API key saved'); }
  });
  GM_registerMenuCommand('3. Test WhatsApp message pathao', () => {
    sendWhatsApp('✅ Piper Notifier test message. Setup thik ache!')
      .then(() => alert('Test message pathano hoyeche. WhatsApp check koro.'))
      .catch((e) => alert('Pathano jay nai: ' + e.message));
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

  function tokenExpiresSoon(token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload.exp === 'number' && payload.exp * 1000 - 30000 <= Date.now();
    } catch (_) {
      return false;
    }
  }

  function sendWhatsApp(text) {
    return new Promise((resolve, reject) => {
      if (!cfg.phone || !cfg.apiKey) {
        reject(new Error('Phone ba API key set kora nai. Tampermonkey menu theke set koro.'));
        return;
      }
      const url = 'https://api.callmebot.com/whatsapp.php'
        + '?phone=' + encodeURIComponent(cfg.phone)
        + '&text=' + encodeURIComponent(text)
        + '&apikey=' + encodeURIComponent(cfg.apiKey);
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 20000,
        onload: (r) => (r.status >= 200 && r.status < 300 ? resolve(r) : reject(new Error('CallMeBot HTTP ' + r.status + ': ' + (r.responseText || '').slice(0, 200)))),
        onerror: () => reject(new Error('CallMeBot network error')),
        ontimeout: () => reject(new Error('CallMeBot timeout')),
      });
    });
  }

  function buildMessage(list) {
    const head = list.length === 1 ? '🔔 *Notun Piper survey available!*' : `🔔 *${list.length} ta notun Piper survey available!*`;
    const body = list.map((c) =>
      `📝 *${titleOf(c)}*\n💰 ${money(c.reward)}  ·  ⏱ ${c.estimatedTimeMinutes ?? '?'} min\n🏷 ${labelOf(c)}`
    ).join('\n\n');
    return `${head}\n\n${body}\n\n👉 ${DASHBOARD_URL}`;
  }

  // ---------------------------------------------------------------------------
  // Small status pill on the page so you can see it is running.
  // ---------------------------------------------------------------------------
  let pill;
  function status(text, isError) {
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'piper-wa-notifier';
      Object.assign(pill.style, {
        position: 'fixed', left: '12px', bottom: '84px', zIndex: 2147483647,
        font: '12px/1.3 system-ui, sans-serif', padding: '6px 10px', borderRadius: '999px',
        background: 'rgba(20,20,20,.85)', color: '#fff', pointerEvents: 'none',
        maxWidth: 'calc(100vw - 24px)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      });
      document.body.appendChild(pill);
    }
    pill.style.background = isError ? 'rgba(160,30,30,.92)' : 'rgba(20,20,20,.85)';
    pill.textContent = '📲 WA Notifier: ' + text;
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
          sendWhatsApp('⚠️ Piper theke logout hoye gecho. Notification pete abar login koro: ' + DASHBOARD_URL).catch(() => {});
        }
        return;
      }
      GM_setValue('loggedOutWarned', false);

      // Token expire hole site nijei refresh kore page load er somoy.
      // Tai amra nije refresh na kore page reload kori, jate site er login nosto na hoy.
      if (tokenExpiresSoon(token)) {
        const last = Number(GM_getValue('lastReloadAt', 0));
        if (Date.now() - last > 60000) {
          GM_setValue('lastReloadAt', Date.now());
          status('login refresh er jonno reload...');
          location.reload();
        }
        return;
      }

      const res = await fetch(API_BASE + CAMPAIGNS_PATH, {
        headers: { Authorization: 'Bearer ' + token },
        cache: 'no-store',
      });
      if (res.status === 401) {
        const last = Number(GM_getValue('lastReloadAt', 0));
        if (Date.now() - last > 60000) {
          GM_setValue('lastReloadAt', Date.now());
          location.reload();
        }
        return;
      }
      if (!res.ok) throw new Error('Piper API HTTP ' + res.status);

      const data = await res.json();
      const campaigns = Array.isArray(data && data.campaigns) ? data.campaigns : [];
      const available = campaigns.filter((c) => c && c.assignmentStatus === AVAILABLE_STATUS);

      const seen = new Set(GM_getValue('seenIds', []));
      const fresh = available.filter((c) => !seen.has(String(c.id)));

      if (fresh.length) {
        const msg = buildMessage(fresh);
        if (cfg.desktopNotify) {
          GM_notification({ title: 'Piper: notun survey', text: fresh.map((c) => `${titleOf(c)} — ${money(c.reward)} · ${c.estimatedTimeMinutes} min`).join('\n'), timeout: 15000 });
        }
        await sendWhatsApp(msg); // fail hole seen e jabe na, porer bar abar try korbe
        fresh.forEach((c) => seen.add(String(c.id)));
        GM_setValue('seenIds', Array.from(seen).slice(-MAX_SEEN));
      }

      const time = new Date().toLocaleTimeString();
      status(`watching · ${available.length} available · last check ${time}`);
    } catch (e) {
      console.error('[Piper WA Notifier]', e);
      status('error: ' + e.message, true);
    } finally {
      busy = false;
    }
  }

  if (!cfg.phone || !cfg.apiKey) {
    setTimeout(() => status('Tampermonkey menu theke number ar API key set koro', true), 1500);
  }

  setTimeout(check, 3000);
  setInterval(check, cfg.intervalSec * 1000);
})();
