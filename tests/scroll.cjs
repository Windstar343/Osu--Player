const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");
const { buildSync } = require(
  require.resolve("esbuild", {
    paths: [path.dirname(require.resolve("vite/package.json"))],
  }),
);
const root = path.resolve(__dirname, "..");
const bundle = buildSync({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {VirtualRows} from './src/VirtualRows'; window.rowRenders=0; const items=Array.from({length:1000},(_,i)=>i); const render=(item)=>{window.rowRenders++;return <span>Song {item}</span>}; createRoot(document.getElementById('root')).render(<VirtualRows items={items} height={285} overscan={2} render={render}/>);`,
    loader: "tsx",
    resolveDir: root,
  },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
}).outputFiles[0].text;
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<style>.virtual-viewport{height:600px;overflow:auto}</style><div id="root"></div>',
    );
    await page.addScriptTag({ content: bundle });
    await page.waitForFunction(() => window.rowRenders > 0);
    await page.waitForTimeout(100);
    const initial = await page.evaluate(() => window.rowRenders);
    for (const y of [1, 20, 50, 100, 200]) {
      await page
        .locator(".virtual-viewport")
        .evaluate((e, y) => (e.scrollTop = y), y);
      await page.waitForTimeout(35);
    }
    assert.equal(
      await page.evaluate(() => window.rowRenders),
      initial,
      "Pixel scrolling within one row must not render rows again",
    );
    await page
      .locator(".virtual-viewport")
      .evaluate((e) => (e.scrollTop = 350));
    await page.waitForTimeout(60);
    const added = (await page.evaluate(() => window.rowRenders)) - initial;
    assert.ok(
      added <= 1,
      `Only a newly exposed row should render; got ${added}`,
    );
    console.log(
      `PASS: no row renders during within-row scrolling; ${added} newly rendered row at the next boundary.`,
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
