import React, { createContext, useContext } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

export type CoachingScrollHandler = (
  e: NativeSyntheticEvent<NativeScrollEvent>,
) => void;

const CoachingScrollContext = createContext<CoachingScrollHandler | null>(null);

export const CoachingScrollProvider = CoachingScrollContext.Provider;

export function useCoachingScroll(): CoachingScrollHandler | undefined {
  const handler = useContext(CoachingScrollContext);
  return handler ?? undefined;
}
