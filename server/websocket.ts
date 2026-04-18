import { WebSocketServer, WebSocket } from "ws";
import { Server } from "node:http";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { JWT_SECRET } from "./auth";

interface AuthenticatedSocket extends WebSocket {
  userId: string;
  academyId: string;
  coachId?: string;
  playerId?: string;
  isAlive: boolean;
  lastSeenAt?: Date;
}

interface WsMessage {
  type: string;
  payload: unknown;
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

interface OnlineStatusPayload {
  coachId?: string;
  playerId?: string;
  isOnline: boolean;
}

const academyRooms = new Map<string, Set<AuthenticatedSocket>>();
const onlineUsers = new Map<string, Set<string>>();
// Map: academyId -> Map<playerId, lastSeenAt>
const playerLastSeen = new Map<string, Map<string, string>>();

export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws: WebSocket, req) => {
    const socket = ws as AuthenticatedSocket;
    socket.isAlive = true;

    // Extract token from Sec-WebSocket-Protocol sub-protocol ("auth-<token>")
    // This is the standard cross-platform approach that avoids exposing the token in the URL.
    // The "Authorization" header approach is also accepted for server-to-server connections.
    let token: string | null = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else {
      // Extract from the Sec-WebSocket-Protocol header (format: "auth-<jwt>")
      const protocols = req.headers["sec-websocket-protocol"];
      if (protocols) {
        const protocolList = protocols.split(",").map((p) => p.trim());
        const authProtocol = protocolList.find((p) => p.startsWith("auth-"));
        if (authProtocol) {
          token = authProtocol.slice(5);
        }
      }
    }

    if (!token) {
      socket.close(4001, "Authentication required");
      return;
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        userId: string;
        academyId?: string;
        coachId?: string;
        playerId?: string;
      };

      if (!decoded.academyId || !decoded.userId) {
        socket.close(4002, "Academy not found");
        return;
      }

      const user = await storage.getUserById(decoded.userId);
      if (!user || user.academyId !== decoded.academyId) {
        socket.close(4004, "Academy membership verification failed");
        return;
      }

      if (decoded.coachId) {
        const coach = await storage.getCoach(decoded.coachId, decoded.academyId);
        if (!coach || coach.academyId !== decoded.academyId) {
          socket.close(4005, "Coach verification failed");
          return;
        }
      }

      socket.userId = decoded.userId;
      socket.academyId = decoded.academyId;
      socket.coachId = decoded.coachId;
      socket.playerId = decoded.playerId || user.playerId || undefined;

      if (!academyRooms.has(socket.academyId)) {
        academyRooms.set(socket.academyId, new Set());
      }
      academyRooms.get(socket.academyId)!.add(socket);

      if (!onlineUsers.has(socket.academyId)) {
        onlineUsers.set(socket.academyId, new Set());
      }
      onlineUsers.get(socket.academyId)!.add(socket.userId);

      if (socket.coachId) {
        broadcastToAcademy(socket.academyId, {
          type: "user_online",
          payload: { coachId: socket.coachId, playerId: undefined, isOnline: true },
        }, socket);
      }
      if (socket.playerId) {
        broadcastToAcademy(socket.academyId, {
          type: "user_online",
          payload: { playerId: socket.playerId, coachId: undefined, isOnline: true },
        }, socket);
      }

      socket.send(JSON.stringify({
        type: "connected",
        payload: { userId: socket.userId, academyId: socket.academyId },
      }));

    } catch (error) {
      socket.close(4003, "Invalid token");
      return;
    }

    socket.on("pong", () => {
      socket.isAlive = true;
    });

    socket.on("message", (data) => {
      try {
        const message: WsMessage = JSON.parse(data.toString());
        handleMessage(socket, message);
      } catch (error) {
        console.error("WebSocket message parse error:", error);
      }
    });

    socket.on("close", () => {
      if (socket.academyId) {
        const room = academyRooms.get(socket.academyId);
        if (room) {
          room.delete(socket);
          if (room.size === 0) {
            academyRooms.delete(socket.academyId);
          }
        }

        const users = onlineUsers.get(socket.academyId);
        if (users) {
          users.delete(socket.userId);
          if (users.size === 0) {
            onlineUsers.delete(socket.academyId);
          }
        }

        if (socket.coachId) {
          broadcastToAcademy(socket.academyId, {
            type: "user_offline",
            payload: { coachId: socket.coachId, playerId: undefined, isOnline: false },
          });
        }
        if (socket.playerId) {
          // Only broadcast offline if no other active socket for this player remains
          const room = academyRooms.get(socket.academyId);
          const otherSocketForPlayer = room && Array.from(room).some(
            s => s !== socket && s.playerId === socket.playerId
          );
          if (!otherSocketForPlayer) {
            const lastSeenAt = new Date().toISOString();
            if (!playerLastSeen.has(socket.academyId)) {
              playerLastSeen.set(socket.academyId, new Map());
            }
            playerLastSeen.get(socket.academyId)!.set(socket.playerId, lastSeenAt);
            broadcastToAcademy(socket.academyId, {
              type: "user_offline",
              payload: { playerId: socket.playerId, coachId: undefined, isOnline: false, lastSeenAt },
            });
          }
        }
      }
    });

    socket.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });

  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const socket = ws as AuthenticatedSocket;
      if (!socket.isAlive) {
        socket.terminate();
        return;
      }
      socket.isAlive = false;
      socket.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(pingInterval);
  });

  return wss;
}

