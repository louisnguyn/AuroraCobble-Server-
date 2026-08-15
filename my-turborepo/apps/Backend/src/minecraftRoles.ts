import { executeMinecraftRconCommand } from "./minecraftRconExecute.js";

export const DEFAULT_MINECRAFT_ROLE = "member";

/** Website VIP overlay default (separate from shop ranks). */
export const DEFAULT_VIP_TIER = "player";

/**
 * VIP ladder (achievement-gated; not Asteryn Point shop ranks):
 * player → vip → mvip → svip → uvip → legend → titan
 */
export const VIP_TIER_KEYS = [
  "player",
  "vip",
  "mvip",
  "svip",
  "uvip",
  "legend",
  "titan",
] as const;

export type VipTierKey = (typeof VIP_TIER_KEYS)[number];

export const VIP_TIER_LABELS: Record<VipTierKey, string> = {
  player: "PLAYER",
  vip: "VIP",
  mvip: "MVIP",
  svip: "SVIP",
  uvip: "UVIP",
  legend: "LEGEND",
  titan: "TITAN",
};

const VIP_TIER_SET = new Set<string>(VIP_TIER_KEYS);

/** Staff / partner / donation roles — request or admin grant only (not VIP ladder). */
export const GRANT_ONLY_ROLE_KEYS = new Set([
  "champion",
  "helper",
  "mod",
  "tiktok",
  "youtuber",
  "builder",
  "owner",
  "admin",
  "donator",
]);

/** Website perks tied to LuckPerms rank (shop discount, daily login extras). */
export type DailyItemGrant = { key: string; amount: number; label: string };

export type RoleWebsitePerks = {
  shopDiscountPercent: number;
  dailyFlatCobble: number;
  dailyTickets: number;
  dailyItems: DailyItemGrant[];
};

export type RoleCatalogEntry = {
  key: string;
  label: string;
  /** Asteryn Point cost; omit if not purchasable */
  cost?: number;
  purchasable: boolean;
  perks: RoleWebsitePerks;
};

/**
 * Shop ladder (Asteryn Point, step-by-step):
 * noob → elite → pro → master → hero → ultimate → overlord → god
 * VIP track (separate): player → vip → mvip → svip → uvip → legend → titan
 *
 * `cost` is paid for that one next step only — cannot skip. Daily AP is +1 from VIP.
 * Early steps are a few days of login; later steps are weeks.
 */
const PURCHASABLE: { key: string; label: string; cost: number }[] = [
  { key: "noob", label: "NOOB", cost: 4 },
  { key: "elite", label: "ELITE", cost: 7 },
  { key: "pro", label: "PRO", cost: 10 },
  { key: "master", label: "MASTER", cost: 15 },
  { key: "hero", label: "HERO", cost: 20 },
  { key: "ultimate", label: "ULTIMATE", cost: 28 },
  { key: "overlord", label: "OVERLORD", cost: 38 },
  { key: "god", label: "GOD", cost: 50 },
];

