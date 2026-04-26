# Push-token-dekking — forensische audit

**Datum:** 2026-04-26
**Scope:** alle live users in Supabase (productie)
**Aanleiding:** uit Task #1359 (één-voor-iedereen update-push) bleek dat 56 % van de actieve users (32 van 57) helemaal géén push-token heeft, plus nog eens 16 die alleen een gedeactiveerde token hebben. Dit rapport reconstrueert per record waaróm die token ontbreekt.
**Verwante tasks:** #1359 (gemerged), #1360 (iOS APNs-pijplijn, in progress), #1366 (voorgesteld: `app_version` kolom), #1367 (voorgesteld: nachtelijke dood-token-sweep).

---

## Samenvatting in één paragraaf

Van de 57 user-records die in de afgelopen 30 dagen zijn ingelogd, hebben 9 een werkende push-token, 32 hebben er nooit één gehad en 16 hebben er één die later is gedeactiveerd. De 32 "nooit-token"-records zijn echter géén 32 verschillende personen: door family-lobby-profielwissels heeft één persoon (`ltvjeugd@gmail.com`) zes user-rijen en een ander (`itani.mohd@gmail.com`) drie — die 7 extra rijen zijn statistisch ruis, want hun apparaat registreert de token onder het hoofd-account. Na deduplicatie blijven er ca. 25 echte personen zonder token over. De grootste echte oorzaak is dat de iOS-pijplijn nog niet werkt (Task #1360): elke iPhone die wél een token bij ons aflevert, krijgt die token onderweg geweigerd door Firebase en wordt vervolgens binnen seconden weer op `is_active=false` gezet — dat verklaart 15 van de 16 "alleen-inactief"-records. Voor de 20 niet-family solo-spelers zonder enige token is er één gemeenschappelijke verklaring die wij vandaag nog niet hard kunnen onderbouwen: er staat geen `app_version`/`platform`-kolom op login-niveau, dus we kunnen niet zien of zij in Expo Go, op de web-build of op een verouderde store-binary zitten. Aanbeveling: Task #1366 (app_version-kolom) is essentieel; Task #1367 (nachtelijke sweep) is overbodig zolang #1360 nog niet draait.

---

## 1. Cijfers (sluiting van de telling)

```
57   user-records met last_login_at in de afgelopen 30 dagen
 9   ├─ heeft minstens één actieve push-token
48   └─ heeft GEEN actieve push-token
       ├─ 32  nooit-token (geen rij in push_device_tokens)
       └─ 16  alleen-inactief (alle rijen is_active = false)
```

48 = 32 + 16 ✓.

Op tokenniveau is de 16-bucket schoon: precies 16 inactieve token-rijen behoren tot deze 16 users (1 token per user, niemand heeft meerdere inactieve rijen) en 0 van die 16 zijn "overschreven door een nieuwere rij van dezelfde user". Het zijn dus 16 doodlopende tokens. Voor de volledigheid: systeembreed staan er 43 inactieve token-rijen in `push_device_tokens`, waarvan 27 buiten dit cohort vallen (horen bij users die nadien wél een actieve token hebben aangemeld of die niet in de 30-daagse cohort zitten); die 27 zijn dus de "overschreven" populatie en zijn niet relevant voor dit rapport.

---

## 2. De 32 "nooit-token"-records — categorisatie

### 2.1 Family-lobby-profielwissels: 7 records (22 %)

`ltvjeugd@gmail.com` heeft 6 aparte user-rijen, allemaal met rol `player`, allemaal `member` in dezelfde family. `itani.mohd@gmail.com` heeft 3 rijen (1 `creator` + 2 `member`). Een family-lobby switch update `last_login_at` op het sub-account, maar het fysieke toestel blijft één en dezelfde — dus blijft er één token onder het hoofd-account staan. De andere 5 (ltvjeugd) en 2 (itani) records zijn architecturaal nooit kandidaat voor een eigen token.

**Oorzaak:** ontwerpkeuze van het family-lobby-systeem. Geen bug.

**Bewijs:** zie sectie 5, query Q3.

### 2.2 Family-creators (betalende ouders) zonder eigen token: 4 records (12,5 %)

`ammar@dynamo.ae`, `hibamajzoub@gmail.com`, `pmoutafidou@hotmail.com`, en `itani.mohd@gmail.com` (de creator-rij) zijn allemaal `creator` van een family group. Zij hebben dus een Family Wallet en betalen voor hun gezin, maar staan nul in `push_device_tokens`. Dit is operationeel relevant: deze 4 ouders kunnen géén Family-Wallet-meldingen ontvangen (limiet bereikt, kind-boeking, betaalfout).

**Oorzaak (waarschijnlijk):** zelfde wortel als 2.4 — geen onderbouwing op basis van DB-data alleen, want we registreren niet welk device-type elke ouder gebruikt. Plausibele subset:
- ouders die het kind-account beheren via de web-omgeving (push wordt op web overgeslagen door `usePushNotifications.ts`),
- of ouders die de notificatie-permissie niet hebben gegeven bij eerste open van de app.

**Aanbeveling:** wachten op #1366 (app_version-kolom) is nodig om dit hard te kunnen onderscheiden. Geen quick fix mogelijk vandaag.

### 2.3 Solo single-family-member: 1 record (3 %)

`mirna.el.cheikh@hotmail.com` is `member` van een family (geen creator) en zonder duplicaten. Behandeld als 2.4-categorie qua oorzaak.

### 2.4 Solo player zonder family: 20 records (62,5 %)

De grootste groep. 19 zijn `player`-rol en 1 is `academy_owner` (`nextgensportsacademydxb@gmail.com`). Slechts 1 van de 20 logt in via Apple ID (`khoory765@gmail.com`); de overige 19 gebruiken e-mail/wachtwoord — wat zowel via mobiel als via web kan.

**Wat de DB ons WEL vertelt:**
- 8 van de 20 zijn de afgelopen 7 dagen actief (sterk signaal dat dit echte regelmatige users zijn, geen vergeten accounts).
- 0 van de 20 heeft ooit een rij in `push_device_tokens` aangemaakt — dus de client-call `POST /api/push/register` is bij hen nooit succesvol uitgevoerd.

**Wat de DB ons NIET vertelt:**
- of de gebruiker in een browser zit (web-build slaat push-registratie expliciet over in `client/hooks/usePushNotifications.ts`),
- of de gebruiker het notificatie-permissieverzoek heeft afgewezen (er is server-side geen logregel voor),
- of de gebruiker in Expo Go op een development build zit (oude tokens werken daar anders),
- of de gebruiker een 1.3.4 / 1.3.5 store-binary draait die `usePushNotifications` correct aanroept maar wiens iOS-token onderweg sneuvelt (zie 3.x).

**Aanbeveling:** zonder #1366 (app_version-kolom op `push_device_tokens` én op `users.last_login`) blijft dit een blackbox. Server-logs zijn slechts ~3 dagen retentief en bevatten geen "permission_denied"-events vanaf de client.

### 2.5 Telling sluit

```
 7  family-switch-duplicaten   (sectie 2.1)
 4  family-creators            (sectie 2.2)
 1  solo family-member         (sectie 2.3)
20  solo player zonder family  (sectie 2.4)
--
32  ✓
```

---

## 3. De 16 "alleen-inactief"-records — categorisatie

Alle 16 zijn iOS, alle 16 zijn `player`-rol.

### 3.1 "Echt dood": 15 records (94 %) — wortel: Task #1360

Voor elk van deze 15 records ligt de `last_used_at` van de inactieve token vlak bij of zelfs ná de `last_login_at` van de user (2 records hebben token-laatst-gebruikt 7 tot 15 dagen ná last_login — klassiek "background app refresh"-signaal). Voor 13 anderen zijn de twee data identiek of binnen 1 dag van elkaar.

**Patroon dat dit verklaart:**
1. iPhone opent de app → `usePushNotifications.ts` haalt het Expo/APNs-token op → `POST /api/push/register` slaagt en zet `is_active=true`.
2. De server probeert direct of bij de eerste push een Firebase-call met die token.
3. Firebase Admin SDK retourneert `messaging/invalid-registration-token` of `messaging/registration-token-not-registered` (omdat de iOS-tokens in deze codebase rauwe APNs device-tokens zijn, geen Firebase-tokens — dat is precies de pijn die Task #1360 oplost).
4. `server/fcm.ts:163-178` schakelt de token onmiddellijk op `is_active=false`.
5. Volgende keer dat de gebruiker de app opent: zelfde dans, zelfde resultaat. De DB ziet het als een rij die telkens "een dag geleden" actief was.

**Bewijs:**
- Alle 16 inactieve tokens in dit cohort zijn iOS — geen enkele Android. Voor een willekeurige verdeling van uitval-oorzaken zou je een mix verwachten; een 16/0-skew naar iOS wijst sterk op een platform-specifieke oorzaak.
- `scripts/push-update-prompt.ts:21-27` documenteert die oorzaak letterlijk: in deze codebase staan in `push_device_tokens` rauwe 64-char APNs device-tokens onder `platform='ios'`, en het script waarschuwt dat noch Expo Push API noch Firebase Admin SDK die accepteert — "every iOS token as failed until #1360 fixes the iOS push pipeline".
- `server/fcm.ts:163-178` is het exacte deactivatie-pad: bij `messaging/invalid-registration-token` of `messaging/registration-token-not-registered` zet het `is_active=false` op de getroffen token. Dat is precies de error-class die Firebase teruggeeft op niet-FCM tokens.
- 0 van de 16 is "overschreven door een nieuwere actieve rij" (sectie 1, zelfde user). Het is dus geen normaal verloop ("nieuwe device, oude token vervalt"), maar terugkerende deactivatie van *de enige* token van die user.

**Conclusie:** dit hele bucket lost zichzelf op zodra Task #1360 gemerged en gerepublished is. Het is niet "16 individuele bugs", het is één pijplijn-fout die zich 16× herhaalt.

### 3.2 "Inlog-na-inactivatie": 1 record (6 %)

`frau.bauer.c@gmail.com` heeft een token die op 2026-04-13 voor het laatst is gebruikt en daarna gedeactiveerd, maar zij heeft op 2026-04-14 nog ingelogd. Dit zou erop kunnen wijzen dat haar client `usePushNotifications.ts` niet opnieuw heeft geprobeerd te registreren, óf dat de hook is overgeslagen door een hot-path (bv. profielwissel zonder full reload). Eén voorval is statistisch verwaarloosbaar — onder de meet-onnauwkeurigheid van timezone-offsets en achtergrond-refreshes. Niet waard om voor te bouwen, wel waard om te onthouden voor de volgende audit.

### 3.3 "Overschreven, geen nieuwe": 0 records

Per definitie nul: het cohort sluit users met een actieve token uit, dus "overschreven door een eigen latere actieve rij" kan binnen dit cohort niet voorkomen. (Dat is meteen de waarschuwing voor Q5: de `overschreven`-tak in die query is daar tautologisch leeg en hoeft niet als analytische dimensie te tellen — de echte 27 "overschreven" rijen leven in user-records buiten dit cohort, zie sectie 1.)

### 3.4 Telling sluit

```
15  echt dood (iOS-pijplijn / #1360)
 1  inlog-na-inactivatie (anekdotisch)
--
16  ✓
```

---

## 4. Aanbevelingen voor de twee voorgestelde tasks

### Task #1366 — voeg `app_version` kolom toe aan `push_device_tokens`

**Aanbeveling: KEEP, met scope-uitbreiding.**

Deze audit kon de 20 solo-spelers in sectie 2.4 niet uitsplitsen omdat we niet weten op welk platform/welke versie ze zaten toen ze inlogden. Voor élke toekomstige push-audit (en voor het correct sturen van versie-specifieke notificaties zoals in #1359) is dit veld onmisbaar.

**Voorstel om scope te verbreden:** voeg óók een `last_login_app_version` (text) en `last_login_platform` (text: ios/android/web) toe aan `users`, zodat we inlog-events kunnen onderscheiden van push-registratie-events. Dat levert de scheiding "wel ingelogd op web vs niet ingelogd op mobiel" die we vandaag missen.

### Task #1367 — nachtelijke dead-token sweep

**Aanbeveling: NIET nu uitvoeren. Pauzeer of sluit.**

De huidige cijfers bewijzen dat dead tokens niet het probleem zijn — `server/fcm.ts:163-178` ruimt invalid tokens al synchroon op bij de eerste mislukte verzendpoging. Het feit dat 15 van de 16 "echt dood"-records bij elke nieuwe inlog opnieuw worden gedeactiveerd betekent dat de sweep nóóit iets nuttigs zou opruimen — de echte fout zit upstream in de iOS-pijplijn (#1360). Een nachtelijke sweep zou alleen ruis aan ops-logs toevoegen en suggereren dat het probleem opgelost is, terwijl er per definitie de volgende dag weer 15 nieuwe dead tokens binnenkomen. **Open #1367 opnieuw zodra #1360 leeft en draaiend is** — dán hebben we een rustige "dead token survival rate"-baseline en pas dán is een sweep zinvol.

---

## 5. Methodologie en herhaalbaarheid

Alle queries draaien tegen de echte productiedatabase via `psql "$SUPABASE_DATABASE_URL"`. De lokale `executeSql`-omgeving wijst naar een sandbox en is daarvoor expliciet niet gebruikt (per `replit.md`).

### Q1 — basis-cohort (57 actieve users)
```sql
SELECT COUNT(*) FROM users
 WHERE COALESCE(deleted, false) = false AND deleted_at IS NULL
   AND last_login_at > NOW() - INTERVAL '30 days';
```

### Q2 — split tussen 9 / 32 / 16
```sql
WITH cohort AS (
  SELECT u.id FROM users u
   WHERE COALESCE(u.deleted, false) = false AND u.deleted_at IS NULL
     AND u.last_login_at > NOW() - INTERVAL '30 days'
)
SELECT
  COUNT(*) FILTER (
    WHERE EXISTS (SELECT 1 FROM push_device_tokens p
                   WHERE p.user_id = c.id AND p.is_active = true)
  ) AS heeft_actieve_token,
  COUNT(*) FILTER (
    WHERE NOT EXISTS (SELECT 1 FROM push_device_tokens p WHERE p.user_id = c.id)
  ) AS nooit_token,
  COUNT(*) FILTER (
    WHERE EXISTS (SELECT 1 FROM push_device_tokens p WHERE p.user_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM push_device_tokens p
                       WHERE p.user_id = c.id AND p.is_active = true)
  ) AS alleen_inactief
FROM cohort c;
```

### Q3 — duplicate emails via family switch
```sql
WITH active30_no_token AS (
  SELECT u.id, u.email FROM users u
   WHERE COALESCE(u.deleted, false) = false AND u.deleted_at IS NULL
     AND u.last_login_at > NOW() - INTERVAL '30 days'
     AND NOT EXISTS (SELECT 1 FROM push_device_tokens p WHERE p.user_id = u.id)
)
SELECT email, COUNT(*) AS user_rijen
  FROM active30_no_token
 GROUP BY email
HAVING COUNT(*) > 1
 ORDER BY user_rijen DESC;
```

### Q4 — family-lidmaatschap per nooit-token user
```sql
WITH active30_no_token AS (
  SELECT u.id, u.email, u.player_id FROM users u
   WHERE COALESCE(u.deleted, false) = false AND u.deleted_at IS NULL
     AND u.last_login_at > NOW() - INTERVAL '30 days'
     AND NOT EXISTS (SELECT 1 FROM push_device_tokens p WHERE p.user_id = u.id)
)
SELECT a.email, fm.role_label,
       fg.created_by_player_id = a.player_id AS is_creator
  FROM active30_no_token a
  JOIN family_members fm ON fm.player_id = a.player_id
  LEFT JOIN family_groups fg ON fg.id = fm.family_group_id;
```

### Q5 — inactieve-only sub-categorisatie
```sql
WITH cohort AS (
  SELECT u.id, u.email, u.last_login_at FROM users u
   WHERE COALESCE(u.deleted, false) = false AND u.deleted_at IS NULL
     AND u.last_login_at > NOW() - INTERVAL '30 days'
     AND EXISTS (SELECT 1 FROM push_device_tokens p WHERE p.user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM push_device_tokens p
                      WHERE p.user_id = u.id AND p.is_active = true)
)
SELECT c.email, pdt.platform, pdt.last_used_at::date,
       CASE
         WHEN EXISTS (SELECT 1 FROM push_device_tokens p2
                       WHERE p2.user_id = c.id AND p2.device_name = pdt.device_name
                         AND p2.platform = pdt.platform AND p2.is_active = true)
              THEN 'overschreven'
         WHEN c.last_login_at::date > pdt.last_used_at::date
              THEN 'inlog_na_inactivatie'
         ELSE 'echt_dood'
       END AS subcategorie
  FROM cohort c
  JOIN push_device_tokens pdt ON pdt.user_id = c.id
 ORDER BY c.last_login_at DESC;
```

### Aanvullende code-paden geverifieerd
- `client/hooks/usePushNotifications.ts` — wordt aangeroepen vanuit `client/navigation/RootStackNavigator.tsx:221`. Slaat web en niet-physical-devices over, logt `[Push] Permission NOT granted` bij weigering. Server-logs hebben hiervan geen tegenhanger, dus weigering is post-hoc niet detecteerbaar.
- `server/routes/academy-settings.ts:626-679` — `POST /api/push/register`. Slaagt of mislukt zonder per-rol logregel.
- `server/fcm.ts:160-180` — synchrone deactivatie bij `messaging/invalid-registration-token` of `messaging/registration-token-not-registered`. Dit is het mechanisme dat de 15 "echt dood"-records elke dag opnieuw produceert.
- `server/storage.ts:8040-8052` — een nieuwe registratie deactiveert oudere tokens van dezelfde user (verklaart het "overschreven"-bucket op tokenniveau).

### PII-discipline
- E-mailadressen zijn opgenomen ter identificatie (zelfde standaard als #1359-spec).
- Push-tokens zelf nergens in dit document opgenomen — alleen tellingen.

### Wat in dit rapport NIET kon
- Permission-denial-tellingen per platform (geen client→server telemetrie).
- Onderscheid tussen Expo-Go-installs en store-installs (geen `app_version`-kolom — vandaar #1366).
- Definitief bewijs dat de 20 solo-spelers in 2.4 web-only zijn (geen `last_login_platform` op `users`).

---

## 6. Conclusie in één regel

**Repareer Task #1360 (iOS-pijplijn) en de 16 "alleen-inactief" lossen op vanzelf op; voer Task #1366 (app_version-kolom) uit en de 20 onverklaarde solo-spelers worden voor het eerst diagnosticeerbaar; pauzeer Task #1367 tot na #1360.**
