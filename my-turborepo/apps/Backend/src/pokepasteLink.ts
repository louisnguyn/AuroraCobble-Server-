import { normalizePasteForPokepaste } from "./pokepasteParse.js";

const POKEPASTE_CREATE_URL = "https://pokepast.es/create";
const MAX_PASTE_CHARS = 12_000;

export async function createPokepasteShareUrl(opts: {
  paste: string;
  title?: string;
  author?: string;
}): Promise<string> {
  const paste = normalizePasteForPokepaste(opts.paste.trim());
  if (!paste) {
    throw new Error("paste required");
  }
  if (paste.length > MAX_PASTE_CHARS) {
    throw new Error("paste too long");
  }

  const title = (opts.title ?? "Team").trim().slice(0, 200) || "Team";
  const author = (opts.author ?? "AuroraCobble").trim().slice(0, 100) || "AuroraCobble";

  const body = new URLSearchParams({ title, paste, author });

  const resp = await fetch(POKEPASTE_CREATE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "AuroraCobble-TeamBuilder/1.0 (+https://github.com/smogon/pokemon-showdown pokepaste)",
    },
    body: body.toString(),
    redirect: "manual",
  });

  const location = resp.headers.get("location");
  if (location) {
    return location.startsWith("http") ? location : new URL(location, "https://pokepast.es").href;
  }

  const text = await resp.text().catch(() => "");
  if (resp.ok) {
    const m = text.match(/https:\/\/pokepast\.es\/[a-zA-Z0-9]+/);
    if (m?.[0]) return m[0];
  }

  const snippet = text.slice(0, 200).replace(/\s+/g, " ");
  throw new Error(
    `PokePaste upload failed (${resp.status})${snippet ? `: ${snippet}` : ""}`
  );
}
