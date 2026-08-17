import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { supabase, type UserRow } from "./supabase.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "aurora-cobble-dev-secret-change-in-production";
const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export type JwtPayload = { userId: number; email: string; username: string; isAdmin?: boolean };

/** Official Minecraft vs cracked launcher — stored on `users.minecraft_client`. */
export type MinecraftClientType = "premium" | "crack";

export function parseMinecraftClientType(raw: unknown): MinecraftClientType | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "premium" || s === "crack") return s;
  return null;
}

export function readMinecraftClientField(
  row: { minecraft_client?: string | null } | null | undefined
): MinecraftClientType | null {
  return parseMinecraftClientType(row?.minecraft_client);
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  if (error || !data) return null;
  return data as UserRow;
}

export async function findUserById(id: number): Promise<UserRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return data as UserRow;
}

export async function createUser(params: {
  email: string;
  password: string;
  username: string;
  minecraftClient: MinecraftClientType;
}): Promise<UserRow | { error: string }> {
  if (!supabase) return { error: "Database not configured" };
  const email = params.email.trim().toLowerCase();
  const username = params.username.trim();
  if (!email || !params.password || !username)
    return { error: "Email, password, and username are required" };
  if (params.password.length < 8) return { error: "Password must be at least 8 characters" };
  if (!params.minecraftClient) return { error: "Choose Premium or Crack for your Minecraft account" };

  const existing = await findUserByEmail(email);
  if (existing) return { error: "An account with this email already exists" };

  const password_hash = await hashPassword(params.password);
  const { data, error } = await supabase
    .from("users")
    .insert({
      email,
      password_hash,
      username,
      is_admin: false,
      minecraft_client: params.minecraftClient,
    })
    .select()
    .single();

  if (error) {
    if (/minecraft_client|column.*does not exist/i.test(error.message)) {
      return {
        error: "Database missing minecraft_client — run supabase/users_minecraft_client.sql",
      };
    }
    return { error: error.message };
  }
  return data as UserRow;
}

export async function updatePasswordForUser(
  userId: number,
  currentPassword: string,
  newPassword: string
): Promise<{ ok: true } | { error: string }> {
  if (!supabase) return { error: "Database not configured" };
  if (newPassword.length < 8) return { error: "Password must be at least 8 characters" };
  const user = await findUserById(userId);
  if (!user) return { error: "User not found" };
  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) return { error: "Current password is incorrect" };
  if (currentPassword === newPassword) return { error: "New password must be different from your current password" };
  const password_hash = await hashPassword(newPassword);
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("users")
    .update({ password_hash, updated_at: now })
    .eq("id", userId);
  if (error) return { error: error.message };
  return { ok: true };
}

/** Staff-only password reset (no current password). */
export async function adminResetPassword(
  userId: number,
  newPassword: string
): Promise<{ ok: true } | { error: string }> {
  if (!supabase) return { error: "Database not configured" };
  if (newPassword.length < 8) return { error: "Password must be at least 8 characters" };
  const user = await findUserById(userId);
  if (!user) return { error: "User not found" };
  const password_hash = await hashPassword(newPassword);
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("users")
    .update({ password_hash, updated_at: now })
    .eq("id", userId);
  if (error) return { error: error.message };
  return { ok: true };
}
