/**
 * 5-card draw poker — hand evaluation and dealer rules for website tables vs house.
 */

export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";

export type Card = { suit: Suit; rank: Rank; hidden?: boolean };

export type HandRank =
  | "high_card"
  | "pair"
  | "two_pair"
  | "three_kind"
  | "straight"
  | "flush"
  | "full_house"
  | "four_kind"
  | "straight_flush"
  | "royal_flush";

export type EvaluatedHand = {
  rank: HandRank;
  /** Higher wins; encodes tie-breakers. */
  score: number;
  label: string;
};

export type HandOutcome = "win" | "lose" | "push" | "no_qualify_win";

const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];

const RANK_VALUE: Record<Rank, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

const HAND_RANK_VALUE: Record<HandRank, number> = {
  high_card: 1,
  pair: 2,
  two_pair: 3,
  three_kind: 4,
  straight: 5,
  flush: 6,
  full_house: 7,
  four_kind: 8,
  straight_flush: 9,
  royal_flush: 10,
};

const HAND_LABEL: Record<HandRank, string> = {
  high_card: "High card",
  pair: "Pair",
  two_pair: "Two pair",
  three_kind: "Three of a kind",
  straight: "Straight",
  flush: "Flush",
  full_house: "Full house",
  four_kind: "Four of a kind",
  straight_flush: "Straight flush",
  royal_flush: "Royal flush",
};

export function createShuffledDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

export function drawCards(deck: Card[], count: number): Card[] {
  return deck.splice(0, count);
}

export function cardLabel(c: Card): string {
  const rankDisplay =
    c.rank === "T" ? "10" : c.rank === "J" ? "J" : c.rank === "Q" ? "Q" : c.rank === "K" ? "K" : c.rank === "A" ? "A" : c.rank;
  const suitSymbol =
    c.suit === "hearts" ? "♥" : c.suit === "diamonds" ? "♦" : c.suit === "clubs" ? "♣" : "♠";
  return `${rankDisplay}${suitSymbol}`;
}

function rankCounts(cards: Card[]): number[] {
  const counts = new Map<number, number>();
  for (const c of cards) {
    const v = RANK_VALUE[c.rank];
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.values()].sort((a, b) => b - a);
}

function rankValuesDesc(cards: Card[]): number[] {
  return cards.map((c) => RANK_VALUE[c.rank]).sort((a, b) => b - a);
}

function isFlush(cards: Card[]): boolean {
  const suit = cards[0]?.suit;
  return cards.every((c) => c.suit === suit);
}

function isStraight(values: number[]): boolean {
  const uniq = [...new Set(values)].sort((a, b) => b - a);
  if (uniq.length !== 5) return false;
  if (uniq[0]! - uniq[4]! === 4) return true;
  // A-2-3-4-5 wheel
  const wheel = [14, 5, 4, 3, 2];
  return wheel.every((v, i) => uniq[i] === v);
}

function straightHigh(values: number[]): number {
  const uniq = [...new Set(values)].sort((a, b) => b - a);
  if (uniq.length === 5 && uniq[0] === 14 && uniq[4] === 2) return 5;
  return uniq[0] ?? 0;
}

/** Encode tie-breakers into lower bits of score. */
function encodeScore(handRank: HandRank, kickers: number[]): number {
  const base = HAND_RANK_VALUE[handRank] * 1e10;
  let k = 0;
  for (let i = 0; i < kickers.length && i < 5; i++) {
    k += (kickers[i] ?? 0) * Math.pow(15, 4 - i);
  }
  return base + k;
}

