/**
 * Parse Showdown / PokePaste-style paste into structured team JSON.
 * Best-effort: first line "Species @ Item", Tera Type line, "- Move" lines.
 */

export type ParsedPokemon = {
  species: string;
  speciesSlug: string;
  item: string;
  ability: string | null;
  teraType: string | null;
  moves: string[];
  firstLine: string;
};

function speciesToSlug(speciesLine: string): string {
  let s = speciesLine.trim();
  const paren = s.indexOf(" (");
  if (paren >= 0) s = s.slice(0, paren).trim();
  return s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function parseOneBlock(block: string): ParsedPokemon | null {
  const lines = block.split(/\r?\n/).map((l) => l.trim());
  const first = lines[0];
  if (!first) return null;
  const atMatch = first.match(/^(.+?)\s+@\s*(.+)$/);
  if (!atMatch) return null;
  const speciesPart = atMatch[1]!.trim();
  const item = atMatch[2]!.trim();
  let ability: string | null = null;
  let teraType: string | null = null;
  const moves: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    const ab = line.match(/^Ability:\s*(.+)$/i);
    if (ab) {
      ability = ab[1]!.trim();
      continue;
    }
    const tt = line.match(/^Tera Type:\s*(.+)$/i);
    if (tt) {
      teraType = tt[1]!.trim();
      continue;
    }
    const mv = line.match(/^-\s*(.+)$/);
    if (mv) moves.push(mv[1]!.trim());
  }
  return {
    species: speciesPart,
    speciesSlug: speciesToSlug(speciesPart),
    item,
    ability,
    teraType,
    moves,
    firstLine: first,
  };
}

/** Split paste into Pokémon blocks (double newline, or before each "X @ Y" header). */
function splitBlocks(raw: string): string[] {
  const t = raw.replace(/\r\n/g, "\n").trim();
  if (!t) return [];
  const byDouble = t.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (byDouble.length > 1) return byDouble;
  const blocks: string[] = [];
  const lines = t.split("\n");
  let cur: string[] = [];
  const headerRe = /^[A-Za-z0-9][^\n@]*@[^\n]+$/;
  for (const line of lines) {
    if (headerRe.test(line.trim()) && cur.length > 0) {
      blocks.push(cur.join("\n"));
      cur = [line];
    } else {
      cur.push(line);
    }
  }
  if (cur.length) blocks.push(cur.join("\n"));
  return blocks.filter((b) => b.trim());
}

export function parsePokepaste(raw: string): ParsedPokemon[] {
  const blocks = splitBlocks(raw);
  const out: ParsedPokemon[] = [];
  for (const b of blocks) {
    const p = parseOneBlock(b);
    if (p) out.push(p);
  }
  return out;
}

/** pokepast.es requires CRLF; LF-only pastes break species parsing and sprites. */
export function normalizePasteForPokepaste(paste: string): string {
  return paste.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
}
