import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

// PARKED helper types — kept ONLY so the parked PlayerChatFooter.tsx
// (see task #1309) still typechecks. They are not wired to any real
// behaviour and have no live callers anywhere in the app.
export interface ChatTarget {
  conversationId?: string | null;
  userId?: string | null;
  roomId?: string | null;
  tab?: string | null;
}

export interface OpenGlowChatOptions {
  tab?: string;
  roomId?: string;
  conversationId?: string;
  userId?: string;
  fullscreen?: boolean;
}

interface ChatStateContextType {
  isChatExpanded: boolean;
  setChatExpanded: (expanded: boolean) => void;
  chatTarget: ChatTarget | null;
  consumeChatTarget: () => ChatTarget | null;
}

const ChatStateContext = createContext<ChatStateContextType>({
  isChatExpanded: false,
  setChatExpanded: () => {},
  chatTarget: null,
  consumeChatTarget: () => null,
});

export function ChatStateProvider({ children }: { children: React.ReactNode }) {
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const setChatExpanded = useCallback((expanded: boolean) => {
    setIsChatExpanded(expanded);
  }, []);
  const consumeChatTarget = useCallback(() => null, []);

  // Memoize the provider value so consumers don't see a fresh object on
  // every parent re-render. Without this, every consumer of useChatState()
  // re-renders any time ChatStateProvider itself re-renders, even when
  // the underlying state is unchanged — a classic source of cascading
  // updates that can amplify unrelated render loops elsewhere in the tree.
  const value = useMemo(
    () => ({
      isChatExpanded,
      setChatExpanded,
      chatTarget: null,
      consumeChatTarget,
    }),
    [isChatExpanded, setChatExpanded, consumeChatTarget],
  );

  return (
    <ChatStateContext.Provider value={value}>
      {children}
    </ChatStateContext.Provider>
  );
}

export function useChatState() {
  return useContext(ChatStateContext);
}
