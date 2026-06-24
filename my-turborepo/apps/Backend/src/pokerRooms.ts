import type { WebSocket } from "ws";
import {
  awardSidePots,
  bestHandFromCards,
  buildSidePots,
  mergePayouts,
  type ThemedHand,
} from "./holdemEngine.js";
import {
  createShuffledPokemonDeck,
  drawFromDeck,
  hiddenCard,
  type PokemonCard,
} from "./pokemonDeck.js";
import {
  clampBlind,
  clampBuyIn,
  creditPokerCashOut,
  HOLDEM_ACTION_MS,
  HOLDEM_DEFAULT_BB,
  HOLDEM_DEFAULT_BUY_IN,
  HOLDEM_DEFAULT_SB,
  HOLDEM_MAX_PLAYERS,
  HOLDEM_MIN_PLAYERS,
  spendPokerBuyIn,
  type PokerWalletDeps,
} from "./pokerWallet.js";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type HoldemPhase = "lobby" | "preflop" | "flop" | "turn" | "river" | "showdown" | "hand_over";

export type PublicPokemonCard = PokemonCard;

export type PublicSeat = {
  userId: number;
  username: string;
  chips: number;
  ready: boolean;
  hole: PublicPokemonCard[];
  folded: boolean;
  allIn: boolean;
  betRound: number;
  betHand: number;
  lastAction?: string;
  handLabel?: string;
  isDealer?: boolean;
  isSmallBlind?: boolean;
  isBigBlind?: boolean;
};

export type PublicRoomState = {
  code: string;
  name: string;
  phase: HoldemPhase;
  hostUserId: number;
  hasPassword: boolean;
  settings: {
    maxPlayers: number;
    buyIn: number;
    smallBlind: number;
    bigBlind: number;
  };
  seats: (PublicSeat | null)[];
  community: PublicPokemonCard[];
  pot: number;
  currentBet: number;
  minRaise: number;
  activeSeat: number | null;
  dealerSeat: number | null;
  turnEndsAt: number | null;
  handNumber: number;
  message: string;
  lastResults: string[];
  variant: "texas_holdem_pokemon";
};

type Seat = {
  userId: number;
  username: string;
  chips: number;
  ready: boolean;
  hole: PokemonCard[];
  folded: boolean;
  allIn: boolean;
  betRound: number;
  betHand: number;
  lastAction?: string;
  handLabel?: string;
};

type Room = {
  code: string;
  name: string;
  password: string | null;
  hostUserId: number;
  settings: { maxPlayers: number; buyIn: number; smallBlind: number; bigBlind: number };
  seats: (Seat | null)[];
  phase: HoldemPhase;
  deck: PokemonCard[];
  community: PokemonCard[];
  dealerSeat: number;
  activeSeat: number;
  currentBet: number;
  minRaise: number;
  lastRaiseSize: number;
  pot: number;
  handNumber: number;
  turnEndsAt: number | null;
  turnTimer: ReturnType<typeof setTimeout> | null;
  needsAction: Set<number>;
  message: string;
  lastResults: string[];
};

const rooms = new Map<string, Room>();
const userRoom = new Map<number, string>();
const sockets = new Map<number, WebSocket>();

let walletDeps: PokerWalletDeps | null = null;

export function setPokerWalletDeps(deps: PokerWalletDeps): void {
  walletDeps = deps;
}

function generateCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]!;
  if (rooms.has(code)) return generateCode();
  return code;
}

function seated(room: Room): Seat[] {
  return room.seats.filter((s): s is Seat => s != null);
}

function seatIndexOf(room: Room, userId: number): number {
  return room.seats.findIndex((s) => s?.userId === userId);
}

function nextOccupiedSeat(room: Room, from: number): number {
  const n = room.seats.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (room.seats[idx]) return idx;
  }
  return from;
}

function playersInHand(room: Room): Seat[] {
  return seated(room).filter((s) => !s.folded);
}

function canAct(seat: Seat): boolean {
  return !seat.folded && !seat.allIn && seat.chips > 0;
}

function sendError(userId: number, message: string): void {
  const ws = sockets.get(userId);
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "error", message }));
}

function broadcastRoom(room: Room): void {
  for (const s of seated(room)) {
    const ws = sockets.get(s.userId);
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "room_state", room: publicRoom(room, s.userId) }));
    }
  }
}

