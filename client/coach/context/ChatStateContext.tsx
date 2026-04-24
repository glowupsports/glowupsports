import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { CommonActions } from "@react-navigation/native";
import { getGlobalNavigation } from "@/components/TabNavigationContext";

export type ChatTargetTab = "world" | "academy" | "squad" | "groups" | "players" | "coaches" | "auto";

export interface ChatTarget {
  id: number;
  tab?: ChatTargetTab;
  conversationId?: string | null;
  roomId?: string | null;
  scrollToMessageId?: string | null;
  fullscreen?: boolean;
}

export interface OpenGlowChatOptions {
  tab?: ChatTargetTab;
  conversationId?: string | null;
  roomId?: string | null;
  scrollToMessageId?: string | null;
  fullscreen?: boolean;
}

interface ChatStateContextType {
  isChatExpanded: boolean;
  setChatExpanded: (expanded: boolean) => void;
  chatTarget: ChatTarget | null;
  openGlowChat: (opts?: OpenGlowChatOptions) => void;
  consumeChatTarget: () => ChatTarget | null;
}

const ChatStateContext = createContext<ChatStateContextType>({
  isChatExpanded: false,
  setChatExpanded: () => {},
  chatTarget: null,
  openGlowChat: () => {},
  consumeChatTarget: () => null,
});

export function ChatStateProvider({ children }: { children: React.ReactNode }) {
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [chatTarget, setChatTarget] = useState<ChatTarget | null>(null);
  const targetIdRef = useRef(0);

  const setChatExpanded = useCallback((expanded: boolean) => {
    setIsChatExpanded(expanded);
  }, []);

  const openGlowChat = useCallback((opts?: OpenGlowChatOptions) => {
    targetIdRef.current += 1;
    setChatTarget({
      id: targetIdRef.current,
      tab: opts?.tab,
      conversationId: opts?.conversationId ?? null,
      roomId: opts?.roomId ?? null,
      scrollToMessageId: opts?.scrollToMessageId ?? null,
      fullscreen: opts?.fullscreen ?? false,
    });
    // Ensure we navigate to the surface that mounts the chat footer (PlayerTabs,
    // which is nested inside the root "Player" stack). Without this, callers on
    // a stack screen above the tabs (PlayerGuideScreen, push handlers, etc.)
    // would set the target but never see the footer expand.
    const navRef = getGlobalNavigation();
    if (navRef?.isReady?.()) {
      try {
        const state = navRef.getState?.();
        const hasPlayerRoot = state?.routeNames?.includes("Player");
        if (hasPlayerRoot) {
          navRef.dispatch(
            CommonActions.navigate({
              name: "Player",
              params: { screen: "PlayerTabs" },
            }),
          );
        }
      } catch {
        // Navigation not available (e.g. coach/owner surface) — silently ignore.
      }
    }
  }, []);

  const consumeChatTarget = useCallback(() => {
    const current = chatTarget;
    if (current) setChatTarget(null);
    return current;
  }, [chatTarget]);

  return (
    <ChatStateContext.Provider
      value={{
        isChatExpanded,
        setChatExpanded,
        chatTarget,
        openGlowChat,
        consumeChatTarget,
      }}
    >
      {children}
    </ChatStateContext.Provider>
  );
}

export function useChatState() {
  return useContext(ChatStateContext);
}
