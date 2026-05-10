import { flattenBattleLogLines, humanizeBattleLogLines, type BattleReplayPlayerRef } from "./battleReplayHumanize.js";

const MAX_RAW_LOG_CHARS = 14_000;
const MAX_HUMAN_LINES = 220;

const REPLAY_SUMMARY_SYSTEM = `You help Pokémon VGC / competitive doubles players understand a completed battle from a Pokémon Showdown–style log.

You will receive:
- Match metadata (format, turns, end reason)
- Each trainer's display name, whether they won, and their team preview (species names, if provided)
- A humanized turn-by-turn timeline (may be truncated at the start)
- A raw protocol log tail (may be truncated) for accuracy on faints and late-game switches

Write in clear markdown.

## Required sections

### 1. Battle summary
2–4 short paragraphs: overall flow, pace, major swing turns, win condition, anything notable (speed control, Trick Room/Tailwind, weather, Terra if visible).

### 2. Pokémon status by trainer
For **each trainer** listed, use bullet sub-lists:

- **Standing / not fainted**: species that appear to still be on the field or could still be swapped in unscathed **at battle end**. If doubles and unclear which two were active at the exact end, infer from the latest switches and faint events and say when uncertain.

- **Fainted**: species that clearly **were KO'd** during the battle. Map slot identifiers (p1a, p2b, …) using switch lines and previews when trainer names attach to slots.

If the log omits previews or truncates badly, say what is ambiguous instead of guessing species.

Avoid inventing Pokémon not supported by the log. Use canonical species names where shown.`;

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
      max_tokens: 3_096,
      temperature: 0.35,
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