function maskCard(c: PokemonCard, hide: boolean): PokemonCard {
  return hide ? hiddenCard() : { ...c, hidden: false };
}

function publicActiveSeat(room: Room): number | null {
  if (room.phase === "lobby" || room.phase === "hand_over") return null;
  const seat = room.seats[room.activeSeat];
  if (!seat || !canAct(seat)) return null;
  return room.activeSeat;
}

function publicRoom(room: Room, viewerUserId: number): PublicRoomState {
  const hideHole = (s: Seat) =>
    room.phase !== "showdown" && room.phase !== "hand_over" && s.userId !== viewerUserId;

  const sbSeat =
    room.phase !== "lobby" ? nextOccupiedSeat(room, room.dealerSeat) : -1;
  const bbSeat = sbSeat >= 0 ? nextOccupiedSeat(room, sbSeat) : -1;

  return {
    code: room.code,
    name: room.name,
    phase: room.phase,
    hostUserId: room.hostUserId,
    hasPassword: !!room.password,
    settings: { ...room.settings },
    seats: room.seats.map((s, i) =>
      s
        ? {
            userId: s.userId,
            username: s.username,
            chips: s.chips,
            ready: s.ready,
            hole: s.hole.map((c) => maskCard(c, hideHole(s))),
            folded: s.folded,
            allIn: s.allIn,
            betRound: s.betRound,
            betHand: s.betHand,
            lastAction: s.lastAction,
            handLabel: s.handLabel,
            isDealer: i === room.dealerSeat,
            isSmallBlind: i === sbSeat,
            isBigBlind: i === bbSeat,
          }
        : null
    ),
    community: room.community.map((c) => ({ ...c, hidden: false })),
    pot: room.pot,
    currentBet: room.currentBet,
    minRaise: room.minRaise,
    activeSeat: publicActiveSeat(room),
    dealerSeat: room.phase === "lobby" ? null : room.dealerSeat,
    turnEndsAt: room.turnEndsAt,
    handNumber: room.handNumber,
    message: room.message,
    lastResults: room.lastResults,
    variant: "texas_holdem_pokemon",
  };
}

export function getPublicRoomForUser(userId: number): PublicRoomState | null {
  const code = userRoom.get(userId);
  if (!code) return null;
  const room = rooms.get(code);
  if (!room) return null;
  return publicRoom(room, userId);
}

function clearTurnTimer(room: Room): void {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
  room.turnEndsAt = null;
}

function startTurnTimer(room: Room): void {
  clearTurnTimer(room);
  if (room.phase === "lobby" || room.phase === "showdown" || room.phase === "hand_over") return;
  room.turnEndsAt = Date.now() + HOLDEM_ACTION_MS;
  room.turnTimer = setTimeout(() => {
    void autoFoldActive(room);
  }, HOLDEM_ACTION_MS);
}

async function autoFoldActive(room: Room): Promise<void> {
  const seat = room.seats[room.activeSeat];
  if (!seat) return;
  if (!canAct(seat)) {
    await runOutBoardIfNeeded(room);
    return;
  }
  seat.folded = true;
  seat.lastAction = "Fold (timeout)";
  room.needsAction.delete(seat.userId);
  room.message = `${seat.username} folded (time)`;
  await afterAction(room);
}

function resetHandBets(room: Room): void {
  for (const s of seated(room)) {
    s.betRound = 0;
    s.betHand = 0;
    s.folded = false;
    s.allIn = false;
    s.hole = [];
    s.handLabel = undefined;
    s.lastAction = undefined;
  }
  room.community = [];
  room.currentBet = 0;
  room.minRaise = room.settings.bigBlind;
  room.lastRaiseSize = room.settings.bigBlind;
  room.needsAction = new Set();
}

function commitChips(seat: Seat, amount: number, room: Room): number {
  const pay = Math.min(amount, seat.chips);
  seat.chips -= pay;
  seat.betRound += pay;
  seat.betHand += pay;
  room.pot += pay;
  if (seat.chips === 0) seat.allIn = true;
  return pay;
}

function postBlind(room: Room, seatIdx: number, amount: number): void {
  const seat = room.seats[seatIdx];
  if (!seat) return;
  const pay = commitChips(seat, amount, room);
  seat.lastAction = pay < amount ? `All-in ${pay.toLocaleString()}` : `Blind ${pay.toLocaleString()}`;
}

