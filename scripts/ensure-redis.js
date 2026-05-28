/**
 * Ensures redis/redis-server.exe exists.
 * Uses redis/ folder as canonical location; copies from node-bin only if needed.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const redisDir = path.join(root, "redis");
const destExe = path.join(redisDir, "redis-server.exe");
const sourceExe = path.join(root, "node-bin", "redis-server.exe");

function ensureRedis() {
  if (!fs.existsSync(redisDir)) {
    fs.mkdirSync(redisDir, { recursive: true });
  }

  if (!fs.existsSync(path.join(redisDir, "data"))) {
    fs.mkdirSync(path.join(redisDir, "data"), { recursive: true });
  }

  if (fs.existsSync(destExe)) {
    if (fs.existsSync(sourceExe)) {
      try {
        const srcStat = fs.statSync(sourceExe);
        const destStat = fs.statSync(destExe);
        if (srcStat.mtimeMs > destStat.mtimeMs && srcStat.size !== destStat.size) {
          fs.copyFileSync(sourceExe, destExe);
          console.log("[redis] Updated redis-server.exe from node-bin");
        }
      } catch {
        /* keep existing redis/redis-server.exe */
      }
    }
    return true;
  }

  if (fs.existsSync(sourceExe)) {
    fs.copyFileSync(sourceExe, destExe);
    console.log(`[redis] Copied redis-server.exe to ${destExe}`);
    return true;
  }

  console.error(`[redis] Missing redis-server.exe in ${redisDir}`);
  console.error("[redis] Place redis-server.exe in the redis/ folder, or add it under node-bin/ and run npm run redis:ensure");
  return false;
}

if (require.main === module) {
  process.exit(ensureRedis() ? 0 : 1);
}

module.exports = { ensureRedis, redisDir, destExe };
