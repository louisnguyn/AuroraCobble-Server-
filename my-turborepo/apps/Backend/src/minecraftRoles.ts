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
  "god",
  "owner",
  "admin",
  "donator",
  "vip",
  "svip",
  "mvip",
  "uvip",
  "knight",
  "hero",
  "titan",
  "zeus",
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
  { key: "pro", label: "PRO", cost: 500_000 },
  { key: "master", label: "MASTER", cost: 500_000 },
  { key: "ultimate", label: "ULTIMATE", cost: 1_000_000 },
  { key: "onichan", label: "ONIICHAN", cost: 0 },
  { key: "legend", label: "LEGEND", cost: 1_000_000 },
  { key: "overlord", label: "OVERLORD", cost: 1_000_000 },
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
  owner: "OWNER",
  admin: "ADMIN",
  donator: "DONATOR",
  vip: "VIP",
  svip: "SVIP",
  mvip: "MVIP",
  uvip: "UVIP",
  knight: "KNIGHT",
  hero: "HERO",
  titan: "TITAN",
  zeus: "ZEUS",
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
  return row != null ? row.cost : null;
}

export function isFreeShopRank(roleKey: string): boolean {
  return getPurchasableCost(roleKey) === 0;
}

/** Shop rank ladder order (must buy step-by-step). */
export const PURCHASABLE_ROLE_KEYS: readonly string[] = PURCHASABLE.map((p) => p.key);

export function getPurchasableTierIndex(roleKey: string): number {
  const k = normalizeRoleKey(roleKey);
  if (k === DEFAULT_MINECRAFT_ROLE) return -1;
  return PURCHASABLE_ROLE_KEYS.indexOf(k);
}

/** Next rank the user may buy on the website shop, or null if none. */
export function getNextPurchasableRoleKey(currentRoleKey: string): string | null {
  const k = normalizeRoleKey(currentRoleKey);
  const idx = getPurchasableTierIndex(k);
  if (idx >= 0) {
    const nextIdx = idx + 1;
    if (nextIdx >= PURCHASABLE_ROLE_KEYS.length) return null;
    return PURCHASABLE_ROLE_KEYS[nextIdx] ?? null;
  }
  if (k === DEFAULT_MINECRAFT_ROLE) {
    return PURCHASABLE_ROLE_KEYS[0] ?? null;
  }
  return null;
}

export function validatePurchasableRoleUpgrade(
  currentRoleKey: string,
  targetRoleKey: string
): { ok: true } | { ok: false; error: string; nextRoleKey: string | null } {
  const target = normalizeRoleKey(targetRoleKey);
  const next = getNextPurchasableRoleKey(currentRoleKey);
  if (next == null) {
    return {
      ok: false,
      error: "Shop rank upgrades are not available for your current rank.",
      nextRoleKey: null,
    };
  }
  if (target === next) return { ok: true };

  const targetIdx = getPurchasableTierIndex(target);
  const currentIdx = getPurchasableTierIndex(currentRoleKey);
  if (targetIdx >= 0 && currentIdx >= 0 && targetIdx <= currentIdx) {
    return {
      ok: false,
      error: "You already have this rank or a higher shop rank.",
      nextRoleKey: next,
    };
  }

  const nextEntry = PURCHASABLE.find((p) => p.key === next);
  return {
    ok: false,
    error: `You must buy ranks one step at a time. Next available: ${nextEntry?.label ?? next.toUpperCase()}.`,
    nextRoleKey: next,
  };
}

export type UserProfileBadgeCounts = {
  crimson: number;
  gold: number;
  mythic: number;
};

export function meetsRolePurchaseBadgeRequirement(
  badgeCounts: UserProfileBadgeCounts,
  roleKey: string,
  currentRoleKey?: string
): boolean {
  const k = normalizeRoleKey(roleKey);
  if (k === "onichan") {
    if (!currentRoleKey || normalizeRoleKey(currentRoleKey) !== "ultimate") return false;
    return badgeCounts.crimson >= 1 || badgeCounts.gold >= 2;
  }
  if (k === "legend") return badgeCounts.crimson >= 3;
  if (k === "overlord") return badgeCounts.crimson >= 5 || badgeCounts.mythic >= 2;
  return true;
}

export function getRoleBadgeRequirementLabel(roleKey: string): string | null {
  const k = normalizeRoleKey(roleKey);
  if (k === "onichan") {
    return "Requires Ultimate rank, plus 1 crimson badge or 2 gold badges (free rank)";
  }
  if (k === "legend") return "Requires 3 crimson profile badges";
  if (k === "overlord") return "Requires 5 crimson badges, or 2 mythic badges";
  return null;
}

