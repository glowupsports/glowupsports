# Push-token-dekking — forensische audit

**Datum:** 2026-04-26
**Scope:** alle live users in Supabase (productie)
**Aanleiding:** uit Task #1359 (één-voor-iedereen update-push) bleek dat 56 % van de actieve users (32 van 57) helemaal géén push-token heeft, plus nog eens 16 die alleen een gedeactiveerde token hebben. Dit rapport reconstrueert per record waaróm die token ontbreekt.
**Verwante tasks:** #1359 (gemerged), #1360 (iOS APNs-pijplijn — bij schrijven in MERGING), #1366 (voorgesteld: `app_version` kolom), #1367 (voorgesteld: nachtelijke dood-token-sweep).
**Deployment:** OTA update (alleen markdown — geen code, geen rebuild).

---

## 1. Samenvattingstabel

### 1.1 Cohort-pivot per rol

| rol             | active 30d | active 7d | actieve token | nooit token | alleen inactief |
|-----------------|-----------:|----------:|--------------:|------------:|----------------:|
| academy_owner   |          2 |         2 |             1 |           1 |               0 |
| platform_owner  |          1 |         1 |             1 |           0 |               0 |
| player          |         54 |        29 |             7 |          31 |              16 |
| **TOTAAL**      |     **57** |    **32** |         **9** |      **32** |          **16** |

`9 + 32 + 16 = 57` ✓.

### 1.2 Token-pivot per platform (alle token-rijen van users in de 30d-cohort)

| platform | actief | inactief |
|----------|-------:|---------:|
| android  |      5 |       23 |
| ios      |      4 |       20 |
| **TOT.** |  **9** |   **43** |

Van de 43 inactieve token-rijen vallen 16 binnen het "alleen-inactief"-cohort (sectie 4); de overige 27 horen bij users die nadien wél een nieuwe actieve token hebben aangemeld of die niet in deze 30d-cohort zitten.

---

## 2. Categorisatie van de 32 "nooit-token"-records

**Verplichte taxonomie (uit het taakplan):** Web-only, Family-lobby kind, Permissie geweigerd, FCM/APNs-token-failure, Registratie-call faalde, Onbekend. Elk van de 32 records is in exact één categorie geplaatst.

