import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  PanResponder,
  TextInput,
  Platform,
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

const HEX6_RE = /^#[0-9a-fA-F]{6}$/;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = v - c;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `#${h(r)}${h(g)}${h(b)}`;
}

function hexToHsv(hex: string): { h: number; s: number; v: number } | null {
  if (!HEX6_RE.test(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

function hueHex(h: number): string {
  const { r, g, b } = hsvToRgb(h, 1, 1);
  return rgbToHex(r, g, b);
}

interface Props {
  visible: boolean;
  initial: string;
  title: string;
  onClose: () => void;
  onSelect: (hex: string) => void;
}

const SV_SIZE = 240;
const HUE_HEIGHT = 22;
const HUE_WIDTH = SV_SIZE;

export default function ColorPickerModal({
  visible,
  initial,
  title,
  onClose,
  onSelect,
}: Props) {
  const seed = useMemo(() => {
    const h = hexToHsv(initial);
    return h ?? { h: 0, s: 1, v: 1 };
  }, [initial]);

  const [h, setH] = useState(seed.h);
  const [s, setS] = useState(seed.s);
  const [v, setV] = useState(seed.v);
  const [hexDraft, setHexDraft] = useState(initial);

  // Reset when reopened with a new initial.
  useEffect(() => {
    if (!visible) return;
    const next = hexToHsv(initial) ?? { h: 0, s: 1, v: 1 };
    setH(next.h);
    setS(next.s);
    setV(next.v);
    setHexDraft(HEX6_RE.test(initial) ? initial : "#FFFFFF");
  }, [visible, initial]);

  const rgb = hsvToRgb(h, s, v);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);

  // Keep hex draft in sync when picker drives the colour.
  const lastEmittedRef = useRef<string>(hex);
  useEffect(() => {
    if (lastEmittedRef.current !== hex) {
      setHexDraft(hex);
      lastEmittedRef.current = hex;
    }
  }, [hex]);

  // SV pad pan responder.
  const svResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        setS(clamp01(locationX / SV_SIZE));
        setV(clamp01(1 - locationY / SV_SIZE));
      },
      onPanResponderMove: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        setS(clamp01(locationX / SV_SIZE));
        setV(clamp01(1 - locationY / SV_SIZE));
      },
    }),
  ).current;

  // Hue strip pan responder.
  const hueResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        setH(clamp01(e.nativeEvent.locationX / HUE_WIDTH) * 360);
      },
      onPanResponderMove: (e) => {
        setH(clamp01(e.nativeEvent.locationX / HUE_WIDTH) * 360);
      },
    }),
  ).current;

  const cursorX = s * SV_SIZE;
  const cursorY = (1 - v) * SV_SIZE;
  const hueCursorX = (h / 360) * HUE_WIDTH;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={styles.card}
          onPress={(e) => e.stopPropagation()}
          accessibilityViewIsModal
        >
          <Text style={styles.title}>{title}</Text>

          {/* SV pad */}
          <View
            style={[styles.pad, { width: SV_SIZE, height: SV_SIZE }]}
            {...svResponder.panHandlers}
          >
            <Svg width={SV_SIZE} height={SV_SIZE} style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id="sat" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
                  <Stop offset="1" stopColor={hueHex(h)} stopOpacity="1" />
                </LinearGradient>
                <LinearGradient id="val" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#000000" stopOpacity="0" />
                  <Stop offset="1" stopColor="#000000" stopOpacity="1" />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width={SV_SIZE} height={SV_SIZE} fill="url(#sat)" />
              <Rect x="0" y="0" width={SV_SIZE} height={SV_SIZE} fill="url(#val)" />
            </Svg>
            <View
              pointerEvents="none"
              style={[
                styles.cursor,
                {
                  transform: [
                    { translateX: cursorX - 10 },
                    { translateY: cursorY - 10 },
                  ],
                },
              ]}
            />
          </View>

          {/* Hue strip */}
          <View
            style={[styles.hue, { width: HUE_WIDTH, height: HUE_HEIGHT }]}
            {...hueResponder.panHandlers}
          >
            <Svg width={HUE_WIDTH} height={HUE_HEIGHT} style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id="hue" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#FF0000" />
                  <Stop offset="0.17" stopColor="#FFFF00" />
                  <Stop offset="0.33" stopColor="#00FF00" />
                  <Stop offset="0.5" stopColor="#00FFFF" />
                  <Stop offset="0.67" stopColor="#0000FF" />
                  <Stop offset="0.83" stopColor="#FF00FF" />
                  <Stop offset="1" stopColor="#FF0000" />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width={HUE_WIDTH} height={HUE_HEIGHT} fill="url(#hue)" rx={HUE_HEIGHT / 2} />
            </Svg>
            <View
              pointerEvents="none"
              style={[
                styles.hueCursor,
                {
                  transform: [{ translateX: hueCursorX - 6 }],
                },
              ]}
            />
          </View>

          {/* Preview + hex input */}
          <View style={styles.previewRow}>
            <View style={[styles.swatch, { backgroundColor: hex }]} />
            <TextInput
              value={hexDraft}
              onChangeText={(raw) => {
                const trimmed = raw.length === 0
                  ? ""
                  : raw.startsWith("#") ? raw : `#${raw}`;
                setHexDraft(trimmed.toUpperCase());
                if (HEX6_RE.test(trimmed)) {
                  const next = hexToHsv(trimmed);
                  if (next) {
                    setH(next.h);
                    setS(next.s);
                    setV(next.v);
                  }
                }
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
              placeholder="#RRGGBB"
              placeholderTextColor={Colors.dark.textMuted}
              style={styles.hexInput}
            />
          </View>

          <View style={styles.actions}>
            <Pressable onPress={onClose} style={[styles.btn, styles.btnGhost]}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onSelect(hex);
                onClose();
              }}
              style={[styles.btn, styles.btnPrimary]}
            >
              <Text style={styles.btnPrimaryText}>Apply</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
  },
  card: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
    maxWidth: 360,
    width: "100%",
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  title: {
    color: Colors.dark.text,
    fontWeight: "700",
    fontSize: 16,
  },
  pad: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    alignSelf: "center",
  },
  cursor: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    backgroundColor: "transparent",
  },
  hue: {
    alignSelf: "center",
    borderRadius: HUE_HEIGHT / 2,
    overflow: "hidden",
  },
  hueCursor: {
    position: "absolute",
    top: -2,
    width: 12,
    height: HUE_HEIGHT + 4,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    backgroundColor: "transparent",
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  hexInput: {
    flex: 1,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.sm,
  },
  btn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  btnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  btnGhostText: { color: Colors.dark.text, fontWeight: "600" },
  btnPrimary: { backgroundColor: Colors.dark.primary },
  btnPrimaryText: { color: "#0B0B0B", fontWeight: "700" },
});
