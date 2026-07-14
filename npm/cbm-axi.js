#!/usr/bin/env node

const path = require("node:path");
const { spawnSync } = require("node:child_process");

function assetName(platform = process.platform, arch = process.arch) {
  const os = { darwin: "darwin", linux: "linux", win32: "windows" }[platform];
  const cpu = { arm64: "arm64", x64: "amd64" }[arch];
  if (!os || !cpu) throw new Error(`unsupported platform: ${platform}-${arch}`);
  return `cbm-axi-${os}-${cpu}${platform === "win32" ? ".exe" : ""}`;
}

if (require.main === module) {
  const binary = path.join(__dirname, "..", "dist", assetName());
  const result = spawnSync(binary, process.argv.slice(2), { stdio: "inherit" });

  if (result.error) {
    console.error(`cbm-axi failed: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

module.exports = { assetName };
