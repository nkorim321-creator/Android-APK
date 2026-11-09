# Piper Telegram Notifier

Piper (piperpays.com) dashboard e notun survey **Available** hole Telegram e message ashe.
Message e thake survey er title, koto dollar/cent, ar koto minute lagbe.
Niche ekta **Dashboard kholo** button o thake.

```
🔔 Notun Piper survey available!

📝 Feedback on an image
💰 $0.18  ·  ⏱ 2 min
🏷 Paid opinion

[ 👉 Dashboard kholo ]
```

## Kivabe kaj kore

- Piper er dashboard nije `https://api.piperpays.com/campaigns?status=all` theke survey list ane.
- Ei script tomar login kora browser tab theke same list protiti 60 second e check kore.
- API kaj na korle dashboard page er survey card theke title, dollar ar minute pore ney.
- `ASSIGNED` status er survey mane "Available" tab er survey.
- Notun survey pele tomar nijer Telegram bot diye tomake message pathay.
- Ekbar je survey er message gese, seta abar pathay na.
- Login expire hole page reload kore, site nijei login refresh kore.
- Logout hoye gele ekbar Telegram e warning pathay.

## Setup (PC te, Chrome / Edge / Firefox)

### 1. Telegram bot banao

1. Telegram e **@BotFather** search kore kholo. Nil tick wala ta-i asol.
2. `/newbot` pathao.
3. Bot er ekta naam dao, jemon `Piper Alert`.
4. Ekta username dao, sheshe `bot` thakte hobe. Jemon `rebeca_piper_alert_bot`.
5. BotFather ekta **token** dibe, dekhte emon: `123456789:ABCdefGhIJKlmNoPQRstuVWxyz`. Eta copy kore rakho, karo sathe share korba na.
6. BotFather er message e tomar bot er link thakbe. Oi link e giye **Start** chapo ba `/start` pathao.

### 2. Tampermonkey install koro

Browser er extension store theke **Tampermonkey** install koro.

### 3. Script install koro

1. Tampermonkey icon e click koro, tarpor **Create a new script**.
2. Ja ache sob muche dao.
3. `piper-telegram-notifier.user.js` file er puro code paste koro.
4. `Ctrl + S` diye save koro.

Age WhatsApp version install korle oita Tampermonkey Dashboard theke delete kore dao.

### 4. Token ar chat ID set koro

1. https://www.piperpays.com/dashboard kholo ar login koro.
2. Tampermonkey icon e click koro, **Piper Telegram Notifier** er niche menu ashbe.
3. **1. Telegram bot token set koro** e click kore BotFather er token paste koro.
4. **2. Chat ID auto detect koro** e click koro. "Chat ID pawa geche" dekhabe.
5. **3. Test Telegram message pathao** e click koro. Telegram e test message ashle setup shesh.

Prothom bar Tampermonkey ekta page dekhate pare je script `api.piperpays.com` ba `api.telegram.org` e jete chay.
Okhane **Always allow domain** e click koro. Na korle script survey dekhte parbe na.

Step 4 e "Kono message pawa jay nai" dekhale, bot ke abar `/start` pathiye try koro.

Page er niche bam dike ekta chhoto kalo label dekhabe: `TG Notifier: watching · 1 available · last check ...`.
Eta dekhle bujhbe script cholche.

## Kaj na korle

1. Tampermonkey menu theke **🔍 Ekhon check koro** e click koro.
2. Ekta box e dekhabe koyta survey pawa gelo, koyta pathano holo, ba ki error holo.
3. "Egulo age-i pathano hoyeche" dekhale **Seen list clear koro** te click koro, abar pathabe.
4. Kono error hole script Telegram e o janay, 30 minute e ekbar.

## Joruri kotha

- **Dashboard tab khola rakhte hobe.** Tab bondho korle ba PC sleep e gele check bondho thakbe.
- Chrome er **Memory Saver** e `piperpays.com` ke "Always keep these sites active" e add koro. Na hole Chrome tab ta ghum pariye dite pare.
- Tab background e thakle o kaj kore, minute e ekbar check hoy.
- Menu theke check interval bodlano jay. Minimum 30 second.
- Script tomar Piper password ba token kothao pathay na. Shudhu survey er title, pay ar time Telegram e jay.
