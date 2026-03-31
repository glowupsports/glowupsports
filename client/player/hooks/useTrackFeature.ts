import { useCallback } from "react";
import { Platform } from "react-native";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";

export function useTrackFeature() {
  const track = useCallback((feature: string) => {
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/analytics/event", baseUrl);
      const platform = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";
      fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        credentials: "include",
        body: JSON.stringify({ feature, platform }),
      }).catch(() => {});
    } catch {
    }
  }, []);

  return track;
}
