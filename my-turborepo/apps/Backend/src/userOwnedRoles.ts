import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_MINECRAFT_ROLE,
  DEFAULT_VIP_TIER,
  GRANT_ONLY_ROLE_KEYS,
  PURCHASABLE_ROLE_KEYS,
  VIP_TIER_KEYS,
  VIP_TIER_LABELS,
  getPurchasableTierIndex,
  getNextPurchasableRoleKey,
  getVipTierIndex,
  getRoleWebsitePerks,
  isKnownRoleKey,
  isVipTierKey,
  normalizeRoleKey,
  normalizeVipTierKey,
  type VipTierKey,
  type UserProfileBadgeCounts,
} from "./minecraftRoles.js";

export type OwnedRoleSource = "shop" | "grant" | "admin" | "vip_claim" | "backfill";

export async function listOwnedRoleKeys(
  supabase: SupabaseClient,
  userId: number
): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_owned_roles")
    .select("role_key")
    .eq("user_id", userId);
  if (error) {
    if (/user_owned_roles|relation|does not exist|schema cache/i.test(error.message)) {
      return [];
    }
    console.warn("[owned-roles] list:", error.message);
    return [];
  }
  return [...new Set((data ?? []).map((r) => normalizeRoleKey(String((r as { role_key: string }).role_key))))];
}

export async function userOwnsRole(
  supabase: SupabaseClient,
  userId: number,
  roleKey: string
): Promise<boolean> {
  const k = normalizeRoleKey(roleKey);
  if (k === DEFAULT_MINECRAFT_ROLE) return true;
  const { data, error } = await supabase
    .from("user_owned_roles")
    .select("role_key")
    .eq("user_id", userId)
    .eq("role_key", k)
    .maybeSingle();
  if (error) {
    if (/user_owned_roles|relation|does not exist|schema cache/i.test(error.message)) return false;
    console.warn("[owned-roles] owns:", error.message);
    return false;
  }
  return Boolean(data);
}

/** Insert ownership (idempotent). Returns false if table missing. */
export async function addOwnedRole(
  supabase: SupabaseClient,
  userId: number,
  roleKey: string,
  source: OwnedRoleSource
): Promise<boolean> {
  const k = normalizeRoleKey(roleKey);
  if (!k || k === DEFAULT_MINECRAFT_ROLE || k === DEFAULT_VIP_TIER) return true;
  const { error } = await supabase.from("user_owned_roles").upsert(
    {
      user_id: userId,
      role_key: k,
      source,
    },
    { onConflict: "user_id,role_key", ignoreDuplicates: true }
  );
  if (error) {
    if (/user_owned_roles|relation|does not exist|schema cache/i.test(error.message)) {
      console.warn("[owned-roles] table missing — run users_owned_roles_and_vip.sql");
      return false;
    }
    console.warn("[owned-roles] add:", error.message);
    return false;
  }
  return true;
}

