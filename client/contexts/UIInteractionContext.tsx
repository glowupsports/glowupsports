import React, { createContext, useContext, useState, useCallback, useRef } from "react";

interface UIInteraction {
  elementType: string;
  elementLabel: string;
  screenName: string;
  timestamp: Date;
}

interface UIInteractionContextType {
  lastInteraction: UIInteraction | null;
  trackInteraction: (elementType: string, elementLabel: string, screenName: string) => void;
}

const UIInteractionContext = createContext<UIInteractionContextType>({
  lastInteraction: null,
  trackInteraction: () => {},
});

export function UIInteractionProvider({ children }: { children: React.ReactNode }) {
  const [lastInteraction, setLastInteraction] = useState<UIInteraction | null>(null);

  const trackInteraction = useCallback((elementType: string, elementLabel: string, screenName: string) => {
    setLastInteraction({
      elementType,
      elementLabel,
      screenName,
      timestamp: new Date(),
    });
  }, []);

  return (
    <UIInteractionContext.Provider value={{ lastInteraction, trackInteraction }}>
      {children}
    </UIInteractionContext.Provider>
  );
}

export function useUIInteraction() {
  return useContext(UIInteractionContext);
}

export function useTrackButton(screenName: string) {
  const { trackInteraction } = useUIInteraction();
  
  return useCallback((label: string, onPress?: () => void) => {
    return () => {
      trackInteraction("button", label, screenName);
      onPress?.();
    };
  }, [trackInteraction, screenName]);
}
