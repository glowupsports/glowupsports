import { Platform, useWindowDimensions } from "react-native";

export function useDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= 1024;
}
