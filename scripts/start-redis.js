/**
 * Start portable Redis: redis/redis-server.exe redis.conf (cwd = redis/)
 */
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");

const { ensureRedis, redisDir, destExe } = require("./ensure-redis");

const exe = destExe;
const conf = "redis.conf";
const host = process.env.REDIS_HOST || "127.0.0.1";
const port = Number(process.env.REDIS_PORT || 6379);

function isPortOpen() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(1500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function main() {
  if (!ensureRedis()) {
    process.exit(1);
  }

  if (await isPortOpen()) {
    console.log(`[redis] Already listening on ${host}:${port}`);
    return;
  }

  const child = spawn(exe, [conf], {
    cwd: redisDir,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });

  child.unref();

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await isPortOpen()) {
      console.log(`[redis] Started on ${host}:${port} (dir: ${path.join(redisDir, "data")})`);
      return;
    }
  }

  console.error("[redis] Failed to start — port still closed after 6s");
  process.exit(1);
}

main().catch((err) => {
  console.error("[redis] Start error:", err);
  process.exit(1);
});
