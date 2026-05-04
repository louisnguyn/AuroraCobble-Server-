import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateProfileAvatarBuffer } from "./profileAvatarUpload.js";

export async function uploadRestrictionImageToStorage(
  supabase: SupabaseClient,
  buf: Buffer
): Promise<{ publicUrl: string } | { error: string }> {
  const v = validateProfileAvatarBuffer(buf);
  if (!v) return { error: "File must be a PNG, JPEG, WebP, or GIF under 2 MB." };

  const objectPath = `${Date.now()}_${randomUUID()}.${v.ext}`;
  const { error: upErr } = await supabase.storage.from("restriction_images").upload(objectPath, buf, {
    contentType: v.contentType,
    upsert: false,
    cacheControl: "3600",
  });
  if (upErr) {
    const msg = upErr.message || "Upload failed";
    if (/bucket|not found/i.test(msg)) {
      return {
        error:
          'Storage bucket "restriction_images" missing — run supabase/restriction_images_storage.sql in Supabase.',
      };
    }
    return { error: msg };
  }

  const { data: pub } = supabase.storage.from("restriction_images").getPublicUrl(objectPath);
  const publicUrl = pub?.publicUrl?.trim();
  if (!publicUrl || !publicUrl.startsWith("https://")) {
    return { error: "Could not resolve public URL for image." };
  }
  return { publicUrl };
}
