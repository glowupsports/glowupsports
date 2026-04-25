import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { Player, ChatMessage, ChatChannel, INITIAL_PLAYER, INITIAL_MESSAGES } from "@/constants/playerData";
import * as storage from "@/lib/storage";
import { apiRequest, getApiUrl } from "@/lib/query-client";

interface PlayerContextType {
  player: Player;
  messages: ChatMessage[];
  isLoading: boolean;
  currentChannel: ChatChannel;
  setCurrentChannel: (channel: ChatChannel) => void;
  refreshPlayer: () => Promise<void>;
  earnXP: (amount: number) => Promise<boolean>;
  earnCurrency: (diamonds: number, coins: number) => Promise<void>;
  updateSkill: (skillId: string, amount: number) => Promise<void>;
  updateProfile: (name: string, avatar: string) => Promise<void>;
  sendMessage: (message: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  resetData: () => Promise<void>;
  loadConversationMessages: () => Promise<void>;
  initializeCoachConversation: () => Promise<void>;
  conversationId: string | null;
  setProfilePhotoUrl: (url: string | null) => void;
}

interface ApiMessage {
  id: string;
  conversationId: string;
  senderType: string | null;
  senderCoachId: string | null;
  senderPlayerId: string | null;
  body: string;
  messageType: string | null;
  createdAt: string;
  reactions: {
    id: string;
    emoji: string;
    reactorType: string;
  }[];
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<Player>(INITIAL_PLAYER);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [isLoading, setIsLoading] = useState(true);
  const [currentChannel, setCurrentChannel] = useState<ChatChannel>("academy");
  const [conversationId, setConversationId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [loadedPlayer, loadedMessages] = await Promise.all([
        storage.getPlayer(),
        storage.getMessages(),
      ]);
      setPlayer(loadedPlayer);
      setMessages(loadedMessages);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refreshPlayer = useCallback(async () => {
    const loadedPlayer = await storage.getPlayer();
    setPlayer(loadedPlayer);
  }, []);

  const earnXP = useCallback(async (amount: number): Promise<boolean> => {
    const { player: updatedPlayer, leveledUp } = await storage.addXP(amount);
    setPlayer(updatedPlayer);
    if (leveledUp) {
      const systemMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        channel: "academy",
        senderId: "system",
        senderName: "System",
        senderAvatar: "system",
        message: `${updatedPlayer.name} leveled up to Level ${updatedPlayer.level}!`,
        timestamp: new Date(),
        reactions: [],
        isSystemMessage: true,
      };
      const updatedMessages = [...messages, systemMessage];
      setMessages(updatedMessages);
      await storage.saveMessages(updatedMessages);
    }
    return leveledUp;
  }, [messages]);

  const earnCurrency = useCallback(async (diamonds: number, coins: number) => {
    const updatedPlayer = await storage.addCurrency(diamonds, coins);
    setPlayer(updatedPlayer);
  }, []);

  const updateSkill = useCallback(async (skillId: string, amount: number) => {
    const updatedPlayer = await storage.updateSkillScore(skillId, amount);
    setPlayer(updatedPlayer);
  }, []);

  const updateProfile = useCallback(async (name: string, avatar: string) => {
    const updatedPlayer = await storage.updatePlayerProfile(name, avatar);
    setPlayer(updatedPlayer);
  }, []);

  const convertApiMessageToChat = useCallback((msg: ApiMessage): ChatMessage => {
    const reactionCounts: Record<string, { count: number; userReacted: boolean }> = {};
    msg.reactions.forEach((r) => {
      if (!reactionCounts[r.emoji]) {
        reactionCounts[r.emoji] = { count: 0, userReacted: false };
      }
      reactionCounts[r.emoji].count++;
      if (r.reactorType === "player") {
        reactionCounts[r.emoji].userReacted = true;
      }
    });
    
    return {
      id: msg.id,
      channel: "coaches" as ChatChannel,
      senderId: msg.senderType === "player" ? (msg.senderPlayerId || "player") : (msg.senderCoachId || "coach"),
      senderName: msg.senderType === "player" ? player.name : "Coach",
      senderAvatar: msg.senderType === "player" ? player.avatar : "coach",
      message: msg.body,
      timestamp: new Date(msg.createdAt),
      reactions: Object.entries(reactionCounts).map(([emoji, data]) => ({
        emoji,
        count: data.count,
        userReacted: data.userReacted,
      })),
      isSystemMessage: msg.messageType === "system",
    };
  }, [player]);

