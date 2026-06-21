/**
 * Texas Hold'em — 7-card best hand, themed labels, side pots.
 */

import type { PokemonCard } from "./pokemonDeck.js";
import {
  compareHands,
  evaluateFiveCardHand,
  type Card,
  type EvaluatedHand,
  type HandRank,
} from "./pokerEngine.js";

export type { HandRank, EvaluatedHand };

export const HAND_THEME_LABEL: Record<HandRank, string> = {
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
};

export type ThemedHand = EvaluatedHand & { themeLabel: string };

function toEval(c: PokemonCard): Card {
  return { suit: c.suit, rank: c.rank };
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first!, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

export function bestHandFromCards(cards: PokemonCard[]): ThemedHand {
  if (cards.length < 5) {
    const ev = evaluateFiveCardHand(cards.map(toEval));
    return { ...ev, themeLabel: HAND_THEME_LABEL[ev.rank], label: HAND_THEME_LABEL[ev.rank] };
  }
  let best = evaluateFiveCardHand(cards.slice(0, 5).map(toEval));
  for (const combo of combinations(cards, 5)) {
    const ev = evaluateFiveCardHand(combo.map(toEval));
    if (ev.score > best.score) best = ev;
  }
  return {
    ...best,
    themeLabel: HAND_THEME_LABEL[best.rank],
    label: HAND_THEME_LABEL[best.rank],
  };
}

export type SidePot = {
  amount: number;
  eligible: number[];
};

/** Build side pots from player contributions (userId -> chips put in this hand). */
export function buildSidePots(contributions: Map<number, number>): SidePot[] {
  const entries = [...contributions.entries()].filter(([, amt]) => amt > 0);
  if (!entries.length) return [];

  const levels = [...new Set(entries.map(([, a]) => a))].sort((a, b) => a - b);
  const pots: SidePot[] = [];
  let prev = 0;

  for (const level of levels) {
    const layer = level - prev;
    if (layer <= 0) continue;
    const eligible = entries.filter(([, a]) => a >= level).map(([id]) => id);
    if (!eligible.length) continue;
    pots.push({ amount: layer * eligible.length, eligible });
    prev = level;
  }

  return pots;
}

export type PotWinner = { userId: number; amount: number; hand: ThemedHand };

export function awardSidePots(
  pots: SidePot[],
  hands: Map<number, ThemedHand>,
  folded: Set<number>
): PotWinner[] {
  const payouts: PotWinner[] = [];

  for (const pot of pots) {
    const contenders = pot.eligible.filter((id) => !folded.has(id) && hands.has(id));
    if (!contenders.length) continue;
    if (contenders.length === 1) {
      const uid = contenders[0]!;
      payouts.push({ userId: uid, amount: pot.amount, hand: hands.get(uid)! });
      continue;
    }
    let bestIds: number[] = [];
    let bestScore = -1;
    for (const id of contenders) {
      const h = hands.get(id)!;
      if (h.score > bestScore) {
        bestScore = h.score;
        bestIds = [id];
      } else if (h.score === bestScore) {
        bestIds.push(id);
      }
    }
    const share = Math.floor(pot.amount / bestIds.length);
    let remainder = pot.amount - share * bestIds.length;
    for (const id of bestIds) {
      const extra = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder--;
      payouts.push({ userId: id, amount: share + extra, hand: hands.get(id)! });
    }
  }

  return payouts;
}

export function mergePayouts(payouts: PotWinner[]): Map<number, { amount: number; hand: ThemedHand }> {
  const map = new Map<number, { amount: number; hand: ThemedHand }>();
  for (const p of payouts) {
    const cur = map.get(p.userId);
    if (cur) {
      cur.amount += p.amount;
      if (p.hand.score > cur.hand.score) cur.hand = p.hand;
    } else {
      map.set(p.userId, { amount: p.amount, hand: p.hand });
    }
  }
  return map;
}

export function compareThemedHands(a: ThemedHand, b: ThemedHand): number {
  return compareHands(a, b);
}
