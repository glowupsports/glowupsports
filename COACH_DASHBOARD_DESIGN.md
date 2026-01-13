# Coach Dashboard Design System
**Visual Style: Gaming-Aesthetic with Glassmorphism**

---

## Core Design Elements

### 1. Gaming-Style Progress Bar
- Animated neon glow effect with gradient fill (cyan → magenta → purple)
- Gentle pulse animation
- Used in wizards and multi-step flows

```typescript
// Gradient colors
colors: [ProTennisColors.neonCyan, "#FF00FF", "#8B5CF6"]

// Animation: pulse with opacity 0.6 → 1.0
```

### 2. Glassmorphism Cards
- Transparent background with rgba overlays
- Neon border highlights
- Subtle gradient tints per session type
- No solid white surfaces

```typescript
// Base glass effect
backgroundColor: "rgba(18, 18, 22, 0.9)"
borderWidth: 1
borderColor: "rgba(255, 255, 255, 0.1)"
```

### 3. Neon Glow Effects
- Animated glow pulse on progress indicators
- Neon cyan/magenta accents on selected items
- Shadow glow for emphasis

```typescript
// Glow shadow
shadowColor: ProTennisColors.neonCyan
shadowOffset: { width: 0, height: 0 }
shadowOpacity: 0.8
shadowRadius: 12
```

### 4. Session Type Cards
Each session type has a unique color scheme:

| Type | Primary Color | Hex |
|------|--------------|-----|
| Private | Neon Cyan | #00F0FF |
| Group | Electric Green | #CCFF00 |
| Semi-Private | Amber | #FFA500 |
| Physical | Orange | #FF6B00 |
| Activity | Purple | #8B5CF6 |

- Gradient fill with dark overlay
- Selected state: full opacity + glow border
- Unselected state: dimmed (30% opacity)

### 5. Time Slot Grid
- Animated selection feedback with Haptics
- Color-coded availability:
  - **Green**: Available / optimal
  - **Yellow**: Limited / warning
  - **Orange**: Low availability / caution
- Spring animation on selection

### 6. Spring Animations
All transitions use react-native-reanimated with spring physics:

```typescript
// Standard spring config
withSpring(value, {
  damping: 20,
  stiffness: 90,
})
```

### 7. Summary Card
- Glassmorphism effect
- All session details in organized layout
- Section dividers with subtle borders
- Icon + text pairs for each detail

### 8. Dark Gaming Aesthetic
- Background: #0a0a0a (near-black)
- No bright white surfaces
- All text: white with muted gray for secondary
- Neon accents for CTAs and highlights

---

## Color Palette (ProTennisColors)

| Name | Hex | Usage |
|------|-----|-------|
| Midnight Blue | #090E17 | Primary background |
| Card Surface | #151B29 | Elevated surfaces |
| Electric Green | #CCFF00 | Primary CTA, tennis ball accent |
| Neon Cyan | #00F0FF | Secondary accent, social actions |
| Warning/Gold | #FFB800 | Warnings, upcoming states |
| Danger | #FF4444 | Errors, cancel actions |
| Text | #FFFFFF | Primary text |
| Text Muted | #7A8AA3 | Secondary text |

---

## Typography

- **Headings**: Bold, uppercase, letter-spacing: 1-2
- **Numbers/Stats**: Large, prominent, tabular figures
- **Labels**: Small, muted, supporting role
- **Font Family**: System default (Rajdhani-like gaming feel)

---

## Animation Guidelines

### Haptic Feedback
- Light impact on selections
- Medium impact on confirmations
- Warning notification on destructive actions

### Timing
- Quick transitions: 200ms
- Standard transitions: 300ms
- Emphasized transitions: 400-500ms with spring

### States
- **Idle**: Base state, subtle background
- **Pressed**: Scale down slightly (0.97)
- **Selected**: Full opacity + glow + border highlight
- **Disabled**: 50% opacity, no interactions

---

## Component Patterns

### Button Styles
```typescript
// Primary (CTA)
backgroundColor: ProTennisColors.electricGreen
color: ProTennisColors.midnightBlue

// Secondary
backgroundColor: "transparent"
borderWidth: 1
borderColor: ProTennisColors.neonCyan
color: ProTennisColors.neonCyan

// Danger
backgroundColor: ProTennisColors.danger + "20"
borderColor: ProTennisColors.danger
color: ProTennisColors.danger
```

### Card Styles
```typescript
// Glass card
backgroundColor: "rgba(18, 18, 22, 0.85)"
borderRadius: 16
borderWidth: 1
borderColor: "rgba(255, 255, 255, 0.1)"
overflow: "hidden"
```

### Input Styles
```typescript
backgroundColor: "rgba(255, 255, 255, 0.05)"
borderWidth: 1
borderColor: "rgba(255, 255, 255, 0.1)"
borderRadius: 12
color: "#FFFFFF"
// Focus state
borderColor: ProTennisColors.neonCyan
```

---

## Implementation Notes

1. **Never use pure white backgrounds** - Always use dark surfaces with subtle transparency
2. **Always add haptic feedback** - Every tap should feel responsive
3. **Use spring animations** - Avoid linear/ease timing for interactions
4. **Glow effects for emphasis** - Selected items should "pop" with neon glow
5. **Consistent spacing** - Use Spacing constants from theme.ts
6. **BorderRadius consistency** - Use BorderRadius constants (sm: 8, md: 12, lg: 16, xl: 20)
