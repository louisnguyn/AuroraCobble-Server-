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
 * Cobblemon expects Galarian regional forms as two tokens: `moltres galarian`, not `moltresgalar`.
 * Reward text like "shiny meowth galar" or "Galarian Moltres" — normalize before RCON.
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
  if (s.startsWith("galarian")) {
    const base = s.slice("galarian".length);
    if (base.length >= 2) return withSpaceBeforeRegional(base);
    return s;
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

/**
 * Parse website Asteryn Coin reward labels for auto-credit.
 * Supported: `asterynpoints:<amount>` or legacy `cobbledollars:<amount>`
 * Example: `asterynpoints:5000`
 */
export function parseCobbledollarsReward(
  rewardType: string
): { amount: number } | null {
  const t = rewardType.trim().toLowerCase();
  const m = /^(?:asterynpoints|cobbledollars)\s*:\s*([0-9]{1,13})$/.exec(t);
  if (!m) return null;
  const amount = Number.parseInt(m[1] ?? "", 10);
  if (!Number.isInteger(amount) || amount < 1) return null;
  return { amount };
}

/** `item|{namespace:id}|{min}-{max}|{label}` or materialized `item|{id}|{n}|{label}`. */
const GACHA_ITEM_NAMESPACES = new Set(["cobblemon", "mega_showdown", "obc"]);

export type GachaItemReward = {
  itemId: string;
  min: number;
  max: number;
  label: string;
};

export type GachaCurrencyReward = {
  currencyType: string;
  amount: number;
  label: string;
};

function parseAmountRange(raw: string): { min: number; max: number } | null {
  const t = raw.trim();
  const range = /^([0-9]{1,3})-([0-9]{1,3})$/.exec(t);
  if (range) {
    const min = Number.parseInt(range[1] ?? "", 10);
    const max = Number.parseInt(range[2] ?? "", 10);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 64 || max < min) {
      return null;
    }
    return { min, max };
  }
  const n = Number.parseInt(t, 10);
  if (!Number.isInteger(n) || n < 1 || n > 64) return null;
  return { min: n, max: n };
}

export function parseGachaItemReward(rewardType: string): GachaItemReward | null {
  const parts = rewardType.trim().split("|");
  if (parts.length < 3 || parts[0] !== "item") return null;
  const itemId = (parts[1] ?? "").trim().toLowerCase();
  const ns = itemId.split(":")[0] ?? "";
  const path = itemId.split(":")[1] ?? "";
  if (!GACHA_ITEM_NAMESPACES.has(ns) || !/^[a-z0-9_]+$/.test(path)) return null;
  const range = parseAmountRange(parts[2] ?? "");
  if (!range) return null;
  const label = (parts[3] ?? path.replace(/_/g, " ")).trim() || path;
  return { itemId, min: range.min, max: range.max, label };
}

export function parseGachaCurrencyReward(rewardType: string): GachaCurrencyReward | null {
  const parts = rewardType.trim().split("|");
  if (parts.length < 3 || parts[0] !== "currency") return null;
  const currencyType = (parts[1] ?? "").trim().toLowerCase();
  if (!currencyType || currencyType.length > 64) return null;
  const range = parseAmountRange(parts[2] ?? "");
  if (!range) return null;
  const label = (parts[3] ?? currencyType).trim() || currencyType;
  return { currencyType, amount: range.min, label };
}

export function rollGachaItemAmount(item: GachaItemReward): number {
  if (item.min === item.max) return item.min;
  return item.min + Math.floor(Math.random() * (item.max - item.min + 1));
}

export function materializeGachaRewardType(template: string): string {
  const item = parseGachaItemReward(template);
  if (item) {
    const n = rollGachaItemAmount(item);
    return `item|${item.itemId}|${n}|${item.label}`;
  }
  return template.trim();
}

export function formatGachaRewardLabel(rewardType: string): string {
  const item = parseGachaItemReward(rewardType);
  if (item) {
    const n = item.min === item.max ? item.min : `${item.min}–${item.max}`;
    return `${item.label} ×${n}`;
  }
  const cur = parseGachaCurrencyReward(rewardType);
  if (cur) return `${cur.label} ×${cur.amount}`;
  const cobble = parseCobbledollarsReward(rewardType);
  if (cobble) return `Asteryn Coin +${cobble.amount.toLocaleString()}`;
  return rewardType.trim();
}

export function buildGiveItemCommand(playerName: string, itemId: string, amount: number): string {
  const template =
    process.env.INVENTORY_CLAIM_COMMAND_TEMPLATE?.trim() || "give {player} {item_id} {amount}";
  return template
    .replace(/\{player\}/g, playerName)
    .replace(/\{item_id\}/g, itemId)
    .replace(/\{amount\}/g, String(amount));
}

export function gachaRewardMatchKey(rewardType: string): string {
  const item = parseGachaItemReward(rewardType);
  if (item) return `item|${item.itemId}`;
  const cur = parseGachaCurrencyReward(rewardType);
  if (cur) return `currency|${cur.currencyType}`;
  return rewardType.trim().toLowerCase();
}