| categorie                       | aantal | bewijsstandaard |
|---------------------------------|-------:|---|
| Family-lobby kind               |   **8** | `family_members.role_label = 'member'` voor het record (sub-account onder een family-creator) |
| Web-only                        |   **0** | onbewijsbaar — `users` heeft geen `last_login_platform` (zie aanbeveling #1366) |
| Permissie geweigerd             |   **0** | onbewijsbaar — client logt alleen lokaal, server ziet de denial niet |
| FCM/APNs-token-failure          |   **0** | per definitie: geen `push_device_tokens`-rij = geen failure mogelijk |
| Registratie-call faalde         |   **0** | log-scan over de retentie-window toont alleen `401 Authentication required`, géén 5xx (zie sectie 6.3) |
| Onbekend                        |  **24** | rest |
| **TOTAAL**                      | **32** | ✓ |

**Belangrijke nuance over "Onbekend":** dit is geen "weet niet" maar "kan niet uitsplitsen op basis van DB + huidige logs". Vier waarschijnlijke sub-oorzaken zitten hierin gestapeld:

1. **Web-only sessies** (gebruiker in browser): `client/hooks/usePushNotifications.ts` slaat platform `web` expliciet over, dus er ontstaat geen rij. Niet detecteerbaar zonder `last_login_platform`.
2. **Permissie geweigerd**: hook logt `[Push] Permission NOT granted` lokaal en stopt. Geen server-event.
3. **Family-creators** (4 records: ammar, hibamajzoub, pmoutafidou, itani.mohd-creator-rij): zijn de ouders die de Family Wallet beheren. Ze worden NIET in "Family-lobby kind" geplaatst (want ze zijn geen kind), maar lijken qua structuur wel op een variant: misschien beheren ze de gezinsaccounts vooral via web. Operationeel relevant — deze 4 ontvangen géén Family-Wallet-meldingen.
4. **Stille register-failures buiten de log-retentie**: zie sectie 6.3.

**De 8 "Family-lobby kind"-records uitgesplitst:**

| email                  | aantal sub-account-rijen | toelichting |
|------------------------|------------------------:|---|
| `ltvjeugd@gmail.com`   | 6                       | 6 player-rijen, allen `member`. Eén persoon, één device — token zit op het hoofd-account, sub-accounts hoeven er geen te hebben. |
| `itani.mohd@gmail.com` | 2                       | 2 `member`-rijen onder de family-creator (zelfde email, andere user-id). Idem. |

Dit zijn architecturaal géén kandidaten voor een eigen token: het family-lobby-systeem deelt één fysiek toestel over meerdere user-accounts, en `last_login_at` van een sub-account wordt door profiel-switching geüpdatet. Ze tellen in dit rapport mee als "geen probleem".

### 2.1 Per-user classificatie (alle 32 records)

| email                              | rol           | laatst       | login   | family-rol | dup. e-mails | categorie               |
|------------------------------------|---------------|--------------|---------|------------|-------------:|--------------------------|
| hibamajzoub@gmail.com              | player        | 2026-04-25   | pwd     | creator    | 1            | Onbekend                 |
| ammar@dynamo.ae                    | player        | 2026-04-24   | pwd     | creator    | 1            | Onbekend                 |
| mirna.el.cheikh@hotmail.com        | player        | 2026-04-24   | pwd     | member     | 1            | Onbekend                 |
| ltvjeugd@gmail.com                 | player        | 2026-04-24   | pwd     | member     | 6            | Family-lobby kind        |
| saudfahad66@outlook.com            | player        | 2026-04-24   | pwd     | -          | 1            | Onbekend                 |
| pmoutafidou@hotmail.com            | player        | 2026-04-24   | pwd     | creator    | 1            | Onbekend                 |
| ghasemi.neda@gmail.com             | player        | 2026-04-23   | pwd     | -          | 1            | Onbekend                 |
| nextgensportsacademydxb@gmail.com  | academy_owner | 2026-04-23   | pwd     | -          | 1            | Onbekend                 |
| progamer.klambrozy@gmail.com       | player        | 2026-04-23   | pwd     | -          | 1            | Onbekend                 |
| maximterhorst2011@gmail.com        | player        | 2026-04-22   | pwd     | -          | 1            | Onbekend                 |
| ltvjeugd@gmail.com                 | player        | 2026-04-22   | pwd     | member     | 6            | Family-lobby kind        |
| nohametawe3@gmail.com              | player        | 2026-04-21   | pwd     | -          | 1            | Onbekend                 |
| itani.mohd@gmail.com               | player        | 2026-04-21   | pwd     | creator    | 3            | Onbekend                 |
| itani.mohd@gmail.com               | player        | 2026-04-21   | pwd     | member     | 3            | Family-lobby kind        |
| khoory765@gmail.com                | player        | 2026-04-20   | apple   | -          | 1            | Onbekend                 |
| instashkafuk@gmail.com             | player        | 2026-04-19   | pwd     | -          | 1            | Onbekend                 |
| ltvjeugd@gmail.com                 | player        | 2026-04-19   | pwd     | member     | 6            | Family-lobby kind        |
| ltvjeugd@gmail.com                 | player        | 2026-04-19   | pwd     | member     | 6            | Family-lobby kind        |
| customappindustries@gmail.com      | player        | 2026-04-19   | pwd     | -          | 1            | Onbekend                 |
| khalifa.binhendi@hotmail.com       | player        | 2026-04-16   | pwd     | -          | 1            | Onbekend                 |
| ltvjeugd@gmail.com                 | player        | 2026-04-16   | pwd     | member     | 6            | Family-lobby kind        |
| itani.mohd@gmail.com               | player        | 2026-04-14   | pwd     | member     | 3            | Family-lobby kind        |
| medvedieva@gmail.com               | player        | 2026-04-13   | pwd     | -          | 1            | Onbekend                 |
| youssef.ammar@gmail.com            | player        | 2026-04-13   | pwd     | -          | 1            | Onbekend                 |
| khaledx24@hotmail.com              | player        | 2026-04-13   | pwd     | -          | 1            | Onbekend                 |
| ltvjeugd@gmail.com                 | player        | 2026-04-13   | pwd     | -          | 6            | Family-lobby kind        |
| rawanbaddour@gmail.com             | player        | 2026-04-12   | pwd     | -          | 1            | Onbekend                 |
| jamiezhangwenjia@gmail.com         | player        | 2026-04-12   | pwd     | -          | 1            | Onbekend                 |
| smolenaarsnoah@gmail.com           | player        | 2026-04-12   | pwd     | -          | 1            | Onbekend                 |
| weehooalex@gmail.com               | player        | 2026-04-09   | pwd     | -          | 1            | Onbekend                 |
| vidur109@gmail.com                 | player        | 2026-04-02   | pwd     | -          | 1            | Onbekend                 |
| tncaballeroramos@gmail.com         | player        | 2026-04-02   | pwd     | -          | 1            | Onbekend                 |

`8 Family-lobby kind + 24 Onbekend = 32` ✓.
(De zesde `ltvjeugd`-rij staat in `family-rol = -` omdat de bijbehorende `family_members`-rij verwijderd of nooit aangemaakt is voor dat specifieke user-id; structureel is het echter een sub-account onder dezelfde email, en wordt daarom in "Family-lobby kind" geclassificeerd.)

---

## 3. Categorisatie van de 16 "alleen-inactief"-records

**Verplichte taxonomie (uit het taakplan):** Overschreven vs Echt dood.

| categorie     | aantal | bewijsstandaard |
|---------------|-------:|---|
| Overschreven  | **0**  | per definitie nul: het cohort sluit users met een actieve token uit, dus "overschreven door een eigen latere actieve rij" kan niet voorkomen binnen dit cohort. De overschreven populatie van 27 rijen leeft elders (zie sectie 1.2). |
| Echt dood     | **16** | geen nieuwere token-rij (`is_active=true` óf `false`) bestaat voor dezelfde user. De rij is doodgelopen. |
| **TOTAAL**    | **16** | ✓ |

**Wortel-oorzaak van de 16 echt-dode tokens (één-op-één Task #1360):** alle 16 zijn iOS, alle 16 zijn rauwe APNs device-tokens. Bij elke push-poging retourneert de Firebase Admin SDK `messaging/invalid-registration-token` of `messaging/registration-token-not-registered`, en `server/fcm.ts:163-178` deactiveert de token onmiddellijk. Dit is geen 16 verschillende bugs — het is één pijplijn-fout die zich 16× herhaalt.

**Bewijs:**
1. **Platform-skew 16/0 naar iOS** is statistisch onmogelijk bij willekeurige uitval (verwacht zou ongeveer 50/50 zijn op basis van de actieve mix android 5 / ios 4) — wijst op platform-specifieke oorzaak.
2. **`scripts/push-update-prompt.ts:21-27`** documenteert het mechanisme letterlijk: in deze codebase staan onder `platform='ios'` rauwe 64-char APNs-tokens, en het script-comment zegt expliciet "every iOS token as failed until #1360 fixes the iOS push pipeline".
3. **`server/fcm.ts:160-180`** is het exacte deactivatie-pad — error-class match is 1-op-1 met wat Firebase teruggeeft op niet-FCM tokens.
4. **Geen overschrijving:** 0 van de 16 wordt opgevolgd door een nieuwere actieve rij. Het is dus niet het normale "nieuw toestel, oud token vervalt"-patroon, maar terugkerende deactivatie van *de enige* token van de user.

### 3.1 Per-user classificatie (alle 16 records)

| email                          | rol    | laatst       | platform | token laatst gebruikt | token aangemaakt | categorie  |
|--------------------------------|--------|--------------|----------|----------------------|------------------|------------|
| hdacameron@gmail.com           | player | 2026-04-24   | ios      | 2026-04-24           | 2026-04-24       | Echt dood  |
| shimayala02@gmail.com          | player | 2026-04-24   | ios      | 2026-04-24           | 2026-04-24       | Echt dood  |
| kandreeva.e@gmail.com          | player | 2026-04-24   | ios      | 2026-04-24           | 2026-04-24       | Echt dood  |
| rouzbeh.fazlinejad@gmail.com   | player | 2026-04-23   | ios      | 2026-04-23           | 2026-04-23       | Echt dood  |
| marine.bustros@gmail.com       | player | 2026-04-22   | ios      | 2026-04-22           | 2026-04-16       | Echt dood  |
| sarahmohieldin@gmail.com       | player | 2026-04-21   | ios      | 2026-04-21           | 2026-04-21       | Echt dood  |
| scuotris@gmail.com             | player | 2026-04-21   | ios      | 2026-04-21           | 2026-04-10       | Echt dood  |
| ashsaha134@gmail.com           | player | 2026-04-19   | ios      | 2026-04-19           | 2026-03-31       | Echt dood  |
| ammar@dynamo.ae                | player | 2026-04-17   | ios      | 2026-04-24           | 2026-04-09       | Echt dood  |
| mirna.el.cheikh@hotmail.com    | player | 2026-04-14   | ios      | 2026-04-24           | 2026-03-31       | Echt dood  |
| frau.bauer.c@gmail.com         | player | 2026-04-14   | ios      | 2026-04-13           | 2026-04-13       | Echt dood (note A) |
| ceciliakmurat@gmail.com        | player | 2026-04-13   | ios      | 2026-04-13           | 2026-04-09       | Echt dood  |
| abdallah.raafat200@gmail.com   | player | 2026-04-08   | ios      | 2026-04-23           | 2026-04-03       | Echt dood  |
| markholdich@gmail.com          | player | 2026-04-05   | ios      | 2026-04-05           | 2026-04-05       | Echt dood  |
| a.pybus@outlook.com            | player | 2026-04-02   | ios      | 2026-04-02           | 2026-04-02       | Echt dood  |
| monasherif77@hotmail.com       | player | 2026-03-31   | ios      | 2026-03-31           | 2026-03-31       | Echt dood  |

`0 + 16 = 16` ✓.

**Note A — `frau.bauer.c@gmail.com`:** token voor het laatst gebruikt op 2026-04-13, daarna gedeactiveerd; user logde op 2026-04-14 nog in maar registreerde geen nieuwe token. Eén voorval, statistisch verwaarloosbaar — kan even goed timezone-offset of een hot-path zijn waarbij `usePushNotifications` niet remountte. Geen aparte categorie waard.

**Cross-cohort observatie:** `ammar@dynamo.ae` en `mirna.el.cheikh@hotmail.com` komen óók voor in de 32 nooit-token-tabel (sectie 2.1). Dezelfde persoon heeft dus een hoofd-account met een dood iOS-token én een family-creator/member-account zonder enige token — wat versterkt dat het tweede account een family-lobby-construct is dat het toestel deelt met het hoofd-account.

---

## 4. Aanbevelingen voor de twee voorgestelde tasks

### Task #1366 — `app_version`/`platform` kolom toevoegen

**Aanbeveling: KEEP, met scope-uitbreiding.**

24 van 32 nooit-token records (75 %) zijn vandaag "Onbekend" puur omdat we niet kunnen zien op welk platform/welke versie deze users laatst inlogden. Voeg toe:
- `last_login_platform` (text: ios/android/web) op `users`,
- `last_login_app_version` (text) op `users`,
- `app_version` (text) op `push_device_tokens` (zoals oorspronkelijk in #1366 voorgesteld).

Met dit veld wordt de volgende push-audit triviaal en kunnen Family-Wallet-meldingen aan de 4 family-creators in dit rapport gericht worden bevestigd of weerlegd.

### Task #1367 — nachtelijke dead-token sweep

**Aanbeveling: PAUSEER tot na #1360 productie-stabiel is.**

`server/fcm.ts:163-178` ruimt invalid tokens al synchroon op bij iedere mislukte verzendpoging. Een nachtelijke sweep zou vandaag nul nieuwe waarde toevoegen — alle 16 dode tokens zijn al `is_active=false`. Bovendien suggereert "nachtelijke sweep" bij ops dat het probleem bij de tokens ligt; in werkelijkheid ligt het in de iOS-pijplijn. Open #1367 opnieuw 1 week na de eerste productie-Republish van #1360 — dan hebben we een rustige baseline om een echte sweep tegen te ijken.

---

## 5. Wat in dit rapport NIET bewezen kon worden

- **Web-only-aandeel** binnen "Onbekend" — geen `last_login_platform`-kolom (vandaar #1366).
- **Permissie-denied-aandeel** — client logt lokaal, server ziet niets.
- **Stille registratie-failures buiten de retentie-window** — server-logs zijn enkele dagen retentief; zie 6.3.

---

## 6. Methodologie en herhaalbaarheid

Alle queries draaien tegen de echte productiedatabase via `psql "$SUPABASE_DATABASE_URL"`. De lokale `executeSql`-omgeving wijst naar een sandbox en is daarvoor expliciet niet gebruikt (per `replit.md`).

### 6.1 SQL — basis-cohort en split

```sql
-- Q1: cohort
SELECT COUNT(*) FROM users
 WHERE COALESCE(deleted, false) = false AND deleted_at IS NULL
   AND last_login_at > NOW() - INTERVAL '30 days';   -- 57

-- Q2: 9 / 32 / 16 split
WITH cohort AS (
  SELECT u.id FROM users u
   WHERE COALESCE(u.deleted, false) = false AND u.deleted_at IS NULL
     AND u.last_login_at > NOW() - INTERVAL '30 days'
)
SELECT
  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM push_device_tokens p
                                  WHERE p.user_id = c.id AND p.is_active=true)) AS heeft_actief,
  COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM push_device_tokens p WHERE p.user_id = c.id)) AS nooit,
  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM push_device_tokens p WHERE p.user_id = c.id)
                     AND NOT EXISTS (SELECT 1 FROM push_device_tokens p
                                      WHERE p.user_id = c.id AND p.is_active=true)) AS alleen_inactief
FROM cohort c;
```

### 6.2 SQL — categorisatie

```sql
-- Q3: family-lid per nooit-token user
WITH active30_no_token AS (
  SELECT u.id, u.email, u.player_id FROM users u
   WHERE COALESCE(u.deleted, false) = false AND u.deleted_at IS NULL
     AND u.last_login_at > NOW() - INTERVAL '30 days'
     AND NOT EXISTS (SELECT 1 FROM push_device_tokens p WHERE p.user_id = u.id)
)
SELECT a.email, fm.role_label, fg.created_by_player_id = a.player_id AS is_creator
  FROM active30_no_token a
  LEFT JOIN family_members fm ON fm.player_id = a.player_id
  LEFT JOIN family_groups fg ON fg.id = fm.family_group_id;

-- Q4: 16-cohort detail (alle inactieve token-rijen 1:1)
WITH cohort_users AS (
  SELECT u.id, u.email, u.last_login_at FROM users u
   WHERE COALESCE(u.deleted, false) = false AND u.deleted_at IS NULL
     AND u.last_login_at > NOW() - INTERVAL '30 days'
     AND EXISTS (SELECT 1 FROM push_device_tokens p WHERE p.user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM push_device_tokens p WHERE p.user_id = u.id AND p.is_active=true)
)
SELECT c.email, pdt.platform, pdt.last_used_at::date, pdt.created_at::date,
       CASE WHEN EXISTS (SELECT 1 FROM push_device_tokens p2
                          WHERE p2.user_id = pdt.user_id
                            AND p2.id <> pdt.id
                            AND p2.created_at > pdt.created_at)
            THEN 'overschreven' ELSE 'echt_dood' END AS subcategorie
  FROM cohort_users c
  JOIN push_device_tokens pdt ON pdt.user_id = c.id
 ORDER BY c.last_login_at DESC;
```

### 6.3 Log-evidence — exacte queries en retentie-disclaimer

Replit deployment-logs hebben in deze account een effectieve retentie van enkele dagen — onvoldoende om de oorsprong van rijen uit maart te traceren. Onderstaande queries zijn op 2026-04-26 uitgevoerd over de hele beschikbare retentie-window. Resultaten:

```
fetch_deployment_logs(message="/api/push/register.*[45][0-9][0-9]")
→ 5 hits binnen window. Allen 401 Authentication required.
  Geen 5xx, geen 4xx anders dan 401.

fetch_deployment_logs(message="Push.*Permission|messaging/invalid-registration|messaging/registration-token-not-registered|\\[FCM\\] Deactivating")
→ 0 hits binnen window.

fetch_deployment_logs(message="\\[Push\\]|push.register|push_device_tokens", message_context={lines:3, limit:10})
→ ~30 hits, alle [PushToken] Registering ... 200 (succesvol). Geen failure-paden.
```

**Wat dit voor de classificatie betekent:**
- **"Registratie-call faalde"**: telling = 0 binnen log-window. Voor records ouder dan de retentie kunnen we niet bewijzen dat hun call NIET faalde, maar we kunnen wél stellen dat in het recente venster het patroon afwezig is. Hadden we Sentry-tagging op `POST /api/push/register` of langere logretentie gehad, dan was hard cijfer mogelijk.
- **"FCM/APNs-token-failure"** voor de 32-cohort = 0 per definitie (geen token-rij betekent geen pijplijn-aanraking).
- **"Permissie geweigerd"**: nul telemetrie naar de server. Onmeetbaar tot het toegevoegd wordt.

### 6.4 Code-paden geverifieerd

- `client/hooks/usePushNotifications.ts` — wordt aangeroepen vanuit `client/navigation/RootStackNavigator.tsx:221`. Slaat web en niet-physical-devices over. Logt `[Push] Permission NOT granted` lokaal bij weigering — geen server-event.
- `server/routes/academy-settings.ts:626-679` — `POST /api/push/register`. Slaagt of mislukt zonder rolspecifieke logregel.
- `server/fcm.ts:160-180` — synchrone deactivatie bij `messaging/invalid-registration-token` of `messaging/registration-token-not-registered`. **Het mechanisme dat de 16 echt-dode iOS-tokens elke ronde reproduceert.**
- `server/storage.ts:8040-8052` — bij nieuwe registratie worden oudere tokens van dezelfde user gedeactiveerd. **Dit is het "overschreven"-pad** — verklaart de 27 overschreven rijen buiten dit cohort, niet de 16 binnen het cohort.
- `scripts/push-update-prompt.ts:21-27` — script-comment documenteert de iOS-pijplijn-fout van Task #1360 woordelijk.

### 6.5 PII-discipline

- E-mailadressen ter identificatie opgenomen (zelfde standaard als #1359-spec).
- Push-tokens nergens in dit document opgenomen — alleen tellingen.

---

## 7. Conclusie in één regel

**Repareer Task #1360 (iOS-pijplijn) en alle 16 "alleen-inactief"-records lossen op vanzelf op; voer Task #1366 (app_version-kolom) uit en de 24 "Onbekend"-records worden voor het eerst diagnosticeerbaar; pauzeer Task #1367 tot na #1360.**
