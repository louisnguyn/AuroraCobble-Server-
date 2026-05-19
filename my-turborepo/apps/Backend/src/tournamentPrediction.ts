import type { Express, Request, Response } from "express";
import { supabase } from "./supabase.js";
import {
  buildBracketView,
  getWinner,
  otherParticipantInMatch,
  type ParticipantRow,
} from "./tournamentBracket.js";

const COBBLEDOLLARS = "cobbledollars";
const SETTINGS_ID = 1;

export type TournamentPredictionSettingsRow = {
  tournament_id: number | null;
  predictions_locked_at: string | null;
  max_stake: number;
  min_stake: number;
  champion_win_multiplier: number;
  runner_up_win_multiplier: number;
};

export async function loadTournamentPredictionSettings(): Promise<TournamentPredictionSettingsRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("tournament_prediction_settings")
    .select(
      "tournament_id, predictions_locked_at, max_stake, min_stake, champion_win_multiplier, runner_up_win_multiplier"
    )
    .eq("id", SETTINGS_ID)
    .maybeSingle();
  if (error || !data) return null;
  return data as TournamentPredictionSettingsRow;
}

export function isTournamentPredictionWindowOpen(
  settings: TournamentPredictionSettingsRow,
  now: Date = new Date()
): boolean {
  if (!settings.tournament_id) return false;
  if (!settings.predictions_locked_at) return true;
  return now.getTime() < new Date(settings.predictions_locked_at).getTime();
}

export type TournamentPredictionPickSummary = {
  participantId: number;
  displayName: string;
  seedRank: number;
  totalStake: number;
  betCount: number;
};

export type TournamentPredictionBetEntry = {
  id: number;
  userId: number;
  username: string;
  stakeChampion: number;
  pickChampionParticipantId: number | null;
  pickChampionLabel: string | null;
  resultChampion: string;
  payoutChampion: number | null;
  stakeRunnerUp: number;
  pickRunnerUpParticipantId: number | null;
  pickRunnerUpLabel: string | null;
  resultRunnerUp: string;
  payoutRunnerUp: number | null;
  totalStake: number;
  createdAt: string;
  resolvedAt: string | null;
};

export type TournamentPredictionBetsPayload = {
  tournament: { id: number; slug: string; title: string };
  entries: TournamentPredictionBetEntry[];
  summary: {
    champion: TournamentPredictionPickSummary[];
    runnerUp: TournamentPredictionPickSummary[];
    totalEntries: number;
    totalStaked: number;
  };
};

