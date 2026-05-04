import { supabase } from "./supabase.js";
import { sanitizeBattleRestrictionsHtml } from "./battleRestrictionsSanitize.js";

export type BattleRestrictionsPublic = {
  updated_at: string;
  format_label: string;
  player_restrictions_html: string;
  pokemon_slugs: string[];
  pokemon_notes_html: string;
  move_slugs: string[];
  move_notes_html: string;
  ability_slugs: string[];
  ability_notes_html: string;
  item_slugs: string[];
  item_notes_html: string;
};

const MAX_FORMAT_LABEL = 240;

function normalizeFormatLabel(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t.length > MAX_FORMAT_LABEL ? t.slice(0, MAX_FORMAT_LABEL) : t;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const MAX_SLUGS = 800;
const MAX_SLUG_LEN = 80;

function normalizeSlugArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const s = x.trim().toLowerCase();
    if (!s || s.length > MAX_SLUG_LEN || !SLUG_RE.test(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= MAX_SLUGS) break;
  }
  return out;
}

function rowToPublic(r: Record<string, unknown>): BattleRestrictionsPublic {
  return {
    updated_at: typeof r.updated_at === "string" ? r.updated_at : new Date().toISOString(),
    format_label:
      typeof r.format_label === "string" ? r.format_label.trim().slice(0, MAX_FORMAT_LABEL) : "",
    player_restrictions_html: typeof r.player_restrictions_html === "string" ? r.player_restrictions_html : "",
    pokemon_slugs: Array.isArray(r.pokemon_slugs) ? (r.pokemon_slugs as string[]) : [],
    pokemon_notes_html: typeof r.pokemon_notes_html === "string" ? r.pokemon_notes_html : "",
    move_slugs: Array.isArray(r.move_slugs) ? (r.move_slugs as string[]) : [],
    move_notes_html: typeof r.move_notes_html === "string" ? r.move_notes_html : "",
    ability_slugs: Array.isArray(r.ability_slugs) ? (r.ability_slugs as string[]) : [],
    ability_notes_html: typeof r.ability_notes_html === "string" ? r.ability_notes_html : "",
    item_slugs: Array.isArray(r.item_slugs) ? (r.item_slugs as string[]) : [],
    item_notes_html: typeof r.item_notes_html === "string" ? r.item_notes_html : "",
  };
}

const SELECT_FIELDS =
  "updated_at, format_label, player_restrictions_html, pokemon_slugs, pokemon_notes_html, move_slugs, move_notes_html, ability_slugs, ability_notes_html, item_slugs, item_notes_html";

export async function fetchBattleRestrictionsPublic(): Promise<
  { ok: true; data: BattleRestrictionsPublic } | { ok: false; error: string }
> {
  if (!supabase) return { ok: false, error: "Database not configured" };
  const { data, error } = await supabase
    .from("battle_restrictions_config")
    .select(SELECT_FIELDS)
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    const missing = /battle_restrictions_config|relation|does not exist|schema cache/i.test(error.message);
    const missingFmt = /format_label/i.test(error.message);
    let msg = error.message;
    if (missing) msg = "Run supabase/battle_restrictions_config.sql.";
    else if (missingFmt) msg = "Run supabase/battle_restrictions_format_label.sql (adds format_label).";
    return {
      ok: false,
      error: missing || missingFmt ? msg : error.message,
    };
  }
  if (!data) {
    return {
      ok: true,
      data: {
        updated_at: new Date().toISOString(),
        format_label: "",
        player_restrictions_html: "",
        pokemon_slugs: [],
        pokemon_notes_html: "",
        move_slugs: [],
        move_notes_html: "",
        ability_slugs: [],
        ability_notes_html: "",
        item_slugs: [],
        item_notes_html: "",
      },
    };
  }
  return { ok: true, data: rowToPublic(data as Record<string, unknown>) };
}

export async function upsertBattleRestrictionsFromAdmin(body: Record<string, unknown>): Promise<
  { ok: true; data: BattleRestrictionsPublic } | { ok: false; error: string }
> {
  if (!supabase) return { ok: false, error: "Database not configured" };

  const player_restrictions_html = sanitizeBattleRestrictionsHtml(
    typeof body.player_restrictions_html === "string" ? body.player_restrictions_html : ""
  );
  const pokemon_notes_html = sanitizeBattleRestrictionsHtml(
    typeof body.pokemon_notes_html === "string" ? body.pokemon_notes_html : ""
  );
  const move_notes_html = sanitizeBattleRestrictionsHtml(
    typeof body.move_notes_html === "string" ? body.move_notes_html : ""
  );
  const ability_notes_html = sanitizeBattleRestrictionsHtml(
    typeof body.ability_notes_html === "string" ? body.ability_notes_html : ""
  );
  const item_notes_html = sanitizeBattleRestrictionsHtml(
    typeof body.item_notes_html === "string" ? body.item_notes_html : ""
  );
  const format_label = normalizeFormatLabel(body.format_label);

  const row = {
    id: 1,
    updated_at: new Date().toISOString(),
    format_label,
    player_restrictions_html,
    pokemon_slugs: normalizeSlugArray(body.pokemon_slugs),
    pokemon_notes_html,
    move_slugs: normalizeSlugArray(body.move_slugs),
    move_notes_html,
    ability_slugs: normalizeSlugArray(body.ability_slugs),
    ability_notes_html,
    item_slugs: normalizeSlugArray(body.item_slugs),
    item_notes_html,
  };

  const { error } = await supabase.from("battle_restrictions_config").upsert(row, { onConflict: "id" });
  if (error) {
    const missing = /battle_restrictions_config|relation|does not exist|schema cache/i.test(error.message);
    const missingFmt = /format_label/i.test(error.message);
    let msg = error.message;
    if (missing) msg = "Run supabase/battle_restrictions_config.sql.";
    else if (missingFmt) msg = "Run supabase/battle_restrictions_format_label.sql (adds format_label).";
    return {
      ok: false,
      error: missing || missingFmt ? msg : error.message,
    };
  }
  return fetchBattleRestrictionsPublic();
}
