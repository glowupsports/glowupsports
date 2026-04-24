import React, { createContext, useContext, useState, useCallback } from "react";

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

  return (
    <ChatStateContext.Provider
      value={{
        isChatExpanded,
        setChatExpanded,
        chatTarget: null,
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
