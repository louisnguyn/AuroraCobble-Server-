/**
 * 12-player: seeds 5–12 qualify → QF vs seeds 1–4 → SF → final + 3rd.
 * 8-player: classic single-elim at QF — (1 vs 8), (2 vs 7), (3 vs 6), (4 vs 5) → SF → final + 3rd (no qualifying round).
 */

export type BracketSizeMode = 8 | 12;

export const QUAL_PAIRS: [number, number][] = [
  [5, 12],
  [6, 11],
  [7, 10],
  [8, 9],
];

export const QF_TOP_SEEDS = [1, 2, 3, 4] as const;

/** Eight-player bracket: quarter-final seed pairings (high vs low within each matchup). */
export const QF_SEED_PAIRS_8: readonly [number, number][] = [
  [1, 8],
  [2, 7],
  [3, 6],
  [4, 5],
];

/** Legacy default: QF i faces winner of qual `DEFAULT_QF_QUAL_FEED[i]` (QF0 ← qual-3, QF1 ← qual-2, …). */
export const DEFAULT_QF_QUAL_FEED: readonly [number, number, number, number] = [3, 2, 1, 0];

/**
 * `qfQualFeed[i]` = qualifier index (0–3) whose winner plays top seed `i+1` in quarter-final `i`.
 * Must be a permutation of [0,1,2,3].
 */
export function normalizeQfQualFeed(raw: unknown): [number, number, number, number] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const nums: number[] = [];
  for (const x of raw) {
    const n = typeof x === "number" ? x : parseInt(String(x), 10);
    if (!Number.isFinite(n) || n < 0 || n > 3 || !Number.isInteger(n)) return null;
    nums.push(n);
  }
  if (new Set(nums).size !== 4) return null;
  return nums as [number, number, number, number];
}

export type ParticipantRow = {
  id: number;
  seed_rank: number;
  display_name: string;
  team_json: unknown;
};

export type MatchResultRow = {
  match_key: string;
  winner_participant_id: number | null;
};

export type SlotResolved =
  | { kind: "participant"; id: number; name: string; teamPreview: unknown }
  | { kind: "tbd" }
  | { kind: "winner_of"; matchKey: string }
  | { kind: "loser_of"; matchKey: string };

function bySeed(parts: ParticipantRow[]): Map<number, ParticipantRow> {
  const m = new Map<number, ParticipantRow>();
  for (const p of parts) m.set(p.seed_rank, p);
  return m;
}

function teamPreview(teamJson: unknown): unknown {
  if (!Array.isArray(teamJson)) return [];
  return (teamJson as { species?: string; speciesSlug?: string }[]).map((mon) => ({
    species: mon.species,
    speciesSlug: mon.speciesSlug,
  }));
}

export function getWinner(results: Map<string, number | null>, key: string): number | null {
  return results.get(key) ?? null;
}

function participantById(parts: ParticipantRow[], id: number): ParticipantRow | undefined {
  return parts.find((p) => p.id === id);
}

export function otherParticipantInMatch(aId: number, bId: number, winnerId: number): number | null {
  if (winnerId === aId) return bId;
  if (winnerId === bId) return aId;
  return null;
}

export type BuiltMatch = {
  key: string;
  round: "qualifying" | "quarter" | "semi" | "final" | "third";
  label: string;
  left: SlotResolved;
  right: SlotResolved;
  winnerParticipantId: number | null;
  canSetWinner: boolean;
};

function slotFromWinner(
  parts: ParticipantRow[],
  wid: number | null,
  pendingKey: string
): SlotResolved {
  if (wid) {
    const p = participantById(parts, wid);
    if (p)
      return {
        kind: "participant",
        id: p.id,
        name: p.display_name,
        teamPreview: teamPreview(p.team_json),
      };
  }
  return { kind: "winner_of", matchKey: pendingKey };
}

function buildSemiFinalThroughThird(
  participants: ParticipantRow[],
  res: Map<string, number | null>
): BuiltMatch[] {
  const wqf = (idx: number) => getWinner(res, `qf-${idx}`);
  const w0 = wqf(0);
  const w1 = wqf(1);
  const w2 = wqf(2);
  const w3 = wqf(3);

  const sfMatches: BuiltMatch[] = [
    {
      key: "sf-0",
      round: "semi",
      label: "Semi-final 1",
      left: slotFromWinner(participants, w0, "qf-0"),
      right: slotFromWinner(participants, w1, "qf-1"),
      winnerParticipantId: getWinner(res, "sf-0"),
      canSetWinner: !!(w0 && w1),
    },
    {
      key: "sf-1",
      round: "semi",
      label: "Semi-final 2",
      left: slotFromWinner(participants, w2, "qf-2"),
      right: slotFromWinner(participants, w3, "qf-3"),
      winnerParticipantId: getWinner(res, "sf-1"),
      canSetWinner: !!(w2 && w3),
    },
  ];

  const wsf0 = getWinner(res, "sf-0");
  const wsf1 = getWinner(res, "sf-1");

  const finalMatch: BuiltMatch = {
    key: "final",
    round: "final",
    label: "Final",
    left: slotFromWinner(participants, wsf0, "sf-0"),
    right: slotFromWinner(participants, wsf1, "sf-1"),
    winnerParticipantId: getWinner(res, "final"),
    canSetWinner: !!(wsf0 && wsf1),
  };

  let thirdLeft: SlotResolved = { kind: "loser_of", matchKey: "sf-0" };
  let thirdRight: SlotResolved = { kind: "loser_of", matchKey: "sf-1" };
  let canThird = false;
  if (w0 != null && w1 != null && wsf0 != null) {
    const lo0 = otherParticipantInMatch(w0, w1, wsf0);
    if (lo0) {
      const p = participantById(participants, lo0);
      thirdLeft = p
        ? { kind: "participant", id: p.id, name: p.display_name, teamPreview: teamPreview(p.team_json) }
        : { kind: "tbd" };
    }
  }
  if (w2 != null && w3 != null && wsf1 != null) {
    const lo1 = otherParticipantInMatch(w2, w3, wsf1);
    if (lo1) {
      const p = participantById(participants, lo1);
      thirdRight = p
        ? { kind: "participant", id: p.id, name: p.display_name, teamPreview: teamPreview(p.team_json) }
        : { kind: "tbd" };
    }
  }
  canThird = thirdLeft.kind === "participant" && thirdRight.kind === "participant";

  const thirdMatch: BuiltMatch = {
    key: "third",
    round: "third",
    label: "3rd place",
    left: thirdLeft,
    right: thirdRight,
    winnerParticipantId: getWinner(res, "third"),
    canSetWinner: canThird,
  };

  return [...sfMatches, finalMatch, thirdMatch];
}