const GRANT_ONLY_LABELS: Record<string, string> = {
  champion: "CHAMPION",
  helper: "HELPER",
  mod: "MOD",
  tiktok: "TIKTOK",
  youtuber: "YOUTUBER",
  builder: "BUILDER",
  owner: "OWNER",
  admin: "ADMIN",
  donator: "DONATOR",
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

/**
 * Old shop ranks removed from the ladder → treat as this shop tier for "next buy" / owned checks.
 * zeus/knight sat between pro and master; legend sat between ultimate and overlord;
 * onichan sat between hero and ultimate (free checkpoint).
 */
const LEGACY_SHOP_EQUIV: Record<string, string> = {
  zeus: "pro",
  knight: "pro",
  legend: "ultimate",
  onichan: "hero",
};

const ALL_KNOWN_KEYS = new Set<string>([
  DEFAULT_MINECRAFT_ROLE,
  ...PURCHASABLE.map((p) => p.key),
  ...GRANT_ONLY_ROLE_KEYS,
  ...VIP_TIER_KEYS.filter((k) => k !== DEFAULT_VIP_TIER),
]);

export function isKnownRoleKey(key: string): boolean {
  return ALL_KNOWN_KEYS.has(normalizeRoleKey(key));
}

export function isVipTierKey(key: string): boolean {
  return VIP_TIER_SET.has(normalizeRoleKey(key));
}

export function normalizeVipTierKey(raw: string | null | undefined): VipTierKey {
  const k = (raw ?? "").trim().toLowerCase();
  if (VIP_TIER_SET.has(k)) return k as VipTierKey;
  // Removed from VIP ladder — treat as next remaining tier.
  if (k === "zeus") return "legend";
  return DEFAULT_VIP_TIER;
}

export function getVipTierIndex(tierKey: string): number {
  return VIP_TIER_KEYS.indexOf(normalizeVipTierKey(tierKey));
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
  const direct = PURCHASABLE_ROLE_KEYS.indexOf(k);
  if (direct >= 0) return direct;
  const equiv = LEGACY_SHOP_EQUIV[k];
  if (equiv) return PURCHASABLE_ROLE_KEYS.indexOf(equiv);
  return -1;
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
  mythic: number;
  gold: number;
  legend: number;
};

/** Shop ranks no longer require profile badges (VIP track does). */
export function purchasableRoleCatalogFlags(
  shopProgressRoleKey: string,
  entryKey: string,
  tierIndex: number,
  ownedKeys: Set<string>
): {
  owned: boolean;
  canBuyNow: boolean;
  locked: boolean;
  freeRank: boolean;
  badgeRequirementLabel: string | null;
  meetsBadgeRequirement: boolean;
  canActivate: boolean;
} {
  const next = getNextPurchasableRoleKey(shopProgressRoleKey);
  const owned = ownedKeys.has(normalizeRoleKey(entryKey)) || (() => {
    const progressIdx = getPurchasableTierIndex(shopProgressRoleKey);
    return progressIdx >= 0 && tierIndex <= progressIdx;
  })();
  const canBuyNow = entryKey === next && !owned;
  return {
    owned,
    canBuyNow,
    locked: !owned && !canBuyNow,
    freeRank: isFreeShopRank(entryKey),
    badgeRequirementLabel: null,
    meetsBadgeRequirement: true,
    canActivate: owned,
  };
}

/** Limited-time percent off all website Asteryn Point shops (items, battle pass, rank shop). Set to 0 when no event. */
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

/** Event discount, then rank shop discount (items, battle pass). */
export function applyWebsiteShopPrice(baseCobble: number, roleDiscountPercent: number): number {
  return applyCobbleShopDiscount(
    applyCobbleShopDiscount(baseCobble, SHOP_EVENT_DISCOUNT_PERCENT),
    roleDiscountPercent
  );
}

/**
 * Percent off website Asteryn Point shop (items + battle pass).
 * Staff/partner grant ranks (champion, helper, mod, tiktok, youtuber, builder): 15%.
 * Shop ladder: stepped discounts by tier.
 */
export function getWebsiteShopDiscountPercent(roleKey: string): number {
  const k = normalizeRoleKey(roleKey);
  if (GRANT_ONLY_FLAT_SHOP_DISCOUNT_15.has(k)) return 15;
  const byRole: Record<string, number> = {
    [DEFAULT_MINECRAFT_ROLE]: 0,
    noob: 5,
    elite: 8,
    pro: 10,
    zeus: 12,
    knight: 13,
    master: 15,
    hero: 16,
    onichan: 18,
    ultimate: 20,
    legend: 22,
    overlord: 25,
    titan: 27,
    god: 30,
    // Donation / VIP tiers (website overlay — ascending)
    donator: 10,
    vip: 12,
    svip: 15,
    mvip: 18,
    uvip: 22,
    // Staff
    admin: 25,
    owner: 30,
  };
  return byRole[k] ?? 0;
}

/**
 * Daily Asteryn Point from VIP overlay (+1 for player through titan). Shop ranks do not add Point.
 */
export function getDailyLoginFlatCobbleBonusPerClaim(roleKey: string): number {
  const k = normalizeRoleKey(roleKey);
  const byVip: Record<string, number> = {
    [DEFAULT_VIP_TIER]: 1,
    vip: 1,
    mvip: 1,
    svip: 1,
    uvip: 1,
    legend: 1,
    titan: 1,
    donator: 1,
  };
  return byVip[k] ?? 0;
}

/** Daily normal tickets from shop/staff rank only (1–5). VIP overlay does not add tickets. */
export function getDailyLoginTicketBonusPerClaim(roleKey: string): number {
  const k = normalizeRoleKey(roleKey);
  if (VIP_TIER_SET.has(k)) return 0;
  const byRank: Record<string, number> = {
    [DEFAULT_MINECRAFT_ROLE]: 1,
    noob: 1,
    elite: 2,
    pro: 2,
    zeus: 2,
    knight: 2,
    master: 3,
    hero: 3,
    onichan: 3,
    ultimate: 4,
    overlord: 4,
    god: 5,
    champion: 3,
    helper: 3,
    mod: 3,
    tiktok: 3,
    youtuber: 3,
    builder: 3,
    admin: 4,
    owner: 5,
  };
  if (GRANT_ONLY_FLAT_SHOP_DISCOUNT_15.has(k) && !(k in byRank)) return 3;
  return byRank[k] ?? 1;
}

const DAILY_ITEM_ORDER = [
  "poke_ball",
  "great_ball",
  "ultra_ball",
  "exp_candy_xs",
  "exp_candy_s",
  "exp_candy_m",
  "exp_candy_l",
  "potion",
  "super_potion",
  "hyper_potion",
  "max_potion",
  "full_heal",
  "revive",
] as const;

export function mergeDailyItemGrants(...lists: DailyItemGrant[][]): DailyItemGrant[] {
  const map = new Map<string, DailyItemGrant>();
  for (const list of lists) {
    for (const it of list) {
      if (!it.key || it.amount <= 0) continue;
      const prev = map.get(it.key);
      if (prev) map.set(it.key, { ...prev, amount: prev.amount + it.amount });
      else map.set(it.key, { ...it });
    }
  }
  return [...map.values()].sort((a, b) => {
    const ia = DAILY_ITEM_ORDER.indexOf(a.key as (typeof DAILY_ITEM_ORDER)[number]);
    const ib = DAILY_ITEM_ORDER.indexOf(b.key as (typeof DAILY_ITEM_ORDER)[number]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

/**
 * Daily website-inventory items from shop/staff rank.
 * Starts at Poke Ball + Candy XS + Potion; Great Ball / Candy S only from Master+.
 */
export function getDailyLoginRankItemGrants(roleKey: string): DailyItemGrant[] {
  const k = normalizeRoleKey(roleKey);
  const byRank: Record<string, DailyItemGrant[]> = {
    [DEFAULT_MINECRAFT_ROLE]: [
      { key: "poke_ball", amount: 2, label: "Poke Ball" },
      { key: "exp_candy_xs", amount: 1, label: "EXP Candy XS" },
      { key: "potion", amount: 1, label: "Potion" },
    ],
    noob: [
      { key: "poke_ball", amount: 4, label: "Poke Ball" },
      { key: "exp_candy_xs", amount: 2, label: "EXP Candy XS" },
      { key: "potion", amount: 2, label: "Potion" },
    ],
    elite: [
      { key: "poke_ball", amount: 6, label: "Poke Ball" },
      { key: "exp_candy_xs", amount: 3, label: "EXP Candy XS" },
      { key: "potion", amount: 3, label: "Potion" },
    ],
    pro: [
      { key: "poke_ball", amount: 8, label: "Poke Ball" },
      { key: "exp_candy_xs", amount: 4, label: "EXP Candy XS" },
      { key: "potion", amount: 4, label: "Potion" },
    ],
    zeus: [
      { key: "poke_ball", amount: 8, label: "Poke Ball" },
      { key: "exp_candy_xs", amount: 4, label: "EXP Candy XS" },
      { key: "potion", amount: 4, label: "Potion" },
    ],
    knight: [
      { key: "poke_ball", amount: 8, label: "Poke Ball" },
      { key: "exp_candy_xs", amount: 4, label: "EXP Candy XS" },
      { key: "potion", amount: 4, label: "Potion" },
    ],
    master: [
      { key: "poke_ball", amount: 8, label: "Poke Ball" },
      { key: "great_ball", amount: 2, label: "Great Ball" },
      { key: "exp_candy_xs", amount: 4, label: "EXP Candy XS" },
      { key: "exp_candy_s", amount: 1, label: "EXP Candy S" },
      { key: "potion", amount: 3, label: "Potion" },
      { key: "super_potion", amount: 1, label: "Super Potion" },
    ],
    hero: [
      { key: "poke_ball", amount: 6, label: "Poke Ball" },
      { key: "great_ball", amount: 4, label: "Great Ball" },
      { key: "exp_candy_xs", amount: 3, label: "EXP Candy XS" },
      { key: "exp_candy_s", amount: 2, label: "EXP Candy S" },
      { key: "super_potion", amount: 2, label: "Super Potion" },
    ],
    onichan: [
      { key: "poke_ball", amount: 6, label: "Poke Ball" },
      { key: "great_ball", amount: 5, label: "Great Ball" },
      { key: "exp_candy_s", amount: 3, label: "EXP Candy S" },
      { key: "super_potion", amount: 3, label: "Super Potion" },
    ],
    ultimate: [
      { key: "great_ball", amount: 6, label: "Great Ball" },
      { key: "ultra_ball", amount: 2, label: "Ultra Ball" },
      { key: "exp_candy_s", amount: 3, label: "EXP Candy S" },
      { key: "exp_candy_m", amount: 1, label: "EXP Candy M" },
      { key: "hyper_potion", amount: 2, label: "Hyper Potion" },
    ],
    overlord: [
      { key: "great_ball", amount: 4, label: "Great Ball" },
      { key: "ultra_ball", amount: 4, label: "Ultra Ball" },
      { key: "exp_candy_m", amount: 2, label: "EXP Candy M" },
      { key: "hyper_potion", amount: 3, label: "Hyper Potion" },
      { key: "full_heal", amount: 1, label: "Full Heal" },
    ],
    god: [
      { key: "ultra_ball", amount: 6, label: "Ultra Ball" },
      { key: "exp_candy_m", amount: 2, label: "EXP Candy M" },
      { key: "exp_candy_l", amount: 1, label: "EXP Candy L" },
      { key: "max_potion", amount: 2, label: "Max Potion" },
      { key: "revive", amount: 1, label: "Revive" },
    ],
    champion: [
      { key: "poke_ball", amount: 8, label: "Poke Ball" },
      { key: "great_ball", amount: 2, label: "Great Ball" },
      { key: "exp_candy_xs", amount: 4, label: "EXP Candy XS" },
      { key: "exp_candy_s", amount: 1, label: "EXP Candy S" },
      { key: "potion", amount: 3, label: "Potion" },
      { key: "super_potion", amount: 1, label: "Super Potion" },
    ],
    helper: [
      { key: "poke_ball", amount: 8, label: "Poke Ball" },
      { key: "great_ball", amount: 2, label: "Great Ball" },
      { key: "exp_candy_xs", amount: 4, label: "EXP Candy XS" },
      { key: "exp_candy_s", amount: 1, label: "EXP Candy S" },
      { key: "potion", amount: 3, label: "Potion" },
      { key: "super_potion", amount: 1, label: "Super Potion" },
    ],
    mod: [
      { key: "poke_ball", amount: 8, label: "Poke Ball" },
      { key: "great_ball", amount: 2, label: "Great Ball" },
      { key: "exp_candy_xs", amount: 4, label: "EXP Candy XS" },
      { key: "exp_candy_s", amount: 1, label: "EXP Candy S" },
      { key: "potion", amount: 3, label: "Potion" },
      { key: "super_potion", amount: 1, label: "Super Potion" },
    ],
    tiktok: [
      { key: "poke_ball", amount: 8, label: "Poke Ball" },
      { key: "great_ball", amount: 2, label: "Great Ball" },
      { key: "exp_candy_xs", amount: 4, label: "EXP Candy XS" },
      { key: "exp_candy_s", amount: 1, label: "EXP Candy S" },
      { key: "potion", amount: 3, label: "Potion" },
      { key: "super_potion", amount: 1, label: "Super Potion" },
    ],
    youtuber: [
      { key: "poke_ball", amount: 8, label: "Poke Ball" },
      { key: "great_ball", amount: 2, label: "Great Ball" },
      { key: "exp_candy_xs", amount: 4, label: "EXP Candy XS" },
      { key: "exp_candy_s", amount: 1, label: "EXP Candy S" },
      { key: "potion", amount: 3, label: "Potion" },
      { key: "super_potion", amount: 1, label: "Super Potion" },
    ],
    builder: [
      { key: "poke_ball", amount: 8, label: "Poke Ball" },
      { key: "great_ball", amount: 2, label: "Great Ball" },
      { key: "exp_candy_xs", amount: 4, label: "EXP Candy XS" },
      { key: "exp_candy_s", amount: 1, label: "EXP Candy S" },
      { key: "potion", amount: 3, label: "Potion" },
      { key: "super_potion", amount: 1, label: "Super Potion" },
    ],
    donator: [
      { key: "poke_ball", amount: 8, label: "Poke Ball" },
      { key: "great_ball", amount: 4, label: "Great Ball" },
      { key: "exp_candy_xs", amount: 4, label: "EXP Candy XS" },
      { key: "exp_candy_s", amount: 2, label: "EXP Candy S" },
      { key: "super_potion", amount: 2, label: "Super Potion" },
    ],
    admin: [
      { key: "great_ball", amount: 4, label: "Great Ball" },
      { key: "ultra_ball", amount: 4, label: "Ultra Ball" },
      { key: "exp_candy_m", amount: 2, label: "EXP Candy M" },
      { key: "hyper_potion", amount: 3, label: "Hyper Potion" },
      { key: "full_heal", amount: 1, label: "Full Heal" },
    ],
    owner: [
      { key: "ultra_ball", amount: 6, label: "Ultra Ball" },
      { key: "exp_candy_m", amount: 2, label: "EXP Candy M" },
      { key: "exp_candy_l", amount: 1, label: "EXP Candy L" },
      { key: "max_potion", amount: 2, label: "Max Potion" },
      { key: "revive", amount: 1, label: "Revive" },
    ],
  };
  if (GRANT_ONLY_FLAT_SHOP_DISCOUNT_15.has(k) && !(k in byRank)) return byRank.master ?? [];
  return byRank[k] ?? byRank[DEFAULT_MINECRAFT_ROLE] ?? [];
}

/**
 * Daily website-inventory items from VIP overlay.
 * Player/VIP start at Poke Ball + Candy XS + Potion; Great Ball / Candy S from MVIP+.
 */
export function getDailyLoginVipItemGrants(vipKey: string): DailyItemGrant[] {
  const k = normalizeVipTierKey(vipKey);
  const byVip: Record<VipTierKey, DailyItemGrant[]> = {
    player: [
      { key: "poke_ball", amount: 4, label: "Poke Ball" },
      { key: "exp_candy_xs", amount: 2, label: "EXP Candy XS" },
      { key: "potion", amount: 2, label: "Potion" },
    ],
    vip: [
      { key: "poke_ball", amount: 6, label: "Poke Ball" },
      { key: "exp_candy_xs", amount: 3, label: "EXP Candy XS" },
      { key: "potion", amount: 3, label: "Potion" },
    ],
    mvip: [
      { key: "poke_ball", amount: 8, label: "Poke Ball" },
      { key: "great_ball", amount: 2, label: "Great Ball" },
      { key: "exp_candy_xs", amount: 4, label: "EXP Candy XS" },
      { key: "exp_candy_s", amount: 1, label: "EXP Candy S" },
      { key: "potion", amount: 4, label: "Potion" },
    ],
    svip: [
      { key: "poke_ball", amount: 6, label: "Poke Ball" },
      { key: "great_ball", amount: 4, label: "Great Ball" },
      { key: "exp_candy_xs", amount: 3, label: "EXP Candy XS" },
      { key: "exp_candy_s", amount: 2, label: "EXP Candy S" },
      { key: "super_potion", amount: 2, label: "Super Potion" },
    ],
    uvip: [
      { key: "great_ball", amount: 6, label: "Great Ball" },
      { key: "ultra_ball", amount: 2, label: "Ultra Ball" },
      { key: "exp_candy_s", amount: 3, label: "EXP Candy S" },
      { key: "exp_candy_m", amount: 1, label: "EXP Candy M" },
      { key: "super_potion", amount: 3, label: "Super Potion" },
      { key: "full_heal", amount: 1, label: "Full Heal" },
    ],
    legend: [
      { key: "great_ball", amount: 4, label: "Great Ball" },
      { key: "ultra_ball", amount: 4, label: "Ultra Ball" },
      { key: "exp_candy_m", amount: 2, label: "EXP Candy M" },
      { key: "hyper_potion", amount: 2, label: "Hyper Potion" },
      { key: "full_heal", amount: 1, label: "Full Heal" },
      { key: "revive", amount: 1, label: "Revive" },
    ],
    titan: [
      { key: "ultra_ball", amount: 8, label: "Ultra Ball" },
      { key: "exp_candy_m", amount: 2, label: "EXP Candy M" },
      { key: "exp_candy_l", amount: 1, label: "EXP Candy L" },
      { key: "hyper_potion", amount: 3, label: "Hyper Potion" },
      { key: "revive", amount: 2, label: "Revive" },
    ],
  };
  return byVip[k] ?? byVip.player;
}

export function getRoleWebsitePerks(roleKey: string): RoleWebsitePerks {
  const k = normalizeRoleKey(roleKey);
  return {
    shopDiscountPercent: getWebsiteShopDiscountPercent(roleKey),
    dailyFlatCobble: getDailyLoginFlatCobbleBonusPerClaim(roleKey),
    dailyTickets: getDailyLoginTicketBonusPerClaim(roleKey),
    dailyItems: isVipTierKey(k) ? getDailyLoginVipItemGrants(k) : getDailyLoginRankItemGrants(k),
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
  const role = resolveLuckpermsGroupForDisplay(roleKey);
  const tpl =
    process.env.MC_LUCKPERMS_PARENT_COMMAND_TEMPLATE?.trim() ||
    "lp user {username} parent set {role}";
  return tpl.replace(/\{username\}/g, user).replace(/\{role\}/g, role);
}

/**
 * Map website display keys → LuckPerms group names.
 * Asteryn resource pack includes a `player` glyph (U+E00D); use LP group `player`.
 */
export function resolveLuckpermsGroupForDisplay(roleKey: string): string {
  return normalizeRoleKey(roleKey);
}

/**
 * Runs LuckPerms on the Minecraft server (RCON). Command has no leading slash.
 */
export async function runLuckpermsParentSet(
  minecraftUsername: string,
  roleKey: string
): Promise<{ ok: true; output: string; lpGroup: string } | { ok: false; error: string }> {
  const lpGroup = resolveLuckpermsGroupForDisplay(roleKey);
  const cmd = buildLuckpermsParentSetCommand(minecraftUsername, roleKey);
  const result = await executeMinecraftRconCommand(cmd);
  if (!result.ok) return result;
  return { ok: true, output: result.output, lpGroup };
}
