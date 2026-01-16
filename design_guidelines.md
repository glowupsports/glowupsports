# GLOW UP SPORTS — MASTER UI BIBLE v2.0

> **Dit is het definitieve design systeem. Alles wat hiervan afwijkt = FOUT.**

---

## 🎯 CORE IDENTITEIT

| Aspect | Definitie |
|--------|-----------|
| **Mood** | Dark · Premium · Athletic · Gamified (RPG subtiel) |
| **Feeling** | Alsof Nike & EA Sports een app maakten |
| **Not** | Geen fitness app, geen hacker look, geen basic |

**Regel #1**: Je app is DONKER. Kleur = ENERGIE. Glow = BELONING.

---

## 🖤 BASE COLOR SYSTEM (FUNDAMENT)

### Backgrounds (90% van je UI)

| Token | Hex | Gebruik |
|-------|-----|---------|
| `bg.root` | `#0B0D10` | App achtergrond |
| `bg.card` | `#11141A` | Cards, panels |
| `bg.elevated` | `#171B22` | Modals, sheets, drawers |
| `bg.surface` | `#1F2430` | Borders, dividers, subtle surfaces |

**❌ NOOIT**:
- Puur zwart (#000000)
- Kleur in backgrounds
- Gradients in base backgrounds

---

### Text Hierarchy

| Level | Hex | Gebruik |
|-------|-----|---------|
| `text.primary` | `#FFFFFF` | Titels, belangrijke waarden |
| `text.secondary` | `#B8BCC6` | Labels, beschrijvingen |
| `text.muted` | `#7C8290` | Helper text, meta info |
| `text.disabled` | `#4A4F5C` | Inactieve elementen |

**❌ NOOIT**: Groen voor normale tekst. Groen = actie/status, geen lees-kleur.

---

## 💚 GLOW PRIMARY (DNA)

Dit is de HEILIGE kleur van Glow Up Sports.

| Token | Hex | Gebruik |
|-------|-----|---------|
| `glow.primary` | `#C8FF3D` | XP, Level, Active tab, Primary CTA |
| `glow.soft` | `#A6E92A` | Subtiele accenten, hover states |
| `glow.dark` | `#7FB300` | Pressed states, muted glow |

### Glow Shadow Effect
```css
box-shadow: 0 0 20px rgba(200, 255, 61, 0.35);
```

**❌ NOOIT**:
- Hele achtergronden
- Grote vlakken
- Lange lijsten
- Elke knop

---

## 🎨 FUNCTION COLORS (1 BETEKENIS = 1 KLEUR)

| Functie | Primary | Soft | Gebruik |
|---------|---------|------|---------|
| **Planning** | `#4DA3FF` | `#2E6FB8` | Calendar, sessions, scheduling |
| **Social** | `#FFB020` | `#C8891A` | Messages, friends, community |
| **Error** | `#FF4D4D` | `#C83838` | Errors, warnings, destructive |
| **Info** | `#00D4FF` | `#00A8CC` | Neutral stats, info badges |
| **Success** | `#00E676` | `#00B85C` | Completed, confirmed |

**❗ REGELS**:
- Elke kleur = één betekenis
- Nooit mixen
- Nooit "ik vind dit mooier"

---

## 👥 DASHBOARD KLEUREN (PER ROL)

| Dashboard | Accent | Glow Intensity |
|-----------|--------|----------------|
| **Player** | `glow.primary` (#C8FF3D) | HIGH - Dominant |
| **Coach** | `glow.primary` + Blue (#4DA3FF) | MEDIUM - Balanced |
| **Admin** | Orange (#FF851B) | LOW - Professional |
| **Platform Owner** | Gold (#FFD700) | RARE - Exclusive |

**Regel**: Zelfde base, zelfde rules, alleen accent verschilt.

---

## ✨ GLOW RULES (KRITIEK!)

### Glow MAG ALLEEN bij:
- ✅ Level up momentje
- ✅ XP gain animatie
- ✅ Active navigation tab
- ✅ Selected/focused state
- ✅ Achievement unlock
- ✅ Primary CTA (1 per screen max)

### Glow MAG NOOIT:
- ❌ Standaard op elke knop
- ❌ Op elke card
- ❌ Op hele schermen
- ❌ Als decoratie

**Quote**: "Glow is beloning, niet decoratie"

---

## 🧱 COMPONENT REGELS

### Buttons

| State | Style |
|-------|-------|
| **Default** | Dark bg + subtle border |
| **Hover** | Subtle glow border |
| **Active/Pressed** | Glow primary bg, dark text |
| **Disabled** | Muted grey, geen glow |

```tsx
// Default button
backgroundColor: "rgba(255, 255, 255, 0.05)"
borderWidth: 1
borderColor: "rgba(255, 255, 255, 0.1)"

// Active/Primary button  
backgroundColor: "#C8FF3D"
color: "#000000"
shadowColor: "#C8FF3D"
shadowRadius: 12
shadowOpacity: 0.4
```

### Cards

| Type | Style |
|------|-------|
| **Default** | `bg.card` (#11141A), subtle border |
| **Selected** | Glow stroke border |
| **Important** | Lichte inner glow |
| **Interactive** | Scale 0.98 on press |

```tsx
// Premium card
backgroundColor: "#11141A"
borderWidth: 1
borderColor: "rgba(255, 255, 255, 0.06)"
borderRadius: 16

// Selected card
borderColor: "rgba(200, 255, 61, 0.4)"
shadowColor: "#C8FF3D"
shadowRadius: 8
shadowOpacity: 0.15
```

### Navigation

| State | Style |
|-------|-------|
| **Inactive** | `text.muted` (#7C8290) |
| **Active** | `glow.primary` + dot indicator |

**Regel**: Slechts 1 actieve kleur tegelijk.

---

## 🎮 GAMIFICATION INTENSITY

| State | Visual |
|-------|--------|
| **Locked** | Grey, flat, no glow |
| **Unlocked** | Color, no glow |
| **Progressing** | Color + animated bar |
| **Level Up** | Color + burst glow (kort!) |
| **Legendary** | Pulse glow (tijdelijk) |

---

## 📊 SCREEN HIERARCHY (20/60/20 REGEL)

### 20% EPIC (Home/Dashboard alleen)
- Hero headers met animaties
- Maximum 1 glow element
- Dramatische typografie
- Status indicators met pulse

### 60% CALM (Lijsten, Calendar, Settings)
- Clean hierarchy
- **Zero** animated glows
- Flat cards met duidelijke secties
- Groen alleen voor actie/selectie
- **Dit is de GOLD STANDARD**

### 20% FOCUSED (Detail screens)
- Single-purpose
- Depth alleen op main content
- Minimal distractions

---

## 🌟 PREMIUM EFFECTS

### Glass Effect (voor premium modals/sheets)
```tsx
backgroundColor: "rgba(17, 20, 26, 0.85)"
backdropFilter: "blur(20px)"
borderWidth: 1
borderColor: "rgba(255, 255, 255, 0.08)"
```

### Glow Shadow
```tsx
// Subtle glow (cards)
shadowColor: "#C8FF3D"
shadowOffset: { width: 0, height: 0 }
shadowRadius: 8
shadowOpacity: 0.1

// Strong glow (CTAs, active states)
shadowColor: "#C8FF3D"
shadowOffset: { width: 0, height: 0 }
shadowRadius: 16
shadowOpacity: 0.35
```

### Gradient Overlays
```tsx
// Card top highlight
LinearGradient colors={["rgba(255,255,255,0.05)", "transparent"]}

// Glow fade
LinearGradient colors={["rgba(200,255,61,0.15)", "transparent"]}
```

### Micro-animations
```tsx
// Press feedback
transform: [{ scale: 0.98 }]
transition: 100ms

// Glow pulse (achievements only)
animation: pulse 2s ease-in-out infinite
```

---

## 📏 SPACING & SIZING

| Token | Value | Use |
|-------|-------|-----|
| `xs` | 4px | Tight spacing |
| `sm` | 8px | Component internal |
| `md` | 12px | Default gaps |
| `lg` | 16px | Section spacing |
| `xl` | 24px | Large gaps |
| `2xl` | 32px | Section dividers |

### Border Radius
| Token | Value | Use |
|-------|-------|-----|
| `sm` | 8px | Small buttons, badges |
| `md` | 12px | Cards, inputs |
| `lg` | 16px | Large cards, modals |
| `xl` | 24px | Hero cards |
| `full` | 9999px | Pills, avatars |

---

## 📝 TYPOGRAPHY

| Style | Size | Weight | Use |
|-------|------|--------|-----|
| **h1** | 28px | 700 | Screen titles |
| **h2** | 20px | 600 | Card titles |
| **h3** | 18px | 600 | Section headers |
| **body** | 16px | 400 | Main text |
| **small** | 14px | 400 | Secondary text |
| **caption** | 12px | 500 | Labels, meta |
| **numberLarge** | 32px | 700 | Big stats, XP |
| **numberMedium** | 24px | 600 | Medium stats |

---

## ✅ CHECKLIST (VOOR ELKE SCREEN)

### Glow Check
- [ ] Maximum 1 glow element
- [ ] Glow = functie, niet decoratie
- [ ] Geen animated glows op calm screens

### Color Check
- [ ] Backgrounds uit bg.* tokens
- [ ] Text uit text.* tokens
- [ ] Accenten matched met functie

### Component Check
- [ ] Buttons hebben alle states
- [ ] Cards hebben juiste depth
- [ ] Navigation consistent

### Premium Check
- [ ] Glass effects waar nodig
- [ ] Subtle shadows
- [ ] Smooth press animations
- [ ] Loading states met shimmer

---

## 🚫 VERBODEN

1. **Geen hard-coded kleuren** - Alles via tokens
2. **Geen "even snel"** - Volg het systeem
3. **Geen pure zwart** (#000000)
4. **Geen kleur in backgrounds**
5. **Geen glow als decoratie**
6. **Geen emoji's in UI** (tenzij user request)

---

## 🎯 DESIGN TOKENS MAPPING

```typescript
// Background Tokens
colors.bg.root = "#0B0D10"
colors.bg.card = "#11141A"
colors.bg.elevated = "#171B22"
colors.bg.surface = "#1F2430"

// Text Tokens
colors.text.primary = "#FFFFFF"
colors.text.secondary = "#B8BCC6"
colors.text.muted = "#7C8290"
colors.text.disabled = "#4A4F5C"

// Glow Tokens
colors.glow.primary = "#C8FF3D"
colors.glow.soft = "#A6E92A"
colors.glow.dark = "#7FB300"

// Function Tokens
colors.planning = "#4DA3FF"
colors.social = "#FFB020"
colors.error = "#FF4D4D"
colors.success = "#00E676"
colors.info = "#00D4FF"

// Role Accents
colors.role.player = "#C8FF3D"
colors.role.coach = "#C8FF3D" // + blue accents
colors.role.admin = "#FF851B"
colors.role.owner = "#FFD700"
```

---

**Dit document is wet. Geen uitzonderingen.**
