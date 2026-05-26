import type { Express, Request, Response } from "express";
import { supabase } from "./supabase.js";
import { parsePokepaste } from "./pokepasteParse.js";
import {
  buildBracketView,
  DEFAULT_QF_QUAL_FEED,
  normalizeQfQualFeed,
  parseBracketSize,
  type BracketSizeMode,
  type BuiltMatch,
  type ParticipantRow,
} from "./tournamentBracket.js";
import { resolveTournamentPredictionsForTournament } from "./tournamentPrediction.js";

function qfFeedFromRow(t: { qf_qual_feed?: unknown } | null | undefined): [number, number, number, number] {
  return normalizeQfQualFeed(t?.qf_qual_feed) ?? ([...DEFAULT_QF_QUAL_FEED] as [number, number, number, number]);
}

function bracketSizeFromRow(t: { bracket_size?: unknown } | null | undefined): BracketSizeMode {
  return parseBracketSize(t?.bracket_size);
}

function paramStr(v: string | string[] | undefined): string {
  if (v == null) return "";
  return Array.isArray(v) ? String(v[0] ?? "") : String(v);
}

function requireSupabase(res: Response): boolean {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return false;
  }
  return true;
}

function contestantIds(m: BuiltMatch): [number, number] | null {
  if (m.left.kind !== "participant" || m.right.kind !== "participant") return null;
  return [m.left.id, m.right.id];
}

