const assert = require("node:assert/strict");
const test = require("node:test");
const { assetName } = require("./cbm-axi");

test("selects bundled executables", () => {
  assert.equal(assetName("darwin", "arm64"), "cbm-axi-darwin-arm64");
  assert.equal(assetName("linux", "x64"), "cbm-axi-linux-amd64");
  assert.equal(assetName("win32", "x64"), "cbm-axi-windows-amd64.exe");
  assert.throws(() => assetName("freebsd", "x64"), /unsupported platform/);
});
