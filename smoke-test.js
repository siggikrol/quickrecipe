const fs   = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html    = fs.readFileSync('./index.html',   'utf8');
const appJs   = fs.readFileSync('./app.js',       'utf8');
const recipes = fs.readFileSync('./recipes.json', 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources:  'usable',
  url:        'http://localhost/',
  beforeParse(window) {
    /* Mock fetch so init() can load recipes.json */
    window.fetch = (url) => {
      if (url.includes('recipes.json')) {
        return Promise.resolve({
          ok:   true,
          json: () => Promise.resolve(JSON.parse(recipes)),
        });
      }
      return Promise.reject(new Error(`fetch not mocked for: ${url}`));
    };
    /* Mock matchMedia (not available in jsdom) */
    window.matchMedia = () => ({ matches: false, addEventListener: () => {} });
    /* Suppress CSS parse warnings */
    window.console.error = () => {};
  },
});

/* Inject app.js as inline script (avoids resource-loading via fetch) */
const scriptEl = dom.window.document.createElement('script');
scriptEl.textContent = appJs;
dom.window.document.body.appendChild(scriptEl);

const wait = (ms = 300) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  /* Allow async init() to complete */
  await wait();

  const { document } = dom.window;
  const brand  = document.querySelector('.brand')?.textContent?.trim();
  const cards  = document.querySelectorAll('.card').length;
  const detail = !!document.getElementById('detail');

  if (!brand || brand !== 'QuickRecipe') {
    throw new Error(`Brand text missing or incorrect: "${brand}"`);
  }
  if (cards < 1) {
    throw new Error('No recipe cards rendered');
  }
  if (!detail) {
    throw new Error('Recipe detail pane missing');
  }

  console.log(`Smoke test passed: ${cards} recipe cards rendered, detail pane present.`);
})();