export async function loadTournamentPredictionBetsForTournament(
  tournamentId: number
): Promise<TournamentPredictionBetsPayload | null> {
  if (!supabase) return null;
  const { data: t } = await supabase
    .from("tournaments")
    .select("id, slug, title")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!t) return null;

  const { data: rows, error } = await supabase
    .from("tournament_predictions")
    .select(
      "id, user_id, stake_champion, pick_champion_participant_id, stake_runner_up, pick_runner_up_participant_id, result_champion, result_runner_up, payout_champion, payout_runner_up, created_at, resolved_at"
    )
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const list = rows ?? [];
  const userIds = [...new Set(list.map((r) => r.user_id as number))];
  const partIds = new Set<number>();
  for (const r of list) {
    const c = r.pick_champion_participant_id as number | null;
    const ru = r.pick_runner_up_participant_id as number | null;
    if (c != null) partIds.add(c);
    if (ru != null) partIds.add(ru);
  }

  const userMap = new Map<number, string>();
  if (userIds.length > 0) {
    const { data: users } = await supabase.from("users").select("id, username").in("id", userIds);
    for (const u of users ?? []) {
      userMap.set(u.id as number, String(u.username ?? `#${u.id}`));
    }
  }

  const partMap = new Map<number, { displayName: string; seedRank: number }>();
  if (partIds.size > 0) {
    const { data: parts } = await supabase
      .from("tournament_participants")
      .select("id, seed_rank, display_name")
      .in("id", [...partIds]);
    for (const p of parts ?? []) {
      partMap.set(p.id as number, {
        displayName: String(p.display_name ?? ""),
        seedRank: Number(p.seed_rank),
      });
    }
  }

  const labelPart = (id: number | null): string | null => {
    if (id == null) return null;
    const p = partMap.get(id);
    return p ? `#${p.seedRank} ${p.displayName}` : `#${id}`;
  };

  const champTotals = new Map<number, TournamentPredictionPickSummary>();
  const ruTotals = new Map<number, TournamentPredictionPickSummary>();

  const addTotal = (map: Map<number, TournamentPredictionPickSummary>, partId: number, stake: number) => {
    if (stake <= 0) return;
    const p = partMap.get(partId);
    const cur = map.get(partId);
    if (cur) {
      cur.totalStake += stake;
      cur.betCount += 1;
    } else {
      map.set(partId, {
        participantId: partId,
        displayName: p?.displayName ?? `Participant ${partId}`,
        seedRank: p?.seedRank ?? 0,
        totalStake: stake,
        betCount: 1,
      });
    }
  };

  const entries: TournamentPredictionBetEntry[] = list.map((r) => {
    const stakeChampion = Number(r.stake_champion) || 0;
    const stakeRunnerUp = Number(r.stake_runner_up) || 0;
    const pickChampionId = r.pick_champion_participant_id as number | null;
    const pickRunnerUpId = r.pick_runner_up_participant_id as number | null;
    if (pickChampionId != null) addTotal(champTotals, pickChampionId, stakeChampion);
    if (pickRunnerUpId != null) addTotal(ruTotals, pickRunnerUpId, stakeRunnerUp);

    return {
      id: r.id as number,
      userId: r.user_id as number,
      username: userMap.get(r.user_id as number) ?? `#${r.user_id}`,
      stakeChampion,
      pickChampionParticipantId: pickChampionId,
      pickChampionLabel: labelPart(pickChampionId),
      resultChampion: r.result_champion as string,
      payoutChampion: r.payout_champion as number | null,
      stakeRunnerUp,
      pickRunnerUpParticipantId: pickRunnerUpId,
      pickRunnerUpLabel: labelPart(pickRunnerUpId),
      resultRunnerUp: r.result_runner_up as string,
      payoutRunnerUp: r.payout_runner_up as number | null,
      totalStake: stakeChampion + stakeRunnerUp,
      createdAt: r.created_at as string,
      resolvedAt: r.resolved_at as string | null,
    };
  });

  const sortSummary = (m: Map<number, TournamentPredictionPickSummary>) =>
    [...m.values()].sort((a, b) => b.totalStake - a.totalStake);

  return {
    tournament: { id: t.id as number, slug: t.slug as string, title: t.title as string },
    entries,
    summary: {
      champion: sortSummary(champTotals),
      runnerUp: sortSummary(ruTotals),
      totalEntries: entries.length,
      totalStaked: entries.reduce((s, e) => s + e.totalStake, 0),
    },
  };
}

/** Champion = final winner; runner-up = other finalist (loser of final). */
export async function resolveTournamentChampionRunnerUp(
  tournamentId: number
): Promise<{ championParticipantId: number; runnerUpParticipantId: number } | null> {
  if (!supabase) return null;
  const { data: t } = await supabase
    .from("tournaments")
    .select("id, qf_qual_feed, bracket_size")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!t) return null;
  const { data: parts } = await supabase
    .from("tournament_participants")
    .select("id, seed_rank, display_name, team_json")
    .eq("tournament_id", tournamentId);
  const { data: results } = await supabase
    .from("tournament_match_results")
    .select("match_key, winner_participant_id")
    .eq("tournament_id", tournamentId);
  const bracket = buildBracketView(
    (parts ?? []) as ParticipantRow[],
    (results ?? []) as { match_key: string; winner_participant_id: number | null }[],
    {
      qfQualFeed: (t as { qf_qual_feed?: unknown }).qf_qual_feed,
      bracketSize: Number((t as { bracket_size?: unknown }).bracket_size) === 8 ? 8 : 12,
    }
  );
  const res = new Map<string, number | null>();
  for (const r of results ?? []) {
    res.set(r.match_key as string, r.winner_participant_id as number | null);
  }
  const wsf0 = getWinner(res, "sf-0");
  const wsf1 = getWinner(res, "sf-1");
  const finalWinner = getWinner(res, "final");
  if (!wsf0 || !wsf1 || !finalWinner) return null;
  const runnerUp = finalWinner === wsf0 ? wsf1 : wsf0;
  if (!runnerUp) return null;
  return { championParticipantId: finalWinner, runnerUpParticipantId: runnerUp };
}

