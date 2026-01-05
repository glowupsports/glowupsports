# Glow Up Sports - UI Design System

## Gaming-Style Session Creation Wizard

The CreateSessionWizard showcases the pinnacle of our gaming-aesthetic UI design. This document captures every visual detail for future reference.

---

## Color Palette

### Core Dark Theme
```
Background Root:     #1A1A1A (deepest black)
Background Default:  #2D2D2D (elevated surfaces)
Background Secondary: #353739 (cards, inputs)
Background Tertiary: #404244 (hover states)
```

### Neon Accent Colors
```
Primary Green:       #2ECC40 (main brand color)
Primary Glow:        #3DDB52 (hover/active states)
XP Cyan:            #00D4FF (player stats, XP bars)
Gold:               #FFD700 (rewards, premium)
Orange:             #FF851B (group sessions)
Neon Success:       #39FF14 (success states)
Error Red:          #FF4444 (errors, alerts)
Pink Accent:        #FF6B9D (activity sessions)
Diamond Silver:     #E0E0E0 (platinum tier)
Bronze Coin:        #CD7F32 (bronze tier)
Magenta Glow:       #E040FB (glow ball level)
```

### Session Type Colors
Each session type has its own identity:
```
Private:      #2ECC40 (Cyan/Primary)
Group:        #FF851B (Orange)
Semi-Private: #00D4FF (XP Cyan)
Physical:     #FFD700 (Gold)
Activity:     #FF6B9D (Pink)
```

### Ball Level Colors
```
Red Ball:    #FF4444
Orange Ball: #FF851B
Green Ball:  #2ECC40
Yellow Ball: #FFD700
Glow Ball:   #E040FB (Magenta)
```

---

## Typography

```typescript
h1: { fontSize: 28, fontWeight: "700" }  // Main titles
h2: { fontSize: 20, fontWeight: "600" }  // Section headers
h3: { fontSize: 18, fontWeight: "600" }  // Card titles
h4: { fontSize: 16, fontWeight: "600" }  // Subsections
body: { fontSize: 16, fontWeight: "400" } // Regular text
small: { fontSize: 14, fontWeight: "400" } // Secondary info
caption: { fontSize: 12, fontWeight: "500" } // Labels, badges

// Number emphasis for gaming metrics
numberLarge: { fontSize: 32, fontWeight: "700", letterSpacing: -0.5 }
numberMedium: { fontSize: 24, fontWeight: "600", letterSpacing: -0.3 }
```

---

## Spacing Scale

```typescript
xs: 4    // Tight gaps
sm: 8    // Small gaps
md: 12   // Medium spacing
lg: 16   // Large spacing
xl: 24   // Section gaps
2xl: 32  // Major sections
3xl: 40  // Page margins
4xl: 48  // Extra large
5xl: 56  // Maximum spacing
```

---

## Border Radius

```typescript
xs: 8    // Subtle rounding
sm: 12   // Small buttons
md: 16   // Cards, inputs
lg: 24   // Large buttons
xl: 30   // Pills
2xl: 40  // Large pills
3xl: 50  // Extra large
full: 9999 // Circles
```

---

## Glassmorphism Effect

The wizard uses frosted glass styling throughout:

```typescript
// Container with glass effect
container: {
  backgroundColor: "#0a0a0aEE",  // 93% opacity black
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.15)",
}

// Blur overlay for modal backdrop
<BlurView intensity={80} tint="dark" />
```

---

## Session Type Cards

Large, tappable cards with gradient fills:

```typescript
sessionTypeCard: {
  flex: 1,
  minWidth: (SCREEN_WIDTH - 64) / 2,  // 2-column grid
  aspectRatio: 1.2,
  borderRadius: 16,
  overflow: "hidden",
  borderWidth: 2,
  borderColor: Colors.dark.border,
}

// Gradient fill per type (40% → 10% opacity)
Private:      ["#2ECC4040", "#2ECC4010"]
Group:        ["#FF851B40", "#FF851B10"]
Semi-Private: ["#00D4FF40", "#00D4FF10"]
Physical:     ["#FFD70040", "#FFD70010"]
Activity:     ["#FF6B9D40", "#FF6B9D10"]

// Active state
sessionTypeCardActive: {
  borderColor: {color},  // Session type's accent color
  borderWidth: 3,
}
```

