import { executeMinecraftRconCommand } from "./minecraftRconExecute.js";

export const DEFAULT_MINECRAFT_ROLE = "member";

/** Roles that cannot be bought with Cobble$; only staff grant or approved user request. */
export const GRANT_ONLY_ROLE_KEYS = new Set([
  "champion",
  "helper",
  "mod",
  "tiktok",
  "youtuber",
  "builder",
  "legend",
  "overlord",
  "god",
]);

/** Website perks tied to LuckPerms rank (shop discount, daily login streak extras). */
export type RoleWebsitePerks = {
  shopDiscountPercent: number;
  dailyFlatCobble: number;
  dailyTickets: number;
};

export type RoleCatalogEntry = {
  key: string;
  label: string;
  /** Cobble$ cost; omit if not purchasable */
  cost?: number;
  purchasable: boolean;
  perks: RoleWebsitePerks;
};

/** Cobble$ shop — NOOB through ULTIMATE; Legend+ above Ultimate are grant/request-only. */
const PURCHASABLE: { key: string; label: string; cost: number }[] = [
  { key: "noob", label: "NOOB", cost: 100_000 },
  { key: "elite", label: "ELITE", cost: 500_000 },
  { key: "pro", label: "PRO", cost: 1_000_000 },
  { key: "master", label: "MASTER", cost: 2_000_000 },
  { key: "ultimate", label: "ULTIMATE", cost: 3_000_000 },
];

const GRANT_ONLY_LABELS: Record<string, string> = {
  champion: "CHAMPION",
  helper: "HELPER",
  mod: "MOD",
  tiktok: "TIKTOK",
  youtuber: "YOUTUBER",
  builder: "BUILDER",
  legend: "LEGEND",
  ultimate: "ULTIMATE",
  overlord: "OVERLORD",
  god: "GOD",
};

/** Staff / partner grant-only ranks — same website shop discount as MASTER (15%). */
const GRANT_ONLY_FLAT_SHOP_DISCOUNT_15 = new Set([
  "champion",
  "helper",
  "mod",
  "tiktok",
  "youtuber",
  "builder",
]);

const ALL_KNOWN_KEYS = new Set<string>([
  DEFAULT_MINECRAFT_ROLE,
  ...PURCHASABLE.map((p) => p.key),
  ...GRANT_ONLY_ROLE_KEYS,
]);

export function isKnownRoleKey(key: string): boolean {
  return ALL_KNOWN_KEYS.has(normalizeRoleKey(key));
}

/** All configured LuckPerms group keys (for admin grant UI), `member` first. */
export function listAllKnownRoleKeys(): string[] {
  const arr = [...ALL_KNOWN_KEYS];
  arr.sort((a, b) => {
    if (a === DEFAULT_MINECRAFT_ROLE) return -1;
    if (b === DEFAULT_MINECRAFT_ROLE) return 1;
    return a.localeCompare(b);
  });
  return arr;
}

/**
 * Legacy name → canonical LuckPerms group key.
 * Only `youtube` → `youtuber` (never the reverse): LP must use `parent set youtuber`.
 */
const LEGACY_ROLE_KEY_ALIASES: Record<string, string> = {
  youtube: "youtuber",
};

export function normalizeRoleKey(key: string): string {
  const k = key.trim().toLowerCase();
  return LEGACY_ROLE_KEY_ALIASES[k] ?? k;
}

export function getPurchasableCost(roleKey: string): number | null {
  const k = normalizeRoleKey(roleKey);
  const row = PURCHASABLE.find((p) => p.key === k);
  return row ? row.cost : null;
}

/**
 * Percent off website Cobble$ shop (items + Pokémon shop).
 * Staff/special grant ranks (champion, helper, mod, tiktok, youtuber, builder): 15%.
 * Legend+ (grant-only): 18%–30%. Purchasable ranks: stepped up to MASTER 15%.
 */