export function registerTournamentRoutes(
  app: Express,
  deps: {
    requireAuth: (req: Request, res: Response, next: () => void) => void;
    requireAdmin: (req: Request, res: Response, next: () => void) => void;
  }
): void {
  const { requireAuth, requireAdmin } = deps;

  app.post("/admin/tournaments/parse-pokepaste", requireAuth, requireAdmin, (req, res) => {
    const raw = typeof (req.body ?? {}).raw === "string" ? (req.body as { raw: string }).raw : "";
    if (!raw.trim()) {
      res.status(400).json({ error: "raw pokepaste text required" });
      return;
    }
    const team = parsePokepaste(raw);
    res.json({ team, count: team.length });
  });

  app.get("/admin/tournaments", requireAuth, requireAdmin, async (_req, res) => {
    if (!requireSupabase(res)) return;
    const { data, error } = await supabase!
      .from("tournaments")
      .select("id, slug, title, subtitle, prizes, is_published, bracket_size, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ tournaments: data ?? [] });
  });

  app.post("/admin/tournaments", requireAuth, requireAdmin, async (req, res) => {
    if (!requireSupabase(res)) return;
    const body = req.body ?? {};
    const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-") : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!slug || !title) {
      res.status(400).json({ error: "slug and title required" });
      return;
    }
    const subtitle = typeof body.subtitle === "string" ? body.subtitle.trim() : null;
    const prizes = Array.isArray(body.prizes) ? body.prizes : [];
    const is_published = Boolean(body.is_published);
    const bracket_size = parseBracketSize((body as { bracket_size?: unknown }).bracket_size);
    const now = new Date().toISOString();
    const qfRaw = (body as { qf_qual_feed?: unknown }).qf_qual_feed;
    const qfNorm = normalizeQfQualFeed(qfRaw);
    if (qfRaw != null && qfNorm == null) {
      res.status(400).json({ error: "qf_qual_feed must be four distinct integers 0–3" });
      return;
    }

    const { data, error } = await supabase!
      .from("tournaments")
      .insert({
        slug,
        title,
        subtitle,
        prizes,
        is_published,
        bracket_size,
        ...(qfNorm != null ? { qf_qual_feed: qfNorm } : {}),
        updated_at: now,
      })
      .select("id, slug, title, subtitle, prizes, is_published, bracket_size")
      .single();
    if (error) {
      if (/duplicate key/i.test(error.message)) {
        res.status(400).json({ error: "Slug already exists" });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ tournament: data });
  });

  app.patch("/admin/tournaments/:id", requireAuth, requireAdmin, async (req, res) => {
    if (!requireSupabase(res)) return;
    const id = parseInt(paramStr(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = req.body ?? {};
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.title === "string") patch.title = body.title.trim();
    if (typeof body.subtitle === "string") patch.subtitle = body.subtitle.trim();
    if (Array.isArray(body.prizes)) patch.prizes = body.prizes;
    if (typeof body.is_published === "boolean") patch.is_published = body.is_published;
    if ("bracket_size" in body) {
      patch.bracket_size = parseBracketSize((body as { bracket_size?: unknown }).bracket_size);
    }
    if ("qf_qual_feed" in body) {
      const qfNorm = normalizeQfQualFeed((body as { qf_qual_feed?: unknown }).qf_qual_feed);
      if (qfNorm == null) {
        res.status(400).json({ error: "qf_qual_feed must be four distinct integers 0–3" });
        return;
      }
      patch.qf_qual_feed = qfNorm;
    }
    const { data, error } = await supabase!.from("tournaments").update(patch).eq("id", id).select().single();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ tournament: data });
  });

  app.put("/admin/tournaments/:id/participants/:seedRank", requireAuth, requireAdmin, async (req, res) => {
    if (!requireSupabase(res)) return;
    const tournamentId = parseInt(paramStr(req.params.id), 10);
    const seedRank = parseInt(paramStr(req.params.seedRank), 10);
    const { data: tMeta } = await supabase!
      .from("tournaments")
      .select("bracket_size")
      .eq("id", tournamentId)
      .maybeSingle();
    const maxSeed = bracketSizeFromRow(tMeta);
    if (!Number.isFinite(tournamentId) || !Number.isFinite(seedRank) || seedRank < 1 || seedRank > maxSeed) {
      res.status(400).json({ error: `Invalid tournament id or seed (1–${maxSeed} for this bracket)` });
      return;
    }
    const body = req.body ?? {};
    const display_name = typeof body.display_name === "string" ? body.display_name.trim() : "";
    if (!display_name) {
      res.status(400).json({ error: "display_name required" });
      return;
    }
    const pokepaste_raw = typeof body.pokepaste_raw === "string" ? body.pokepaste_raw : "";
    const team = parsePokepaste(pokepaste_raw);
    const team_json = team;
    const now = new Date().toISOString();
    const { data, error } = await supabase!
      .from("tournament_participants")
      .upsert(
        {
          tournament_id: tournamentId,
          seed_rank: seedRank,
          display_name,
          pokepaste_raw: pokepaste_raw || null,
          team_json,
          updated_at: now,
        },
        { onConflict: "tournament_id,seed_rank" }
      )
      .select()
      .single();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ participant: data });
  });

  app.delete("/admin/tournaments/:id/participants/:seedRank", requireAuth, requireAdmin, async (req, res) => {
    if (!requireSupabase(res)) return;
    const tournamentId = parseInt(paramStr(req.params.id), 10);
    const seedRank = parseInt(paramStr(req.params.seedRank), 10);
    if (!Number.isFinite(tournamentId) || !Number.isFinite(seedRank)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const { error } = await supabase!
      .from("tournament_participants")
      .delete()
      .eq("tournament_id", tournamentId)
      .eq("seed_rank", seedRank);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ ok: true });
  });

  app.put("/admin/tournaments/:id/matches/:matchKey/winner", requireAuth, requireAdmin, async (req, res) => {
    if (!requireSupabase(res)) return;
    const tournamentId = parseInt(paramStr(req.params.id), 10);
    const matchKey = paramStr(req.params.matchKey).trim();
    const winnerRaw = (req.body as { winner_participant_id?: number })?.winner_participant_id;
    const winnerId =
      typeof winnerRaw === "number" && Number.isFinite(winnerRaw)
        ? winnerRaw
        : parseInt(String(winnerRaw ?? ""), 10);
    if (!Number.isFinite(tournamentId) || !matchKey) {
      res.status(400).json({ error: "Invalid tournament or match" });
      return;
    }
    if (!Number.isFinite(winnerId)) {
      res.status(400).json({ error: "winner_participant_id required" });
      return;
    }

    const { data: tRow } = await supabase!
      .from("tournaments")
      .select("qf_qual_feed, bracket_size")
      .eq("id", tournamentId)
      .maybeSingle();
    const { data: parts } = await supabase!
      .from("tournament_participants")
      .select("id, seed_rank, display_name, team_json")
      .eq("tournament_id", tournamentId);
    const { data: results } = await supabase!
      .from("tournament_match_results")
      .select("match_key, winner_participant_id")
      .eq("tournament_id", tournamentId);

    const participants = (parts ?? []) as ParticipantRow[];
    const bracket = buildBracketView(
      participants,
      (results ?? []) as { match_key: string; winner_participant_id: number | null }[],
      { qfQualFeed: tRow?.qf_qual_feed, bracketSize: bracketSizeFromRow(tRow) }
    );
    const m = bracket.find((x) => x.key === matchKey);
    if (!m) {
      res.status(404).json({ error: "Unknown match key" });
      return;
    }
    const pair = contestantIds(m);
    if (!pair) {
      res.status(400).json({ error: "Match is not ready (missing participants)" });
      return;
    }
    if (winnerId !== pair[0] && winnerId !== pair[1]) {
      res.status(400).json({ error: "Winner must be one of the two players in this match" });
      return;
    }

    const now = new Date().toISOString();
    const { error: upErr } = await supabase!.from("tournament_match_results").upsert(
      {
        tournament_id: tournamentId,
        match_key: matchKey,
        winner_participant_id: winnerId,
        updated_at: now,
      },
      { onConflict: "tournament_id,match_key" }
    );
    if (upErr) {
      res.status(500).json({ error: upErr.message });
      return;
    }
    if (matchKey === "final") {
      void resolveTournamentPredictionsForTournament(tournamentId).catch((e) =>
        console.warn(
          "[tournament-prediction] resolve after final:",
          e instanceof Error ? e.message : e
        )
      );
    }
    res.json({ ok: true, matchKey, winner_participant_id: winnerId });
  });

  app.delete("/admin/tournaments/:id/matches/:matchKey/winner", requireAuth, requireAdmin, async (req, res) => {
    if (!requireSupabase(res)) return;
    const tournamentId = parseInt(paramStr(req.params.id), 10);
    const matchKey = paramStr(req.params.matchKey).trim();
    const { error } = await supabase!
      .from("tournament_match_results")
      .delete()
      .eq("tournament_id", tournamentId)
      .eq("match_key", matchKey);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ ok: true });
  });

  app.get("/admin/tournaments/:id/bracket", requireAuth, requireAdmin, async (req, res) => {
    if (!requireSupabase(res)) return;
    const tournamentId = parseInt(paramStr(req.params.id), 10);
    if (!Number.isFinite(tournamentId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const { data: t } = await supabase!.from("tournaments").select("*").eq("id", tournamentId).maybeSingle();
    if (!t) {
      res.status(404).json({ error: "Tournament not found" });
      return;
    }
    const { data: parts } = await supabase!
      .from("tournament_participants")
      .select("id, seed_rank, display_name, pokepaste_raw, team_json")
      .eq("tournament_id", tournamentId)
      .order("seed_rank");
    const { data: results } = await supabase!
      .from("tournament_match_results")
      .select("match_key, winner_participant_id")
      .eq("tournament_id", tournamentId);
    const bracket = buildBracketView(
      (parts ?? []) as ParticipantRow[],
      (results ?? []) as { match_key: string; winner_participant_id: number | null }[],
      {
        qfQualFeed: (t as { qf_qual_feed?: unknown }).qf_qual_feed,
        bracketSize: bracketSizeFromRow(t as { bracket_size?: unknown }),
      }
    );
    res.json({ tournament: t, participants: parts ?? [], bracket });
  });

  /** Public: list published brackets (for site dropdown). Must be registered before /tournaments/:slug */
  app.get("/tournaments", async (_req, res) => {
    if (!requireSupabase(res)) return;
    const { data, error } = await supabase!
      .from("tournaments")
      .select("slug, title, updated_at, bracket_size")
      .eq("is_published", true)
      .order("updated_at", { ascending: false });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    const rows = data ?? [];
    res.json({
      tournaments: rows.map((row) => ({
        slug: row.slug as string,
        title: row.title as string,
        updatedAt: row.updated_at as string,
        bracketSize: bracketSizeFromRow(row as { bracket_size?: unknown }),
      })),
    });
  });

  /** Public: published tournaments only */
  app.get("/tournaments/:slug", async (req, res) => {
    if (!requireSupabase(res)) return;
    const slug = paramStr(req.params.slug).trim().toLowerCase();
    if (!slug) {
      res.status(400).json({ error: "Invalid slug" });
      return;
    }
    const { data: t } = await supabase!
      .from("tournaments")
      .select("id, slug, title, subtitle, prizes, is_published, updated_at, qf_qual_feed, bracket_size")
      .eq("slug", slug)
      .maybeSingle();
    if (!t || !t.is_published) {
      res.status(404).json({ error: "Tournament not found" });
      return;
    }
    const tid = t.id as number;
    const { data: parts } = await supabase!
      .from("tournament_participants")
      .select("id, seed_rank, display_name, team_json")
      .eq("tournament_id", tid)
      .order("seed_rank");
    const { data: results } = await supabase!
      .from("tournament_match_results")
      .select("match_key, winner_participant_id")
      .eq("tournament_id", tid);
    const bracket = buildBracketView(
      (parts ?? []) as ParticipantRow[],
      (results ?? []) as { match_key: string; winner_participant_id: number | null }[],
      {
        qfQualFeed: (t as { qf_qual_feed?: unknown }).qf_qual_feed,
        bracketSize: bracketSizeFromRow(t as { bracket_size?: unknown }),
      }
    );
    res.json({
      tournament: {
        slug: t.slug,
        title: t.title,
        subtitle: t.subtitle,
        prizes: t.prizes,
        updatedAt: t.updated_at,
        qfQualFeed: qfFeedFromRow(t as { qf_qual_feed?: unknown }),
        bracketSize: bracketSizeFromRow(t as { bracket_size?: unknown }),
      },
      bracket,
    });
  });

  app.get("/tournaments/:slug/participants/:participantId", async (req, res) => {
    if (!requireSupabase(res)) return;
    const slug = paramStr(req.params.slug).trim().toLowerCase();
    const participantId = parseInt(paramStr(req.params.participantId), 10);
    if (!slug || !Number.isFinite(participantId)) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const { data: t } = await supabase!.from("tournaments").select("id, is_published").eq("slug", slug).maybeSingle();
    if (!t || !t.is_published) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { data: p } = await supabase!
      .from("tournament_participants")
      .select("id, seed_rank, display_name, team_json, pokepaste_raw")
      .eq("tournament_id", t.id)
      .eq("id", participantId)
      .maybeSingle();
    if (!p) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }
    res.json({
      participant: {
        id: p.id,
        seedRank: p.seed_rank,
        displayName: p.display_name,
        team: p.team_json,
      },
    });
  });

}
