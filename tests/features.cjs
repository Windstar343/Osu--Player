const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const art =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#d64e8e"/><stop offset="1" stop-color="#3b2869"/></linearGradient></defs><rect width="800" height="800" fill="url(#g)"/><circle cx="400" cy="400" r="200" fill="none" stroke="#ffffff55" stroke-width="24"/></svg>';
const wav = Buffer.alloc(44 + 8000 * 2 * 120);
wav.write("RIFF");
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24);
wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 0; i < (wav.length - 44) / 2; i++)
  wav.writeInt16LE(
    Math.round(Math.sin((2 * Math.PI * 440 * i) / 8000) * 5000),
    44 + i * 2,
  );
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/audio") {
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Accept-Ranges", "bytes");
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
    if (range) {
      const start = Number(range[1]),
        end = range[2]
          ? Math.min(Number(range[2]), wav.length - 1)
          : wav.length - 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${wav.length}`,
        "Content-Length": end - start + 1,
      });
      res.end(wav.subarray(start, end + 1));
    } else {
      res.setHeader("Content-Length", wav.length);
      res.end(wav);
    }
    return;
  }
  if (url === "/art" && art) {
    res.setHeader("Content-Type", "image/svg+xml");
    res.end(art);
    return;
  }
  const file = path.join(root, "dist", url === "/" ? "index.html" : url);
  try {
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : "text/html",
    );
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 820 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.addInitScript(() => {
      if (!localStorage.getItem("librarySourcesV1"))
        localStorage.setItem(
          "librarySourcesV1",
          JSON.stringify([
            { kind: "stable", folder: "stable", enabled: true },
            { kind: "lazer", folder: "lazer", enabled: true },
          ]),
        );
      window.isTauri = true;
      window.scans = 0;
      window.revision = "one";
      window.calls = [];
      window.filters = [];
      window.oscillators = [];
      window.gains = [];
      const createOscillator = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function () {
        const node = createOscillator.call(this);
        window.oscillators.push(node);
        return node;
      };
      const createGain = AudioContext.prototype.createGain;
      AudioContext.prototype.createGain = function () {
        const node = createGain.call(this);
        window.gains.push(node);
        return node;
      };
      window.callbacks = {};
      window.presence = { enabled: false };
      const createSource = AudioContext.prototype.createMediaElementSource;
      AudioContext.prototype.createMediaElementSource = function (element) {
        const node = createSource.call(this, element);
        const analyser = this.createAnalyser();
        analyser.fftSize = 8192;
        analyser.smoothingTimeConstant = 0;
        node.connect(analyser);
        if (element === document.querySelector("audio"))
          window.toneFrequency = () => {
            const values = new Float32Array(analyser.frequencyBinCount);
            analyser.getFloatFrequencyData(values);
            let peak = 0;
            for (let i = 1; i < values.length; i++)
              if (values[i] > values[peak]) peak = i;
            return (peak * this.sampleRate) / analyser.fftSize;
          };
        return node;
      };
      const base = AudioContext.prototype.createBiquadFilter;
      AudioContext.prototype.createBiquadFilter = function () {
        const node = base.call(this);
        window.filters.push(node);
        return node;
      };
      window.__TAURI_INTERNALS__ = {
        transformCallback: (callback) => {
          const id = Object.keys(window.callbacks).length + 1;
          window.callbacks[id] = callback;
          return id;
        },
        unregisterCallback: () => {},
        convertFileSrc: (p) => (p === "art" ? "/art" : "/audio"),
        invoke: async (cmd, args) => {
          window.calls.push({ cmd, args });
          if (cmd === "discover_sources")
            return [
              { kind: "stable", folder: "stable", enabled: true },
              { kind: "lazer", folder: "lazer", enabled: true },
            ];
          if (cmd === "update_discord") {
            window.presence = args.presence;
            return null;
          }
          if (cmd === "discord_status")
            return window.presence.enabled
              ? window.presence.playing
                ? "Showing your current song on Discord"
                : "Waiting for playback"
              : "Off";
          if (cmd === "library_revision") return window.revision;
          if (cmd === "scan_sources") {
            window.scans++;
            const tracks = [
              {
                id: "a",
                title: "Pulse",
                artist: "Artist A",
                creator: "Mapper A",
                audioPath: "audio",
                backgroundPath: "art",
                sources: ["stable"],
                modes: [0, 3],
                timingPoints: [{ time: 0, beatLength: 500, meter: 4 }],
                beatmapSetId: 123,
              },
              {
                id: "b",
                title: "Dawn",
                artist: "Artist B",
                creator: "Mapper B",
                audioPath: "audio",
                backgroundPath: "art",
                sources: ["lazer"],
                modes: [1],
                timingPoints: [
                  { time: 0, beatLength: 500, meter: 4 },
                  { time: 1000, beatLength: 400, meter: 4 },
                ],
                beatmapSetId: 456,
              },
              {
                id: "c",
                title: "Sky",
                artist: "Artist C",
                creator: "Mapper A",
                audioPath: "audio",
                backgroundPath: "art",
                sources: ["stable", "lazer"],
                modes: [2],
              },
            ];
            if (localStorage.getItem("largeFixture"))
              for (let i = 0; i < 10000; i++)
                tracks.push({
                  ...tracks[0],
                  id: "large-" + i,
                  title: "Fixture " + i,
                });
            if (window.revision === "two")
              tracks.push({
                id: "d",
                title: "New download",
                artist: "New artist",
                creator: "Mapper A",
                audioPath: "audio",
                sources: ["lazer"],
                modes: [0],
              });
            return {
              tracks:
                window.revision === "three"
                  ? tracks.filter((t) => t.id !== "a")
                  : tracks,
              skipped: 0,
              warnings: [],
            };
          }
          if (cmd === "plugin:dialog|save") return "backup.json";
          if (cmd === "plugin:dialog|open")
            return args?.options?.title?.startsWith("Locate audio")
              ? "relinked.mp3"
              : "backup.json";
          if (cmd === "audio_file_info")
            return {
              exists: window.fileExists !== false,
              bytes: 1048576,
              format: "mp3",
            };
          if (cmd === "authorize_audio_file") return args.path;
          if (cmd === "show_audio_file") return null;
          if (cmd === "artwork_thumbnail") return "art";
          if (cmd === "write_playlist_backup") {
            window.backup = args.content;
            return null;
          }
          if (cmd === "read_playlist_backup") return window.backup;
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "toggle_fullscreen") return true;
          return null;
        },
      };
    });
    await page.goto("http://127.0.0.1:" + server.address().port);
    await page.locator(".track").nth(2).waitFor();
    await page.getByLabel("Filter by source").selectOption("lazer");
    assert.equal(await page.locator(".track").count(), 2);
    await page.getByLabel("Filter by source").selectOption("all");
    await page.getByLabel("Filter by game mode").selectOption("3");
    assert.equal(await page.locator(".track").count(), 1);
    assert.match(await page.locator(".song").innerText(), /Pulse/);
    await page.getByLabel("Filter by game mode").selectOption("all");
    await page.getByLabel("Filter by mapper").selectOption("Mapper B");
    assert.equal(await page.locator(".track").count(), 1);
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();

    await page
      .getByRole("button", { name: "Create playlist", exact: true })
      .click();
    await page.getByLabel("Playlist name").fill("Night drive");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Create playlist", exact: true })
      .click();
    await page
      .locator("aside")
      .getByRole("button", { name: /Your library/ })
      .click();
    for (const song of ["Pulse", "Dawn"]) {
      await page
        .getByRole("button", {
          name: "Add " + song + " to playlist",
          exact: true,
        })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: /Night drive/ })
        .click();
    }
    await page
      .locator("aside")
      .getByRole("button", { name: /Night drive/ })
      .click();
    assert.deepEqual(await page.locator(".song strong").allTextContents(), [
      "Pulse",
      "Dawn",
    ]);
    await page
      .getByRole("button", { name: "Move Dawn up", exact: true })
      .click();
    assert.deepEqual(await page.locator(".song strong").allTextContents(), [
      "Dawn",
      "Pulse",
    ]);
    await page
      .getByRole("button", { name: "Rename playlist", exact: true })
      .click();
    await page.getByLabel("Playlist name").fill("After hours");
    await page.getByRole("button", { name: "Save name", exact: true }).click();
    await page.getByRole("button", { name: "Play Dawn", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector("audio").paused);
    await page
      .getByRole("button", { name: "Open Now Playing", exact: true })
      .click();
    await page
      .getByRole("region", { name: "Now Playing", exact: true })
      .waitFor();
    await page.waitForFunction(
      () => document.querySelector(".large-art img").complete,
    );
    await page
      .getByRole("button", { name: "Double Time", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector("audio").playbackRate === 1.5 &&
        document.querySelector("audio").preservesPitch,
    );
    await page.waitForFunction(
      () => Math.abs(window.toneFrequency() - 440) < 15,
    );
    const beforeMod = await page.evaluate(
      () => document.querySelector("audio").currentTime,
    );
    await page.getByRole("button", { name: "Nightcore", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector("audio").playbackRate === 1.5 &&
        !document.querySelector("audio").preservesPitch,
    );
    await page.waitForFunction(
      () => Math.abs(window.toneFrequency() - 660) < 15,
    );
    assert.equal(await page.evaluate(() => window.oscillators.length), 0);
    assert.ok(
      Math.abs(
        (await page.evaluate(
          () => document.querySelector("audio").currentTime,
        )) - beforeMod,
      ) < 2,
    );
    await page.getByLabel("Volume", { exact: true }).fill("0");
    await page.waitForFunction(() => window.gains[0].gain.value === 0);
    await page.getByLabel("Volume", { exact: true }).fill("0.7");
    await page
      .getByRole("button", { name: "Double Time", exact: true })
      .click();
    const drumCount = await page.evaluate(() => window.oscillators.length);
    await page.waitForTimeout(350);
    assert.equal(
      await page.evaluate(() => window.oscillators.length),
      drumCount,
    );
    await page.getByRole("button", { name: "Normal", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector("audio").playbackRate === 1,
    );
    for (const viewport of [
      { width: 1280, height: 820 },
      { width: 2559, height: 1394 },
      { width: 900, height: 640 },
    ]) {
      await page.setViewportSize(viewport);
      const layout = await page
        .locator(".expanded-content")
        .evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            centerY: bounds.top + bounds.height / 2,
            centerX: bounds.left + bounds.width / 2,
            bottom: bounds.bottom,
            width: innerWidth,
            height: innerHeight,
            noScroll:
              document.documentElement.scrollWidth <= innerWidth &&
              document.documentElement.scrollHeight <= innerHeight,
            clipped:
              getComputedStyle(document.querySelector(".expanded-player"))
                .overflow === "hidden",
          };
        });
      assert.ok(Math.abs(layout.centerX - layout.width / 2) < 2);
      assert.ok(Math.abs(layout.centerY - layout.height / 2) < 35);
      assert.ok(layout.bottom <= layout.height);
      assert.ok(layout.noScroll && layout.clipped);
    }
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.screenshot({
      path: path.join(root, "test-results", "now-playing.png"),
    });
    await page.getByRole("button", { name: "Next song", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector(".expanded-song-title h1").textContent ===
        "Pulse",
    );
    assert.equal(
      await page.evaluate(() => document.querySelector("audio").paused),
      false,
    );
    await page
      .getByRole("button", { name: "Back to library", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Remove Dawn from playlist", exact: true })
      .click();
    assert.equal(await page.locator(".track").count(), 1);

    await page
      .locator("aside")
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await page
      .getByLabel("Playback speed", { exact: true })
      .selectOption("1.25");
    await page.waitForFunction(
      () => document.querySelector("audio").playbackRate === 1.25,
    );
    await page
      .getByRole("checkbox", { name: "Equalizer", exact: true })
      .check();
    await page.waitForFunction(() => window.filters.length >= 5);
    await page.getByRole("button", { name: "Bass boost", exact: true }).click();
    await page.waitForFunction(() => window.filters[0].gain.value === 6);
    await page
      .getByRole("checkbox", { name: "Reduce loud peaks", exact: true })
      .check();
    await page
      .getByRole("checkbox", {
        name: "Minimize to the system tray",
        exact: true,
      })
      .check();
    await page.waitForFunction(() =>
      window.calls.some(
        (c) =>
          c.cmd === "set_desktop_preferences" &&
          c.args.preferences.minimizeToTray,
      ),
    );
    await page
      .getByRole("button", { name: "Minimize player", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() =>
        window.calls.some((c) => c.cmd === "minimize_player"),
      ),
      true,
    );
    await page.screenshot({
      path: path.join(root, "test-results", "settings.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Reset audio settings", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelector("audio").playbackRate === 1,
    );
    assert.equal(
      await page
        .getByRole("checkbox", { name: "Equalizer", exact: true })
        .isChecked(),
      false,
    );

    const sharing = page.getByRole("checkbox", {
      name: "Show current song on Discord",
      exact: true,
    });
    assert.equal(await sharing.isChecked(), false);
    assert.equal(
      await page.evaluate(() =>
        window.calls.some(
          (c) => c.cmd === "update_discord" && c.args.presence.enabled,
        ),
      ),
      false,
    );
    await sharing.check();
    await page.waitForFunction(
      () =>
        window.presence.enabled &&
        window.presence.title === "Pulse" &&
        window.presence.artist === "Artist A",
    );
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.waitForFunction(() => !window.presence.playing);
    await sharing.uncheck();
    await page.waitForFunction(() => window.presence.enabled === false);
    assert.equal(await page.evaluate(() => window.presence.title), undefined);
    assert.equal(
      await page
        .getByRole("checkbox", { name: "Nightcore drums", exact: true })
        .count(),
      0,
    );
    await page.clock.install();
    await page
      .getByLabel("Refresh interval", { exact: true })
      .selectOption("15");
    const scans = await page.evaluate(() => window.scans);
    await page.evaluate(() => (window.revision = "two"));
    await page.clock.fastForward(15001);
    await page.waitForFunction((previous) => window.scans > previous, scans);
    await page
      .locator("aside")
      .getByRole("button", { name: /Your library/ })
      .click();
    assert.equal(await page.locator(".track").count(), 4);
    await page.getByRole("button", { name: "Play Pulse", exact: true }).click();
    await page
      .getByRole("button", { name: "Open Now Playing", exact: true })
      .click();
    await page.evaluate(() => (window.revision = "three"));
    await page.clock.fastForward(15001);
    await page.waitForFunction(
      () => !document.querySelector(".expanded-player"),
    );
    assert.equal(await page.locator("footer").count(), 1);
    await page.evaluate(() => (window.fileExists = false));
    await page
      .locator("aside")
      .getByRole("button", { name: /Unavailable/ })
      .click();
    await page
      .getByRole("button", { name: "Song details for Pulse", exact: true })
      .click();
    const details = page.getByRole("dialog", {
      name: "Song details",
      exact: true,
    });
    await page.waitForFunction(() =>
      document
        .querySelector(".song-details")
        .textContent.includes("Unavailable —"),
    );
    await page.screenshot({
      path: path.join(root, "test-results", "missing-song.png"),
    });
    await page.evaluate(() => (window.fileExists = true));
    await details
      .getByRole("button", { name: "Locate audio file", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("audioOverridesV1")).a ===
        "relinked.mp3",
    );
    await details
      .getByRole("button", { name: "Close song details", exact: true })
      .click();

    await page.clock.resume();

    await page.reload();
    await page.locator(".track").nth(2).waitFor();
    await page
      .locator("aside")
      .getByRole("button", { name: /After hours/ })
      .click();
    assert.deepEqual(await page.locator(".song strong").allTextContents(), [
      "Pulse",
    ]);
    await page
      .getByRole("button", { name: "Delete playlist", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete playlist", exact: true })
      .click();
    assert.equal(
      await page
        .locator("aside")
        .getByRole("button", { name: /After hours/ })
        .count(),
      0,
    );
    // Queue insertion, duplicate entries, reorder and removal keep the current
    // entry anchored. Native calls are asserted separately from browser layout.
    await page.getByRole("button", { name: "Play Pulse", exact: true }).click();
    await page.getByRole("button", { name: "Open queue", exact: true }).click();
    const queue = page.getByRole("region", { name: "Playback queue" });
    await queue
      .getByRole("button", { name: "Clear queue", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Close queue", exact: true })
      .click();
    await page.getByLabel("Queue options for Sky", { exact: true }).click();
    await page.getByRole("button", { name: "Play next", exact: true }).click();
    await page.getByLabel("Queue options for Dawn", { exact: true }).click();
    await page
      .getByRole("button", { name: "Add to queue", exact: true })
      .click();
    await page.getByRole("button", { name: "Open queue", exact: true }).click();
    assert.deepEqual(
      await queue.locator(".queue-song strong").allTextContents(),
      ["Pulse", "Sky", "Dawn"],
    );
    await queue.getByLabel("Move queued song 3 up", { exact: true }).click();
    assert.deepEqual(
      await queue.locator(".queue-song strong").allTextContents(),
      ["Pulse", "Dawn", "Sky"],
    );
    await queue
      .getByRole("listitem")
      .nth(2)
      .dragTo(queue.getByRole("listitem").nth(1));
    assert.deepEqual(
      await queue.locator(".queue-song strong").allTextContents(),
      ["Pulse", "Sky", "Dawn"],
    );
    await queue
      .getByRole("listitem")
      .nth(1)
      .dragTo(queue.getByRole("listitem").nth(2));
    assert.deepEqual(
      await queue.locator(".queue-song strong").allTextContents(),
      ["Pulse", "Dawn", "Sky"],
    );
    await queue.getByLabel("Remove queued song 3", { exact: true }).click();
    assert.equal(
      await queue
        .getByLabel("Remove queued song 1", { exact: true })
        .isDisabled(),
      true,
    );
    await page.screenshot({
      path: path.join(root, "test-results", "queue.png"),
    });
    await queue
      .getByRole("button", { name: "Close queue", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelector("audio").readyState >= 3,
    );
    await page.getByLabel("Playback position", { exact: true }).fill("37");
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.waitForTimeout(2100);
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector("audio").currentTime >= 37,
    );
    assert.equal(
      await page.evaluate(() => document.querySelector("audio").paused),
      true,
    );
    assert.equal(
      await page.evaluate(() => navigator.mediaSession.metadata.title),
      "Pulse",
    );
    await page.getByRole("button", { name: "Open queue", exact: true }).click();
    assert.deepEqual(
      await queue.locator(".queue-song strong").allTextContents(),
      ["Pulse", "Dawn"],
    );
    await queue
      .getByRole("button", { name: "Close queue", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Open mini-player", exact: true })
      .click();
    await page.setViewportSize({ width: 380, height: 360 });
    await page
      .getByRole("region", { name: "Mini-player", exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(() =>
        window.calls.some(
          (c) => c.cmd === "set_mini_player" && c.args.enabled && c.args.pinned,
        ),
      ),
      true,
    );
    await page.screenshot({
      path: path.join(root, "test-results", "mini-player.png"),
    });
    assert.equal(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= 380 &&
          document.documentElement.scrollHeight <= 360,
      ),
      true,
    );
    await page
      .getByRole("button", { name: "Keep mini-player on top", exact: true })
      .click();
    await page.waitForFunction(() =>
      window.calls.some(
        (c) => c.cmd === "set_mini_player" && c.args.enabled && !c.args.pinned,
      ),
    );
    await page.mouse.move(0, 400);
    await page.waitForTimeout(1800);
    assert.equal(
      await page
        .locator(".mini-controls")
        .evaluate((e) => getComputedStyle(e).opacity),
      "0",
    );
    await page.locator(".mini-player").hover();
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector(".mini-controls")).opacity ===
        "1",
    );
    await page
      .getByRole("button", { name: "Return to full player", exact: true })
      .click();
    await page.setViewportSize({ width: 1280, height: 820 });
    await page
      .locator("aside")
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await page.getByLabel("Crossfade", { exact: true }).selectOption("2");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.getByLabel("Playback position", { exact: true }).fill("118.5");
    await page.waitForFunction(
      () =>
        document.querySelector(".now-playing-title strong").textContent ===
        "Dawn",
    );
    assert.equal(
      await page.evaluate(
        () =>
          [...document.querySelectorAll("audio")].filter((a) => !a.paused)
            .length,
      ),
      2,
    );
    await page.waitForTimeout(2200);
    assert.equal(
      await page.evaluate(
        () =>
          [...document.querySelectorAll("audio")].filter((a) => !a.paused)
            .length,
      ),
      1,
    );
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.getByLabel("Crossfade", { exact: true }).selectOption("0");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.getByLabel("Playback position", { exact: true }).fill("119.9");
    await page.waitForFunction(
      () =>
        document.querySelector(".now-playing-title strong").textContent ===
        "Pulse",
    );
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page
      .getByRole("button", { name: "Export playlists", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() => JSON.parse(window.backup).format),
      "osu-player-playlists",
    );
    await page
      .getByRole("button", { name: "Import playlists", exact: true })
      .click();
    await page
      .getByRole("checkbox", { name: "Windows media controls", exact: true })
      .uncheck();
    await page.waitForFunction(() =>
      window.calls.some((c) => c.cmd === "set_media_keys" && !c.args.enabled),
    );
    assert.equal(
      await page.evaluate(() => navigator.mediaSession.metadata),
      null,
    );
    // Visual preferences, quick search, both sleep-timer modes; custom context menus, blocked browser shortcuts, song details, missing-song recovery, and persisted relinking.
    await page.getByLabel("Accent color", { exact: true }).selectOption("pink");
    await page.waitForFunction(
      () =>
        document.documentElement.style.getPropertyValue("--accent-rgb") ===
        "242 138 182",
    );
    await page
      .getByLabel("Accent color", { exact: true })
      .selectOption("artwork");
    await page.waitForFunction(
      () =>
        document.documentElement.style.getPropertyValue("--accent-rgb") !==
        "242 138 182",
    );
    await page
      .locator("aside")
      .getByRole("button", { name: /Your library/ })
      .click();
    await page
      .getByRole("button", { name: "Artwork grid view", exact: true })
      .click();
    assert.equal(await page.locator(".grid-play").count(), 3);
    await page
      .getByRole("button", { name: "Collapse sidebar", exact: true })
      .click();
    assert.ok(
      await page
        .locator("aside")
        .evaluate((e) => e.getBoundingClientRect().width < 90),
    );
    await page.screenshot({
      path: path.join(root, "test-results", "artwork-grid.png"),
    });
    await page
      .getByRole("button", { name: "Expand sidebar", exact: true })
      .click();
    await page.keyboard.press("Control+k");
    await page
      .getByRole("dialog", { name: "Quick search", exact: true })
      .waitFor();
    await page.getByLabel("Find a song", { exact: true }).fill("Artist B");
    await page.screenshot({
      path: path.join(root, "test-results", "quick-search.png"),
    });
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () =>
        document.querySelector(".now-playing-title strong").textContent ===
        "Dawn",
    );
    await page.getByLabel("Sleep timer", { exact: true }).click();
    await page
      .getByRole("button", { name: "End of current song", exact: true })
      .click();
    await page.getByLabel("Playback position", { exact: true }).fill("119.9");
    await page.waitForFunction(() =>
      [...document.querySelectorAll("audio")].every((e) => e.paused),
    );
    assert.equal(
      await page.locator(".now-playing-title strong").textContent(),
      "Dawn",
    );
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.getByLabel("Sleep timer", { exact: true }).click();
    await page.getByRole("button", { name: "15 minutes", exact: true }).click();
    await page.clock.fastForward(900001);
    await page.waitForFunction(() =>
      [...document.querySelectorAll("audio")].every((e) => e.paused),
    );
    await page.clock.resume();
    await page.getByRole("button", { name: "List view", exact: true }).click();
    await page.locator(".track").first().hover();
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector(".track .source-badges"))
          .opacity === "1",
    );
    assert.equal(
      await page
        .locator(".track")
        .first()
        .locator(".source-badges")
        .evaluate((e) => getComputedStyle(e).opacity),
      "1",
    );
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);
    assert.equal(
      await page
        .locator(".track")
        .last()
        .locator(".source-badges")
        .evaluate((e) => getComputedStyle(e).opacity),
      "0",
    );
    await page.evaluate(() => localStorage.setItem("largeFixture", "yes"));
    await page.reload();
    await page.getByRole("heading", { name: /Your collection/ }).waitFor();
    await page.waitForFunction(() =>
      document.querySelector(".section-title").textContent.includes("10003"),
    );
    assert.ok((await page.locator(".track").count()) < 30);
    await page
      .getByRole("button", { name: "Artwork grid view", exact: true })
      .click();
    await page.evaluate(() => {
      window.scrollMutations = 0;
      window.scrollObserver = new MutationObserver(
        (records) => (window.scrollMutations += records.length),
      );
      window.scrollObserver.observe(document.querySelector(".artwork-grid"), {
        subtree: true,
        childList: true,
        attributes: true,
      });
    });
    for (let y = 1; y <= 100; y += 10) {
      await page.locator(".artwork-grid .virtual-viewport").evaluate((e, y) => {
        e.scrollTop = y;
      }, y);
      await page.waitForTimeout(18);
    }
    assert.equal(
      await page.evaluate(() => window.scrollMutations),
      0,
      "Scrolling within a row must not rebuild cards",
    );
    await page.evaluate(() => window.scrollObserver.disconnect());
    await page
      .locator(".artwork-grid .virtual-viewport")
      .evaluate((e) => (e.scrollTop = 1300));
    await page.waitForTimeout(80);
    await page.locator(".artwork-grid .virtual-viewport").evaluate((e) => {
      const bounds = e.getBoundingClientRect();
      const button = Array.from(
        e.querySelectorAll('button[aria-label^="Favorite "]'),
      ).find((b) => {
        const r = b.getBoundingClientRect();
        return r.top > bounds.top && r.bottom < bounds.bottom;
      });
      if (!button) throw new Error("No visible favorite button");
      button.click();
    });
    await page.waitForTimeout(80);
    assert.equal(
      await page
        .locator(".artwork-grid .virtual-viewport")
        .evaluate((e) => e.scrollTop),
      1300,
      "Favoriting a grid card must preserve scroll position",
    );
    await page.getByRole("button", { name: "List view", exact: true }).click();

    await page
      .locator(".virtual-viewport")
      .evaluate((e) => (e.scrollTop = e.scrollHeight));
    await page
      .getByRole("button", { name: "Play Fixture 9999", exact: true })
      .waitFor();
    await page.screenshot({
      path: path.join(root, "test-results", "large-library.png"),
    });
    await page.locator(".track").first().click({ button: "right" });
    await page
      .getByRole("dialog", { name: "Song details", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Show in folder", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() =>
        window.calls.some((c) => c.cmd === "show_audio_file"),
      ),
      true,
    );
    await page
      .getByRole("button", { name: "Close song details", exact: true })
      .click();
    assert.equal(
      await page.evaluate(
        () =>
          !document.querySelector(".shell").dispatchEvent(
            new MouseEvent("contextmenu", {
              bubbles: true,
              cancelable: true,
            }),
          ),
      ),
      true,
    );
    assert.equal(
      await page.evaluate(
        () =>
          !window.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "F12",
              code: "F12",
              bubbles: true,
              cancelable: true,
            }),
          ),
      ),
      true,
    );
    for (const viewport of [
      { width: 1280, height: 820 },
      { width: 2328, height: 1360 },
    ]) {
      await page.setViewportSize(viewport);
      for (const mode of ["Artwork grid view", "List view"]) {
        await page.getByRole("button", { name: mode, exact: true }).click();
        const gap = await page
          .locator(".library .virtual-viewport")
          .evaluate(
            (e) =>
              document.querySelector("footer").getBoundingClientRect().top -
              e.getBoundingClientRect().bottom,
          );
        assert.ok(
          gap >= 0 && gap <= 16,
          `Collection should fill available height, got ${gap}px gap`,
        );
      }
    }
    await page
      .locator("aside")
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    assert.equal(
      await page.getByText("Created by Windstar343", { exact: true }).count(),
      1,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: source/mode/mapper filters; playlist create/add/reorder/rename/remove/persist/delete; actual audio playback, Now Playing and playlist order; DT/NC measured frequency and pitch, no generated percussion, opt-in Discord clearing, playback rate, EQ graph and reset; tray preferences; automatic refresh; editable queue, session restore, mini-player, crossfade and preloaded transitions, backup dialogs, media controls, 10,003-song virtualization; artwork grid, adaptive/fixed accents, sidebar collapse, keyboard quick search, badge visibility, fading mini controls, both sleep-timer modes; custom context menus, blocked browser shortcuts, song details, missing-song recovery, and persisted relinking.",
    );
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
