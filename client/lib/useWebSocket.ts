import { useEffect, useRef, useCallback, useState } from "react";
import { getApiUrl } from "./query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface WsMessage {
  type: string;
  payload: unknown;
}

interface NewMessagePayload {
  conversationId: string;
  message: {
    id: string;
    content: string;
    messageType?: string;
    senderType: "coach" | "player" | "provider" | "system";
    senderId?: string;
    senderName?: string;
    senderPhotoUrl?: string | null;
    senderBallLevel?: string | null;
    createdAt: string;
  };
}

interface TypingPayload {
  conversationId: string;
  coachId?: string;
  playerId?: string;
  isTyping: boolean;
}

interface ReadReceiptPayload {
  conversationId: string;
  messageId: string;
  readerType: "coach" | "player";
  readerId: string;
  readAt: string;
}

interface OnlineStatusPayload {
  coachId?: string;
  playerId?: string;
  isOnline: boolean;
  lastSeenAt?: string;
}

interface NewSessionPayload {
  sessionId: string;
  sessionName: string;
  coachId: string;
  startTime: string;
}

interface FeedbackReceivedPayload {
  playerId: string;
  sessionId: string;
  coachName: string;
}

interface SessionUpdatePayload {
  sessionId: string;
  type: "cancelled" | "updated" | "attendance";
}

type MessageHandler = (payload: NewMessagePayload) => void;
type TypingHandler = (payload: TypingPayload) => void;
type ReadReceiptHandler = (payload: ReadReceiptPayload) => void;
type OnlineStatusHandler = (payload: OnlineStatusPayload) => void;
type NewSessionHandler = (payload: NewSessionPayload) => void;
type FeedbackReceivedHandler = (payload: FeedbackReceivedPayload) => void;
type SessionUpdateHandler = (payload: SessionUpdatePayload) => void;
type WorldMessageHandler = (payload: unknown) => void;

interface UseWebSocketOptions {
  onNewMessage?: MessageHandler;
  onTyping?: TypingHandler;
  onReadReceipt?: ReadReceiptHandler;
  onOnlineStatus?: OnlineStatusHandler;
  onNewSession?: NewSessionHandler;
  onFeedbackReceived?: FeedbackReceivedHandler;
  onSessionUpdate?: SessionUpdateHandler;
  onWorldMessage?: WorldMessageHandler;
  onNewConversation?: (payload: { conversationId: string; type: string }) => void;
  onMessageDeleted?: (payload: { conversationId: string; messageId: string }) => void;
  onReactionUpdated?: (payload: { conversationId: string; messageId: string; reactions: unknown[] }) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const optionsRef = useRef(options);

  optionsRef.current = options;

  const connect = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("auth_token");
      if (!token) {
        return;
      }

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        return;
      }

      const apiUrl = getApiUrl();
      const wsUrl = apiUrl.replace(/^http/, "ws") + "/ws";

      // Pass the JWT via the Sec-WebSocket-Protocol header using a special sub-protocol
      // of the form "auth-<token>". This is the standard cross-platform approach that
      // avoids exposing the token in the URL (which appears in server access logs).
      // The server negotiates the protocol and extracts the token from it.
      const ws = new WebSocket(wsUrl, [`auth-${token}`]);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttempts.current = 0;
        optionsRef.current.onConnected?.();
      };

      ws.onmessage = (event) => {
        try {
          const message: WsMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case "new_message":
              optionsRef.current.onNewMessage?.(message.payload as NewMessagePayload);
              break;
            case "typing":
              optionsRef.current.onTyping?.(message.payload as TypingPayload);
              break;
            case "read_receipt":
              optionsRef.current.onReadReceipt?.(message.payload as ReadReceiptPayload);
              break;
            case "online_status":
            case "user_online":
            case "user_offline": {
              const statusPayload = message.payload as OnlineStatusPayload;
              setOnlineUsers((prev) => {
                const next = new Set(prev);
                const userId = statusPayload.coachId || statusPayload.playerId;
                if (userId) {
                  if (statusPayload.isOnline) {
                    next.add(userId);
                  } else {
                    next.delete(userId);
                  }
                }
                return next;
              });
              optionsRef.current.onOnlineStatus?.(statusPayload);
              break;
            }
            case "new_session":
              optionsRef.current.onNewSession?.(message.payload as NewSessionPayload);
              break;
            case "feedback_received":
              optionsRef.current.onFeedbackReceived?.(message.payload as FeedbackReceivedPayload);
              break;
            case "session_update":
              optionsRef.current.onSessionUpdate?.(message.payload as SessionUpdatePayload);
              break;
            case "world_message":
              optionsRef.current.onWorldMessage?.(message.payload);
              break;
            case "new_conversation":
              optionsRef.current.onNewConversation?.(message.payload as { conversationId: string; type: string });
              break;
            case "message_deleted":
              optionsRef.current.onMessageDeleted?.(message.payload as { conversationId: string; messageId: string });
              break;
            case "reaction_updated":
              optionsRef.current.onReactionUpdated?.(message.payload as { conversationId: string; messageId: string; reactions: unknown[] });
              break;
            case "connected":
              break;
            case "pong":
              break;
          }
        } catch (error) {
          console.error("WebSocket message parse error:", error);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        optionsRef.current.onDisconnected?.();

        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current += 1;
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

    } catch (error) {
      console.error("WebSocket connection error:", error);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const sendTyping = useCallback((conversationId: string, isTyping: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "typing",
        payload: { conversationId, isTyping },
      }));
    }
  }, []);

  const sendReadReceipt = useCallback((conversationId: string, messageId: string, readerType: "coach" | "player", readerId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "read_receipt",
        payload: { conversationId, messageId, readerType, readerId },
      }));
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    onlineUsers,
    connect,
    disconnect,
    sendTyping,
    sendReadReceipt,
  };
}

export type { NewMessagePayload, TypingPayload, ReadReceiptPayload, OnlineStatusPayload, NewSessionPayload, FeedbackReceivedPayload, SessionUpdatePayload };
