# Glow Up Tennis - Design Guidelines

## Visual Identity: "Midnight Grand Slam"

**Theme**: Sport-Tech, FIFA/EAFC-style Player Cards, Premium Athletic

**Color Palette** (use ProTennisColors from theme.ts):
- Background: Midnight Blue (#090E17) - deep, almost black blue
- Card Surface: #151B29 - elevated surfaces
- Primary Accent: Electric Green (#CCFF00) - tennis ball yellow/green for CTAs
- Secondary Accent: Neon Cyan (#00F0FF) - social/cold actions
- Text: White (#FFFFFF), Muted (#7A8AA3)

**Visual Elements**:
- No "hacker" look - pure sport-tech aesthetic
- Aerodynamic curves (like tennis rackets, sports cars)
- Tennis court line patterns as subtle background overlay
- Glass-effect surfaces with blur
- FIFA-style player cards for identity

**Typography**:
- Player names: Bold, uppercase
- Numbers/Stats: Large, prominent
- Labels: Small, subtle, supporting

---

## Authentication Architecture

**Auth Required**: Yes
- Social/multiplayer features (chat channels, friends, ranking)
- Backend sync for XP, currency, and progression data across devices
- Multi-user system with coaches and admins

**Implementation**:
- Apple Sign-In (primary for iOS, App Store requirement)
- Google Sign-In (Android & cross-platform support)
- Email/password as fallback option
- Privacy policy and terms of service links on sign-up screens

---

## Player Home Screen: 5-Zone Layout

The Player Home Screen uses a structured 5-zone layout inspired by sports broadcast interfaces.

### ZONE 1: Player Card Header (FIFA-Style)
**Purpose**: Player identity in a premium sports card format

**Layout**:
- **Left**: Pro Photo
  - Avatar in circle with Electric Green glow ring (represents Form/Streak)
  - Glow intensity increases with higher streak
  
- **Center**: Stats
  - Name: Bold, uppercase (e.g., "THE LAW")
  - Title: Current player title
  - Level: Player level number
  - Form Bar: XP progress bar (how close to next level)
  
- **Right**: Locker Room
  - Credits/Wallet icon with balance
  - "My Squad" switch (for parent family lobby)

**Styling**:
- Background: Glass blur over midnight blue
- Card has subtle glow border
- Height: ~120px

---

### ZONE 2: Center Court (Dynamic Hero)
**Purpose**: Main action area - shows next session or booking options

**Scenario A - No Activity ("Training Block")**:
- Visual: Dark tennis court image with spotlights
- Text: "OFF SEASON MODE" or "REST DAY"
- Two large action cards:
  - [ HIT THE COURT ] - Book training session
  - [ CHALLENGE PLAYER ] - Find a match/rival

**Scenario B - Session Scheduled ("Match Day")**:
- Visual: Active court graphic
- Header: "NEXT SESSION" with pulsing green dot (LIVE indicator)
- Countdown timer: HH:MM:SS format
- Check-in button when within 60 minutes
- Session type, coach name, court info

**Styling**:
- Cards use glass effect with Electric Green accents
- Countdown uses large, bold numbers
- Aerodynamic curved corners on cards

---

### ZONE 3: Performance Center (Grid)
**Purpose**: Player toolkit for improvement

**4 Glass Tiles**:
1. **SWING LAB** (Video Analysis)
   - Icon: Play button in focus frame
   - Subtitle: "Analyze your strokes"
   
2. **MY DATA** (Stats)
   - Icon: Radar chart / Activity icon
   - Subtitle: "Track technical progress"
   
3. **PRO SHOP** (Gear)
   - Icon: Shopping bag / Racket bag
   - Subtitle: "Upgrade your equipment"
   
4. **ACADEMY HUB** (Social/News)
   - Icon: Trophy / Globe
   - Subtitle: "News & Rankings"

**Styling**:
- 2x2 grid layout
- Glass-effect cards on midnight blue
- White icons, Electric Green on hover/press
- Locked features show lock icon with "Unlock at Level X"

---

### ZONE 4: Social Ticker (Footer)
**Purpose**: Live activity feed combining all notifications

**Content Types** (horizontally scrolling):
- Chat messages from coach
- Daily goals progress
- Streak status
- Academy news/announcements
- Player achievements ("Max reached Level 5!")
- System notifications

**Styling**:
- Black bar with white text, ESPN/Eurosport ticker style
- Auto-scrolls horizontally
- Icons before each item (target, lightning, megaphone, trophy)
- Tap to expand into full feed/chat

---

### ZONE 5: Quick Serve FAB
**Purpose**: Fast actions floating button

**Position**: Bottom-right, Electric Green color

**Menu Actions**:
- Log Score (match result)
- Chat Coach (quick message)
- Record Video (capture evidence)

**Styling**:
- Electric Green (#CCFF00) primary button
- Expands into radial menu on tap
- Spring animation on open/close

---

## Feature Unlock System (Solo Leveling)

Features are gated by player level with visual indicators:

**Locked State**:
- Show feature teaser with blur overlay
- Lock icon in center
- "Unlock at Level X" text
- Subtle pulse animation

**Unlock Celebration**:
- Modal with confetti/particles
- "NEW FEATURE UNLOCKED" header
- Feature icon and description
- XP reward for discovery

---

### Chat Interface
**Purpose**: Quick access to 5 channel types with notifications

**Layout**:
- Channel tabs at top: Academy, Squad, Friends, Coaches, Admin
- Message list with WhatsApp-style bubbles
- Emoticon reaction buttons on each message (tap to add)
- System notifications for level-ups (highlighted in #39FF14)
- Input field at bottom with send button

**Visual**:
- User messages: Right-aligned, #2ECC40 background
- Other messages: Left-aligned, #2D2D2D background
- Reactions: Small circular badges with emoji, overlaid on message corner
- Timestamp: Gray text, 10px font size

---

### 3. Profile/Settings Screen
**Purpose**: Manage account, preferences, and avatar

**Layout**:
- **Header**: Default navigation with "Profile" title
  - Right button: "Save" (when editing)
  - Transparent background

- **Main Content**: Scrollable form
  - Avatar selection (grid of tennis-themed preset avatars)
  - Display name input field
  - Theme toggle (dark mode default)
  - Notification preferences
  - Account management section (bottom)
  - Safe area top inset: headerHeight + 24px
  - Safe area bottom inset: insets.bottom + 24px

- **Buttons**: Submit/Cancel at bottom of form (not in header)

**Assets Needed**: 8-10 tennis-themed avatar presets (racket, ball, trophy variations)

---

### 4. Drawer Menu Screens
**Common Layout**:
- Default navigation header with screen title
- Back button (auto-handled by drawer)
- Scrollable content area
- Consistent safe area insets

**Specific Screens**:
- **Lessons**: List of available lessons with booking status
- **Quest**: Daily/weekly challenge cards with progress
- **Match**: Match history + schedule new match button
- **Ranking**: Leaderboard list with filter chips
- **Friends**: Friend list with add friend floating button
- **Game Lobby**: Available multiplayer sessions
- **Events Calendar**: Calendar view with event markers
- **Payments**: Transaction history + add currency button

---

## Design System

### Color Palette
**Primary Colors**:
- Tennis Green: `#2ECC40` (primary actions, highlights)
- Gold Trophy: `#FFD700` (achievements, rewards)
- Energetic Orange: `#FF851B` (accents, CTAs)

**Background & UI**:
- Dark Background: `#1A1A1A` (screen backgrounds)
- Card Grey: `#2D2D2D` (elevated surfaces)
- XP Cyan: `#00D4FF` (progress indicators with glow)

**Currency**:
- Diamond Silver: `#E0E0E0` (hard currency icon)
- Bronze Coin: `#CD7F32` (soft currency icon)

**Feedback**:
- Success Neon: `#39FF14` (level-ups, achievements)
- Error Red: `#FF4444` (form errors, warnings)
- Disabled Gray: `#666666` (inactive elements)

### Typography
**Font Families**:
- Headings: Rajdhani Bold (gaming feel)
- Body: Poppins Regular/Medium
- Stats/Numbers: Montserrat SemiBold (clarity)

**Scale**:
- H1 (Screen Titles): 28px, Rajdhani Bold
- H2 (Card Titles): 20px, Poppins SemiBold
- Body: 16px, Poppins Regular
- Caption (Stats): 14px, Montserrat Medium
- Small (Timestamps): 12px, Poppins Regular

**Line Heights**: 1.4x for readability in dark theme

### Spacing System
- xs: 4px
- sm: 8px
- md: 12px
- lg: 16px
- xl: 24px
- xxl: 32px

### Component Specifications

**Skill Category Cards**:
- Size: Full-width minus 32px horizontal padding (2-column grid with 12px gap)
- Height: 160px minimum
- Background: #2D2D2D
- Border radius: 12px
- Active glow: 0 0 16px rgba(46, 204, 64, 0.3)
- Content: Icon (top), name (center), score + ring (bottom)

**XP Progress Bar**:
- Height: 6px
- Background: #2D2D2D
- Fill: Linear gradient (#00D4FF to #2ECC40)
- Glow effect: 0 0 8px rgba(0, 212, 255, 0.6)
- Animated on XP gain

**Buttons**:
- Primary: #2ECC40 background, white text, 48px height, 12px radius
- Secondary: Outline #2ECC40, transparent bg, 48px height
- Icon buttons: 44x44px tap target minimum
- Floating action button: 56x56px, #FF851B, drop shadow (offset 0,2 opacity 0.1 radius 2)

**Chat Bubbles**:
- Max width: 75% screen width
- Padding: 12px horizontal, 8px vertical
- Border radius: 16px (rounded corners on appropriate sides)
- Tail: None (clean WhatsApp style)

**Currency Indicators**:
- Icon size: 20x20px
- Value: Montserrat SemiBold 14px
- Container: Horizontal layout with 6px gap
- Background: Semi-transparent #2D2D2D with 8px padding

### Visual Effects
**Glow Effects** (sparingly used):
- XP bar: Cyan glow during progress animation
- Level-up: Full-screen green (#39FF14) flash effect
- Active cards: Subtle green glow on tap

**Shadows**:
- Cards: None by default (rely on background contrast)
- Floating button ONLY: shadowOffset {width: 0, height: 2}, shadowOpacity: 0.10, shadowRadius: 2
- Header: Subtle bottom border (#2ECC40, 1px, 0.3 opacity)

**Animations**:
- Level-up: Scale + fade + confetti particles
- XP gain: Smooth fill animation (300ms ease-out)
- Chat expand: Spring animation (tension 100, friction 10)
- Card interactions: Scale to 0.98 on press

### Icons
**System Icons**: Use Feather icons from @expo/vector-icons
- Navigation: menu, settings, x (close)
- Actions: plus, edit-2, trash-2, send
- Social: message-circle, users, award
- Currency: No emojis - use custom tennis racket and ball SVG icons

**Custom Assets Required**:
1. Tennis racket icon (diamond currency)
2. Tennis ball icon (bronze currency)
3. 8-10 tennis-themed avatars (player presets)
4. 5 skill category icons (Tactical, Mental, Technical, Physical, Social)
5. Trophy/medal icons for achievements

### Accessibility
- All touchable elements: Minimum 44x44px tap target
- Color contrast: WCAG AA compliant (light text on dark backgrounds)
- Press feedback: Opacity 0.7 or scale 0.98 on all touchables
- Screen reader labels: Meaningful descriptions for all icons
- Chat messages: Timestamp + sender info for context
- XP progress: Announce percentage on update
- Haptic feedback: On level-up and achievement unlock

### Responsive Behavior
- All layouts use flexbox for device size adaptation
- Minimum safe area insets respected on all screens
- Chat footer: Max 60% screen height when expanded
- Card grid: Switches to single column on very small screens (<350px width)
- Typography scales down 10% on small screens

---

## Screen Hierarchy (20/60/20 Rule)

**CRITICAL: Not every page can be "epic". Distribute visual intensity:**

### 20% Epic (Command Center / Home Only)
- Dashboard/Home screens with hero headers
- One animated glow element maximum
- Dramatic typography and status indicators
- Reserved for: Main dashboard, command centers, onboarding

### 60% Calm (Lists, Calendar, Settings)
**This is the GOLD STANDARD. Most screens should look like this.**
- Clean hierarchy: Title → filters → content
- **Zero animated glows** - glow is functional only (status/selection)
- Flat cards with clear sections
- Green used only for action/selection, never decorative
- Professional, task-driven layouts
- Examples: Calendar (gold standard), Settings, Player lists, Session lists

### 20% Focused (Detail Screens)
- Single-purpose screens with one primary action
- Depth only on the main content card
- Minimal distractions
- Examples: Player detail, Session feedback, Profile edit

---

## Visual Rules Checklist

### Glow Rules
- **Maximum 1 glow element per screen**
- Glow = status indicator or selection state ONLY
- Glow is NEVER purely decorative
- Calm screens: No animated glows at all
- Epic screens: One controlled glow effect maximum

### Green Usage
- Green = Action button or selection state
- Green = Active/selected filter or tab
- Green ≠ Background fill
- Green ≠ Decorative accent on every element
- Use sparingly: if everything is green, nothing stands out

### Card Depth Policy
- **List items = Flat** (no elevation, minimal border)
- **Detail views = Depth** (subtle elevation, focus on content)
- **Problem indicators = Accent** (colored border or badge only)
- Never: Every card with glow/gradient/animation

### Typography Hierarchy
- **Title = White** (#FFFFFF or light text)
- **Meta/Labels = Grey** (muted, secondary)
- **Status = Color** (green for success, gold for pending, red for error)
- Uppercase + letter-spacing = Reserved for epic headers only

---

## Component Usage by Screen Type

### For CALM Screens (Calendar, Settings, Lists)
```
NeoLoadoutPanel: tone="calm" (glow disabled, flat background)
Cards: Simple background, 1px border, no animation
Filters: Pill buttons without glow, color on active only
Lists: FlatList with minimal styling per row
```

### For EPIC Screens (Dashboard, Command Center)
```
NeoLoadoutPanel: tone="epic" (single glow allowed, animations OK)
Header: Can have sweep animation, status badges
Cards: One card with glow effect maximum
Status: Animated indicators allowed
```

### For FOCUSED Screens (Details, Forms)
```
NeoLoadoutPanel: tone="focused" (depth on main card only)
Content: Single scrollable area with clear CTA
Navigation: Simple back button, no complex tabs
```