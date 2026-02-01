import React, { createContext, useContext, useCallback, useRef, useState, ReactNode } from "react";
import PagerView from "react-native-pager-view";
import * as Haptics from "expo-haptics";

interface TabNavigationContextType {
  navigateToTab: (tabKey: string) => void;
  registerPager: (pagerRef: React.RefObject<PagerView | null>, tabs: { key: string }[]) => void;
  scrollEnabled: boolean;
  setScrollEnabled: (enabled: boolean) => void;
}

const TabNavigationContext = createContext<TabNavigationContextType | null>(null);

interface TabNavigationProviderProps {
  children: ReactNode;
}

export function TabNavigationProvider({ children }: TabNavigationProviderProps) {
  const pagerRefStore = useRef<React.RefObject<PagerView | null> | null>(null);
  const tabsStore = useRef<{ key: string }[]>([]);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const registerPager = useCallback((pagerRef: React.RefObject<PagerView | null>, tabs: { key: string }[]) => {
    pagerRefStore.current = pagerRef;
    tabsStore.current = tabs;
  }, []);

  const navigateToTab = useCallback((tabKey: string) => {
    if (!pagerRefStore.current?.current || !tabsStore.current.length) {
      console.warn("[TabNavigation] Pager not registered yet");
      return;
    }
    
    const tabIndex = tabsStore.current.findIndex(t => t.key === tabKey);
    if (tabIndex === -1) {
      console.warn(`[TabNavigation] Tab "${tabKey}" not found`);
      return;
    }
    
    pagerRefStore.current.current.setPage(tabIndex);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  return (
    <TabNavigationContext.Provider value={{ navigateToTab, registerPager, scrollEnabled, setScrollEnabled }}>
      {children}
    </TabNavigationContext.Provider>
  );
}

export function useTabNavigation(): TabNavigationContextType {
  const context = useContext(TabNavigationContext);
  if (!context) {
    return {
      navigateToTab: (tabKey: string) => {
        console.warn("[TabNavigation] useTabNavigation called outside provider");
      },
      registerPager: () => {},
      scrollEnabled: true,
      setScrollEnabled: () => {}
    };
  }
  return context;
}
