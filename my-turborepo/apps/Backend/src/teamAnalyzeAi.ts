const MAX_PASTE_CHARS = 12_000;

const TEAM_ANALYSIS_SYSTEM_PROMPT = `Act as a professional competitive Pokémon analyst.

Format: VGC Set H doubles — bring 6, pick 4.

The user will send a Showdown / pokepaste-style team (up to six Pokémon). Analyse it in depth.

Your analysis must include:

1. Team Archetype
- Identify the playstyle (e.g. hyper offense, balance, trick room, weather, stall)
- Explain the win condition(s)

2. Synergy & Core
- Identify offensive and defensive cores
- Explain how Pokémon support each other (typing, abilities, speed control, etc.)

3. Strengths
- What does this team do well in high-level ranked play?
- Matchups it dominates

4. Weaknesses
- Key threats (meta Pokémon, strategies)
- Type weaknesses, speed issues, lack of coverage, etc.

5. Speed Control & Tempo
- Tailwind, Trick Room, priority, speed tiers
- Is the team fast enough for current meta?

6. Damage & Coverage
- Physical vs special balance
- Coverage against common threats

7. Improvements
- Suggest specific changes (moves, items, EVs, Pokémon replacements)
- Explain WHY each change improves the team

8. Matchup Guide
- How to play vs common meta archetypes
- Lead suggestions (especially for doubles: bring 6 pick 4, lead 2)

9. Skill Ceiling
- How difficult is this team to pilot?
- Mistake punishment level

Be brutally honest and think like a tournament-level player.

Use clear markdown: numbered sections matching the list above (## 1. Team Archetype, etc.), with bullets and **bold** for emphasis where helpful. If the paste is empty or has fewer than two Pokémon, say what is missing instead of fabricating sets. Base reasoning on the paste; note when EVs or exact spreads are unknown.`;

export type TeamAnalysisLanguage = "en" | "vi";

function buildSystemContent(lang: TeamAnalysisLanguage): string {
  const langBlock =
    lang === "vi"
      ? `

Ngôn ngữ đầu ra: Viết toàn bộ phân tích bằng tiếng Việt. Dùng tiếng Việt tự nhiên; tên Pokémon, chiêu (moves), item, ability giữ như trong paste hoặc cách gọi quen thuộc. Có thể giữ thuật ngữ meta tiếng Anh khi cần (ví dụ Trick Room, Tailwind, speed tier, meta, lead) nhưng phần giải thích phải là tiếng Việt. Giữ đúng cấu trúc 9 mục; tiêu đề từng mục nên dịch sang tiếng Việt (ví dụ "## 1. Vai trò & lối chơi đội") thay vì tiếng Anh.`
      : `

Output language: Write the entire analysis in English. Use the English section titles (## 1. Team Archetype, etc.).`;
  return TEAM_ANALYSIS_SYSTEM_PROMPT + langBlock;
}

function buildUserContent(lang: TeamAnalysisLanguage, paste: string): string {
  if (lang === "vi") {
    return `Phân tích đội hình sau một cách chuyên sâu:\n\n${paste}`;
  }
  return `Analyse the following team in depth:\n\n${paste}`;
}

export async function analyzeTeamPokepaste(
  pokepaste: string,
  options?: { language?: TeamAnalysisLanguage }
): Promise<{ text: string }> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const baseRaw = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
  const base = baseRaw.replace(/\/$/, "");

  const trimmed = pokepaste.trim().slice(0, MAX_PASTE_CHARS);
  const language: TeamAnalysisLanguage = options?.language === "vi" ? "vi" : "en";

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: buildSystemContent(language) },
        { role: "user", content: buildUserContent(language, trimmed) },
      ],
      max_tokens: 8192,
      temperature: 0.6,
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
