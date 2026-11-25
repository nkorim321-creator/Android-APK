# Piper Telegram Notifier

Piper (piperpays.com) dashboard e notun survey **Available** hole Telegram e message ashe.
Je RDP er kaj, message automatic oi RDP er user er personal Telegram e jay. Admin sob RDP er kaj pay.
Cash-out er hisab (kon ID te kon tarikh e koto dollar) Telegram e na, tomar nijer server er monitor page e dekhay.

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

## Cash-out monitor (nijer server e)

Cash-out er hisab Telegram e jay na. Protita RDP er script tar account er cash-out ar balance tomar nijer server e pathay.
Browser e server er link khulle (password diye) monitor page dekhay:

- **Upore 3 ta box:** sob ID mile mot koto paid, koto ashche (On its way), ar mot balance koto.
- **ID onujayi:** protita RDP / account er mot paid, koyta cash-out, balance, lifetime, shesh cash-out er tarikh, ar shesh kokhon data eseche. 3 ghonta data na ashle lal ⚠ dekhay, mane oi RDP er script bondho.
- **Mash onujayi:** kon mash e koto dollar paid hoyeche.
- **Sob cash-out:** tarikh, RDP, account, dollar ar status. Upore RDP bachai kore shudhu oi RDP er gula dekha jay.

### Taka bhag (Worker / Buyer / VPS)

Monitor protita Paid cash-out ke bhag kore dekhay:

- Protita cash-out theke age $0.50 fee kate. Baki ta **Received**.
- Received taka Worker 50%, Buyer 25%, VPS 25%.
- Jemon $11.12 cash-out: Received $10.62, Worker $5.31, Buyer $2.66, VPS $2.65.
- Adha cent hole (jemon $10.62 er 25% = $2.655) ekjon 1 cent beshi pay, jate Worker + Buyer + VPS sob somoy Received er shoman hoy.
- Table e Sent, Fee, Received, Worker, Buyer, VPS alada column e thake.
- "On its way" cash-out er hisab italic e dekhay, total e dhora hoy na. Canceled ar failed er bhag hoy na.

Percent ba fee bodlate server chalanor command e jog koro, jemon `--worker 50 --buyer 25 --vps 25 --fee 0.50`. Worker + Buyer + VPS mile 100 hote hobe.

### Settled tick (shudhu admin)

Kono cash-out er taka Worker, Buyer ar VPS ke diye dile oi cash-out e **Settled** tick dao.

- Tick deya cash-out upore box ("To settle", "Worker to pay", "Buyer to pay", "VPS to pay") ar "By account" er hisab theke bad jay. Mane upore shudhu ja ekhono dite baki seta dekhay.
- "By month" e sob Paid cash-out thake, tick deya hok ba na hok.
- Tick shudhu **admin** dite pare. Server chalanor somoy `--admin-password` dao. Monitor e **Admin login** e click kore oi password dao (12 ghonta mone rakhe).
- Admin password server e thake, page e kokhono ashe na. Admin na hole page e checkbox-i thake na, ar Inspect diye checkbox banalew server tick save kore na.
- Ekshathe onek gula: RDP bachai koro, tarpor **Mark shown as settled** chapo.
- Bhul tick dile admin abar click kore tick tule dite pare.
- Admin password e 15 minute e 5 bar bhul dile oi IP 15 minute atke thake.
- Admin password ar monitor password ek hole server chalu hoy na.

Page protiti 1 minute e nijei refresh hoy. Script protita RDP te 45-90 minute e ekbar data pathay.
Script shudhu pore: cash-out request ba "Redeem your reward" kokhono chape na, reward er link o pathay na.

### Server e chalu kora (ekbar)

Server e **Node.js** (16 ba notun) lagbe. Kono npm package lage na.

1. `cashout-server/server.js` file ta server er ekta folder e rakho, jemon `piper-cashout`.
2. Oi folder e giye chalao (port ar password nijer moto):

   ```
   node server.js --port 3200 --password tomar-password
   ```

   `Piper Cash-out Monitor cholche: http://0.0.0.0:3200` dekhale cholche.
