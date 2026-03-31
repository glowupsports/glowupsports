import { Platform, Linking, Alert } from "react-native";

export async function openDirections(options: {
  lat?: number | null;
  lng?: number | null;
  label?: string | null;
  address?: string | null;
}): Promise<void> {
  const { lat, lng, label, address } = options;
  const hasCoords = lat != null && lng != null;
  const encodedLabel = encodeURIComponent(label || address || "");

  let url: string;

  if (Platform.OS === "ios") {
    if (hasCoords) {
      url = `maps:?ll=${lat},${lng}&q=${encodedLabel}`;
    } else {
      url = `maps:?q=${encodeURIComponent(address || label || "")}`;
    }
  } else {
    if (hasCoords) {
      url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    } else {
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || label || "")}`;
    }
  }

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      const fallback = hasCoords
        ? `https://maps.google.com/?q=${lat},${lng}`
        : `https://maps.google.com/?q=${encodeURIComponent(address || label || "")}`;
      await Linking.openURL(fallback);
    }
  } catch {
    Alert.alert("Unable to open Maps", "Please open a maps app manually.");
  }
}