function initNeedsAction(room: Room): void {
  room.needsAction = new Set();
  for (const s of seated(room)) {
    if (!s.folded && !s.allIn) room.needsAction.add(s.userId);
  }
}

function bettingRoundComplete(room: Room): boolean {
  const inHand = playersInHand(room);
  const atTable = seated(room).length;
  if (inHand.length <= 1 && atTable > 1) return true;
  if (room.needsAction.size === 0) return true;
  for (const s of seated(room)) {
    if (!canAct(s)) continue;
    if (s.betRound < room.currentBet) return false;
  }
  return room.needsAction.size === 0;
}

function advanceToNextActor(room: Room): boolean {
  let idx = room.activeSeat;
  for (let i = 0; i < room.seats.length; i++) {
    idx = nextOccupiedSeat(room, idx);
    const s = room.seats[idx];
    if (s && canAct(s)) {
      room.activeSeat = idx;
      startTurnTimer(room);
      return true;
    }
  }
  clearTurnTimer(room);
  return false;
}

/** When everyone left is all-in (or folded), deal remaining streets through showdown. */
async function runOutBoardIfNeeded(room: Room): Promise<void> {
  if (room.phase === "lobby" || room.phase === "showdown" || room.phase === "hand_over") return;
  if (!bettingRoundComplete(room)) return;
  if (playersInHand(room).length === 0) return;
  await advanceStreet(room);
}

async function awardPotToSingle(room: Room, winner: Seat): Promise<void> {
  winner.chips += room.pot;
  room.lastResults = [`${winner.username} wins ${room.pot.toLocaleString()} Cobble$ (everyone else folded)`];
  room.pot = 0;
  room.phase = "hand_over";
  room.message = `${winner.username} wins the pot!`;
  clearTurnTimer(room);
  for (const s of seated(room)) s.ready = false;
  broadcastRoom(room);
}

async function runShowdown(room: Room): Promise<void> {
  room.phase = "showdown";
  clearTurnTimer(room);
  const contenders = playersInHand(room);
  const hands = new Map<number, ThemedHand>();
  for (const s of contenders) {
    const hand = bestHandFromCards([...s.hole, ...room.community]);
    s.handLabel = hand.themeLabel;
    hands.set(s.userId, hand);
  }
  const contributions = new Map<number, number>();
  for (const s of seated(room)) {
    if (s.betHand > 0) contributions.set(s.userId, s.betHand);
  }
  const folded = new Set(seated(room).filter((s) => s.folded).map((s) => s.userId));
  const pots = buildSidePots(contributions);
  const payouts = awardSidePots(pots.length ? pots : [{ amount: room.pot, eligible: [...hands.keys()] }], hands, folded);
  const merged = mergePayouts(payouts);
  room.lastResults = [];
  for (const [userId, { amount, hand }] of merged) {
    const seat = seated(room).find((s) => s.userId === userId);
    if (seat) {
      seat.chips += amount;
      room.lastResults.push(
        `${seat.username}: ${hand.themeLabel} — wins ${amount.toLocaleString()} Cobble$`
      );
    }
  }
  room.pot = 0;
  room.phase = "hand_over";
  room.message = "Showdown complete. Tap Ready for the next hand.";
  for (const s of seated(room)) s.ready = false;
  broadcastRoom(room);
}

async function advanceStreet(room: Room): Promise<void> {
  for (const s of seated(room)) s.betRound = 0;
  room.currentBet = 0;
  room.minRaise = room.settings.bigBlind;
  room.lastRaiseSize = room.settings.bigBlind;

  const order: HoldemPhase[] = ["preflop", "flop", "turn", "river", "showdown"];
  const idx = order.indexOf(room.phase);
  const next = order[idx + 1];

  if (next === "flop") {
    room.phase = "flop";
    room.community.push(...drawFromDeck(room.deck, 3));
    room.message = "Flop dealt.";
  } else if (next === "turn") {
    room.phase = "turn";
    room.community.push(...drawFromDeck(room.deck, 1));
    room.message = "Turn dealt.";
  } else if (next === "river") {
    room.phase = "river";
    room.community.push(...drawFromDeck(room.deck, 1));
    room.message = "River dealt.";
  } else if (next === "showdown" || !next) {
    await runShowdown(room);
    return;
  }

  initNeedsAction(room);
  room.activeSeat = nextOccupiedSeat(room, room.dealerSeat);
  if (!advanceToNextActor(room) && bettingRoundComplete(room)) {
    await runOutBoardIfNeeded(room);
    return;
  }
  broadcastRoom(room);
}