async function creditCobbledollars(
  userId: number,
  amount: number,
  kind: string,
  detail: string
): Promise<void> {
  if (!supabase || amount <= 0) return;
  const { data: sel } = await supabase
    .from("user_currency")
    .select("id, balance")
    .eq("user_id", userId)
    .eq("currency_type", COBBLEDOLLARS)
    .limit(1)
    .maybeSingle();
  const now = new Date().toISOString();
  let newBalance = amount;
  if (sel) {
    newBalance = (sel as { balance: number }).balance + amount;
    await supabase
      .from("user_currency")
      .update({ balance: newBalance, updated_at: now })
      .eq("id", (sel as { id: number }).id);
  } else {
    await supabase.from("user_currency").insert({
      user_id: userId,
      currency_type: COBBLEDOLLARS,
      balance: amount,
    });
  }
  await supabase.from("user_cobbledollar_ledger").insert({
    user_id: userId,
    delta: amount,
    balance_after: newBalance,
    kind,
    detail,
  });
}

/** Settle pending predictions after final is decided. Idempotent per line (pending only). */
export async function resolveTournamentPredictionsForTournament(
  tournamentId: number
): Promise<{ settled: number; wins: number }> {
  if (!supabase) return { settled: 0, wins: 0 };
  const outcome = await resolveTournamentChampionRunnerUp(tournamentId);
  if (!outcome) return { settled: 0, wins: 0 };

  const settings = await loadTournamentPredictionSettings();
  const champMult = Number(settings?.champion_win_multiplier ?? 2);
  const ruMult = Number(settings?.runner_up_win_multiplier ?? 2);

  const { data: pending, error } = await supabase
    .from("tournament_predictions")
    .select(
      "id, user_id, stake_champion, pick_champion_participant_id, stake_runner_up, pick_runner_up_participant_id, result_champion, result_runner_up"
    )
    .eq("tournament_id", tournamentId)
    .or("result_champion.eq.pending,result_runner_up.eq.pending");
  if (error || !pending?.length) return { settled: 0, wins: 0 };

  let settled = 0;
  let wins = 0;
  const nowIso = new Date().toISOString();

  for (const row of pending as Array<{
    id: number;
    user_id: number;
    stake_champion: number;
    stake_runner_up: number;
    pick_champion_participant_id: number | null;
    pick_runner_up_participant_id: number | null;
    result_champion: string;
    result_runner_up: string;
  }>) {
    let payoutChampion = 0;
    let payoutRunnerUp = 0;
    let resultChampion = row.result_champion;
    let resultRunnerUp = row.result_runner_up;

    if (row.result_champion === "pending" && row.stake_champion > 0) {
      const won =
        row.pick_champion_participant_id === outcome.championParticipantId;
      resultChampion = won ? "won" : "lost";
      if (won) payoutChampion = Math.floor(row.stake_champion * champMult);
    }
    if (row.result_runner_up === "pending" && row.stake_runner_up > 0) {
      const won =
        row.pick_runner_up_participant_id === outcome.runnerUpParticipantId;
      resultRunnerUp = won ? "won" : "lost";
      if (won) payoutRunnerUp = Math.floor(row.stake_runner_up * ruMult);
    }

    const { data: locked } = await supabase
      .from("tournament_predictions")
      .update({
        result_champion: resultChampion,
        result_runner_up: resultRunnerUp,
        payout_champion: payoutChampion || null,
        payout_runner_up: payoutRunnerUp || null,
        resolved_at: nowIso,
      })
      .eq("id", row.id)
      .select("id");
    if (!locked?.length) continue;
    settled++;
    const totalPayout = payoutChampion + payoutRunnerUp;
    if (totalPayout > 0) {
      wins++;
      await creditCobbledollars(
        row.user_id,
        totalPayout,
        "tournament_prediction_win",
        `Tournament predict · tournament #${tournamentId} · +${totalPayout}`
      );
    }
  }
  return { settled, wins };
}