export function purchasableRoleCatalogFlags(
  currentRoleKey: string,
  entryKey: string,
  tierIndex: number,
  badgeCounts: UserProfileBadgeCounts = { crimson: 0, gold: 0, mythic: 0 }
): {
  owned: boolean;
  canBuyNow: boolean;
  locked: boolean;
  freeRank: boolean;
  badgeRequirementLabel: string | null;
  meetsBadgeRequirement: boolean;
} {
  const currentIdx = getPurchasableTierIndex(currentRoleKey);
  const next = getNextPurchasableRoleKey(currentRoleKey);
  const owned = currentIdx >= 0 && tierIndex <= currentIdx;
  const meetsBadgeRequirement = meetsRolePurchaseBadgeRequirement(badgeCounts, entryKey, currentRoleKey);
  const canBuyNow = entryKey === next && meetsBadgeRequirement;
  return {
    owned,
    canBuyNow,
    locked: !owned && !canBuyNow,
    freeRank: isFreeShopRank(entryKey),
    badgeRequirementLabel: getRoleBadgeRequirementLabel(entryKey),
    meetsBadgeRequirement,
  };
}

export function validateRolePurchaseBadgeRequirement(
  badgeCounts: UserProfileBadgeCounts,
  targetRoleKey: string,
  currentRoleKey: string
): { ok: true } | { ok: false; error: string; badgeCounts: UserProfileBadgeCounts } {
  if (meetsRolePurchaseBadgeRequirement(badgeCounts, targetRoleKey, currentRoleKey)) return { ok: true };
  const label = getRoleBadgeRequirementLabel(targetRoleKey);
  const k = normalizeRoleKey(targetRoleKey);
  if (k === "legend") {
    return {
      ok: false,
      error: `This rank requires at least 3 crimson profile badge(s). You have ${badgeCounts.crimson}.`,
      badgeCounts,
    };
  }
  if (k === "onichan") {
    if (normalizeRoleKey(currentRoleKey) !== "ultimate") {
      return {
        ok: false,
        error: "OniiChan requires Ultimate rank first, then 1 crimson badge or 2 gold badges.",
        badgeCounts,
      };
    }
    return {
      ok: false,
      error: `OniiChan requires 1 crimson badge, or 2 gold badge(s). You have ${badgeCounts.crimson} crimson and ${badgeCounts.gold} gold.`,
      badgeCounts,
    };
  }
  if (k === "overlord") {
    return {
      ok: false,
      error: `This rank requires 5 crimson badge(s), or 2 mythic badge(s). You have ${badgeCounts.crimson} crimson and ${badgeCounts.mythic} mythic.`,
      badgeCounts,
    };
  }
  return {
    ok: false,
    error: label ?? "Profile badge requirements not met.",
    badgeCounts,
  };
}

/** Limited-time percent off all website Cobble$ shops (items, Pokémon shop, battle pass, rank shop). Set to 0 when no event. */
export const SHOP_EVENT_DISCOUNT_PERCENT = 0;

/** Cobble$ after integer percent-off. */
export function applyCobbleShopDiscount(baseCobble: number, discountPercent: number): number {
  const b = Math.floor(Number(baseCobble));
  const p = Math.min(100, Math.max(0, Math.floor(Number(discountPercent))));
  if (!Number.isFinite(b) || b <= 0 || p <= 0) return Math.max(0, b);
  const out = Math.floor((b * (100 - p)) / 100);
  return Math.max(1, out);
}

/** Event discount only (e.g. rank shop list prices). */
export function applyWebsiteShopEventPrice(baseCobble: number): number {
  return applyCobbleShopDiscount(baseCobble, SHOP_EVENT_DISCOUNT_PERCENT);
}

/** Event discount, then rank shop discount (items, Pokémon shop, battle pass). */
export function applyWebsiteShopPrice(baseCobble: number, roleDiscountPercent: number): number {
  return applyCobbleShopDiscount(
    applyCobbleShopDiscount(baseCobble, SHOP_EVENT_DISCOUNT_PERCENT),
    roleDiscountPercent
  );
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
    onichan: 20,
    master: 15,
    legend: 20,
    ultimate: 18,
    overlord: 25,
    god: 25,
    // Donation / VIP tiers (ascending)
    donator: 10,
    vip: 12,
    svip: 15,
    mvip: 18,
    uvip: 22,
    // Special / event ranks (ascending)
    knight: 12,
    hero: 16,
    titan: 20,
    zeus: 25,
    // Staff
    admin: 25,
    owner: 30,
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
    onichan: 100_000,
    master: 75_000,
    helper: 90_000,
    mod: 100_000,
    champion: 95_000,
    tiktok: 75_000,
    youtuber: 75_000,
    legend: 120_000,
    ultimate: 90_000,
    overlord: 150_000,
    god: 200_000,
    // Donation / VIP tiers (ascending)
    donator: 50_000,
    vip: 60_000,
    svip: 80_000,
    mvip: 100_000,
    uvip: 130_000,
    // Special / event ranks (ascending)
    knight: 60_000,
    hero: 85_000,
    titan: 120_000,
    zeus: 160_000,
    // Staff
    admin: 150_000,
    owner: 250_000,
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
    onichan: 2,
    master: 2,
    legend: 2,
    ultimate: 2,
    overlord: 3,
    god: 3,
    // Donation / VIP tiers (ascending)
    donator: 1,
    vip: 1,
    svip: 2,
    mvip: 2,
    uvip: 3,
    // Special / event ranks (ascending)
    knight: 1,
    hero: 2,
    titan: 3,
    zeus: 3,
    // Staff
    admin: 3,
    owner: 5,
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
