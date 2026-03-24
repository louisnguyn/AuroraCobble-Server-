import net from "node:net";

/** Shown when TCP connect times out or OS reports ETIMEDOUT — packets never get a reply. */
const ETIMEDOUT_EXPLAIN =
  " The TCP handshake got no answer (not the same as wrong password). " +
  "Typical causes: (1) This port is not forwarded to your Minecraft process on the host — in Modrinth/Pterodactyl open Network and add a TCP allocation for RCON; rcon.port must match that port; restart the server. " +
  "(2) Only the game port is public — RCON often needs its own exposed port. " +
  "(3) Corporate/home firewall blocking outbound TCP to that port from the machine running the backend. " +
  "(4) Wrong host — use the same public IP/hostname that works for Query. " +
  "Workarounds: run the backend on the same host/VPN as Minecraft, use an SSH tunnel (forward local port to server:rcon), or set MC_COBBLEDOLLARS_DISABLE=true if you cannot expose RCON.";

/**
 * Raw TCP connect to see OS-level error (ECONNREFUSED vs ETIMEDOUT vs ENOTFOUND).
 * RCON library often only says "unreachable".
 */
export async function getTcpPortDiagnostics(
  host: string,
  port: number,
  timeoutMs = 6000
): Promise<string> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, family: 0 }, () => {
      socket.destroy();
      resolve(
        " Raw TCP to this host:port succeeded — if RCON still failed, check password or try restarting the server after changing rcon.password."
      );
    });
    socket.setTimeout(timeoutMs);
    socket.on("error", (err: NodeJS.ErrnoException) => {
      const code = err.code ?? "UNKNOWN";
      let hint = "";
      if (code === "ECONNREFUSED") {
        hint =
          " Nothing accepted the connection. Common: (1) rcon.port in server.properties does not match this port, (2) enable-rcon=false, (3) Modrinth/Pterodactyl: you must add a port allocation for RCON and restart — the game port alone is not enough, (4) backend uses wrong host (use server public IP, not 127.0.0.1 unless backend runs on the same machine as Minecraft).";
      } else if (code === "ETIMEDOUT") {
        hint = ETIMEDOUT_EXPLAIN;
      } else if (code === "ENOTFOUND") {
        hint = " Hostname not found — check MC_RCON_HOST / MC_SERVER_HOST spelling.";
      } else {
        hint = ` ${err.message}`;
      }
      resolve(` Raw TCP diagnostic: ${code}.${hint}`);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(` Raw TCP diagnostic: ETIMEDOUT.${ETIMEDOUT_EXPLAIN}`);
    });
  });
}

/**
 * Turn generic minecraft-server-util RCON errors into actionable hints.
 */
export function explainRconConnectionError(
  message: string,
  host: string,
  port: number
): string {
  const m = message.trim();
  if (/offline or unreachable/i.test(m) || /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(m)) {
    return (
      `${m} — RCON uses TCP on rcon.port (not the game/query port). ` +
      `Trying ${host}:${port}. Hosted panels often require a separate port allocation for RCON; set MC_RCON_PORT to that port and MC_RCON_HOST to the same reachable IP/hostname you use for Query (not localhost unless the backend runs on the server).`
    );
  }
  if (/authentication|password|login|failed/i.test(m)) {
    return `${m} — Check MC_RCON_PASSWORD matches rcon.password in server.properties exactly.`;
  }
  return m;
}
