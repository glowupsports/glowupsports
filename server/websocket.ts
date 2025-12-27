import { WebSocketServer, WebSocket } from "ws";
import { Server } from "node:http";
import jwt from "jsonwebtoken";
import { storage } from "./storage";

const JWT_SECRET = process.env.SESSION_SECRET || "dev-secret-key";

interface AuthenticatedSocket extends WebSocket {
  userId: string;
  academyId: string;
  coachId?: string;
  isAlive: boolean;
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
    senderType: "coach" | "player" | "system";
    senderId?: string;
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

export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws: WebSocket, req) => {
    const socket = ws as AuthenticatedSocket;
    socket.isAlive = true;

    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const token = url.searchParams.get("token");

    if (!token) {
      socket.close(4001, "Authentication required");
      return;
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        userId: string;
        academyId?: string;
        coachId?: string;
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
          type: "online_status",
          payload: { coachId: socket.coachId, isOnline: true },
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
            type: "online_status",
            payload: { coachId: socket.coachId, isOnline: false },
          });
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

export function broadcastNewMessage(academyId: string, payload: NewMessagePayload) {
  broadcastToAcademy(academyId, {
    type: "new_message",
    payload,
  });
}

export function getOnlineUsers(academyId: string): string[] {
  const users = onlineUsers.get(academyId);
  return users ? Array.from(users) : [];
}
