import React, { createContext, useContext, useCallback, useRef, useState, ReactNode } from "react";
import PagerView from "react-native-pager-view";
import * as Haptics from "expo-haptics";
import { NavigationContainerRef } from "@react-navigation/native";

interface TabNavigationContextType {
  navigateToTab: (tabKey: string, screenParams?: { screen: string; params?: any }) => void;
  registerPager: (pagerRef: React.RefObject<PagerView | null>, tabs: { key: string }[]) => void;
  registerNavigation: (navRef: NavigationContainerRef<any>) => void;
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
  const navigationRef = useRef<NavigationContainerRef<any> | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const registerPager = useCallback((pagerRef: React.RefObject<PagerView | null>, tabs: { key: string }[]) => {
    pagerRefStore.current = pagerRef;
    tabsStore.current = tabs;
  }, []);

  const registerNavigation = useCallback((navRef: NavigationContainerRef<any>) => {
    navigationRef.current = navRef;
  }, []);

  const navigateToTab = useCallback((tabKey: string, screenParams?: { screen: string; params?: any }) => {
    if (!pagerRefStore.current?.current || !tabsStore.current.length) {
      console.warn("[TabNavigation] Pager not registered yet");
      return;
    }
    
    const tabIndex = tabsStore.current.findIndex(t => t.key === tabKey);
    if (tabIndex === -1) {
      console.warn(`[TabNavigation] Tab "${tabKey}" not found`);
      return;
    }
    
    // First navigate to the tab
    pagerRefStore.current.current.setPage(tabIndex);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // If screen params provided, navigate to nested screen after tab switch
    if (screenParams && navigationRef.current) {
      // Small delay to let tab switch animation complete
      setTimeout(() => {
        if (navigationRef.current) {
          navigationRef.current.navigate(tabKey, screenParams);
        }
      }, 50);
    }
  }, []);

  return (
    <TabNavigationContext.Provider value={{ navigateToTab, registerPager, registerNavigation, scrollEnabled, setScrollEnabled }}>
      {children}
    </TabNavigationContext.Provider>
  );
}

export function useTabNavigation(): TabNavigationContextType {
  const context = useContext(TabNavigationContext);
  if (!context) {
    return {
      navigateToTab: (tabKey: string, screenParams?: { screen: string; params?: any }) => {
        console.warn("[TabNavigation] useTabNavigation called outside provider");
      },
      registerPager: () => {},
      registerNavigation: () => {},
      scrollEnabled: true,
      setScrollEnabled: () => {}
    };
  }
  return context;
}