export function evaluateFiveCardHand(cards: Card[]): EvaluatedHand {
  if (cards.length !== 5) {
    return { rank: "high_card", score: 0, label: "Invalid hand" };
  }
  const values = rankValuesDesc(cards);
  const counts = rankCounts(cards);
  const flush = isFlush(cards);
  const straight = isStraight(values);

  if (flush && straight) {
    const high = straightHigh(values);
    if (high === 14 && values.includes(10)) {
      return {
        rank: "royal_flush",
        score: encodeScore("royal_flush", [14]),
        label: HAND_LABEL.royal_flush,
      };
    }
    return {
      rank: "straight_flush",
      score: encodeScore("straight_flush", [high]),
      label: HAND_LABEL.straight_flush,
    };
  }

  if (counts[0] === 4) {
    const quad = values.find((v) => cards.filter((c) => RANK_VALUE[c.rank] === v).length === 4)!;
    const kicker = values.find((v) => v !== quad)!;
    return {
      rank: "four_kind",
      score: encodeScore("four_kind", [quad, kicker]),
      label: HAND_LABEL.four_kind,
    };
  }

  if (counts[0] === 3 && counts[1] === 2) {
    const trips = values.find((v) => cards.filter((c) => RANK_VALUE[c.rank] === v).length === 3)!;
    const pair = values.find((v) => v !== trips)!;
    return {
      rank: "full_house",
      score: encodeScore("full_house", [trips, pair]),
      label: HAND_LABEL.full_house,
    };
  }

  if (flush) {
    return {
      rank: "flush",
      score: encodeScore("flush", values),
      label: HAND_LABEL.flush,
    };
  }

  if (straight) {
    return {
      rank: "straight",
      score: encodeScore("straight", [straightHigh(values)]),
      label: HAND_LABEL.straight,
    };
  }

  if (counts[0] === 3) {
    const trips = values.find((v) => cards.filter((c) => RANK_VALUE[c.rank] === v).length === 3)!;
    const kickers = values.filter((v) => v !== trips);
    return {
      rank: "three_kind",
      score: encodeScore("three_kind", [trips, ...kickers]),
      label: HAND_LABEL.three_kind,
    };
  }

  if (counts[0] === 2 && counts[1] === 2) {
    const pairs = [...new Set(values.filter((v) => cards.filter((c) => RANK_VALUE[c.rank] === v).length === 2))].sort(
      (a, b) => b - a
    );
    const kicker = values.find((v) => !pairs.includes(v))!;
    return {
      rank: "two_pair",
      score: encodeScore("two_pair", [pairs[0]!, pairs[1]!, kicker]),
      label: HAND_LABEL.two_pair,
    };
  }

  if (counts[0] === 2) {
    const pair = values.find((v) => cards.filter((c) => RANK_VALUE[c.rank] === v).length === 2)!;
    const kickers = values.filter((v) => v !== pair);
    return {
      rank: "pair",
      score: encodeScore("pair", [pair, ...kickers]),
      label: HAND_LABEL.pair,
    };
  }

  return {
    rank: "high_card",
    score: encodeScore("high_card", values),
    label: HAND_LABEL.high_card,
  };
}

/** Dealer must have at least a pair to qualify. */
export function dealerQualifies(hand: EvaluatedHand): boolean {
  return HAND_RANK_VALUE[hand.rank] >= HAND_RANK_VALUE.pair;
}

export function compareHands(a: EvaluatedHand, b: EvaluatedHand): number {
  return a.score - b.score;
}

export function settlePlayerVsDealer(
  playerHand: EvaluatedHand,
  dealerHand: EvaluatedHand,
  bet: number
): { outcome: HandOutcome; payout: number } {
  if (!dealerQualifies(dealerHand)) {
    return { outcome: "no_qualify_win", payout: bet * 2 };
  }
  const cmp = compareHands(playerHand, dealerHand);
  if (cmp > 0) return { outcome: "win", payout: bet * 2 };
  if (cmp < 0) return { outcome: "lose", payout: 0 };
  return { outcome: "push", payout: bet };
}

export function applyDiscard(hand: Card[], discardIndices: number[], deck: Card[]): Card[] {
  const discardSet = new Set(discardIndices.filter((i) => i >= 0 && i < hand.length));
  const kept = hand.filter((_, i) => !discardSet.has(i));
  const drawCount = discardSet.size;
  const drawn = drawCards(deck, drawCount);
  return [...kept, ...drawn];
}

export function sanitizeDiscardIndices(handLen: number, indices: unknown): number[] {
  if (!Array.isArray(indices)) return [];
  const out = new Set<number>();
  for (const raw of indices) {
    const i = typeof raw === "number" ? raw : parseInt(String(raw), 10);
    if (Number.isInteger(i) && i >= 0 && i < handLen) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}
