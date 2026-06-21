import type { Express } from "express";
import type { Server } from "http";
import { WebSocketServer } from "ws";
import { findUserById, verifyToken } from "./auth.js";
import {
  getPublicRoomForUser,
  handlePokerMessage,
  registerPokerSocket,
  setPokerWalletDeps,
  unregisterPokerSocket,
} from "./pokerRooms.js";
import {
  HOLDEM_ACTION_MS,
  HOLDEM_DEFAULT_BB,
  HOLDEM_DEFAULT_BUY_IN,
  HOLDEM_DEFAULT_SB,
  HOLDEM_MAX_BUY_IN,
  HOLDEM_MAX_PLAYERS,
  HOLDEM_MIN_BUY_IN,
  HOLDEM_MIN_PLAYERS,
  type PokerWalletDeps,
} from "./pokerWallet.js";
import type { UserRow } from "./supabase.js";

type AuthMiddleware = (
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
) => void | Promise<void>;

export function userMayUsePoker(user: Pick<UserRow, "is_admin" | "minecraft_verified_at">): boolean {
  return !!user.is_admin || !!user.minecraft_verified_at;
}

export function registerPokerRoutes(
  app: Express,
  deps: { requireAuth: AuthMiddleware }
): void {
  app.get("/poker/config", (_req, res) => {
    res.json({
      minBuyIn: HOLDEM_MIN_BUY_IN,
      maxBuyIn: HOLDEM_MAX_BUY_IN,
      defaultBuyIn: HOLDEM_DEFAULT_BUY_IN,
      defaultSmallBlind: HOLDEM_DEFAULT_SB,
      defaultBigBlind: HOLDEM_DEFAULT_BB,
      minPlayers: HOLDEM_MIN_PLAYERS,
      maxPlayers: HOLDEM_MAX_PLAYERS,
      actionSeconds: Math.round(HOLDEM_ACTION_MS / 1000),
      variant: "texas_holdem_pokemon",
      handNames: {
        high_card: "Wild Encounter",
        pair: "Duo Encounter",
        two_pair: "Double Encounter",
        three_kind: "Triple Spawn",
        straight: "Dex Chain",
        flush: "Regional Team",
        full_house: "Evolution Nest",
        four_kind: "Alpha Swarm",
        straight_flush: "Champion Team",
        royal_flush: "Legendary Squad",
      },
    });
  });

  app.get("/poker/room", deps.requireAuth, async (req, res) => {
    const user = res.locals.user as { userId: number };
    const row = await findUserById(user.userId);
    if (!row || !userMayUsePoker(row)) {
      res.status(403).json({ error: "Pokémon Poker requires a verified account" });
      return;
    }
    res.json({ room: getPublicRoomForUser(user.userId) });
  });
}

export function attachPokerWebSocket(httpServer: Server, walletDeps: PokerWalletDeps): void {
  setPokerWalletDeps(walletDeps);

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname !== "/poker/ws") return;

    wss.handleUpgrade(req, socket, head, (ws) => {
      void (async () => {
        const token = url.searchParams.get("token")?.trim();
        if (!token) {
          ws.close(4401, "Login required");
          return;
        }
        const payload = verifyToken(token);
        if (!payload) {
          ws.close(4401, "Invalid token");
          return;
        }
        const user = await findUserById(payload.userId);
        if (!user) {
          ws.close(4401, "User not found");
          return;
        }
        if (!userMayUsePoker(user)) {
          ws.close(4403, "Verified account required");
          return;
        }

        registerPokerSocket(user.id, user.username, ws);

        const existingRoom = getPublicRoomForUser(user.id);
        if (existingRoom) {
          ws.send(JSON.stringify({ type: "room_state", room: existingRoom }));
        } else {
          ws.send(JSON.stringify({ type: "connected" }));
        }

        ws.on("message", (data) => {
          void handlePokerMessage(user.id, user.username, data.toString());
        });

        ws.on("close", () => {
          unregisterPokerSocket(user.id);
        });

        ws.on("error", (err) => {
          console.warn("[poker-ws]", err.message);
        });
      })().catch((err) => {
        console.warn("[poker-ws] auth failed:", err instanceof Error ? err.message : err);
        ws.close(1011, "Server error");
      });
    });
  });
}
