# Piper Telegram Notifier

Piper (piperpays.com) dashboard e notun survey **Available** hole Telegram e message ashe.
Message e thake survey er title, koto dollar/cent, ar koto minute lagbe.
Je account jar, message automatic tar personal Telegram e jay. Admin sob account er message pay.

```
👤 Rhonda No:01  →  Navid
🔔 Notun Piper survey available!

📝 Feedback on an image
💰 $0.18  ·  ⏱ 2 min
🏷 Paid opinion

[ 👉 Dashboard kholo ]
```

## Kivabe kaj kore

- Piper er dashboard nije `https://api.piperpays.com/campaigns?status=all` theke survey list ane.
- Ei script tomar login kora browser tab theke same list check kore.
- Check er kono fixed somoy nai. Protibar 1 theke 5 minute er moddhe random somoy e check hoy.
- API kaj na korle dashboard page er survey card theke title, dollar ar minute pore ney.
- `ASSIGNED` status er survey mane "Available" tab er survey.
- Notun survey pele tomar nijer Telegram bot diye message pathay: account er malik ke, ar admin ke.
- Ekbar je survey er message gese, seta abar pathay na. Same title er notun survey ashle seta jay.
- Login expire hole page reload kore, site nijei login refresh kore.
- Logout hoye gele ekbar Telegram e warning pathay.

## Je account jar, message tar kache

Script er ekdom upore 3 ta list ache. Egulo tumi nije bhorba.

```js
  // 1) MANUSH LIST: naam ar tar Telegram chat ID
  const PEOPLE = {
    'Admin':  '900000001',
    'Navid':  '111111111',
    'Nabila': '222222222',
  };

  // 2) Ei manush ra SOB account er message pabe
  const ALL_ACCOUNTS_TO = ['Admin'];

  // 3) ACCOUNT LIST: 'Piper er naam': [number, 'account ta kar'],
  const ACCOUNTS = {
    'Rhonda': [1, 'Navid'],
    'Rebeca': [2, 'Nabila'],
    'Jessica': [7, 'Nabila'],
  };
```

Ei list e:

- `Rhonda No:01` e survey ashle **Navid** ar **Admin** pabe. Nabila pabe na.
- `Rebeca No:02` ar `Jessica No:07` e survey ashle **Nabila** ar **Admin** pabe.
- Account ta onno karo hate dile shudhu oi line er naam bodlao.

Niyom:

- Piper er naam ta hubohu dashboard er "Afternoon, Rebeca" te je naam dekhay seta-i dibe. Boro-choto hater lekha na milleo chole.
- Malik er naam ta `PEOPLE` list er naam er sathe milte hobe.
- Ek account koyekjon er hole: `'Rhonda': [1, 'Navid', 'Nabila'],`
- Malik na dile (`'Rebeca': [2],`) shudhu `ALL_ACCOUNTS_TO` er manush ra pabe.
- `ALL_ACCOUNTS_TO` te ekta group o dite paro. Group ke `PEOPLE` e add koro, group er chat ID minus diye shuru hoy.
- `ACCOUNTS` list e na thaka account er message `Jessica No:??` hisebe shudhu admin er kache jay.
- Malik er chat ID na thakle message er prothom line e `Navid (chat ID nai!)` dekhay.
- Malik bot block korle ba Start na chaple admin survey ta pay, sathe ekta warning o pay.
- Logout warning ar error o ei ek-i manush der kache jay.

### Chat ID kivabe pabe

1. Bot er link (`t.me/tomar_bot_username`) oi manush ke pathao.
2. Se link e giye **Start** chapbe. Start na chaple bot take message dite pare na.
3. Tumi dashboard e Tampermonkey menu theke **2. Chat ID khujo** e click koro.
4. Ekta box e sobar naam ar chat ID dekhabe. Nicher line ta copy kore `PEOPLE` list e boshao.
5. Naam gulo nijer moto thik kore nao (jemon `'Navid': '111111111',`), tarpor script save koro.

Group er chat ID pete bot ke group e add koro, tarpor **2. Chat ID khujo** dao.

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

### 4. Token set koro ar list bhoro