export function getWebsiteShopDiscountPercent(roleKey: string): number {
  const k = normalizeRoleKey(roleKey);
  if (GRANT_ONLY_FLAT_SHOP_DISCOUNT_15.has(k)) return 15;
  const byRole: Record<string, number> = {
    [DEFAULT_MINECRAFT_ROLE]: 0,
    noob: 5,
    elite: 8,
    pro: 10,
    master: 15,
    legend: 21,
    ultimate: 18,
    overlord: 23,
    god: 25,
  };
  return byRole[k] ?? 0;
}

/**
 * Flat extra Cobble$ every daily claim (streak + this bonus), same idea as fixed PVP top payouts.
 * Staff/partner grant ranks: fixed daily stipend. Unknown keys → 0.
 */
export function getDailyLoginFlatCobbleBonusPerClaim(roleKey: string): number {
  const k = normalizeRoleKey(roleKey);
  const byRole: Record<string, number> = {
    [DEFAULT_MINECRAFT_ROLE]: 0,
    noob: 25_000,
    elite: 40_000,
    pro: 50_000,
    master: 75_000,
    helper: 90_000,
    mod: 100_000,
    champion: 95_000,
    tiktok: 65_000,
    youtuber: 65_000,
    legend: 120_000,
    ultimate: 100_000,
    overlord: 150_000,
    god: 200_000,
  };
  if (k in byRole) return byRole[k]!;
  if (GRANT_ONLY_FLAT_SHOP_DISCOUNT_15.has(k)) return 85_000;
  return 0;
}

/** Bonus normal website tickets on every successful daily claim (in addition to streak reward). */
export function getDailyLoginTicketBonusPerClaim(roleKey: string): number {
  const k = normalizeRoleKey(roleKey);
  if (GRANT_ONLY_FLAT_SHOP_DISCOUNT_15.has(k)) return 2;
  const byRole: Record<string, number> = {
    [DEFAULT_MINECRAFT_ROLE]: 0,
    noob: 0,
    elite: 1,
    pro: 1,
    master: 2,
    legend: 2,
    ultimate: 2,
    overlord: 3,
    god: 3,
  };
  return byRole[k] ?? 0;
}

export function getRoleWebsitePerks(roleKey: string): RoleWebsitePerks {
  return {
    shopDiscountPercent: getWebsiteShopDiscountPercent(roleKey),
    dailyFlatCobble: getDailyLoginFlatCobbleBonusPerClaim(roleKey),
    dailyTickets: getDailyLoginTicketBonusPerClaim(roleKey),
  };
}

export function getRoleCatalog(): {
  defaultRole: string;
  memberPerks: RoleWebsitePerks;
  purchasable: RoleCatalogEntry[];
  grantOnly: RoleCatalogEntry[];
} {
  const grantOnly: RoleCatalogEntry[] = [...GRANT_ONLY_ROLE_KEYS].map((key) => ({
    key,
    label: GRANT_ONLY_LABELS[key] ?? key.toUpperCase(),
    purchasable: false,
    perks: getRoleWebsitePerks(key),
  }));
  const purchasable: RoleCatalogEntry[] = PURCHASABLE.map((p) => ({
    key: p.key,
    label: p.label,
    cost: p.cost,
    purchasable: true,
    perks: getRoleWebsitePerks(p.key),
  }));
  return {
    defaultRole: DEFAULT_MINECRAFT_ROLE,
    memberPerks: getRoleWebsitePerks(DEFAULT_MINECRAFT_ROLE),
    purchasable,
    grantOnly,
  };
}

export function buildLuckpermsParentSetCommand(minecraftUsername: string, roleKey: string): string {
  const user = minecraftUsername.trim();
  const role = normalizeRoleKey(roleKey);
  const tpl =
    process.env.MC_LUCKPERMS_PARENT_COMMAND_TEMPLATE?.trim() ||
    "lp user {username} parent set {role}";
  return tpl.replace(/\{username\}/g, user).replace(/\{role\}/g, role);
}

/**
 * Runs LuckPerms on the Minecraft server (RCON). Command has no leading slash.
 */
export async function runLuckpermsParentSet(
  minecraftUsername: string,
  roleKey: string
): Promise<{ ok: true; output: string } | { ok: false; error: string }> {
  const cmd = buildLuckpermsParentSetCommand(minecraftUsername, roleKey);
  return executeMinecraftRconCommand(cmd);
}
