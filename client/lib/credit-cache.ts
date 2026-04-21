import type { QueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PLAYERS_LIST_PREFIXES = [
  "@coach.playersList.v1",
  "@coach.pastPlayersList.v1",
  "@coach.pendingPlayersList.v1",
];

export function invalidatePlayersList(queryClient: QueryClient): void {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey?.[0];
      return typeof key === "string" && key.startsWith("/api/players");
    },
  });

  AsyncStorage.getAllKeys()
    .then((keys) => {
      const stale = keys.filter((k) =>
        PLAYERS_LIST_PREFIXES.some((prefix) => k.startsWith(prefix)),
      );
      if (stale.length > 0) {
        return AsyncStorage.multiRemove(stale);
      }
    })
    .catch(() => {
    });
}