async function afterAction(room: Room): Promise<void> {
  const inHand = playersInHand(room);
  if (inHand.length === 0) {
    room.lastResults = ["Pot forfeited (everyone folded)"];
    room.pot = 0;
    room.phase = "hand_over";
    room.message = "Hand over.";
    clearTurnTimer(room);
    for (const s of seated(room)) s.ready = false;
    broadcastRoom(room);
    return;
  }
  if (inHand.length === 1 && seated(room).length > 1) {
    await awardPotToSingle(room, inHand[0]!);
    return;
  }
  if (bettingRoundComplete(room)) {
    await advanceStreet(room);
    return;
  }
  if (!advanceToNextActor(room)) {
    await runOutBoardIfNeeded(room);
    return;
  }
  broadcastRoom(room);
}

async function startHand(room: Room): Promise<void> {
  const ready = seated(room).filter((s) => s.ready && s.chips >= room.settings.bigBlind);
  if (ready.length < HOLDEM_MIN_PLAYERS) {
    room.message = `Need at least ${HOLDEM_MIN_PLAYERS} ready players with chips.`;
    broadcastRoom(room);
    return;
  }

  resetHandBets(room);
  room.deck = createShuffledPokemonDeck();
  room.handNumber += 1;
  room.pot = 0;
  room.phase = "preflop";
  room.dealerSeat = nextOccupiedSeat(room, room.dealerSeat);

  for (const s of seated(room)) {
    if (!s.ready) {
      s.folded = true;
      continue;
    }
    s.hole = drawFromDeck(room.deck, 2);
  }

  const sb = nextOccupiedSeat(room, room.dealerSeat);
  const bb = nextOccupiedSeat(room, sb);
  postBlind(room, sb, room.settings.smallBlind);
  postBlind(room, bb, room.settings.bigBlind);
  room.currentBet = Math.max(room.seats[sb]?.betRound ?? 0, room.seats[bb]?.betRound ?? 0);
  room.minRaise = room.settings.bigBlind;
  room.lastRaiseSize = room.settings.bigBlind;

  initNeedsAction(room);
  room.activeSeat = nextOccupiedSeat(room, bb);
  room.message = "Cards dealt — place your bets.";
  if (!advanceToNextActor(room)) {
    await runOutBoardIfNeeded(room);
    return;
  }
  broadcastRoom(room);
}