3. Sob somoy chalu rakho, jate server restart er por o nijei chalu hoy:
   - **Windows server:** Administrator PowerShell e ei ek line dao (folder `C:\Piper Monitor` dhore). Server Task Scheduler e background e chole, kono window khola rakhte hoy na, login chara-o restart er por chalu hoy:

     ```
     Register-ScheduledTask -TaskName 'Piper Cash-out Monitor' -Action (New-ScheduledTaskAction -Execute (Get-Command node).Source -Argument '"C:\Piper Monitor\server.js" --port 3200 --password tomar-password --admin-password admin-er-password' -WorkingDirectory 'C:\Piper Monitor') -Trigger (New-ScheduledTaskTrigger -AtStartup) -Settings (New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)) -User 'NT AUTHORITY\SYSTEM' -RunLevel Highest -Force
     ```

     Tarpor `Start-ScheduledTask -TaskName 'Piper Cash-out Monitor'`. `server.js` bodlale age `Stop-ScheduledTask -TaskName 'Piper Cash-out Monitor'`, file bodlao, tarpor abar `Start-ScheduledTask`.
   - **Linux server:** pm2 diye chalao:

     ```
     npm install -g pm2
     pm2 start server.js --name piper-cashout -- --port 3200 --password tomar-password --admin-password admin-er-password
     pm2 save
     ```

     Restart er por o chalu rakhte ekbar `pm2 startup` dao, je command dekhay seta chalao.
4. Server er firewall e port ta kholo:
   - Ubuntu: `sudo ufw allow 3200/tcp`
   - Windows: `netsh advfirewall firewall add rule name="Piper Cash-out 3200" dir=in action=allow protocol=TCP localport=3200`
   - Server company (VPS) er panel e alada firewall thakle okhane o 3200 kholo.
5. Browser e `http://SERVER-IP:3200` kholo. Password page ashle server thik ache.

Port 3200 e age theke kichu cholle server bole `Port 3200 e already onno kichu cholche`. Tokhon onno port dao, jemon `--port 3201`.

Data thake `server.js` er pasher `cashout-data.json` file e. Ei file muche dile monitor khali hoye jay; RDP gula porer bar abar pathabe.

### Protita RDP te

1. Notun userscript ta purono script er upor-e paste kore save koro.
2. Tampermonkey menu theke **💵 Cash-out monitor link set koro** e click koro.
3. Server er link lekho, jemon `http://SERVER-IP:3200`, tarpor password dao.
4. Script sathe sathe ei RDP er cash-out pathabe, ar monitor er link dekhabe.

Prothom bar Tampermonkey server er IP te jete permission chaite pare. **Always allow domain** chapo.

### Monitor dekha

Browser e `http://SERVER-IP:3200` kholo, password dao. Ekbar dile oi browser 1 bochor mone rakhe. Phone e o khole.

### Somossa hole

- **Menu theke dekho:** **💵 Cash-out monitor e ekhon pathao** dile sathe sathe pathay, ar kichu bhul hole ki bhul seta bole.
- **Shesh kokhon gese:** **Account list dekho / remove koro** ar **🔍 Ekhon check koro** te `Cash-out monitor:` line e dekhay shesh kokhon pathano hoyeche, ba ki error.
- **"Monitor: password bhul":** Tampermonkey er password ar server er `--password` mile na.
- **"Monitor server e jete parchi na":** server bondho, ba firewall e port khola nai.
- **"thik uttor ashe nai (HTTP 404)":** link e bhul port, onno kono app (jemon BP monitor) er port deya hoyeche.
- **15 minute e 20 bar bhul password** dile oi IP 15 minute atke thake.
- **Password bodlate:** server notun `--password` diye abar chalao, protita RDP te menu theke notun password dao, browser e abar login koro.
- **Monitor bondho korte:** menu te link er jaygay khali kore OK chapo. Tokhon script Piper er cash-out pora-o bondho kore.

Server ta `http` e chole, tai password network e lukano thake na. Ei password ta onno kothao (Piper, email) use korba na.

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
- Script tomar Piper password ba token kothao pathay na. Telegram e shudhu RDP number, survey er title, pay ar time jay. Cash-out er tarikh, dollar ar status shudhu tomar nijer monitor server e jay.
- Bot token kono error message e dekhay na.
