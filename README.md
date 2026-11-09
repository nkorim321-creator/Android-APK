# Piper WhatsApp Notifier

Piper (piperpays.com) dashboard e notun survey **Available** hole WhatsApp e message ashe.
Message e thake survey er title, koto dollar/cent, ar koto minute lagbe.

```
🔔 Notun Piper survey available!

📝 Feedback on an image
💰 $0.18  ·  ⏱ 2 min
🏷 Paid opinion

👉 https://www.piperpays.com/dashboard
```

## Kivabe kaj kore

- Piper er dashboard nije `https://api.piperpays.com/campaigns?status=all` theke survey list ane.
- Ei script tomar login kora browser tab theke same API protiti 60 second e check kore.
- `ASSIGNED` status er survey mane "Available" tab er survey.
- Notun survey pele CallMeBot er free API diye tomar WhatsApp e message pathay.
- Ekbar je survey er message gese, seta abar pathay na.
- Login expire hole page reload kore, site nijei login refresh kore.
- Logout hoye gele ekbar WhatsApp e warning pathay.

## Setup (PC te, Chrome / Edge / Firefox)

### 1. CallMeBot theke API key nao

1. Phone e ei number ta contact e save koro: **+34 644 87 82 92**
2. WhatsApp theke oi contact e ei message pathao: `I allow callmebot to send me messages`
3. Kichukkhon por reply ashbe: `API Activated ... Your APIKEY is 123456`. Ei APIKEY ta rakho.
4. 2 minute er moddhe reply na ashle 24 ghonta por abar try koro.

Number ta CallMeBot majhe majhe bodlay. Kaj na korle https://www.callmebot.com/blog/free-api-whatsapp-messages/ theke notun number dekho.

### 2. Tampermonkey install koro

Browser er extension store theke **Tampermonkey** install koro.

### 3. Script install koro

1. Tampermonkey icon e click koro, tarpor **Create a new script**.
2. Ja ache sob muche dao.
3. `piper-whatsapp-notifier.user.js` file er puro code paste koro.
4. `Ctrl + S` diye save koro.

### 4. Number ar API key set koro

1. https://www.piperpays.com/dashboard kholo ar login koro.
2. Tampermonkey icon e click koro, **Piper WhatsApp Notifier** er niche menu ashbe.
3. **1. WhatsApp number set koro** e click kore number dao, country code shoho. Jemon `+8801712345678`.
4. **2. CallMeBot API key set koro** e click kore APIKEY dao.
5. **3. Test WhatsApp message pathao** e click koro. WhatsApp e test message ashle setup shesh.

Page er niche bam dike ekta chhoto kalo label dekhabe: `WA Notifier: watching · 1 available · last check ...`.
Eta dekhle bujhbe script cholche.

## Joruri kotha

- **Dashboard tab khola rakhte hobe.** Tab bondho korle ba PC sleep e gele check bondho thakbe.
- Chrome er **Memory Saver** e `piperpays.com` ke "Always keep these sites active" e add koro. Na hole Chrome tab ta ghum pariye dite pare.
- Tab background e thakle o kaj kore, minute e ekbar check hoy.
- Menu theke check interval bodlano jay. Minimum 30 second.
- Script tomar password ba token kothao pathay na. Shudhu WhatsApp message er text CallMeBot e jay.