async function processAction(
  room: Room,
  userId: number,
  kind: string,
  amountRaw?: unknown
): Promise<void> {
  if (room.phase === "lobby" || room.phase === "showdown" || room.phase === "hand_over") {
    sendError(userId, "No betting right now");
    return;
  }
  const idx = seatIndexOf(room, userId);
  if (idx < 0 || idx !== room.activeSeat) {
    sendError(userId, "Not your turn");
    return;
  }
  const seat = room.seats[idx]!;
  if (!canAct(seat)) {
    sendError(userId, "You are all-in — waiting for the board to finish");
    return;
  }

  const toCall = room.currentBet - seat.betRound;

  if (kind === "fold") {
    seat.folded = true;
    seat.lastAction = "Fold";
    room.needsAction.delete(userId);
    await afterAction(room);
    return;
  }

  if (kind === "check") {
    if (toCall > 0) {
      sendError(userId, "Cannot check — must call or fold");
      return;
    }
    seat.lastAction = "Check";
    room.needsAction.delete(userId);
    await afterAction(room);
    return;
  }

  if (kind === "call") {
    if (toCall <= 0) {
      sendError(userId, "Nothing to call");
      return;
    }
    commitChips(seat, toCall, room);
    seat.lastAction = `Call ${toCall.toLocaleString()}`;
    room.needsAction.delete(userId);
    await afterAction(room);
    return;
  }

  if (kind === "all_in") {
    const pay = seat.chips;
    const total = seat.betRound + pay;
    commitChips(seat, pay, room);
    if (total > room.currentBet) {
      const raiseBy = total - room.currentBet;
      room.lastRaiseSize = raiseBy;
      room.minRaise = Math.max(room.settings.bigBlind, raiseBy);
      room.currentBet = total;
      initNeedsAction(room);
      room.needsAction.delete(userId);
    } else {
      room.needsAction.delete(userId);
    }
    seat.lastAction = `All-in ${pay.toLocaleString()}`;
    await afterAction(room);
    return;
  }

  const amount = typeof amountRaw === "number" ? amountRaw : parseInt(String(amountRaw ?? ""), 10);
  if (!Number.isInteger(amount) || amount <= 0) {
    sendError(userId, "Invalid amount");
    return;
  }

  if (kind === "bet") {
    if (room.currentBet > 0) {
      sendError(userId, "Use raise when there is a bet");
      return;
    }
    if (amount < room.settings.bigBlind) {
      sendError(userId, `Minimum bet is ${room.settings.bigBlind.toLocaleString()}`);
      return;
    }
    commitChips(seat, amount, room);
    room.currentBet = seat.betRound;
    room.lastRaiseSize = amount;
    room.minRaise = amount;
    seat.lastAction = `Bet ${amount.toLocaleString()}`;
    initNeedsAction(room);
    room.needsAction.delete(userId);
    await afterAction(room);
    return;
  }

  if (kind === "raise") {
    const target = amount;
    if (target <= room.currentBet) {
      sendError(userId, `Raise must be above ${room.currentBet.toLocaleString()}`);
      return;
    }
    const raiseBy = target - room.currentBet;
    if (raiseBy < room.minRaise && seat.chips > raiseBy) {
      sendError(userId, `Minimum raise is ${room.minRaise.toLocaleString()}`);
      return;
    }
    const need = target - seat.betRound;
    commitChips(seat, need, room);
    room.currentBet = seat.betRound;
    room.lastRaiseSize = raiseBy;
    room.minRaise = Math.max(room.settings.bigBlind, raiseBy);
    seat.lastAction = `Raise to ${seat.betRound.toLocaleString()}`;
    initNeedsAction(room);
    room.needsAction.delete(userId);
    await afterAction(room);
    return;
  }

  sendError(userId, "Unknown action");
}

async function cashOutAndLeave(userId: number, room: Room): Promise<boolean> {
  const idx = seatIndexOf(room, userId);
  if (idx < 0) return true;
  const seat = room.seats[idx]!;
  // Leave is only allowed in lobby or hand_over — always return table chips to wallet.
  if (seat.chips > 0) {
    if (!walletDeps) {
      sendError(userId, "Wallet not available — try again later or contact staff.");
      return false;
    }
    try {
      await creditPokerCashOut(walletDeps, userId, seat.chips, `Table ${room.code} · cash-out`);
    } catch (err) {
      console.error(
        "[poker] cash-out failed",
        userId,
        room.code,
        seat.chips,
        err instanceof Error ? err.message : err
      );
      sendError(userId, "Could not credit Cobble$ to your wallet — try leaving again or contact staff.");
      return false;
    }
  }
  room.seats[idx] = null;
  userRoom.delete(userId);
  if (userId === room.hostUserId) {
    const next = seated(room)[0];
    if (next) room.hostUserId = next.userId;
  }
  if (seated(room).length === 0) {
    clearTurnTimer(room);
    rooms.delete(room.code);
  } else {
    room.message = `${seat.username} left the table.`;
    broadcastRoom(room);
  }
  return true;
}

export function registerPokerSocket(userId: number, _username: string, ws: WebSocket): void {
  sockets.set(userId, ws);
  const code = userRoom.get(userId);
  if (code && rooms.has(code)) broadcastRoom(rooms.get(code)!);
}

export function unregisterPokerSocket(userId: number): void {
  sockets.delete(userId);
}

