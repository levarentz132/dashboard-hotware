# Portable Redis (Hotware Dashboard)

```
redis/
  redis-server.exe
  redis.conf
  data/              ← AOF persistence (appendonly yes)
```

## Server data model (Redis-only)

The Next.js server uses Redis as a **persistent key-value store**, not a TTL cache:

- **SET** only (no `SETEX` / `PEXPIREAT`)
- **No** logout `DEL` / scan cleanup
- **No** in-memory fallback if Redis is down (reads miss, writes skip)

Stale API responses remain until the **same key** is written again or you flush Redis manually.

**Mutation overwrite:** successful NX proxy `POST`/`PUT`/`PATCH`/`DELETE` responses overwrite the matching `GET` cache entry for the same URL (no `DEL`).

**Scheduled recordings:** `hotware:scheduled_recordings` — `writeScheduledRecordings()`. Legacy `data/scheduled_recordings.json` migrates on first read.

**FFmpeg queue:** `hotware:ffmpeg_queue` — background auto-save jobs via `ffmpeg-queue.ts` / `ffmpeg-queue-store.ts`. Legacy `data/ffmpeg_queue.json` migrates on first read.

**Notifications:** `hotware:notifications` — per-user inbox via `/api/notifications` and `notifications-store.ts`. Legacy `data/notifications.json` migrates on first read.

**NX API cache (`/api/nx` + local `/nx` proxy):** `hotware:nx:api:{hash}` — GET responses for devices, servers, system info, events, alarms, storages, etc. Single-flight deduplication prevents concurrent duplicate upstream calls. Response header `X-NX-Cache: HIT|MISS`. Skip with request header `x-skip-nx-cache: 1`.

**Shared device documents (per system):**

- `hotware:nx:devices:{systemId}` — full device list
- `hotware:nx:devices:status:{systemId}` — status payload
- `hotware:nx:devices:index:{systemId}` — id/name/hash maps (used by recordings API)

Device mutations mark these stale (overwrite with stale marker, no `DEL`). Next GET repopulates from NX.

- `hotware:nx:devices:summary:{systemId}` — lightweight list (id, name, status) for grids/monitor
- `hotware:cloud_systems:{auth}` — NX Cloud systems list
- `hotware:device_monitor:latest` — last background monitor snapshot

**Conditional GET:** `/api/nx` sends `If-None-Match` when a cached ETag exists; `304` responses are served from Redis (`X-NX-Cache-Source: 304`).

**Monitor:** `GlobalDeviceMonitor` polls `/api/nx/devices/status` (not full `/devices`) every 60s and merges names from `/api/nx/devices-summary` (Redis-only).

All of the above use SET with no TTL and persist across app restarts via Redis AOF in `redis/data/`.

Browser-side caching (React Query, `cloudSystemsCache`) is unchanged.

## Start

```bat
npm run redis:start
```

Or:

```bat
cd redis
redis-server.exe redis.conf
```

## Config (`redis.conf`)

- `bind 127.0.0.1`
- `port 6379`
- `appendonly yes` + `dir ./data`
- `protected-mode yes`

## Environment

```
REDIS_URL=redis://127.0.0.1:6379
REDIS_ENABLED=false   # disables Redis reads/writes (no fallback store)
```

## Manual flush (when data is stale)

```bat
redis-cli -h 127.0.0.1 FLUSHDB
```

Or delete `redis/data/*` while Redis is stopped (AOF files).
