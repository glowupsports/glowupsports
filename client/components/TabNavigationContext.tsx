import React, { createContext, useContext, useCallback, useRef, useState, ReactNode } from "react";
import PagerView from "react-native-pager-view";
import * as Haptics from "expo-haptics";
import { NavigationContainerRef } from "@react-navigation/native";

interface PendingNavigation {
  tabKey: string;
  screen: string;
  params?: any;
}

interface TabNavigationContextType {
  navigateToTab: (tabKey: string, screenParams?: { screen: string; params?: any }) => void;
  registerPager: (pagerRef: React.RefObject<PagerView | null>, tabs: { key: string }[]) => void;
  registerNavigation: (navRef: NavigationContainerRef<any>) => void;
  getNavigation: () => NavigationContainerRef<any> | null;
  consumePendingNavigation: (tabKey: string) => PendingNavigation | null;
  scrollEnabled: boolean;
  setScrollEnabled: (enabled: boolean) => void;
}

const TabNavigationContext = createContext<TabNavigationContextType | null>(null);

interface TabNavigationProviderProps {
  children: ReactNode;
}

let globalNavigationRef: NavigationContainerRef<any> | null = null;
let pendingNav: PendingNavigation | null = null;

export function TabNavigationProvider({ children }: TabNavigationProviderProps) {
  const pagerRefStore = useRef<React.RefObject<PagerView | null> | null>(null);
  const tabsStore = useRef<{ key: string }[]>([]);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const registerPager = useCallback((pagerRef: React.RefObject<PagerView | null>, tabs: { key: string }[]) => {
    pagerRefStore.current = pagerRef;
    tabsStore.current = tabs;
  }, []);

  const registerNavigation = useCallback((navRef: NavigationContainerRef<any>) => {
    globalNavigationRef = navRef;
  }, []);
  
  const getNavigation = useCallback(() => {
    return globalNavigationRef;
  }, []);

  const consumePendingNavigation = useCallback((tabKey: string): PendingNavigation | null => {
    if (pendingNav && pendingNav.tabKey === tabKey) {
      const nav = pendingNav;
      pendingNav = null;
      return nav;
    }
    return null;
  }, []);

  const navigateToTab = useCallback((tabKey: string, screenParams?: { screen: string; params?: any }) => {
    if (!pagerRefStore.current?.current || !tabsStore.current.length) {
      return;
    }
    
    const tabIndex = tabsStore.current.findIndex(t => t.key === tabKey);
    if (tabIndex === -1) {
      return;
    }
    
    if (screenParams) {
      pendingNav = {
        tabKey,
        screen: screenParams.screen,
        params: screenParams.params,
      };
    }
    
    pagerRefStore.current.current.setPage(tabIndex);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  return (
    <TabNavigationContext.Provider value={{ navigateToTab, registerPager, registerNavigation, getNavigation, consumePendingNavigation, scrollEnabled, setScrollEnabled }}>
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
      getNavigation: () => globalNavigationRef,
      consumePendingNavigation: () => null,
      scrollEnabled: true,
      setScrollEnabled: () => {}
    };
  }
  return context;
}
