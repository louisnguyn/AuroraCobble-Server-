/**
 * AuroraCobble Pokémon deck — 52 cards mapped to ranks/regions for Texas Hold'em.
 */

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Region = "kanto" | "johto" | "hoenn" | "sinnoh";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";
export type RarityTier = "rare" | "paradox" | "ultra_beast" | "mythical" | "legendary";

export type PokemonCardDef = {
  rank: Rank;
  suit: Suit;
  region: Region;
  pokemon: string;
  slug: string;
  rarity: RarityTier;
};

export type PokemonCard = PokemonCardDef & {
  shiny: boolean;
  hidden?: boolean;
};

export const REGION_BY_SUIT: Record<Suit, Region> = {
  spades: "kanto",
  hearts: "johto",
  diamonds: "hoenn",
  clubs: "sinnoh",
};

export const REGION_LABEL: Record<Region, string> = {
  kanto: "Kanto",
  johto: "Johto",
  hoenn: "Hoenn",
  sinnoh: "Sinnoh",
};

export const REGION_DOT: Record<Region, string> = {
  kanto: "🟥",
  johto: "🟦",
  hoenn: "🟩",
  sinnoh: "🟨",
};

export const RARITY_LABEL: Record<RarityTier, string> = {
  rare: "Rare",
  paradox: "Paradox",
  ultra_beast: "Ultra Beast",
  mythical: "Mythical",
  legendary: "Legendary",
};

export const SHINY_CHANCE = 0.0025;

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];

type Mon = { pokemon: string; slug: string };

const LEGENDARY: Record<Region, Mon> = {
  kanto: { pokemon: "Mewtwo", slug: "mewtwo" },
  johto: { pokemon: "Lugia", slug: "lugia" },
  hoenn: { pokemon: "Rayquaza", slug: "rayquaza" },
  sinnoh: { pokemon: "Dialga", slug: "dialga" },
};

const MYTHICAL: Record<Region, Mon> = {
  kanto: { pokemon: "Mew", slug: "mew" },
  johto: { pokemon: "Celebi", slug: "celebi" },
  hoenn: { pokemon: "Jirachi", slug: "jirachi" },
  sinnoh: { pokemon: "Manaphy", slug: "manaphy" },
};

const ULTRA_BEAST: Record<Region, Mon> = {
  kanto: { pokemon: "Nihilego", slug: "nihilego" },
  johto: { pokemon: "Buzzwole", slug: "buzzwole" },
  hoenn: { pokemon: "Kartana", slug: "kartana" },
  sinnoh: { pokemon: "Blacephalon", slug: "blacephalon" },
};

const PARADOX: Record<Region, Mon> = {
  kanto: { pokemon: "Roaring Moon", slug: "roaringmoon" },
  johto: { pokemon: "Iron Valiant", slug: "ironvaliant" },
  hoenn: { pokemon: "Flutter Mane", slug: "fluttermane" },
  sinnoh: { pokemon: "Iron Bundle", slug: "ironbundle" },
};

const RARE_BY_REGION: Record<Region, Mon[]> = {
  kanto: [
    { pokemon: "Pikachu", slug: "pikachu" },
    { pokemon: "Arcanine", slug: "arcanine" },
    { pokemon: "Gengar", slug: "gengar" },
    { pokemon: "Dragonite", slug: "dragonite" },
    { pokemon: "Snorlax", slug: "snorlax" },
    { pokemon: "Lapras", slug: "lapras" },
    { pokemon: "Gyarados", slug: "gyarados" },
    { pokemon: "Alakazam", slug: "alakazam" },
    { pokemon: "Charizard", slug: "charizard" },
  ],
  johto: [
    { pokemon: "Typhlosion", slug: "typhlosion" },
    { pokemon: "Ampharos", slug: "ampharos" },
    { pokemon: "Scizor", slug: "scizor" },
    { pokemon: "Heracross", slug: "heracross" },
    { pokemon: "Tyranitar", slug: "tyranitar" },
    { pokemon: "Umbreon", slug: "umbreon" },
    { pokemon: "Espeon", slug: "espeon" },
    { pokemon: "Skarmory", slug: "skarmory" },
    { pokemon: "Kingdra", slug: "kingdra" },
  ],
  hoenn: [
    { pokemon: "Blaziken", slug: "blaziken" },
    { pokemon: "Gardevoir", slug: "gardevoir" },
    { pokemon: "Aggron", slug: "aggron" },
    { pokemon: "Flygon", slug: "flygon" },
    { pokemon: "Metagross", slug: "metagross" },
    { pokemon: "Salamence", slug: "salamence" },
    { pokemon: "Milotic", slug: "milotic" },
    { pokemon: "Absol", slug: "absol" },
    { pokemon: "Sceptile", slug: "sceptile" },
  ],
  sinnoh: [
    { pokemon: "Infernape", slug: "infernape" },
    { pokemon: "Luxray", slug: "luxray" },
    { pokemon: "Garchomp", slug: "garchomp" },
    { pokemon: "Lucario", slug: "lucario" },
    { pokemon: "Togekiss", slug: "togekiss" },
    { pokemon: "Weavile", slug: "weavile" },
    { pokemon: "Roserade", slug: "roserade" },
    { pokemon: "Electivire", slug: "electivire" },
    { pokemon: "Magmortar", slug: "magmortar" },
  ],
};

const NUMERIC_RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "T"];

function buildDeckDefs(): PokemonCardDef[] {
  const deck: PokemonCardDef[] = [];
  for (const suit of SUITS) {
    const region = REGION_BY_SUIT[suit];
    for (let i = 0; i < NUMERIC_RANKS.length; i++) {
      const rank = NUMERIC_RANKS[i]!;
      const mon = RARE_BY_REGION[region][i]!;
      deck.push({ rank, suit, region, pokemon: mon.pokemon, slug: mon.slug, rarity: "rare" });
    }
    const j = PARADOX[region];
    deck.push({ rank: "J", suit, region, pokemon: j.pokemon, slug: j.slug, rarity: "paradox" });
    const q = ULTRA_BEAST[region];
    deck.push({ rank: "Q", suit, region, pokemon: q.pokemon, slug: q.slug, rarity: "ultra_beast" });
    const k = MYTHICAL[region];
    deck.push({ rank: "K", suit, region, pokemon: k.pokemon, slug: k.slug, rarity: "mythical" });
    const a = LEGENDARY[region];
    deck.push({ rank: "A", suit, region, pokemon: a.pokemon, slug: a.slug, rarity: "legendary" });
  }
  return deck;
}

export const POKEMON_DECK_DEFS: PokemonCardDef[] = buildDeckDefs();

export function rankDisplay(rank: Rank): string {
  return rank === "T" ? "10" : rank;
}

export function rollShiny(): boolean {
  return Math.random() < SHINY_CHANCE;
}

export function toPokemonCard(def: PokemonCardDef, shiny = rollShiny()): PokemonCard {
  return { ...def, shiny };
}

export function createShuffledPokemonDeck(): PokemonCard[] {
  const deck = POKEMON_DECK_DEFS.map((d) => toPokemonCard(d));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

export function drawFromDeck(deck: PokemonCard[], count: number): PokemonCard[] {
  return deck.splice(0, count);
}

export function hiddenCard(): PokemonCard {
  return {
    rank: "A",
    suit: "spades",
    region: "kanto",
    pokemon: "?",
    slug: "",
    rarity: "rare",
    shiny: false,
    hidden: true,
  };
}