export async function removeOwnedRole(
  supabase: SupabaseClient,
  userId: number,
  roleKey: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const k = normalizeRoleKey(roleKey);
  if (!k) return { ok: false, error: "Invalid role key" };
  if (k === DEFAULT_MINECRAFT_ROLE || k === DEFAULT_VIP_TIER) {
    return { ok: false, error: "Default member/player cannot be removed from inventory." };
  }
  const { error } = await supabase
    .from("user_owned_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role_key", k);
  if (error) {
    if (/user_owned_roles|relation|does not exist|schema cache/i.test(error.message)) {
      return { ok: false, error: "Owned-roles table missing — run users_owned_roles_and_vip.sql" };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Highest VIP key still owned (including implicit lower tiers from website_vip_tier sync), else player. */
export function highestOwnedVipTier(ownedKeys: string[]): VipTierKey {
  let best = 0;
  let bestKey: VipTierKey = DEFAULT_VIP_TIER;
  for (const raw of ownedKeys) {
    const k = normalizeRoleKey(raw);
    if (!isVipTierKey(k)) continue;
    const idx = getVipTierIndex(k);
    if (idx > best) {
      best = idx;
      bestKey = normalizeVipTierKey(k);
    }
  }
  return bestKey;
}


/** When buying shop tier, own that tier and all lower shop tiers. */
export async function addOwnedShopProgress(
  supabase: SupabaseClient,
  userId: number,
  boughtRoleKey: string
): Promise<void> {
  const idx = getPurchasableTierIndex(boughtRoleKey);
  if (idx < 0) {
    await addOwnedRole(supabase, userId, boughtRoleKey, "shop");
    return;
  }
  for (let i = 0; i <= idx; i++) {
    const key = PURCHASABLE_ROLE_KEYS[i];
    if (key) await addOwnedRole(supabase, userId, key, "shop");
  }
}

/** Highest owned shop ladder key, or member. */
export function getShopProgressRoleKey(ownedKeys: string[], activeRoleKey?: string): string {
  let best = -1;
  let bestKey = DEFAULT_MINECRAFT_ROLE;
  for (const raw of ownedKeys) {
    const idx = getPurchasableTierIndex(raw);
    if (idx > best) {
      best = idx;
      bestKey = PURCHASABLE_ROLE_KEYS[idx] ?? DEFAULT_MINECRAFT_ROLE;
    }
  }
  if (best < 0 && activeRoleKey) {
    const idx = getPurchasableTierIndex(activeRoleKey);
    if (idx >= 0) return PURCHASABLE_ROLE_KEYS[idx] ?? DEFAULT_MINECRAFT_ROLE;
  }
  return bestKey;
}

export function nextShopBuyKey(ownedKeys: string[], activeRoleKey?: string): string | null {
  return getNextPurchasableRoleKey(getShopProgressRoleKey(ownedKeys, activeRoleKey));
}

export async function readWebsiteVipTier(
  supabase: SupabaseClient,
  userId: number
): Promise<VipTierKey> {
  const { data, error } = await supabase
    .from("users")
    .select("website_vip_tier")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return DEFAULT_VIP_TIER;
  return normalizeVipTierKey((data as { website_vip_tier?: string | null }).website_vip_tier);
}

export async function setWebsiteVipTier(
  supabase: SupabaseClient,
  userId: number,
  tier: VipTierKey
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("users")
    .update({ website_vip_tier: tier, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Achievement gates for VIP claim (step must be next above current VIP). */
export function meetsVipClaimBadgeRequirement(
  tier: VipTierKey,
  badges: UserProfileBadgeCounts
): boolean {
  switch (tier) {
    case "player":
      return true;
    case "vip":
      return badges.gold >= 1;
    case "mvip":
      return badges.gold >= 2;
    case "svip":
      return badges.gold >= 3 || badges.mythic >= 1;
    case "uvip":
      return badges.mythic >= 1;
    case "legend":
      return badges.legend >= 1 || badges.mythic >= 3;
    case "titan":
      return badges.legend >= 2 || badges.mythic >= 5;
    default:
      return false;
  }
}

export function getVipClaimBadgeRequirementLabel(tier: VipTierKey): string | null {
  switch (tier) {
    case "vip":
      return "Requires 1 gold profile badge";
    case "mvip":
      return "Requires 2 gold profile badges";
    case "svip":
      return "Requires 3 gold badges, or 1 mythic badge";
    case "uvip":
      return "Requires 1 mythic profile badge";
    case "legend":
      return "Requires 1 legend badge, or 3 mythic badges";
    case "titan":
      return "Requires 2 legend badges, or 5 mythic badges";
    default:
      return null;
  }
}

export function getNextVipClaimKey(currentVip: VipTierKey): VipTierKey | null {
  const idx = getVipTierIndex(currentVip);
  if (idx < 0) return VIP_TIER_KEYS[1] ?? null;
  const next = VIP_TIER_KEYS[idx + 1];
  return next ?? null;
}

export function buildVipCatalogEntries(
  currentVip: VipTierKey,
  ownedKeys: Set<string>,
  badges: UserProfileBadgeCounts,
  activeRoleKey?: string
) {
  const next = getNextVipClaimKey(currentVip);
  const active = normalizeRoleKey(activeRoleKey ?? "");
  return VIP_TIER_KEYS.filter((k) => k !== DEFAULT_VIP_TIER).map((key) => {
    const owned = ownedKeys.has(key) || getVipTierIndex(key) <= getVipTierIndex(currentVip);
    const canClaimNow = key === next && meetsVipClaimBadgeRequirement(key, badges);
    const label = getVipClaimBadgeRequirementLabel(key);
    return {
      key,
      label: VIP_TIER_LABELS[key],
      owned,
      canClaimNow,
      locked: !owned && !canClaimNow,
      badgeRequirementLabel: label,
      meetsBadgeRequirement: meetsVipClaimBadgeRequirement(key, badges),
      canActivate: owned,
      active: active === key,
      perks: getRoleWebsitePerks(key),
    };
  });
}

export function classifyOwnedRoleKey(roleKey: string): "shop" | "vip" | "grant" | "other" {
  const k = normalizeRoleKey(roleKey);
  if (k === DEFAULT_MINECRAFT_ROLE || PURCHASABLE_ROLE_KEYS.includes(k)) return "shop";
  if (isVipTierKey(k)) return "vip";
  if (GRANT_ONLY_ROLE_KEYS.has(k)) return "grant";
  return "other";
}

/** Inventory rows for owned ranks / VIPs (player picks display). Always includes defaults. */
export function buildOwnedInventoryEntries(
  ownedKeys: string[],
  activeRoleKey: string
): {
  key: string;
  kind: "shop" | "vip" | "grant" | "other";
  active: boolean;
}[] {
  const active = normalizeRoleKey(activeRoleKey);
  const uniq = new Set(
    ownedKeys.map(normalizeRoleKey).filter((k) => Boolean(k))
  );
  // Defaults are always owned / selectable in inventory.
  uniq.add(DEFAULT_MINECRAFT_ROLE);
  uniq.add(DEFAULT_VIP_TIER);

  const kindOrder = { shop: 0, vip: 1, grant: 2, other: 3 } as const;
  return [...uniq]
    .map((key) => ({
      key,
      kind: classifyOwnedRoleKey(key),
      active: key === active,
    }))
    .sort((a, b) => {
      // Defaults first within their kind.
      if (a.key === DEFAULT_MINECRAFT_ROLE && b.key !== DEFAULT_MINECRAFT_ROLE && a.kind === "shop") return -1;
      if (b.key === DEFAULT_MINECRAFT_ROLE && a.key !== DEFAULT_MINECRAFT_ROLE && b.kind === "shop") return 1;
      if (a.key === DEFAULT_VIP_TIER && b.key !== DEFAULT_VIP_TIER && a.kind === "vip") return -1;
      if (b.key === DEFAULT_VIP_TIER && a.key !== DEFAULT_VIP_TIER && b.kind === "vip") return 1;
      const ko = kindOrder[a.kind] - kindOrder[b.kind];
      if (ko !== 0) return ko;
      if (a.kind === "shop") {
        const ai = a.key === DEFAULT_MINECRAFT_ROLE ? -1 : getPurchasableTierIndex(a.key);
        const bi = b.key === DEFAULT_MINECRAFT_ROLE ? -1 : getPurchasableTierIndex(b.key);
        return ai - bi;
      }
      if (a.kind === "vip") return getVipTierIndex(a.key) - getVipTierIndex(b.key);
      return a.key.localeCompare(b.key);
    });
}

export function isActivatableOwnedRole(roleKey: string): boolean {
  const k = normalizeRoleKey(roleKey);
  if (k === DEFAULT_MINECRAFT_ROLE || k === DEFAULT_VIP_TIER) return true;
  if (!isKnownRoleKey(k) && !isVipTierKey(k)) return false;
  return true;
}
