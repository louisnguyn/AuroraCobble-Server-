import type { SupabaseClient } from "@supabase/supabase-js";
import { validateProfileAvatarBuffer } from "./profileAvatarUpload.js";

export async function uploadClanAvatarToStorage(
  supabase: SupabaseClient,
  clanId: number,
  buf: Buffer
): Promise<{ publicUrl: string } | { error: string }> {
  const v = validateProfileAvatarBuffer(buf);
  if (!v) return { error: "File must be a PNG, JPEG, WebP, or GIF under 2 MB." };

  const objectPath = `clans/${clanId}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${v.ext}`;
  const { error: upErr } = await supabase.storage.from("avatars").upload(objectPath, buf, {
    contentType: v.contentType,
    upsert: false,
    cacheControl: "3600",
  });
  if (upErr) {
    const msg = upErr.message || "Upload failed";
    if (/bucket|not found/i.test(msg)) {
      return {
        error: 'Storage bucket "avatars" missing — create it in Supabase (see supabase/avatars_storage.sql).',
      };
    }
    return { error: msg };
  }

  const { data: pub } = supabase.storage.from("avatars").getPublicUrl(objectPath);
  const publicUrl = pub?.publicUrl?.trim();
  if (!publicUrl || !publicUrl.startsWith("https://")) {
    return { error: "Could not resolve public URL for clan avatar." };
  }
  return { publicUrl };
}