---

## Animated Progress Bar

The wizard features a neon-glowing progress bar:

```typescript
progressContainer: {
  height: 6,
  backgroundColor: Colors.dark.backgroundSecondary,
  borderRadius: 3,
  overflow: "hidden",
}

// Animated gradient fill (cyan → magenta → purple)
<LinearGradient
  colors={["#00D4FF", "#E040FB", "#8B5CF6"]}
  start={{ x: 0, y: 0 }}
  end={{ x: 1, y: 0 }}
/>

// Spring animation for smooth progress
slideProgress.value = withSpring(currentSlide / (TOTAL_SLIDES - 1), {
  damping: 20,
  stiffness: 90,
});
```

### Glow Pulse Animation

The progress bar has a subtle pulsing glow effect:

```typescript
// Continuous pulse loop
const pulse = () => {
  glowPulse.value = withTiming(1, { duration: 1500 }, () => {
    glowPulse.value = withTiming(0, { duration: 1500 }, () => {
      runOnJS(pulse)();
    });
  });
};

// Animated glow overlay
const progressGlowStyle = useAnimatedStyle(() => ({
  position: "absolute",
  left: 0,
  right: 0,
  top: -2,
  bottom: -2,
  opacity: interpolate(glowPulse.value, [0, 1], [0.3, 0.8]),
}));

// Glow gradient (cyan 50% opacity)
<LinearGradient
  colors={["#00D4FF80", "#E040FB80", "#8B5CF680"]}
  style={{ height: 10, borderRadius: 5 }}
/>
```

---

## Time Slot Grid

Available time slots in a compact grid:

```typescript
slotsGrid: {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 8,
}

timeSlot: {
  width: (SCREEN_WIDTH - 72) / 4,  // 4 columns
  paddingVertical: 10,
  borderRadius: 12,
  alignItems: "center",
  backgroundColor: Colors.dark.backgroundSecondary,
  borderWidth: 1,
  borderColor: Colors.dark.border,
}

// Selected state with neon glow
timeSlotActive: {
  backgroundColor: Colors.dark.primary,
  borderColor: Colors.dark.primary,
}
```

---

## Navigation Buttons

### Next Button (Gradient Fill)
```typescript
nextBtn: {
  borderRadius: 24,
  overflow: "hidden",
}

// Gradient: cyan → primary green
<LinearGradient
  colors={[Colors.dark.xpCyan, Colors.dark.primary]}
  start={{ x: 0, y: 0 }}
  end={{ x: 1, y: 0 }}
>
  <View style={{ 
    paddingHorizontal: 24, 
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  }}>
    <Text style={{ 
      fontSize: 16, 
      fontWeight: "700",
      color: "#1A1A1A"  // Dark text on bright gradient
    }}>
      NEXT
    </Text>
    <Ionicons name="arrow-forward" size={18} color="#1A1A1A" />
  </View>
</LinearGradient>

// Disabled state
nextBtnDisabled: {
  opacity: 0.5,
}
```

### Create Button (Success Gradient)
```typescript
// Gradient: primary green → gold
<LinearGradient
  colors={[Colors.dark.primary, Colors.dark.gold]}
  start={{ x: 0, y: 0 }}
  end={{ x: 1, y: 0 }}
>
  // Same internal structure as Next button
</LinearGradient>
```

### Back Button (Ghost Style)
```typescript
backBtn: {
  flexDirection: "row",
  alignItems: "center",
  gap: 4,
  padding: 12,
}

backBtnText: {
  fontSize: 16,
  fontWeight: "400",
  color: Colors.dark.text,  // White text, no background
}
```