1. https://www.piperpays.com/dashboard kholo ar login koro.
2. Tampermonkey icon e click koro, **Piper Telegram Notifier** er niche menu ashbe.
3. **1. Telegram bot token set koro** e click kore BotFather er token paste koro.
4. **2. Chat ID khujo** diye sobar chat ID ber koro.
5. Script er upore `PEOPLE`, `ALL_ACCOUNTS_TO` ar `ACCOUNTS` list bhoro, save koro, dashboard reload koro.
6. **Kon account kar kache jay dekho** te click kore list ta milao.
7. **3. Test message pathao** e click koro. Ei account er malik ar admin test message pele setup shesh.

Prothom bar Tampermonkey ekta page dekhate pare je script `api.piperpays.com` ba `api.telegram.org` e jete chay.
Okhane **Always allow domain** e click koro. Na korle script survey dekhte parbe na.

Step 4 e "Kono message pawa jay nai" dekhale, bot ke abar `/start` pathiye try koro.

### Koyekta account

- Prottek account alada browser ba Chrome profile e login thake.
- Shob jaygay same script paste koro, ar protitay bot token set koro.
- List bodlale shob browser er script e notun code paste korte hobe.
- **Script update korar age tomar 3 ta list copy kore rekho.** Notun code paste korle list gulo abar boshate hobe.

### Purono version (2.x) theke update

- Bot token ar seen list theke jay. Age pathano survey abar jabe na.
- `PEOPLE` list e chat ID na boshano porjonto message purono chat list e-i jay.
- `PEOPLE` e ekta chat ID boshalei purono chat list ar use hoy na.
- Purono `'Rhonda': 1,` lekha o chole, kintu tate malik thake na.

Page er niche bam dike ekta chhoto kalo label dekhabe: `TG Notifier: Rhonda No:01 · watching (API) · 1 available ...`.
Eta dekhle bujhbe script cholche.

## Limit

| Jinis | Limit |
|---|---|
| Telegram bot | Free. Ek chat e second e 1 ta, group e minute e 20 ta message. Ei script er jonno ei limit kokhono lagbe na. |
| Koto jon ke pathano jay | Kono fixed limit nai. |
| Ek message e koto survey | Onek survey eksathe ashle script nijei koyekta message e bhag kore pathay. |
| Check | Protibar 1-5 minute er moddhe random somoy e, ghontay mot 20 er moto. Menu theke **Random check time bodlao** diye range bodlano jay, jemon `2-6`. Minimum 0.5 minute. |
| Piper API | Piper kono limit lekhe nai. Random somoy dile pattern dhora kothin hoy, kintu puropuri lukano jay na. |
| Seen list | Shesh 1000 ta survey mone rakhe. |

Asol limit holo **PC ar dashboard tab chalu thakte hobe**. PC bondho, sleep ba tab bondho thakle check hoy na.

## Kaj na korle

1. Tampermonkey menu theke **🔍 Ekhon check koro** e click koro.
2. Ekta box e dekhabe koyta survey pawa gelo, koyta pathano holo, kar kache jay, ba ki error holo.
3. "Egulo age-i pathano hoyeche" dekhale **Seen list clear koro** te click koro, abar pathabe.
4. Bhul manush message pele **Kon account kar kache jay dekho** te list ta milao.
5. Kono error hole script Telegram e o janay, 30 minute e ekbar.

## Joruri kotha

- **Dashboard tab khola rakhte hobe.** Tab bondho korle ba PC sleep e gele check bondho thakbe.
- Chrome er **Memory Saver** e `piperpays.com` ke "Always keep these sites active" e add koro. Na hole Chrome tab ta ghum pariye dite pare.
- Tab background e thakle o kaj kore.
- Ek browser e koyekta dashboard tab khola thakle shudhu ekta tab check kore. Oi tab bondho hole arekta tab dayitto ney.
- Internet na thakle script page reload kore na, internet fire ashle nijei abar check shuru kore.
- Page er niche label e porer check kokhon hobe seta dekhay.
- Random somoy er karone notun survey er message ashte 1-5 minute deri hote pare.
- Script tomar Piper password ba token kothao pathay na. Shudhu survey er title, pay ar time Telegram e jay.
- Bot token kono error message e dekhay na.
