import React, { createContext, useContext, useCallback, useMemo, useRef, useState, ReactNode } from "react";
import { Platform } from "react-native";
import PagerView from "react-native-pager-view";
import * as Haptics from "expo-haptics";
import { NavigationContainerRef } from "@react-navigation/native";

type TabNavigationCallback = (screen: string, params?: any) => void;
type WebTabSetter = (index: number) => void;
type ActiveTabListener = (index: number, key: string) => void;

interface TabNavigationContextType {
  navigateToTab: (tabKey: string, screenParams?: { screen: string; params?: any }) => void;
  registerPager: (pagerRef: React.RefObject<PagerView | null>, tabs: { key: string }[]) => void;
  registerNavigation: (navRef: NavigationContainerRef<any>) => void;
  getNavigation: () => NavigationContainerRef<any> | null;
  registerTabCallback: (tabKey: string, callback: TabNavigationCallback) => () => void;
  registerWebTabSetter: (setter: WebTabSetter) => void;
  registerActiveTabListener: (listener: ActiveTabListener) => () => void;
  notifyActiveTab: (index: number, key: string) => void;
  scrollEnabled: boolean;
  setScrollEnabled: (enabled: boolean) => void;
}

const TabNavigationContext = createContext<TabNavigationContextType | null>(null);

interface TabNavigationProviderProps {
  children: ReactNode;
}

let globalNavigationRef: NavigationContainerRef<any> | null = null;

export function getGlobalNavigation(): NavigationContainerRef<any> | null {
  return globalNavigationRef;
}

export function TabNavigationProvider({ children }: TabNavigationProviderProps) {
  const pagerRefStore = useRef<React.RefObject<PagerView | null> | null>(null);
  const tabsStore = useRef<{ key: string }[]>([]);
  const tabCallbacks = useRef<Map<string, TabNavigationCallback>>(new Map());
  const webTabSetterRef = useRef<WebTabSetter | null>(null);
  const activeTabListeners = useRef<Set<ActiveTabListener>>(new Set());
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const registerPager = useCallback((pagerRef: React.RefObject<PagerView | null>, tabs: { key: string }[]) => {
    pagerRefStore.current = pagerRef;
    tabsStore.current = tabs;
  }, []);

  const registerWebTabSetter = useCallback((setter: WebTabSetter) => {
    webTabSetterRef.current = setter;
  }, []);

  const registerNavigation = useCallback((navRef: NavigationContainerRef<any>) => {
    globalNavigationRef = navRef;
  }, []);
  
  const getNavigation = useCallback(() => {
    return globalNavigationRef;
  }, []);

  const registerTabCallback = useCallback((tabKey: string, callback: TabNavigationCallback) => {
    tabCallbacks.current.set(tabKey, callback);
    return () => {
      tabCallbacks.current.delete(tabKey);
    };
  }, []);

  const registerActiveTabListener = useCallback((listener: ActiveTabListener) => {
    activeTabListeners.current.add(listener);
    return () => {
      activeTabListeners.current.delete(listener);
    };
  }, []);

  const notifyActiveTab = useCallback((index: number, key: string) => {
    activeTabListeners.current.forEach(fn => fn(index, key));
  }, []);

  const navigateToTab = useCallback((tabKey: string, screenParams?: { screen: string; params?: any }) => {
    if (!tabsStore.current.length) {
      return;
    }

    const LEGACY_TAB_ALIASES: Record<string, { tabKey: string; screen: string }> = {
      "Schedule":  { tabKey: "Growth", screen: "Schedule" },
      "Quests":    { tabKey: "Growth", screen: "Quests" },
      "Progress":  { tabKey: "Growth", screen: "Progress" },
    };
    const alias = LEGACY_TAB_ALIASES[tabKey];
    if (alias) {
      const resolvedParams = screenParams ?? { screen: alias.screen };
      tabKey = alias.tabKey;
      screenParams = resolvedParams;
    }

    const tabIndex = tabsStore.current.findIndex(t => t.key === tabKey);
    if (tabIndex === -1) {
      return;
    }

    if (Platform.OS === "web" && webTabSetterRef.current) {
      webTabSetterRef.current(tabIndex);
    } else if (pagerRefStore.current?.current) {
      pagerRefStore.current.current.setPage(tabIndex);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      return;
    }

    if (screenParams) {
      setTimeout(() => {
        const cb = tabCallbacks.current.get(tabKey);
        if (cb) {
          cb(screenParams.screen, screenParams.params);
        }
      }, 250);
    }
  }, []);

  // Memoize the provider value so a fresh object isn't handed to every
  // consumer on each render. Without this, every component using
  // useTabNavigation() (PlayerNavigator, SwipeableTabBar, DesktopShell,
  // ProPlayerHomeScreen, and many more) re-renders on every parent
  // re-render — a known anti-pattern that can cascade into update-depth
  // loops when one of those consumers also setState's in an effect that
  // depends on a destructured field.
  const value = useMemo(
    () => ({
      navigateToTab,
      registerPager,
      registerNavigation,
      getNavigation,
      registerTabCallback,
      registerWebTabSetter,
      registerActiveTabListener,
      notifyActiveTab,
      scrollEnabled,
      setScrollEnabled,
    }),
    [
      navigateToTab,
      registerPager,
      registerNavigation,
      getNavigation,
      registerTabCallback,
      registerWebTabSetter,
      registerActiveTabListener,
      notifyActiveTab,
      scrollEnabled,
    ],
  );

  return (
    <TabNavigationContext.Provider value={value}>
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
      registerTabCallback: () => () => {},
      registerWebTabSetter: () => {},
      registerActiveTabListener: () => () => {},
      notifyActiveTab: () => {},
      scrollEnabled: true,
      setScrollEnabled: () => {}
    };
  }
  return context;
}