---

## Recurring Toggle Cards

Two-option toggle with visual distinction:

```typescript
recurringCard: {
  flex: 1,
  padding: 20,
  borderRadius: 16,
  backgroundColor: Colors.dark.backgroundSecondary,
  alignItems: "center",
  gap: 8,
  borderWidth: 2,
  borderColor: Colors.dark.border,
}

// Active state
recurringCardActive: {
  borderColor: Colors.dark.primary,
  backgroundColor: Colors.dark.primary + "20",  // 12.5% opacity
}

// Icons
One-time: "calendar-outline" (Ionicons)
Weekly:   "repeat" (Ionicons)
```

---

## Summary Card (Confirmation Slide)

Final review card with all session details:

```typescript
summaryCard: {
  borderRadius: 24,
  overflow: "hidden",
  marginBottom: 24,
  borderWidth: 1,
  borderColor: Colors.dark.border,
}

// Gradient fill based on session type
summaryCardGradient: {
  padding: 16,
  gap: 12,
}

// Type badge
summaryTypeBadge: {
  flexDirection: "row",
  alignItems: "center",
  gap: 4,
  alignSelf: "flex-start",
  paddingHorizontal: 12,
  paddingVertical: 4,
  borderRadius: 12,
  backgroundColor: {sessionTypeColor},
}

summaryTypeBadgeText: {
  fontSize: 14,
  color: "#1A1A1A",
  fontWeight: "700",
}

// Info rows with icons
summaryRow: {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
}
```

---

## Haptic Feedback

The wizard uses haptic feedback for a premium feel:

```typescript
// Navigation
goNext: Haptics.ImpactFeedbackStyle.Medium
goBack: Haptics.ImpactFeedbackStyle.Light

// Selection changes
sessionTypeSelect: Haptics.ImpactFeedbackStyle.Medium
timeSlotSelect: Haptics.ImpactFeedbackStyle.Light
courtSelect: Haptics.ImpactFeedbackStyle.Light
recurringToggle: Haptics.ImpactFeedbackStyle.Medium

// Success
createSession: Haptics.NotificationFeedbackType.Success
```

---

## Slide Transitions

Smooth slide animations using Reanimated:

```typescript
// Entering animation (new slide)
FadeIn.duration(200)
SlideInRight.duration(200)

// Exiting animation (old slide)
FadeOut.duration(200)
SlideOutLeft.duration(200)
```

---

## Loading States

```typescript
// Spinner with brand color
<ActivityIndicator size="large" color={Colors.dark.primary} />

// Availability check indicator
<Text style={{ color: Colors.dark.textMuted }}>
  Checking availability across all weeks...
</Text>
```

---

## Key Visual Principles

### 1. Dark-First Design
All backgrounds are dark (#1A1A1A to #404244), with bright neon accents for interactivity.

### 2. Gradient Everything
Buttons, progress bars, and cards use gradients for depth and gaming aesthetic.

### 3. Neon Glow Effects
Selected items and CTA buttons glow with their accent color using opacity overlays.

### 4. Consistent Iconography
All icons use Ionicons for consistency. Key icons:
- `person` / `people` / `people-outline` for player counts
- `calendar` / `repeat` for scheduling
- `location` / `time` for when/where
- `chevron-forward` / `chevron-back` for navigation
- `checkmark-circle` for confirmation
- `fitness` / `game-controller` for session types

### 5. Card-Based Layout
Everything is contained in rounded cards with subtle borders and elevation achieved through background color (not shadows).

### 6. Haptic Reinforcement
Every interaction provides tactile feedback appropriate to its importance.

---

## Implementation Files

- **Main Component**: `client/coach/components/CreateSessionWizard.tsx`
- **Theme Constants**: `client/constants/theme.ts`
- **Icons**: `@expo/vector-icons/Ionicons`

---

*This design system captures the "super cool and mooi" gaming aesthetic that makes session creation a joy.*