function handleMessage(socket: AuthenticatedSocket, message: WsMessage) {
  switch (message.type) {
    case "typing":
      handleTyping(socket, message.payload as TypingPayload);
      break;
    case "read_receipt":
      handleReadReceipt(socket, message.payload as ReadReceiptPayload);
      break;
    case "ping":
      socket.send(JSON.stringify({ type: "pong" }));
      break;
    default:
      console.log("Unknown message type:", message.type);
  }
}

function handleTyping(socket: AuthenticatedSocket, payload: TypingPayload) {
  broadcastToAcademy(socket.academyId, {
    type: "typing",
    payload: {
      conversationId: payload.conversationId,
      coachId: socket.coachId || payload.coachId,
      isTyping: payload.isTyping,
    },
  }, socket);
}

function handleReadReceipt(socket: AuthenticatedSocket, payload: ReadReceiptPayload) {
  broadcastToAcademy(socket.academyId, {
    type: "read_receipt",
    payload: {
      conversationId: payload.conversationId,
      messageId: payload.messageId,
      readerType: payload.readerType,
      readerId: payload.readerId,
      readAt: new Date().toISOString(),
    },
  }, socket);
}

function broadcastToAcademy(
  academyId: string,
  message: WsMessage,
  excludeSocket?: AuthenticatedSocket
) {
  const room = academyRooms.get(academyId);
  if (!room) return;

  const data = JSON.stringify(message);
  room.forEach((socket) => {
    if (socket !== excludeSocket && socket.readyState === WebSocket.OPEN) {
      socket.send(data);
    }
  });
}

// Broadcast to specific connected players across all academy rooms (cross-academy safe).
// Use this when an event is scoped to specific players (e.g. open-match participants)
// regardless of whether the match is academy-scoped or public.
export function broadcastToPlayerIds(
  playerIds: string[],
  message: WsMessage,
) {
  if (!playerIds || playerIds.length === 0) return;
  const idSet = new Set(playerIds.filter(Boolean));
  if (idSet.size === 0) return;
  const data = JSON.stringify(message);
  academyRooms.forEach((room) => {
    room.forEach((socket) => {
      if (socket.playerId && idSet.has(socket.playerId) && socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    });
  });
}

// Broadcast to specific connected users only (participant-scoped, no content leak to academy)
export function broadcastToUserIds(
  academyId: string,
  userIds: string[],
  message: WsMessage,
) {
  const room = academyRooms.get(academyId);
  if (!room) return;
  const idSet = new Set(userIds);
  const data = JSON.stringify(message);
  room.forEach((socket) => {
    if (idSet.has(socket.userId) && socket.readyState === WebSocket.OPEN) {
      socket.send(data);
    }
  });
}

export function broadcastNewMessage(academyId: string, payload: NewMessagePayload) {
  broadcastToAcademy(academyId, {
    type: "new_message",
    payload,
  });
}

// Broadcast a world chat message to ALL connected sockets (cross-academy)
export function broadcastWorldMessage(payload: unknown) {
  const data = JSON.stringify({ type: "world_message", payload });
  academyRooms.forEach((room) => {
    room.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(data);
    });
  });
}

// Notify specific users that a new conversation has been created (e.g. new DM recipient)
export function broadcastNewConversation(
  academyId: string,
  participantUserIds: string[],
  payload: { conversationId: string; type: string },
) {
  broadcastToUserIds(academyId, participantUserIds, {
    type: "new_conversation",
    payload,
  });
}

// Scoped broadcast for provider-player conversations — only sends to the two participants
export function broadcastProviderPlayerMessage(
  academyId: string,
  participantUserIds: string[],
  payload: NewMessagePayload,
) {
  broadcastToUserIds(academyId, participantUserIds, {
    type: "new_message",
    payload,
  });
}

export function broadcastMessageDeleted(
  academyId: string,
  participantUserIds: string[],
  payload: { conversationId: string; messageId: string },
) {
  broadcastToUserIds(academyId, participantUserIds, {
    type: "message_deleted",
    payload,
  });
}

export function broadcastReactionUpdated(
  academyId: string,
  participantUserIds: string[],
  payload: { conversationId: string; messageId: string; reactions: Array<{ id: string; emoji: string; reactorType: string; reactorCoachId: string | null; reactorPlayerId: string | null }> },
) {
  broadcastToUserIds(academyId, participantUserIds, {
    type: "reaction_updated",
    payload,
  });
}

export function broadcastNewSession(academyId: string, payload: { sessionId: string; sessionName: string; coachId: string; startTime: string }) {
  broadcastToAcademy(academyId, {
    type: "new_session",
    payload,
  });
}

export function broadcastFeedbackReceived(academyId: string, payload: { playerId: string; sessionId: string; coachName: string }) {
  broadcastToAcademy(academyId, {
    type: "feedback_received",
    payload,
  });
}

export function broadcastSessionUpdate(academyId: string, payload: { sessionId: string; type: "cancelled" | "updated" | "attendance" }) {
  broadcastToAcademy(academyId, {
    type: "session_update",
    payload,
  });
}

export function getOnlineUsers(academyId: string): string[] {
  const users = onlineUsers.get(academyId);
  return users ? Array.from(users) : [];
}

export function getPlayerPresence(academyId: string): Record<string, { isOnline: boolean; lastSeenAt?: string }> {
  const result: Record<string, { isOnline: boolean; lastSeenAt?: string }> = {};
  const room = academyRooms.get(academyId);
  if (room) {
    for (const socket of room) {
      if (socket.playerId) {
        result[socket.playerId] = { isOnline: true };
      }
    }
  }
  const lastSeen = playerLastSeen.get(academyId);
  if (lastSeen) {
    for (const [playerId, lastSeenAt] of lastSeen) {
      if (!result[playerId]) {
        result[playerId] = { isOnline: false, lastSeenAt };
      }
    }
  }
  return result;
}
