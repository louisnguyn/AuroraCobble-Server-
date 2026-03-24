# RCON still “unreachable” with correct password

The game **Query** port and **RCON** port are different:

| | Typical |
|---|-----|
| Game + server list ping | `server-port` (e.g. 25565 or your panel’s main port) |
| Query (UDP) | `query.port` (often same as game) |
| **RCON (TCP)** | **`rcon.port`** (often **25575** unless you changed it) |

## Checklist

1. **`server.properties`** (on the Minecraft host)
   - `enable-rcon=true`
   - `rcon.port=<number>` — must match **`MC_RCON_PORT`** in your backend `.env`
   - `rcon.password=<same as MC_RCON_PASSWORD>`

2. **Modrinth / Pterodactyl / similar**
   - You usually need a **separate port allocation** for RCON (TCP), not only the main Minecraft port.
   - After adding it, set `rcon.port` to that port (or the port the panel assigns) and **restart** the server.

3. **Where the backend runs**
   - **On your PC** → use the server’s **public IP** or hostname (same as Query). **`127.0.0.1` only works** if Minecraft runs on the same machine as the backend.
   - **On a VPS** in the same LAN as the game server → you might use a private IP if allowed.

4. **Firewall**
   - Allow **inbound TCP** on `rcon.port` to the machine running Minecraft (panel firewall + OS firewall if any).

5. **Read the new diagnostic in the Admin error**
   - After the next deploy, the API appends a **Raw TCP diagnostic** (`ECONNREFUSED`, `ETIMEDOUT`, etc.) to explain what failed.

## If you see **ETIMEDOUT**

That means your **backend’s computer** sent TCP packets to `MC_RCON_HOST:MC_RCON_PORT` and **never got a reply** (not a password error — the connection never reaches RCON).

- **Hosted server (Modrinth, etc.)**  
  - Open **Network** → **Allocations** (or similar).  
  - Add **another** TCP port for **RCON** (not only the main Minecraft port).  
  - Set `rcon.port` in `server.properties` to **that** port **and** set `MC_RCON_PORT` to the same.  
  - Restart the Minecraft server.  
  Some panels only publish the primary game port to the internet; RCON won’t work until that extra TCP port exists and is forwarded.

- **Test from your PC** (PowerShell):  
  `Test-NetConnection -ComputerName YOUR_HOST -Port YOUR_RCON_PORT`  
  If `TcpTestSucceeded` is **False** and **ETIMEDOUT**, the port is not reachable from the internet the way you’re testing — fix panel/firewall first.

- **If you can’t expose RCON** (provider policy)  
  - Use **`MC_COBBLEDOLLARS_DISABLE=true`** for the dashboard, or  
  - Run the backend **on the same machine** as Minecraft (then `MC_RCON_HOST=127.0.0.1`), or  
  - Use an **SSH tunnel** from your dev machine to the server’s RCON port.

## Disable Cobble$ over RCON (optional)

If you only need Query/whitelist and not Cobble$ via RCON:

```env
MC_COBBLEDOLLARS_DISABLE=true
```
