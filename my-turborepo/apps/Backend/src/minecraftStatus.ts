import { queryFull, status } from "minecraft-server-util";

export type MinecraftServerPayload = {
  ok: true;
  source: "query" | "status";
  online: number;
  maxPlayers: number;
  /** Raw online player names from Query / ping (before roster merge) */
  onlinePlayerNames: { name: string }[];
  motd?: string;
  version?: string;
  protocol?: number;
  latencyMs?: number;
  note?: string;
  software?: string;
  plugins?: string[];
  mapName?: string;
  reportedHost?: string;
  reportedPort?: number;
  srvTarget?: string;
  faviconDataUri?: string;
};

function readConfig(): { host: string; gamePort: number; queryPort: number; timeout: number } | null {
  const host = process.env.MC_SERVER_HOST?.trim();
  if (!host) return null;
  const gamePort = parseInt(process.env.MC_SERVER_PORT ?? "25565", 10);
  const queryPort = process.env.MC_QUERY_PORT
    ? parseInt(process.env.MC_QUERY_PORT, 10)
    : gamePort;
  const timeout = Math.min(
    Math.max(parseInt(process.env.MC_QUERY_TIMEOUT_MS ?? "8000", 10) || 8000, 2000),
    30000
  );
  return { host, gamePort, queryPort, timeout };
}

export async function fetchMinecraftServerPayload(): Promise<MinecraftServerPayload> {
  const cfg = readConfig();
  if (!cfg) {
    throw new Error("MC_SERVER_HOST_NOT_SET");
  }
  const { host, gamePort, queryPort, timeout } = cfg;

  const enrichFromStatus = async () => {
    try {
      return await status(host, gamePort, { timeout, enableSRV: true });
    } catch {
      return null;
    }
  };

  const faviconFromStatus = (s: Awaited<ReturnType<typeof enrichFromStatus>>) => {
    if (!s?.favicon || s.favicon.length >= 500_000) return undefined;
    return s.favicon.startsWith("data:") ? s.favicon : `data:image/png;base64,${s.favicon}`;
  };

  try {
    const full = await queryFull(host, queryPort, { timeout, enableSRV: true });
    const s = await enrichFromStatus();
    const onlinePlayerNames = full.players.list.map((name) => ({ name }));

    return {
      ok: true,
      source: "query",
      online: full.players.online,
      maxPlayers: full.players.max,
      onlinePlayerNames,
      motd: full.motd.clean,
      version: full.version,
      protocol: s?.version.protocol,
      latencyMs: s?.roundTripLatency,
      software: full.software || undefined,
      plugins: full.plugins?.length ? full.plugins : undefined,
      mapName: full.map || undefined,
      reportedHost: full.hostIP || undefined,
      reportedPort: full.hostPort,
      srvTarget: s?.srvRecord ? `${s.srvRecord.host}:${s.srvRecord.port}` : undefined,
      faviconDataUri: faviconFromStatus(s),
    };
  } catch (queryErr) {
    try {
      const s = await status(host, gamePort, { timeout, enableSRV: true });
      const sample = s.players.sample ?? [];
      const online = s.players.online;
      const note =
        online > 0 && sample.length < online
          ? "Server list ping only includes a sample of players when many are online. Enable query in server.properties for full list."
          : undefined;
      return {
        ok: true,
        source: "status",
        online,
        maxPlayers: s.players.max,
        onlinePlayerNames: sample.map((p) => ({ name: p.name })),
        motd: s.motd.clean,
        version: s.version.name,
        protocol: s.version.protocol,
        latencyMs: s.roundTripLatency,
        note,
        srvTarget: s.srvRecord ? `${s.srvRecord.host}:${s.srvRecord.port}` : undefined,
        faviconDataUri: faviconFromStatus(s),
      };
    } catch (statusErr) {
      const q = queryErr instanceof Error ? queryErr.message : String(queryErr);
      const st = statusErr instanceof Error ? statusErr.message : String(statusErr);
      throw new Error(`Query failed: ${q}; Status ping failed: ${st}`);
    }
  }
}
