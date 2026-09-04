/** Skindex skin id → Cobblemon species the skin applies to. */
export const SKINDEX_CATALOG: Record<string, readonly string[]> = {
  aerodactyl_rodan: ["cobblemon:aerodactyl"],
  ash: ["cobblemon:greninja"],
  champion_incineroar: ["cobblemon:incineroar"],
  champion_yveltal: ["cobblemon:yveltal"],
  ceruledge_ghost_soul: ["cobblemon:ceruledge"],
  crimson_ceruledge: ["cobblemon:ceruledge"],
  crimson_metagross: ["cobblemon:metagross"],
  cubone_cosplay_godzilla: ["cobblemon:cubone"],
  custom_amoonguss: ["cobblemon:amoonguss"],
  custom_blue_xerneas: ["cobblemon:xerneas"],
  custom_dondozo: ["cobblemon:dondozo"],
  custom_greninja: ["cobblemon:greninja"],
  custom_ironvaliant: ["cobblemon:ironvaliant"],
  custom_mew: ["cobblemon:mew"],
  custom_red_xerneas: ["cobblemon:xerneas"],
  custom_ursaluna: ["cobblemon:ursaluna"],
  custom_xerneas: ["cobblemon:xerneas"],
  custom_zacian: ["cobblemon:zacian"],
  dark_knight: ["cobblemon:ceruledge"],
  eternamax: ["cobblemon:eternatus"],
  frieren_gardevoir: ["cobblemon:gardevoir"],
  galaxy_rayquaza: ["cobblemon:rayquaza"],
  galaxy_regigigas: ["cobblemon:regigigas"],
  ghost_white: ["cobblemon:ceruledge"],
  gholdengo_muken_aizen: ["cobblemon:gholdengo"],
  god_of_light_mewtwo: ["cobblemon:mewtwo"],
  grimmjow_sneasler: ["cobblemon:sneasler"],
  groudon_godzilla_base: ["cobblemon:groudon"],
  groudon_godzilla_burn: ["cobblemon:groudon"],
  hollow_ichigo_zoroark: ["cobblemon:zoroark"],
  hydreigon_kingghidora: ["cobblemon:hydreigon"],
  icecream_dragapult: ["cobblemon:dragapult"],
  icecream_ragingbolt: ["cobblemon:ragingbolt"],
  mermaid_eelektross: ["cobblemon:eelektross"],
  mermaid_gorebyss: ["cobblemon:gorebyss"],
  mermaid_milotic: ["cobblemon:milotic"],
  mermaid_primarina: ["cobblemon:primarina"],
  mermaid_volcarona: ["cobblemon:volcarona"],
  nika_lucario: ["cobblemon:lucario"],
  noelle_indeedee_female: ["cobblemon:indeedee"],
  "origin-forme": ["cobblemon:giratina"],
  pascua_ferrothorn: ["cobblemon:ferrothorn"],
  pascua_meowscarada: ["cobblemon:meowscarada"],
  rillaboom_kingkong: ["cobblemon:rillaboom"],
  shadow: ["cobblemon:lugia"],
  skeleton_overlord_armarouge: ["cobblemon:armarouge"],
  spectral: ["cobblemon:gabite", "cobblemon:garchomp", "cobblemon:gible"],
  spirit: ["cobblemon:garchomp"],
  tatsumi_incursio_ironvaliant: ["cobblemon:ironvaliant"],
  tyranitar_godzilla: ["cobblemon:groudon", "cobblemon:tyranitar"],
  "ultra-fusion": ["cobblemon:necrozma"],
  unbound: ["cobblemon:hoopa"],
  volcarona_mothra: ["cobblemon:volcarona"],
  white_ichigo_ironvaliant: ["cobblemon:ironvaliant"],
  zoro_ceruledge: ["cobblemon:ceruledge"],
} as const;

export type SkindexCatalogEntry = {
  id: string;
  species: string[];
};

export function listSkindexCatalog(): SkindexCatalogEntry[] {
  return Object.entries(SKINDEX_CATALOG)
    .map(([id, species]) => ({ id, species: [...species] }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function isKnownSkindexSkinId(skinId: string): boolean {
  return Object.prototype.hasOwnProperty.call(SKINDEX_CATALOG, skinId);
}
