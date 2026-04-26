# OTA-banner: hoe je hem ziet, en hoe je hem on-demand triggert

## Waarom dit bestaat

Na Task #1372 (de dual-runtime OTA-fix) loopt het OTA-pushsysteem zelf zoals
bedoeld: elke push gaat naar zowel iOS 1.3.4 / 1.3.5 / 1.3.6 als Android
1.3.5 / 1.3.6. Wat veel mensen verwart is **wanneer ze de "Update klaar —
herstart nu" sheet zien verschijnen**. Dat hangt af van twee dingen:

1. **Welke binary draait er op het toestel** (oud = silent update, nieuw = banner-UI).
2. **Hebben ze de app sinds de OTA-publicatie écht twee keer cold gestart**
   (een swipe uit het app-overzicht telt als één).

Onderaan de Platform Center kaart staat sinds Task #1373 een knopje
"Check for update now". Daarmee kun je als platform-eigenaar handmatig
één OTA-check afvuren zonder de app twee keer af te sluiten en heropenen.
Handig voor je eigen iPhone/Android, en voor remote rescue van een
testgebruiker die een nieuwe binary heeft maar de banner nog niet zag.

## Scenario 1 — iPhone-tester op verse 1.3.6 TestFlight zag de banner niet

Symptoom: een vriend krijgt de TestFlight-update naar 1.3.6 binnen, opent
de app, ziet niets gebeuren. Geen banner, geen rainbow, niets.

Verklaring: `expo-updates` draait de OTA-check **alleen op cold start**.
"Cold start" = proces is helemaal weg, niet alleen het venster gesloten.
Op iOS:

- Eén keer Home-button + opnieuw openen = niet voldoende (proces leeft nog).
- Twee keer omhoog swipen vanaf de onderrand → app-switcher → Glow Up Sports
  omhoog wegswipen → vanaf het home-screen opnieuw openen = wél een echte
  cold start.

Wat de vriend dus moet doen:

1. Open Glow Up Sports zoals normaal (de eerste keer haalt hij de OTA op,
   maar verwerkt hem nog niet — die blijft klaarliggen voor de volgende start).
2. Veeg de app helemaal weg uit de app-switcher.
3. Open de app opnieuw.
4. Op een 1.3.6 binary verschijnt nu het "Update klaar — herstart nu"
   bottom sheet met de neon-groene knop.
5. Op een 1.3.4 of 1.3.5 binary verschijnt **geen sheet** — die binaries
   draaien nog de oude `UpdateController` zonder banner-UI. De OTA wordt
   wel binnengehaald en stilletjes geactiveerd bij de volgende cold start.
   Dat is verwacht gedrag tot de 1.3.6-binary breed live staat (zie
   `docs/release-1.3.6-android-rollout.md` voor de Android rollout-tijdlijn).

## Scenario 2 — Eigenaar wil zelf op zijn eigen toestel checken zonder twee keer cold-starten

Op de Platform Center-kaart staat onderaan, vlak onder de runtime/channel
diagnostics-regel, een paars omlijnd knopje **"Check for update now"**.

1. Tik erop.
2. Onder de knop verschijnt status-tekst:
   - `Checking for update…` — bezig.
   - `Up to date` — er staat geen nieuwere OTA klaar voor jouw runtime.
   - `Update ready — see banner` — er stond wel iets klaar; de bestaande
     "Update klaar — herstart nu" sheet komt automatisch tevoorschijn.
     Vanaf daar is het exact dezelfde flow als bij een echte cold-start.
   - `OTA disabled by server` — de kill switch op `/api/ota-status` staat aan.
   - `OTA not available on this build` — je draait in development of op web.
   - `Check failed (<errorcode>)` — netwerkfout of expo-updates gaf een
     transient error. Tik gewoon nog een keer.

Belangrijk: de knop hergebruikt exact dezelfde code als de cold-start
check, dus als hij hier "Update ready" geeft, weet je zeker dat een
echte cold-start ook een banner zou tonen.

De knop is zichtbaar voor:

- Alleen platform-owner role (de Platform Center-kaart wordt sowieso
  alleen op die rol getoond).
- Alleen op native (iOS/Android), niet op web.
- Alleen op binaries die de Context-export uit Task #1373 bevatten —
  dat zijn alle 1.3.6 builds. Op oudere binaries valt de hook stilletjes
  terug op `null` en wordt de knop niet gerenderd.

## Scenario 3 — Eigen Android draait nog op de oude 1.3.5 Play Store binary

Op de oude 1.3.5 binary zit de pre-#1306 `UpdateController` — die heeft
geen banner-UI en geen Context-export, dus:

- Geen "Update klaar — herstart nu" sheet, ook niet bij een echte cold start.
- Geen "Check for update now" knop op de Platform Center-kaart.
- De OTA wordt wél binnengehaald en stilletjes geactiveerd bij de
  volgende cold-start (dat is precies het oude gedrag).

Dat is geen bug — dat is verwacht gedrag tot de Play Store de 1.3.6
binary heeft uitgerold. Als je dit gedrag wil veranderen op je eigen
toestel: installeer handmatig de 1.3.6 closed-testing build via de
Alpha-track URL uit `docs/release-1.3.6-android-rollout.md`. Daarna
heb je de banner én de test-knop.

## Quick reference — wanneer zie je wat?

| Binary             | OTA wordt opgehaald | Banner-UI bij cold start | "Check now" knop |
| ------------------ | ------------------- | ------------------------ | ---------------- |
| iOS 1.3.4          | ja                  | nee (oude controller)    | nee              |
| iOS 1.3.5          | ja                  | nee (oude controller)    | nee              |
| iOS 1.3.6          | ja                  | **ja**                   | **ja**           |
| Android 1.3.5      | ja                  | nee (oude controller)    | nee              |
| Android 1.3.6      | ja                  | **ja**                   | **ja**           |

## Verwijzingen

- `client/components/UpdateController.tsx` — Context-export en check-logica
- `client/platform/components/PlatformCommandCenter.tsx` — de knop zelf
- `docs/release-1.3.6-android-rollout.md` — Play Store rollout-draaiboek
- `scripts/live-runtimes.json` — welke runtimes elke OTA-push raakt
- `replit.md` — sectie "Welke runtimes leven op echte toestellen"
