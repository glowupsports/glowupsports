import React, { createContext, useContext, useCallback, useRef, useState, ReactNode } from "react";
import PagerView from "react-native-pager-view";
import * as Haptics from "expo-haptics";
import { NavigationContainerRef } from "@react-navigation/native";

interface TabNavigationContextType {
  navigateToTab: (tabKey: string, screenParams?: { screen: string; params?: any }) => void;
  registerPager: (pagerRef: React.RefObject<PagerView | null>, tabs: { key: string }[]) => void;
  registerNavigation: (navRef: NavigationContainerRef<any>) => void;
  getNavigation: () => NavigationContainerRef<any> | null;
  scrollEnabled: boolean;
  setScrollEnabled: (enabled: boolean) => void;
}

const TabNavigationContext = createContext<TabNavigationContextType | null>(null);

interface TabNavigationProviderProps {
  children: ReactNode;
}

// Store navigation ref globally to avoid closure issues
let globalNavigationRef: NavigationContainerRef<any> | null = null;

export function TabNavigationProvider({ children }: TabNavigationProviderProps) {
  const pagerRefStore = useRef<React.RefObject<PagerView | null> | null>(null);
  const tabsStore = useRef<{ key: string }[]>([]);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const registerPager = useCallback((pagerRef: React.RefObject<PagerView | null>, tabs: { key: string }[]) => {
    pagerRefStore.current = pagerRef;
    tabsStore.current = tabs;
  }, []);

  const registerNavigation = useCallback((navRef: NavigationContainerRef<any>) => {
    console.log("[TabNavigation] registerNavigation called, ref:", !!navRef);
    globalNavigationRef = navRef;
  }, []);
  
  const getNavigation = useCallback(() => {
    return globalNavigationRef;
  }, []);

  const navigateToTab = useCallback((tabKey: string, screenParams?: { screen: string; params?: any }) => {
    console.log(`[TabNavigation] navigateToTab called: tabKey=${tabKey}`, screenParams);
    console.log(`[TabNavigation] pagerRef exists: ${!!pagerRefStore.current?.current}`);
    console.log(`[TabNavigation] tabs count: ${tabsStore.current.length}`);
    console.log(`[TabNavigation] globalNavigationRef exists: ${!!globalNavigationRef}`);
    
    if (!pagerRefStore.current?.current || !tabsStore.current.length) {
      console.warn("[TabNavigation] Pager not registered yet");
      return;
    }
    
    const tabIndex = tabsStore.current.findIndex(t => t.key === tabKey);
    console.log(`[TabNavigation] tabIndex for "${tabKey}": ${tabIndex}`);
    if (tabIndex === -1) {
      console.warn(`[TabNavigation] Tab "${tabKey}" not found`);
      return;
    }
    
    // First navigate to the tab
    pagerRefStore.current.current.setPage(tabIndex);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    console.log(`[TabNavigation] Tab switched to index ${tabIndex}`);
    
    // If screen params provided, navigate to nested screen after tab switch
    if (screenParams && globalNavigationRef) {
      // Small delay to let tab switch animation complete
      setTimeout(() => {
        if (globalNavigationRef) {
          console.log(`[TabNavigation] Navigating to nested screen:`, tabKey, screenParams);
          globalNavigationRef.navigate(tabKey, screenParams);
        }
      }, 150);
    }
  }, []);

  return (
    <TabNavigationContext.Provider value={{ navigateToTab, registerPager, registerNavigation, getNavigation, scrollEnabled, setScrollEnabled }}>
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
      scrollEnabled: true,
      setScrollEnabled: () => {}
    };
  }
  return context;
}
