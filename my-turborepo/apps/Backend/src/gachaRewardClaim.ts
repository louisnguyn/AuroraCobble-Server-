/**
 * Map gacha reward_type text to Cobblemon /givepokemonother args.
 * Multi-word species: spaces are removed (e.g. "Chi Yu" → chiyu), not underscores.
 * Galarian forms: "meowth galar" → `meowth galarian` (space before regional) for Cobblemon.
 * Examples: "shiny mesprit" → mesprit + shiny; "pikachu" → pikachu.
 * Returns null for banners, tickets, or non-Pokémon labels.
 */
export function parseRewardForGivePokemon(
  rewardType: string
): { species: string; shiny: boolean } | null {
  const t = rewardType.trim().toLowerCase();
  let shiny = false;
  let rest = t;
  if (rest.startsWith("shiny ")) {
    shiny = true;
    rest = rest.slice(6).trim();
  }
  const block =
    /\b(banner|ticket|tickets|gems?|loot|currency|item bundle|bundle|voucher|pack)\b/i;
  if (!rest || block.test(rest)) return null;
  rest = rest.split(/\s*[–-]\s*/)[0] ?? rest;
  rest = rest.replace(/\s*\([^)]*\)\s*/g, "").trim();
  if (!rest || block.test(rest)) return null;
  let species = rest.replace(/\s+/g, "").replace(/[^a-z0-9_]/g, "");
  if (species.length < 2 || species.length > 40) return null;
  species = normalizeSpeciesForCobblemon(species);
  return { species, shiny };
}

/**
 * Cobblemon expects Galarian regional forms as two tokens: `meowth galarian`, not `meowthgalar` / `meowthgalarian`.
 * Reward text like "shiny meowth galar" collapses to meowthgalar — normalize before RCON.
 */
export function normalizeSpeciesForCobblemon(species: string): string {
  const s = species.trim().toLowerCase();
  const withSpaceBeforeRegional = (base: string): string => {
    const b = base.replace(/_/g, " ").replace(/\s+/g, " ").trim();
    return b.length >= 1 ? `${b} galarian` : "galarian";
  };
  if (/\s/.test(s) && /\bgalarian\b$/i.test(s)) {
    return s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  }
  if (s.endsWith("galarian")) {
    const base = s.slice(0, -"galarian".length);
    if (base.length >= 2) return withSpaceBeforeRegional(base);
    return s;
  }
  if (s.endsWith("_galar")) {
    return withSpaceBeforeRegional(s.slice(0, -"_galar".length));
  }
  if (s.endsWith("galar") && !s.endsWith("galarian")) {
    return withSpaceBeforeRegional(s.slice(0, -"galar".length));
  }
  return s;
}

/** Java-style IGN for online check (must match website username). */
export function isLikelyMinecraftUsername(name: string): boolean {
  return /^[a-zA-Z0-9_]{2,16}$/.test(name);
}

/**
 * Cobblemon: /givepokemonother — RCON without leading slash.
 * @see https://wiki.cobblemon.com/index.php/Commands
 * Override with MC_GACHA_CLAIM_COMMAND_TEMPLATE (placeholders: {player}, {species}, {shiny_suffix}).
 */
export function buildGivePokemonOtherCommand(
  playerName: string,
  species: string,
  shiny: boolean
): string {
  const normalizedSpecies = normalizeSpeciesForCobblemon(species);
  const template =
    process.env.MC_GACHA_CLAIM_COMMAND_TEMPLATE?.trim() ||
    "givepokemonother {player} {species}{shiny_suffix}";
  const shinySuffix = shiny ? " shiny" : "";
  return template
    .replace(/\{player\}/g, playerName)
    .replace(/\{species\}/g, normalizedSpecies)
    .replace(/\{shiny_suffix\}/g, shinySuffix);
}

export function isGachaClaimEnabled(): boolean {
  if (process.env.MC_GACHA_CLAIM_DISABLE === "true") return false;
  const host =
    process.env.MC_RCON_HOST?.trim() || process.env.MC_SERVER_HOST?.trim();
  const pass = process.env.MC_RCON_PASSWORD?.trim();
  return Boolean(host && pass);
}