export async function handlePokerMessage(
  userId: number,
  username: string,
  raw: string
): Promise<void> {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    sendError(userId, "Invalid message");
    return;
  }

  const type = String(msg.type ?? "");

  if (type === "create_room") {
    if (userRoom.has(userId)) {
      sendError(userId, "Leave your current table first");
      return;
    }
    if (!walletDeps) {
      sendError(userId, "Wallet not available — try again later.");
      return;
    }
    const buyIn = clampBuyIn(msg.buyIn) ?? HOLDEM_DEFAULT_BUY_IN;
    const smallBlind = clampBlind(msg.smallBlind, HOLDEM_DEFAULT_SB);
    const bigBlind = clampBlind(msg.bigBlind, Math.max(smallBlind * 2, HOLDEM_DEFAULT_BB));
    const maxPlayers = Math.min(
      HOLDEM_MAX_PLAYERS,
      Math.max(HOLDEM_MIN_PLAYERS, parseInt(String(msg.maxPlayers ?? HOLDEM_MAX_PLAYERS), 10) || HOLDEM_MAX_PLAYERS)
    );
    const password = typeof msg.password === "string" && msg.password.trim() ? msg.password.trim() : null;
    const name = typeof msg.name === "string" && msg.name.trim() ? msg.name.trim().slice(0, 40) : "Pokémon Table";

    const spend = await spendPokerBuyIn(walletDeps, userId, buyIn, `Table buy-in`);
    if (!spend.ok) {
      sendError(userId, spend.error);
      return;
    }

    const code = generateCode();
    const room: Room = {
      code,
      name,
      password,
      hostUserId: userId,
      settings: { maxPlayers, buyIn, smallBlind, bigBlind },
      seats: Array.from({ length: maxPlayers }, () => null),
      phase: "lobby",
      deck: [],
      community: [],
      dealerSeat: 0,
      activeSeat: 0,
      currentBet: 0,
      minRaise: bigBlind,
      lastRaiseSize: bigBlind,
      pot: 0,
      handNumber: 0,
      turnEndsAt: null,
      turnTimer: null,
      needsAction: new Set(),
      message: "Share the code — players join and tap Ready to start.",
      lastResults: [],
    };
    room.seats[0] = {
      userId,
      username,
      chips: buyIn,
      ready: false,
      hole: [],
      folded: false,
      allIn: false,
      betRound: 0,
      betHand: 0,
    };
    rooms.set(code, room);
    userRoom.set(userId, code);
    broadcastRoom(room);
    return;
  }

  if (type === "join_room") {
    const code = String(msg.code ?? "")
      .trim()
      .toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      sendError(userId, "Table not found");
      return;
    }
    if (userRoom.has(userId)) {
      sendError(userId, "Leave your current table first");
      return;
    }
    if (room.password && room.password !== String(msg.password ?? "")) {
      sendError(userId, "Wrong password");
      return;
    }
    if (room.phase !== "lobby" && room.phase !== "hand_over") {
      sendError(userId, "Hand in progress — try again soon");
      return;
    }
    const empty = room.seats.findIndex((s) => s == null);
    if (empty < 0) {
      sendError(userId, "Table is full");
      return;
    }
    if (!walletDeps) {
      sendError(userId, "Wallet not available — try again later.");
      return;
    }
    const spend = await spendPokerBuyIn(walletDeps, userId, room.settings.buyIn, `Table ${code} buy-in`);
    if (!spend.ok) {
      sendError(userId, spend.error);
      return;
    }
    room.seats[empty] = {
      userId,
      username,
      chips: room.settings.buyIn,
      ready: false,
      hole: [],
      folded: false,
      allIn: false,
      betRound: 0,
      betHand: 0,
    };
    userRoom.set(userId, code);
    room.message = `${username} joined.`;
    broadcastRoom(room);
    return;
  }

  if (type === "leave_room") {
    const code = userRoom.get(userId);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    if (room.phase !== "lobby" && room.phase !== "hand_over") {
      sendError(userId, "Cannot leave during a hand");
      return;
    }
    const left = await cashOutAndLeave(userId, room);
    if (!left) return;
    const ws = sockets.get(userId);
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "left" }));
    return;
  }

  const code = userRoom.get(userId);
  if (!code) {
    sendError(userId, "Not at a table");
    return;
  }
  const room = rooms.get(code);
  if (!room) {
    userRoom.delete(userId);
    return;
  }

  if (type === "ready") {
    if (room.phase !== "lobby" && room.phase !== "hand_over") {
      sendError(userId, "Cannot ready during a hand");
      return;
    }
    const idx = seatIndexOf(room, userId);
    const seat = idx >= 0 ? room.seats[idx] : null;
    if (!seat) return;
    seat.ready = true;
    broadcastRoom(room);
    const eligible = seated(room).filter((s) => s.chips >= room.settings.bigBlind);
    if (eligible.length >= HOLDEM_MIN_PLAYERS && eligible.every((s) => s.ready)) {
      await startHand(room);
    }
    return;
  }

  if (type === "action") {
    const kind = String(msg.kind ?? "");
    await processAction(room, userId, kind, msg.amount);
    return;
  }

  sendError(userId, "Unknown action");
}
