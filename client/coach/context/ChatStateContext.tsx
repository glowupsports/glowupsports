import React, { createContext, useContext, useState, useCallback } from "react";

interface ChatStateContextType {
  isChatExpanded: boolean;
  setChatExpanded: (expanded: boolean) => void;
}

const ChatStateContext = createContext<ChatStateContextType>({
  isChatExpanded: false,
  setChatExpanded: () => {},
});

export function ChatStateProvider({ children }: { children: React.ReactNode }) {
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const setChatExpanded = useCallback((expanded: boolean) => {
    setIsChatExpanded(expanded);
  }, []);

  return (
    <ChatStateContext.Provider value={{ isChatExpanded, setChatExpanded }}>
      {children}
    </ChatStateContext.Provider>
  );
}

export function useChatState() {
  return useContext(ChatStateContext);
}