type RouteDeps = {
  requireAuth: (req: Request, res: Response, next: () => void) => void;
  requireAdmin: (req: Request, res: Response, next: () => void) => void;
  ensureUserCobbledollarsRow: (userId: number) => Promise<{ id: number; balance: number } | null>;
  recordCobbledollarLedger: (
    userId: number,
    delta: number,
    balanceAfter: number,
    kind: string,
    detail: string | null
  ) => Promise<void>;
};

export function registerTournamentPredictionRoutes(app: Express, deps: RouteDeps): void {
  const { requireAuth, requireAdmin, ensureUserCobbledollarsRow, recordCobbledollarLedger } =
    deps;

  app.get("/admin/tournament-prediction/settings", requireAuth, requireAdmin, async (_req, res) => {
    if (!supabase) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    const settings = await loadTournamentPredictionSettings();
    let tournament: { id: number; slug: string; title: string } | null = null;
    if (settings?.tournament_id) {
      const { data: t } = await supabase
        .from("tournaments")
        .select("id, slug, title")
        .eq("id", settings.tournament_id)
        .maybeSingle();
      if (t) tournament = t as { id: number; slug: string; title: string };
    }
    const { data: tournaments } = await supabase
      .from("tournaments")
      .select("id, slug, title, is_published")
      .order("updated_at", { ascending: false });
    res.json({
      settings: settings
        ? {
            tournamentId: settings.tournament_id,
            predictionsLockedAt: settings.predictions_locked_at,
            maxStake: settings.max_stake,
            minStake: settings.min_stake,
            championWinMultiplier: Number(settings.champion_win_multiplier),
            runnerUpWinMultiplier: Number(settings.runner_up_win_multiplier),
          }
        : null,
      tournament,
      tournaments: tournaments ?? [],
    });
  });

  app.put("/admin/tournament-prediction/settings", requireAuth, requireAdmin, async (req, res) => {
    if (!supabase) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    const body = req.body ?? {};
    const tournamentIdRaw = body.tournamentId;
    const tournamentId =
      tournamentIdRaw === null || tournamentIdRaw === "" || tournamentIdRaw === undefined
        ? null
        : Number(tournamentIdRaw);
    if (tournamentId != null && !Number.isFinite(tournamentId)) {
      res.status(400).json({ error: "Invalid tournament id" });
      return;
    }
    if (tournamentId != null) {
      const { data: t } = await supabase.from("tournaments").select("id").eq("id", tournamentId).maybeSingle();
      if (!t) {
        res.status(400).json({ error: "Tournament not found" });
        return;
      }
    }
    const maxStake = Number(body.maxStake);
    const minStake = Number(body.minStake ?? 100);
    if (!Number.isInteger(maxStake) || maxStake < 1) {
      res.status(400).json({ error: "maxStake must be a positive integer" });
      return;
    }
    if (!Number.isInteger(minStake) || minStake < 1 || minStake > maxStake) {
      res.status(400).json({ error: "minStake must be between 1 and maxStake" });
      return;
    }
    let predictionsLockedAt: string | null = null;
    if (body.predictionsLockedAt != null && String(body.predictionsLockedAt).trim() !== "") {
      const d = new Date(String(body.predictionsLockedAt));
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ error: "Invalid predictionsLockedAt" });
        return;
      }
      predictionsLockedAt = d.toISOString();
    }
    const championWinMultiplier = Number(body.championWinMultiplier ?? 2);
    const runnerUpWinMultiplier = Number(body.runnerUpWinMultiplier ?? 2);
    if (championWinMultiplier <= 0 || runnerUpWinMultiplier <= 0) {
      res.status(400).json({ error: "Win multipliers must be positive" });
      return;
    }
    const { error } = await supabase.from("tournament_prediction_settings").upsert({
      id: SETTINGS_ID,
      tournament_id: tournamentId,
      predictions_locked_at: predictionsLockedAt,
      max_stake: maxStake,
      min_stake: minStake,
      champion_win_multiplier: championWinMultiplier,
      runner_up_win_multiplier: runnerUpWinMultiplier,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ ok: true });
  });

  app.get("/admin/tournament-prediction/bets", requireAuth, requireAdmin, async (req, res) => {
    if (!supabase) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    let tournamentId = parseInt(String(req.query.tournamentId ?? ""), 10);
    if (!Number.isFinite(tournamentId)) {
      const settings = await loadTournamentPredictionSettings();
      tournamentId = settings?.tournament_id ?? NaN;
    }
    if (!Number.isFinite(tournamentId)) {
      res.status(400).json({ error: "tournamentId required" });
      return;
    }
    try {
      const payload = await loadTournamentPredictionBetsForTournament(tournamentId);
      if (!payload) {
        res.status(404).json({ error: "Tournament not found" });
        return;
      }
      res.json(payload);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load bets" });
    }
  });

  /** All bets for the active prediction tournament (public read). */
  app.get("/user/tournament-prediction/ledger", async (req, res) => {
    if (!supabase) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    const settings = await loadTournamentPredictionSettings();
    if (!settings?.tournament_id) {
      res.json({ active: false, entries: [], summary: null, tournament: null });
      return;
    }
    try {
      const payload = await loadTournamentPredictionBetsForTournament(settings.tournament_id);
      if (!payload) {
        res.json({ active: false, entries: [], summary: null, tournament: null });
        return;
      }
      res.json({ active: true, ...payload });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load ledger" });
    }
  });

  app.get("/user/tournament-prediction/history", requireAuth, async (req, res) => {
    const user = res.locals.user!;
    if (!supabase) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    const settings = await loadTournamentPredictionSettings();
    const activeTournamentId = settings?.tournament_id ?? null;

    const { data: rows, error } = await supabase
      .from("tournament_predictions")
      .select(
        "id, tournament_id, stake_champion, pick_champion_participant_id, stake_runner_up, pick_runner_up_participant_id, result_champion, result_runner_up, payout_champion, payout_runner_up, created_at, resolved_at"
      )
      .eq("user_id", user.userId)
      .order("created_at", { ascending: false });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    const list = rows ?? [];
    if (list.length === 0) {
      res.json({ history: [] });
      return;
    }

    const tournamentIds = [...new Set(list.map((r) => r.tournament_id as number))];
    const partIds = new Set<number>();
    for (const r of list) {
      const c = r.pick_champion_participant_id as number | null;
      const ru = r.pick_runner_up_participant_id as number | null;
      if (c != null) partIds.add(c);
      if (ru != null) partIds.add(ru);
    }

    const tournamentMap = new Map<number, { title: string; slug: string }>();
    const { data: tournaments } = await supabase
      .from("tournaments")
      .select("id, title, slug")
      .in("id", tournamentIds);
    for (const t of tournaments ?? []) {
      tournamentMap.set(t.id as number, {
        title: String(t.title ?? "Tournament"),
        slug: String(t.slug ?? ""),
      });
    }

    const partMap = new Map<number, string>();
    if (partIds.size > 0) {
      const { data: parts } = await supabase
        .from("tournament_participants")
        .select("id, seed_rank, display_name")
        .in("id", [...partIds]);
      for (const p of parts ?? []) {
        partMap.set(
          p.id as number,
          `#${p.seed_rank} ${String(p.display_name ?? "")}`.trim()
        );
      }
    }

    const labelPart = (id: number | null): string | null => {
      if (id == null) return null;
      return partMap.get(id) ?? `#${id}`;
    };

    const history = list.map((r) => {
      const tournamentId = r.tournament_id as number;
      const tMeta = tournamentMap.get(tournamentId);
      const stakeChampion = Number(r.stake_champion) || 0;
      const stakeRunnerUp = Number(r.stake_runner_up) || 0;
      return {
        id: r.id as number,
        tournamentId,
        tournamentTitle: tMeta?.title ?? `Tournament #${tournamentId}`,
        tournamentSlug: tMeta?.slug ?? "",
        isCurrentEvent: activeTournamentId != null && tournamentId === activeTournamentId,
        stakeChampion,
        pickChampionLabel: labelPart(r.pick_champion_participant_id as number | null),
        resultChampion: r.result_champion as string,
        payoutChampion: r.payout_champion as number | null,
        stakeRunnerUp,
        pickRunnerUpLabel: labelPart(r.pick_runner_up_participant_id as number | null),
        resultRunnerUp: r.result_runner_up as string,
        payoutRunnerUp: r.payout_runner_up as number | null,
        totalStake: stakeChampion + stakeRunnerUp,
        createdAt: r.created_at as string,
        resolvedAt: r.resolved_at as string | null,
      };
    });

    res.json({ history });
  });

  app.get("/user/tournament-prediction", requireAuth, async (req, res) => {
    const user = res.locals.user!;
    if (!supabase) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    const settings = await loadTournamentPredictionSettings();
    if (!settings?.tournament_id) {
      res.json({ active: false, windowOpen: false });
      return;
    }
    const tournamentId = settings.tournament_id;
    const windowOpen = isTournamentPredictionWindowOpen(settings);
    const { data: t } = await supabase
      .from("tournaments")
      .select("id, slug, title, subtitle, is_published")
      .eq("id", tournamentId)
      .maybeSingle();
    const { data: parts } = await supabase
      .from("tournament_participants")
      .select("id, seed_rank, display_name")
      .eq("tournament_id", tournamentId)
      .order("seed_rank");
    const outcome = await resolveTournamentChampionRunnerUp(tournamentId);
    const { data: entry } = await supabase
      .from("tournament_predictions")
      .select(
        "id, stake_champion, pick_champion_participant_id, stake_runner_up, pick_runner_up_participant_id, result_champion, result_runner_up, payout_champion, payout_runner_up, resolved_at"
      )
      .eq("user_id", user.userId)
      .eq("tournament_id", tournamentId)
      .maybeSingle();
    res.json({
      active: true,
      windowOpen,
      tournament: t
        ? {
            id: t.id,
            slug: t.slug,
            title: t.title,
            subtitle: t.subtitle,
          }
        : null,
      predictionsLockedAt: settings.predictions_locked_at,
      maxStake: settings.max_stake,
      minStake: settings.min_stake,
      championWinMultiplier: Number(settings.champion_win_multiplier),
      runnerUpWinMultiplier: Number(settings.runner_up_win_multiplier),
      participants: (parts ?? []).map((p) => ({
        id: p.id,
        seedRank: p.seed_rank,
        displayName: p.display_name,
      })),
      resultsReady: Boolean(outcome),
      championParticipantId: outcome?.championParticipantId ?? null,
      runnerUpParticipantId: outcome?.runnerUpParticipantId ?? null,
      entry: entry ?? null,
    });
  });

  app.post("/user/tournament-prediction", requireAuth, async (req, res) => {
    const user = res.locals.user!;
    if (!supabase) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    const settings = await loadTournamentPredictionSettings();
    if (!settings?.tournament_id) {
      res.status(400).json({ error: "Tournament predictions are not open." });
      return;
    }
    if (!isTournamentPredictionWindowOpen(settings)) {
      res.status(400).json({ error: "Prediction window is closed." });
      return;
    }
    const tournamentId = settings.tournament_id;
    const body = req.body ?? {};
    const parseStake = (v: unknown): number => {
      if (typeof v === "number" && Number.isInteger(v)) return v;
      if (typeof v === "string" && v.trim() !== "") {
        const n = parseInt(v.replace(/,/g, ""), 10);
        return Number.isInteger(n) ? n : NaN;
      }
      return 0;
    };
    const stakeChampion = parseStake(body.stakeChampion);
    const stakeRunnerUp = parseStake(body.stakeRunnerUp);
    const pickChampionId = Number(body.pickChampionParticipantId);
    const pickRunnerUpId = Number(body.pickRunnerUpParticipantId);
    const { min_stake: minStake, max_stake: maxStake } = settings;

    const validateStake = (s: number, label: string): string | null => {
      if (s === 0) return null;
      if (!Number.isInteger(s) || s < minStake || s > maxStake) {
        return `${label} must be 0 or ${minStake}–${maxStake} Cobble$`;
      }
      return null;
    };
    const err =
      validateStake(stakeChampion, "Champion stake") || validateStake(stakeRunnerUp, "Runner-up stake");
    if (err) {
      res.status(400).json({ error: err });
      return;
    }
    if (stakeChampion + stakeRunnerUp <= 0) {
      res.status(400).json({ error: "Stake at least one line (champion and/or runner-up)." });
      return;
    }
    if (stakeChampion > 0 && !Number.isFinite(pickChampionId)) {
      res.status(400).json({ error: "Pick a champion when champion stake > 0." });
      return;
    }
    if (stakeRunnerUp > 0 && !Number.isFinite(pickRunnerUpId)) {
      res.status(400).json({ error: "Pick a runner-up when runner-up stake > 0." });
      return;
    }
    if (
      stakeChampion > 0 &&
      stakeRunnerUp > 0 &&
      pickChampionId === pickRunnerUpId
    ) {
      res.status(400).json({ error: "Champion and runner-up must be different players." });
      return;
    }

    const { data: partRows } = await supabase
      .from("tournament_participants")
      .select("id")
      .eq("tournament_id", tournamentId);
    const allowed = new Set((partRows ?? []).map((p) => p.id as number));
    if (stakeChampion > 0 && !allowed.has(pickChampionId)) {
      res.status(400).json({ error: "Invalid champion pick for this tournament." });
      return;
    }
    if (stakeRunnerUp > 0 && !allowed.has(pickRunnerUpId)) {
      res.status(400).json({ error: "Invalid runner-up pick for this tournament." });
      return;
    }

    const wallet = await ensureUserCobbledollarsRow(user.userId);
    const totalStake = stakeChampion + stakeRunnerUp;
    if (!wallet || wallet.balance < totalStake) {
      res.status(400).json({
        error: "Not enough website Cobble$",
        balance: wallet?.balance ?? 0,
        required: totalStake,
      });
      return;
    }

    const { data: exists } = await supabase
      .from("tournament_predictions")
      .select("id")
      .eq("user_id", user.userId)
      .eq("tournament_id", tournamentId)
      .maybeSingle();
    if (exists) {
      res.status(409).json({ error: "You already submitted predictions for this tournament." });
      return;
    }

    const newBalance = wallet.balance - totalStake;
    const now = new Date().toISOString();
    const { data: updated, error: updErr } = await supabase
      .from("user_currency")
      .update({ balance: newBalance, updated_at: now })
      .eq("id", wallet.id)
      .eq("balance", wallet.balance)
      .select("balance");
    if (updErr) {
      res.status(500).json({ error: updErr.message });
      return;
    }
    if (!updated?.length) {
      res.status(409).json({ error: "Balance changed — try again." });
      return;
    }

    const { error: insErr } = await supabase.from("tournament_predictions").insert({
      user_id: user.userId,
      tournament_id: tournamentId,
      stake_champion: stakeChampion,
      pick_champion_participant_id: stakeChampion > 0 ? pickChampionId : null,
      stake_runner_up: stakeRunnerUp,
      pick_runner_up_participant_id: stakeRunnerUp > 0 ? pickRunnerUpId : null,
      result_champion: stakeChampion > 0 ? "pending" : "skipped",
      result_runner_up: stakeRunnerUp > 0 ? "pending" : "skipped",
    });
    if (insErr) {
      await supabase
        .from("user_currency")
        .update({ balance: wallet.balance, updated_at: now })
        .eq("id", wallet.id);
      if (/duplicate|uq_tournament_predictions/i.test(insErr.message)) {
        res.status(409).json({ error: "You already submitted predictions for this tournament." });
        return;
      }
      res.status(500).json({ error: insErr.message });
      return;
    }

    await recordCobbledollarLedger(
      user.userId,
      -totalStake,
      newBalance,
      "tournament_prediction_stake",
      `Tournament predict · #${tournamentId} · staked ${totalStake}`
    );
    res.json({ ok: true, newBalance, tournamentId });
  });
}