  const loadConversationMessages = useCallback(async () => {
    if (!conversationId) return;
    try {
      const url = new URL(`/api/player/me/conversations/${conversationId}/messages`, getApiUrl());
      const response = await fetch(url.toString());
      if (response.ok) {
        const apiMessages: ApiMessage[] = await response.json();
        const coachMessages = apiMessages.map(convertApiMessageToChat);
        setMessages((prev) => {
          const nonCoachMessages = prev.filter((m) => m.channel !== "coaches");
          return [...nonCoachMessages, ...coachMessages];
        });
      }
    } catch (error) {
      console.error("Error loading conversation messages:", error);
    }
  }, [conversationId, convertApiMessageToChat]);

  const initializeCoachConversation = useCallback(async () => {
    try {
      const url = new URL(`/api/player/me/conversations`, getApiUrl());
      const response = await fetch(url.toString());
      if (response.ok) {
        const conversations = await response.json();
        const coachPlayerConvo = conversations.find(
          (c: { type: string }) => c.type === "coach_player"
        );
        if (coachPlayerConvo) {
          setConversationId(coachPlayerConvo.id);
        }
      }
    } catch (error) {
      console.error("Error initializing coach conversation:", error);
    }
  }, [player.id]);

  useEffect(() => {
    if (currentChannel === "coaches" && !conversationId) {
      initializeCoachConversation();
    }
  }, [currentChannel, conversationId, initializeCoachConversation]);

  useEffect(() => {
    if (conversationId && currentChannel === "coaches") {
      loadConversationMessages();
    }
  }, [conversationId, currentChannel, loadConversationMessages]);

  const sendMessage = useCallback(async (messageText: string) => {
    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      channel: currentChannel,
      senderId: player.id,
      senderName: player.name,
      senderAvatar: player.avatar,
      message: messageText,
      timestamp: new Date(),
      reactions: [],
    };
    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);
    await storage.saveMessages(updatedMessages);

    if (currentChannel === "coaches" && conversationId) {
      try {
        await apiRequest("POST", `/api/player/me/conversations/${conversationId}/messages`, {
          body: messageText,
          messageType: "text",
        });
      } catch (error) {
        console.error("Error sending message to API:", error);
      }
    }
  }, [currentChannel, player, messages, conversationId]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    const updatedMessages = messages.map((msg) => {
      if (msg.id === messageId) {
        const existingReactionIndex = msg.reactions.findIndex((r) => r.emoji === emoji);
        let newReactions = [...msg.reactions];
        if (existingReactionIndex >= 0) {
          const reaction = newReactions[existingReactionIndex];
          if (reaction.userReacted) {
            if (reaction.count === 1) {
              newReactions.splice(existingReactionIndex, 1);
            } else {
              newReactions[existingReactionIndex] = {
                ...reaction,
                count: reaction.count - 1,
                userReacted: false,
              };
            }
          } else {
            newReactions[existingReactionIndex] = {
              ...reaction,
              count: reaction.count + 1,
              userReacted: true,
            };
          }
        } else {
          newReactions.push({ emoji, count: 1, userReacted: true });
        }
        return { ...msg, reactions: newReactions };
      }
      return msg;
    });
    setMessages(updatedMessages);
    await storage.saveMessages(updatedMessages);

    const targetMessage = messages.find((m) => m.id === messageId);
    if (targetMessage?.channel === "coaches" && conversationId) {
      try {
        await apiRequest("POST", `/api/player/me/messages/${messageId}/reactions`, {
          emoji,
        });
      } catch (error) {
        console.error("Error toggling reaction via API:", error);
      }
    }
  }, [messages, conversationId, player.id]);

  const resetData = useCallback(async () => {
    await storage.clearAllData();
    setPlayer(INITIAL_PLAYER);
    setMessages(INITIAL_MESSAGES);
  }, []);

  const setProfilePhotoUrl = useCallback((url: string | null) => {
    setPlayer(prev => ({ ...prev, profilePhotoUrl: url }));
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        player,
        messages,
        isLoading,
        currentChannel,
        setCurrentChannel,
        refreshPlayer,
        earnXP,
        earnCurrency,
        updateSkill,
        updateProfile,
        sendMessage,
        toggleReaction,
        resetData,
        loadConversationMessages,
        initializeCoachConversation,
        conversationId,
        setProfilePhotoUrl,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }
  return context;
}
