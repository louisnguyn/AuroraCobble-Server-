import { flattenBattleLogLines, humanizeBattleLogLines, type BattleReplayPlayerRef } from "./battleReplayHumanize.js";

const MAX_RAW_LOG_CHARS = 14_000;
const MAX_HUMAN_LINES = 220;

const REPLAY_SUMMARY_SYSTEM = `You are a competitive Pokémon VGC / Smogon singles & doubles player reviewing a finished ranked match from a Pokémon Showdown–style log.

You will receive match metadata, rosters, a humanized timeline, and a raw log tail. Infer only what the log supports.

Write **short markdown only**. Do **not** write battle narratives, turn-by-turn stories, or long paragraphs.

## Required output (exactly these two sections)

### Pokémon remaining
For **each trainer** (use their display name and winner/loser if known), state on one line:
- **How many Pokémon are still standing** at battle end (not fainted — includes benched mons that never entered if they were never KO'd).
- Optionally add species names in parentheses if clear from the log.
- If unclear, say "uncertain" and give your best count.

Use faint/switch/win events. **Infer team size from the match** — do not assume 6:
- Read \`format\` / \`gametype\` in metadata (singles, doubles, 2v2singles, etc.).
- Cobblemon ranked often uses **bring 6, pick 3** (singles) or **pick 4** (doubles) — only count mons that were in the battle roster, not a full PC box.
- Full 6v6 formats use up to 6 per side; doubles has 2 active slots (p1a/p1b, p2a/p2b).
- Use \`|teamsize|\` lines and switch/faint events; count only Pokémon that belonged to that trainer's team in this match.

### ELO buffing
Ranked ELO should reflect a **fair, competitive** game. Estimate what **percent of this match counts as "ELO buffing"** (0–100%): inflating or devaluing ELO because the game was not a normal competitive battle.

**0%** = normal competitive match (clean win/loss, reasonable length, genuine play).
**Higher %** = more "buffed" / less legitimate for ELO, e.g.:
- Early forfeit or surrender (especially turn 1–3 with little or no damage)
- Disconnect / timeout / idle loss
- Excessive stalling: repeated Protect, Substitute camping, intentional slow play, "câu giờ" / running clock without progressing the game
- One-sided stomp with almost no interaction (optional small bump only if combined with very few turns)
- Obvious non-game (both players not trying)

Output format:
- **ELO buffing: X%** (single number, 0–100)
- **Verdict:** Not ELO-buffing / Slightly ELO-buffing / ELO-buffing (pick one; "Not" if ≤15%, "Slightly" if 16–40%, "ELO-buffing" if >40%)
- **Why:** 1–2 short sentences max — cite specific evidence from the log (e.g. "forfeit on turn 2", "Protect used 6+ times with no KOs until turn 12").

Be conservative: a normal-length win with real KOs and switches is **not** ELO-buffing unless stall/forfeit/disconnect signals are present — regardless of singles, doubles, or 2v2 singles.

Total response: under 12 lines. No other sections.`;

export type SanitizedReplayForAi = {
  format?: string;
  endReason?: string;
  turnCount?: number;
  timestamp?: string;
  matchId?: string;
  players: BattleReplayPlayerRef[];
  battleLog: unknown;
};

export function sanitizeReplayForAi(body: unknown): { ok: true; replay: SanitizedReplayForAi } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid replay" };
  const o = body as Record<string, unknown>;
  const playersRaw = o.players;
  const players: BattleReplayPlayerRef[] = [];
  if (Array.isArray(playersRaw)) {
    for (const p of playersRaw) {
      if (!p || typeof p !== "object") continue;
      const q = p as Record<string, unknown>;
      const teamR = q.team;
      let team: string[] | undefined;
      if (Array.isArray(teamR)) {
        team = teamR.filter((x): x is string => typeof x === "string").slice(0, 12).map((s) => s.slice(0, 60));
      }
      players.push({
        playerName: typeof q.playerName === "string" ? q.playerName.slice(0, 80) : undefined,
        uuid: typeof q.uuid === "string" ? q.uuid.slice(0, 80) : undefined,
        team,
        isWinner: typeof q.isWinner === "boolean" ? q.isWinner : undefined,
      });
    }
  }
  return {
    ok: true,
    replay: {
      format: typeof o.format === "string" ? o.format.slice(0, 120) : undefined,
      endReason: typeof o.endReason === "string" ? o.endReason.slice(0, 200) : undefined,
      turnCount: typeof o.turnCount === "number" && Number.isFinite(o.turnCount) ? Math.trunc(o.turnCount) : undefined,
      timestamp: typeof o.timestamp === "string" ? o.timestamp.slice(0, 80) : undefined,
      matchId: typeof o.matchId === "string" ? o.matchId.slice(0, 120) : undefined,
      players,
      battleLog: o.battleLog,
    },
  };
}

function buildUserMessage(replay: SanitizedReplayForAi): string {
  const meta = [
    `format: ${replay.format ?? "(unknown)"}`,
    `turns: ${replay.turnCount != null ? replay.turnCount : "(unknown)"}`,
    `end: ${replay.endReason ?? "(unknown)"}`,
    `matchId: ${replay.matchId ?? "(none)"}`,
    `timestamp: ${replay.timestamp ?? "(none)"}`,
  ].join("\n");

  const roster = replay.players
    .map((p, i) => {
      const name = (p.playerName ?? `Player_${i + 1}`).trim();
      const won = p.isWinner === true ? "winner" : p.isWinner === false ? "loser" : "unknown";
      const team = Array.isArray(p.team) && p.team.length ? p.team.join(", ") : "(no team preview in payload)";
      return `- ${name} (${won}): ${team}`;
    })
    .join("\n");

  const lines = flattenBattleLogLines(replay.battleLog);
  const joined = lines.join("\n");
  let rawTail = joined;
  if (rawTail.length > MAX_RAW_LOG_CHARS) rawTail = rawTail.slice(-MAX_RAW_LOG_CHARS);

  let humanLines = humanizeBattleLogLines(lines, replay.players);
  let humanTruncNote = "";
  if (humanLines.length > MAX_HUMAN_LINES) {
    const drop = humanLines.length - MAX_HUMAN_LINES;
    humanLines = humanLines.slice(-MAX_HUMAN_LINES);
    humanTruncNote = `\n(…${drop} earlier humanized lines omitted…)\n`;
  }

  const humanBlock = humanLines.length ? humanTruncNote + humanLines.map((x, idx) => `${idx + 1}. ${x}`).join("\n") : "(no parseable timeline)";

  return `## Metadata
${meta}

## Rosters / trainer names
${roster.length ? roster : "(no players listed)"}

## Humanized timeline
${humanBlock}

## Raw log tail (Showdown protocol, truncated if long)
${rawTail.trim() ? rawTail : "(empty)"}
`;
}

export async function summarizeBattleReplayWithOpenAI(replay: SanitizedReplayForAi): Promise<{ text: string }> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const baseRaw = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
  const base = baseRaw.replace(/\/$/, "");

  const userMessage = buildUserMessage(replay);
  if (userMessage.length > 100_000) {
    throw new Error("replay_context_too_large");
  }

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: REPLAY_SUMMARY_SYSTEM },
        { role: "user", content: userMessage },
      ],
      max_tokens: 512,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`openai_http_${res.status}:${errText.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("openai_empty_response");

  return { text };
}