function buildBracketTwelvePlayers(
  participants: ParticipantRow[],
  results: MatchResultRow[],
  qfQualFeed: unknown
): BuiltMatch[] {
  const feed =
    normalizeQfQualFeed(qfQualFeed) ?? ([...DEFAULT_QF_QUAL_FEED] as [number, number, number, number]);
  const seedMap = bySeed(participants);
  const res = new Map<string, number | null>();
  for (const r of results) res.set(r.match_key, r.winner_participant_id);

  const qualMatches: BuiltMatch[] = QUAL_PAIRS.map(([sa, sb], i) => {
    const key = `qual-${i}`;
    const pa = seedMap.get(sa);
    const pb = seedMap.get(sb);
    const left: SlotResolved = pa
      ? { kind: "participant", id: pa.id, name: pa.display_name, teamPreview: teamPreview(pa.team_json) }
      : { kind: "tbd" };
    const right: SlotResolved = pb
      ? { kind: "participant", id: pb.id, name: pb.display_name, teamPreview: teamPreview(pb.team_json) }
      : { kind: "tbd" };
    return {
      key,
      round: "qualifying",
      label: `Qualifier ${i + 1}`,
      left,
      right,
      winnerParticipantId: getWinner(res, key),
      canSetWinner: !!(pa && pb),
    };
  });

  const qfMatches: BuiltMatch[] = QF_TOP_SEEDS.map((topSeed, i) => {
    const key = `qf-${i}`;
    const qualIdx = feed[i]!;
    const qualKey = `qual-${qualIdx}`;
    const seeded = seedMap.get(topSeed);
    const left: SlotResolved = seeded
      ? { kind: "participant", id: seeded.id, name: seeded.display_name, teamPreview: teamPreview(seeded.team_json) }
      : { kind: "tbd" };
    const wq = getWinner(res, qualKey);
    const rightP = wq ? participantById(participants, wq) : undefined;
    const right: SlotResolved =
      wq && rightP
        ? { kind: "participant", id: rightP.id, name: rightP.display_name, teamPreview: teamPreview(rightP.team_json) }
        : { kind: "winner_of", matchKey: qualKey };
    const w = getWinner(res, key);
    const canSet =
      !!seeded &&
      !!wq &&
      !!rightP &&
      left.kind === "participant" &&
      right.kind === "participant";
    return {
      key,
      round: "quarter",
      label: `Quarter-final ${i + 1}`,
      left,
      right,
      winnerParticipantId: w,
      canSetWinner: canSet,
    };
  });

  const tail = buildSemiFinalThroughThird(participants, res);

  return [...qualMatches, ...qfMatches, ...tail];
}

function buildBracketEightPlayers(participants: ParticipantRow[], results: MatchResultRow[]): BuiltMatch[] {
  const seedMap = bySeed(participants);
  const res = new Map<string, number | null>();
  for (const r of results) res.set(r.match_key, r.winner_participant_id);

  const qfMatches: BuiltMatch[] = QF_SEED_PAIRS_8.map(([sa, sb], i) => {
    const key = `qf-${i}`;
    const pa = seedMap.get(sa);
    const pb = seedMap.get(sb);
    const left: SlotResolved = pa
      ? { kind: "participant", id: pa.id, name: pa.display_name, teamPreview: teamPreview(pa.team_json) }
      : { kind: "tbd" };
    const right: SlotResolved = pb
      ? { kind: "participant", id: pb.id, name: pb.display_name, teamPreview: teamPreview(pb.team_json) }
      : { kind: "tbd" };
    return {
      key,
      round: "quarter",
      label: `Quarter-final ${i + 1}`,
      left,
      right,
      winnerParticipantId: getWinner(res, key),
      canSetWinner: !!(pa && pb),
    };
  });

  return [...qfMatches, ...buildSemiFinalThroughThird(participants, res)];
}

export function buildBracketView(
  participants: ParticipantRow[],
  results: MatchResultRow[],
  options?: { qfQualFeed?: unknown; bracketSize?: BracketSizeMode }
): BuiltMatch[] {
  if (options?.bracketSize === 8) {
    return buildBracketEightPlayers(participants, results);
  }
  return buildBracketTwelvePlayers(participants, results, options?.qfQualFeed);
}
