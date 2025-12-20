import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { Player, ChatMessage, ChatChannel, INITIAL_PLAYER, INITIAL_MESSAGES } from "@/constants/playerData";
import * as storage from "@/lib/storage";

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
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<Player>(INITIAL_PLAYER);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [isLoading, setIsLoading] = useState(true);
  const [currentChannel, setCurrentChannel] = useState<ChatChannel>("academy");

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
  }, [currentChannel, player, messages]);

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
  }, [messages]);

  const resetData = useCallback(async () => {
    await storage.clearAllData();
    setPlayer(INITIAL_PLAYER);
    setMessages(INITIAL_MESSAGES);
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
