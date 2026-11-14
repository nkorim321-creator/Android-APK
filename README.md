# Piper Telegram Notifier

Piper (piperpays.com) dashboard e notun survey **Available** hole Telegram e message ashe.
Je RDP er kaj, message automatic oi RDP er user er personal Telegram e jay. Admin sob RDP er kaj pay.

Telegram message e shudhu RDP number, kaj er title, reward ar time thake:

```
🖥 RDP 01
📝 Feedback on an image
💰 $0.18  ·  ⏱ 2 min
```

## Kivabe kaj kore

- Piper er dashboard nije `https://api.piperpays.com/campaigns?status=all` theke survey list ane.
- Ei script tomar login kora browser tab theke same list check kore.
- Check er kono fixed somoy nai. Protibar 1 theke 5 minute er moddhe random somoy e check hoy.
- API kaj na korle dashboard page er survey card theke title, dollar ar minute pore ney.
- `ASSIGNED` status er survey mane "Available" tab er survey.
- Script Piper profile theke login kora account er naam ney, tarpor tomar account list theke RDP number ar user khuje ber kore.
- Ekbar je survey er message gese, seta abar pathay na. Same title er notun survey ashle seta jay.
- Login expire hole page reload kore, site nijei login refresh kore.
- Logout hoye gele ekbar Telegram e warning pathay.

## Setup (protita RDP te)

### 1. Telegram bot banao (ekbar-i)

1. Telegram e **@BotFather** search kore kholo. Nil tick wala ta-i asol.
2. `/newbot` pathao.
3. Bot er ekta naam dao, jemon `Piper Alert`.
4. Ekta username dao, sheshe `bot` thakte hobe. Jemon `rebeca_piper_alert_bot`.
5. BotFather ekta **token** dibe, dekhte emon: `123456789:ABCdefGhIJKlmNoPQRstuVWxyz`. Eta copy kore rakho, karo sathe share korba na.
6. Bot er link (`t.me/tomar_bot_username`) sob user ke pathao. **Sobai link e giye Start chapbe.** Start na chaple bot take message dite pare na.

### 2. Tampermonkey ar script install koro

1. Browser er extension store theke **Tampermonkey** install koro.
2. Tampermonkey icon e click koro, tarpor **Create a new script**.
3. Ja ache sob muche dao, `piper-telegram-notifier.user.js` er puro code paste koro.
4. `Ctrl + S` diye save koro.

### 3. Menu theke set koro

https://www.piperpays.com/dashboard kholo, login koro, tarpor Tampermonkey icon e click koro.
**Piper Telegram Notifier** er niche menu ashbe.

1. **1. Telegram bot token set koro**: BotFather er token paste koro.
2. **2. Account add koro**: emon lekho

   ```
   Rhonda,1,Navid,6405530876
   ```

   Mane: `Piper naam, RDP number, User naam, User er Telegram chat ID`.
   OK chapar por script dekhabe ki save hobe, abar OK chapo.
3. **3. Admin chat ID set koro**: je (tumi) sob RDP er kaj pabe tar chat ID. Koyekjon hole comma diye.
4. **4. Test message pathao**: ei RDP er user ar admin test message pele setup shesh.

Prothom bar Tampermonkey ekta page dekhate pare je script `api.piperpays.com` ba `api.telegram.org` e jete chay.
Okhane **Always allow domain** e click koro. Na korle script survey dekhte parbe na.

## Account add korar niyom

| Ki chao | Ki lekhbe |
|---|---|
| Ek ta account | `Rhonda,1,Navid,6405530876` |
| Koyekta eksathe | `Rhonda,1,Navid,6405530876; Rebeca,2,Nabila,7012345678` |
| Ek account 2 jon er | `Rhonda,1,Navid,6405530876,Nabila,7012345678` |
| User nai, shudhu admin pabe | `Rebeca,2` |
| RDP er user bodlano | Same Piper naam diye notun line add koro, purono ta bodle jabe |

- Piper naam ta dashboard er "Afternoon, Rebeca" te je naam dekhay seta. Boro-choto hater lekha na milleo chole.
- `RDP 1` likhleo chole. Message e `RDP 01` dekhay.
- Bhul lekha hole script kichu save kore na, kon line bhul seta dekhay.
- List e na thaka account er kaj shudhu admin pay, message e `RDP ?? (Jessica list e nai)` dekhay.

### Chat ID kivabe pabe

1. User bot er link e giye **Start** chapbe.
2. Tumi menu theke **Chat ID khujo** dao.
3. Sobar naam ar chat ID dekhabe. Ke already kon RDP te ache `✔` diye dekhay.

Group e kaj pathate bot ke group e add koro, tarpor **Chat ID khujo** dao. Group er ID minus (-) diye shuru hoy, seta admin e boshao.

### Onek RDP

- Tampermonkey er setting protita browser e alada thake. Tai protita RDP te bot token ar account set korte hobe.
- Protita RDP te shudhu tar nijer account er line holei kaj chole. Sob line dileo somossa nai.
- Sohoj upay: ekta RDP te sob account add koro, tarpor **Account list copy koro** diye lekha ta copy koro.
  Onno RDP te **2. Account add koro** te paste koro.
- **Account list dekho / remove koro** te sob account, admin, ar ei RDP er kaj kar kache jay dekhay. Number lekhle oi account remove hoy.

### Script update

- Notun code purono script er upor-e paste kore save koro. Token, account list ar admin theke jay.
- Script delete kore notun banale sob setting muche jay, abar set korte hobe.
- Version 2.x e menu diye add kora chat list e message jay, jotokkhon na account ba admin set koro.

Page er niche bam dike ekta chhoto kalo label dekhabe: `TG Notifier: RDP 01 (Rhonda) · watching (API) · 1 available ...`.
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

Asol limit holo **RDP ar dashboard tab chalu thakte hobe**. RDP bondho, sleep ba tab bondho thakle check hoy na.

## Kaj na korle

1. Tampermonkey menu theke **🔍 Ekhon check koro** e click koro.
2. Ekta box e dekhabe koyta survey pawa gelo, koyta pathano holo, kar kache jay, ba ki error holo.
3. "Egulo age-i pathano hoyeche" dekhale **Seen list clear koro** te click koro, abar pathabe.
4. Bhul manush kaj pele **Account list dekho / remove koro** te list ta milao.
5. User bot block korle ba Start na chaple admin kaj ta pay, sathe ekta warning o pay.
6. Kono error hole script Telegram e o janay, 30 minute e ekbar.

## Joruri kotha

- **Dashboard tab khola rakhte hobe.** Tab bondho korle ba RDP sleep e gele check bondho thakbe.
- Chrome er **Memory Saver** e `piperpays.com` ke "Always keep these sites active" e add koro. Na hole Chrome tab ta ghum pariye dite pare.
- Tab background e thakle o kaj kore.
- Ek browser e koyekta dashboard tab khola thakle shudhu ekta tab check kore. Oi tab bondho hole arekta tab dayitto ney.
- Internet na thakle script page reload kore na, internet fire ashle nijei abar check shuru kore.
- Random somoy er karone notun survey er message ashte 1-5 minute deri hote pare.
- Script tomar Piper password ba token kothao pathay na. Telegram e shudhu RDP number, survey er title, pay ar time jay.
- Bot token kono error message e dekhay na.
