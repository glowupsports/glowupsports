# Android 1.3.6 — Play Store rollout draaiboek

## Wat dit document is

Stap-voor-stap instructie om de schone Android 1.3.6 binary van EAS in de Google Play Store te krijgen, zodat we daarna `"1.3.6"` echt mogen vertrouwen als doel-runtime van OTA-pushes.

Belangrijk: het Replit-agent-team kan dit niet voor je uitvoeren. EAS-builds duren te lang voor een agent-sessie en de Play Console zelf vereist toegang tot jouw Google-account. Jij doet het, dit document loodst je erdoor.

## De situatie nu (April 2026)

- `app.json` staat op `expo.android.runtimeVersion = "1.3.6"`.
- Op de Play Store staat als laatste live binary versie **1.3.5** (build van 19 april). Dat is wat ~iedereen draait.
- Op EAS zijn er meerdere Android **1.3.6** builds gemaakt:
  - **Build #85** (24 april, 17:02 UTC) — bevat de oude `UpdateController` met de auto-reload bug, geen kill switch, geen Sentry-telemetrie. **NIET submitten.**
  - **Build #86 (of later)** (25 april, 02:30 UTC) — gebouwd ná de production-safe OTA refactor van #1306. Dit is de juiste binary.
- `scripts/live-runtimes.json` bevat momenteel `["1.3.5", "1.3.6"]` voor android — dat dekt zowel huidige live binaries als toekomstige 1.3.6 installs. Zodra 1.3.6 algemeen live staat kun je `"1.3.5"` weghalen.

## Stap-voor-stap

### 1. Identificeer de juiste 1.3.6 build op EAS

```bash
npx eas build:list --platform android --limit 5
```

Pak de meest recente entry met:
- `appVersion: 1.3.6`
- `runtimeVersion: 1.3.6`
- `status: FINISHED`
- `profile: production`
- **gebouwd op of ná 24 april 17:00 UTC** (alles ervoor = build #85, niet gebruiken)

Noteer het build-ID (de korte UUID in de eerste kolom).

### 2. Download de `.aab`

```bash
npx eas build:view <build-id>
```

Dat geeft een download-URL voor de `.aab` (Android App Bundle). Download hem.

### 3. Upload naar Play Console — Closed Testing

1. Ga naar https://play.google.com/console
2. Selecteer Glow Up Sports.
3. Linkermenu: **Testing → Closed testing → Alpha track**.
4. Klik **Create new release**.
5. Sleep de `.aab` in het upload-vak.
6. Voeg release notes toe (Engels + Nederlands, beide ≤ 500 chars). Een korte changelog van wat er sinds 1.3.5 gemerged is volstaat — kijk naar `docs/closed-testing-release-notes.md` voor het format.
7. **Save → Review → Roll out to Alpha**.

### 4. Test op je eigen toestel

1. Zorg dat je e-mail is toegevoegd aan de Alpha-tester groep (Play Console → Testing → Closed testing → Alpha → Testers).
2. Open de opt-in URL die Play Console je geeft, accepteer.
3. Op je Android-toestel: open Play Store → Glow Up Sports → de update naar 1.3.6 verschijnt binnen 5–30 minuten. Installeer.
4. Open de app. Op het Platform Owner home-scherm zie je nu onderaan de Platform Center kaart een kleine debug-regel: `runtime 1.3.6 • channel production • update <id-of-embedded>`. Dat is je bewijs dat je de 1.3.6 binary draait.

### 5. Promote naar Production (pas wanneer Alpha stabiel)

1. Play Console → Production → **Promote release** vanuit Closed testing → Alpha.
2. Kies **Staged rollout** met 10% → 50% → 100% over een paar dagen, niet 100% in één keer.
3. Hou Crashlytics / Sentry in de gaten.

### 6. Update `scripts/live-runtimes.json`

Zodra de 1.3.6 release in Production staged rollout zit en >50% van installs erop draait (zichtbaar in Play Console → Statistics → Versions), is `1.3.6` officieel "live op echte toestellen".

Op dat moment hoef je `live-runtimes.json` voor android **niet** te wijzigen — `"1.3.6"` staat er al in. Het OTA-script publiceert al naar zowel 1.3.5 als 1.3.6 sinds Task #1372.

### 7. Verwijder `1.3.5` uit `live-runtimes.json` — pas wanneer veilig

Wanneer >95% van je installs op 1.3.6 zit (zie Play Console version statistics), mag je `"1.3.5"` uit de android-array van `scripts/live-runtimes.json` halen. Dat scheelt een EAS-update-call per OTA push (kosten + tijd). Doe dit pas wanneer de 5% achterblijvers acceptabel is om geen updates meer te krijgen.

```diff
- "android": ["1.3.5", "1.3.6"]
+ "android": ["1.3.6"]
```

Commit, en de eerstvolgende OTA push gaat alleen nog naar 1.3.6.

## Wat NIET te doen

- Submit build #85 niet. Punt. Markeer hem in EAS dashboard met een commentaar "buggy UpdateController, do not submit" zodat je het over een week niet vergeet.
- Verwijder `"1.3.6"` niet uit `app.json.runtimeVersion`. Dat is wat de **volgende** binary zal claimen. De `live-runtimes.json` is voor wat we al ondersteunen, `app.json` is voor wat we volgende keer bouwen.
- Verlaag `app.json.android.runtimeVersion` niet naar 1.3.5 om de OTA "te laten werken". Dat zou werken, maar breekt zodra je een echte nieuwe build maakt en is precies de soort hack die deze hele taak voorkomt.

## Verwijzingen

- `scripts/live-runtimes.json` — de waarheid over welke runtimes leven
- `scripts/ota-push.sh` — leest live-runtimes.json en publiceert dual
- `replit.md` — sectie "Welke runtimes leven op echte toestellen"
- `.local/tasks/rebuild-1.3.6-with-safe-ota.md` — context over waarom build #85 buggy is
- `.local/tasks/prepare-android-closed-testing-build.md` — eerdere closed-testing setup
