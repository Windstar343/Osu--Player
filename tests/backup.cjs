const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const { buildSync } = require(
  require.resolve("esbuild", {
    paths: [path.dirname(require.resolve("vite/package.json"))],
  }),
);
const output = buildSync({
  entryPoints: [path.join(__dirname, "../src/playlistBackup.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
});
const moduleUnderTest = new Module(path.join(__dirname, "backup-bundle.cjs"));
moduleUnderTest._compile(
  output.outputFiles[0].text,
  path.join(__dirname, "backup-bundle.cjs"),
);
const { makeBackup, readBackup } = moduleUnderTest.exports;
const songs = [
  { id: "old-path", title: "Pulse", artist: "Artist", beatmapSetId: 42 },
];
const playlists = [
  { id: "original", name: "Favorites", trackIds: ["old-path", "unavailable"] },
];
const backup = makeBackup(playlists, songs);
const imported = readBackup(backup, [{ ...songs[0], id: "new-path" }]);
assert.equal(imported[0].name, "Favorites");
assert.notEqual(imported[0].id, "original");
assert.deepEqual(imported[0].trackIds, ["new-path", "unavailable"]);
assert.deepEqual(playlists[0].trackIds, ["old-path", "unavailable"]);
assert.throws(() => readBackup('{"version":99}', []));
assert.throws(() =>
  readBackup(
    JSON.stringify({
      format: "osu-player-playlists",
      version: 1,
      songs: [],
      playlists: [{ name: "Bad", trackIds: [42] }],
    }),
    [],
  ),
);
const ambiguous = readBackup(backup, [
  { ...songs[0], id: "one", beatmapSetId: 1 },
  { ...songs[0], id: "two", beatmapSetId: 2 },
]);
assert.equal(ambiguous[0].trackIds[0], "old-path");
console.log(
  "PASS: playlist backup round trip, moved-path matching, preserving unavailable songs, ambiguity, and malformed input.",
);
