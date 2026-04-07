import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase: SupabaseClient | null =
  url && serviceKey ? createClient(url, serviceKey) : null;

export type UserRow = {
  id: number;
  email: string;
  password_hash: string;
  username: string;
  is_admin: boolean;
  /** Set by admin when user was online on the configured Minecraft server (username = IGN). */
  minecraft_verified_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type TeamRow = {
  id: number;
  user_id: number;
  name: string;
  format: string;
  created_at: string;
  updated_at: string;
};

export type TeamSlotRow = {
  id: number;
  team_id: number;
  slot_index: number;
  pokemon_id: number | null;
  item_id: number | null;
  created_at: string;
  updated_at: string;
};

export type GachaPoolRow = {
  id: number;
  name: string;
  type: string;
  config: Record<string, unknown> | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GachaRewardRow = {
  id: number;
  pool_id: number;
  reward_type: string;
  reward_id: number;
  weight: number;
  created_at: string;
};

export type UserCurrencyRow = {
  id: number;
  user_id: number;
  currency_type: string;
  balance: number;
  created_at: string;
  updated_at: string;
};
