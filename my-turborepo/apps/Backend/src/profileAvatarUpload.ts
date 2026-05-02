import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_BYTES = 2 * 1024 * 1024;

export type ValidatedImage = {
  contentType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  ext: "png" | "jpg" | "webp" | "gif";
};

/** Reject non-images and wrong magic bytes (do not trust Content-Type alone). */
export function validateProfileAvatarBuffer(buf: Buffer): ValidatedImage | null {
  if (!buf || buf.length < 12 || buf.length > MAX_BYTES) return null;

  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { contentType: "image/png", ext: "png" };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { contentType: "image/jpeg", ext: "jpg" };
  }
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  ) {
    return { contentType: "image/gif", ext: "gif" };
  }
  // RIFF....WEBP
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { contentType: "image/webp", ext: "webp" };
  }
  return null;
}

export async function uploadProfileAvatarToStorage(
  supabase: SupabaseClient,
  userId: number,
  buf: Buffer
): Promise<{ publicUrl: string } | { error: string }> {
  const v = validateProfileAvatarBuffer(buf);
  if (!v) return { error: "File must be a PNG, JPEG, WebP, or GIF under 2 MB." };

  const objectPath = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${v.ext}`;
  const { error: upErr } = await supabase.storage.from("avatars").upload(objectPath, buf, {
    contentType: v.contentType,
    upsert: false,
    cacheControl: "3600",
  });
  if (upErr) {
    const msg = upErr.message || "Upload failed";
    if (/bucket|not found/i.test(msg)) {
      return { error: 'Storage bucket "avatars" missing — create it in Supabase (see supabase/avatars_storage.sql).' };
    }
    return { error: msg };
  }

  const { data: pub } = supabase.storage.from("avatars").getPublicUrl(objectPath);
  const publicUrl = pub?.publicUrl?.trim();
  if (!publicUrl || !publicUrl.startsWith("https://")) {
    return { error: "Could not resolve public URL for avatar." };
  }
  return { publicUrl };
}
