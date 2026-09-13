const fs   = require('fs');
const assert = require('node:assert/strict');
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
    window.compactMedia = { matches: false, addEventListener: () => {} };
    window.matchMedia = query => query === '(max-width: 860px)' ? window.compactMedia : { matches: false, addEventListener: () => {} };
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

  document.querySelector('[data-browse="desserts"]').click();
  assert.deepEqual([...document.querySelectorAll('[data-cat]')].map(b => b.dataset.cat).sort(), ['All', 'Cake', 'Cheesecake', 'Dessert', 'Skyr Cake'].sort());
  document.querySelector('[data-cat="Skyr Cake"]').click();
  assert.ok([...document.querySelectorAll('.card .tag')].every(el => el.textContent === 'Skyr Cake'));
  const list = document.getElementById('list');
  list.scrollTop = 220;
  document.querySelector('.card').click();
  document.getElementById('backBtn').click();
  assert.equal(list.scrollTop, 220);
  assert.equal(document.querySelector('[data-cat="Skyr Cake"]').getAttribute('aria-pressed'), 'true');
  const globalSearch = document.getElementById('search');
  globalSearch.value = 'Caesar';
  globalSearch.dispatchEvent(new dom.window.Event('input'));
  assert.equal(document.querySelectorAll('.card').length, 1);
  assert.equal(document.querySelector('.card h3').textContent, 'Caesar Salad Dressing');
  assert.equal(document.getElementById('chips').hidden, true);
  globalSearch.value = '';
  globalSearch.dispatchEvent(new dom.window.Event('input'));
  assert.equal(document.querySelector('[data-cat="Skyr Cake"]').getAttribute('aria-pressed'), 'true');
  document.querySelector('[data-browse="meals"]').click();
  assert.equal(document.querySelectorAll('.card').length, 0);
  document.querySelector('[data-browse="sauces"]').click();
  document.querySelector('[data-fav]').click();
  document.getElementById('favFilter').click();
  assert.equal(document.querySelectorAll('.card').length, 1);
  assert.equal(document.querySelector('.card h3').textContent, 'Caesar Salad Dressing');
  document.querySelector('[data-browse="All"]').click();
  assert.equal(document.querySelectorAll('.card').length, cards);

  const sandwich = JSON.parse(recipes).find(r => r.title === 'Soft Sandwich Bread');
  document.querySelector(`[data-id="${sandwich.id}"]`).click();
  const baseMeta = [...document.querySelectorAll('.meta .stat:not(#recipeYield)')].map(el => el.textContent);
  for (const [factor, expectedYield, flour] of [[2, '2 large loaves', '1000 g'], [3, '3 large loaves', '1500 g'], [0.5, '0.5 large loaves', '250 g'], [1, '1 large loaf', '500 g']]) {
    document.querySelector(`[data-scale="${factor}"]`).click();
    assert.equal(document.getElementById('recipeYield').textContent, expectedYield);
    assert.equal(document.querySelector('.ingredient .amount').textContent, flour);
    assert.deepEqual([...document.querySelectorAll('.meta .stat:not(#recipeYield)')].map(el => el.textContent), baseMeta);
  }
  for (const [original, factor, expected] of [
    ['20–24 rolls', 2, '40–48 rolls'],
    ['2 large or 4 small', 0.5, '1 large or 2 small'],
    ['1 × 30 × 40 cm tray', 2, '2 × 30 × 40 cm tray'],
    ['1 × 20 cm, 10–12 servings', 2, '2 × 20 cm, 20–24 servings'],
    ['About 150 ml', 2, 'About 300 ml'],
    ['2 loaves', 0.5, '1 loaf'],
  ]) assert.equal(dom.window.yieldText(original, factor), expected);

  document.querySelector('.card').click();
  document.querySelector('[data-scale="2"]').click();
  const back = document.getElementById('backBtn');
  if (!back) throw new Error('Back navigation was removed by recipe rendering');
  back.click();
  if (document.querySelector('.app').classList.contains('reading-recipe')) {
    throw new Error('Back navigation did not close the recipe');
  }
  dom.window.compactMedia.matches = true;
  const recipePane = document.getElementById('detail');
  const touch = (type, target, x, y, count = 1) => {
    const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
    const points = Array.from({ length: count }, (_, identifier) => ({ identifier, clientX: x, clientY: y }));
    event.touches = type === 'touchend' || type === 'touchcancel' ? [] : points;
    event.changedTouches = points;
    target.dispatchEvent(event);
    return event;
  };
  const isReading = () => document.querySelector('.app').classList.contains('reading-recipe');
  document.getElementById('list').scrollTop = 200;
  document.querySelector('.card').click();
  touch('touchstart', recipePane, 40, 200);
  const horizontal = touch('touchmove', recipePane, 150, 205);
  touch('touchend', recipePane, 180, 208);
  assert.equal(horizontal.defaultPrevented, true);
  assert.equal(isReading(), false, 'Right swipe should go back');
  assert.equal(document.getElementById('list').scrollTop, 200);
  for (const [dx, dy] of [[15, 2], [-120, 0], [20, 140], [100, 100]]) {
    document.querySelector('.card').click();
    touch('touchstart', recipePane, 150, 200);
    touch('touchmove', recipePane, 150 + dx, 200 + dy);
    touch('touchend', recipePane, 150 + dx, 200 + dy);
    assert.equal(isReading(), true, 'Short, left, vertical, and diagonal gestures must not go back');
  }
  const slider = document.getElementById('hydRange');
  touch('touchstart', slider, 50, 200);
  assert.equal(touch('touchmove', slider, 200, 200).defaultPrevented, false);
  touch('touchend', slider, 200, 200);
  assert.equal(isReading(), true, 'Slider gestures must not go back');
  touch('touchstart', recipePane, 50, 200);
  touch('touchmove', recipePane, 200, 200, 2);
  touch('touchend', recipePane, 200, 200);
  assert.equal(isReading(), true, 'Multitouch must not go back');
  touch('touchstart', recipePane, 50, 200);
  touch('touchmove', recipePane, 200, 200);
  touch('touchcancel', recipePane, 200, 200);
  touch('touchend', recipePane, 200, 200);
  assert.equal(isReading(), true, 'Cancelled gestures must not go back');
  document.getElementById('backBtn').click();
  document.querySelector('[data-browse="desserts"]').click();
  document.querySelector('[data-cat="Skyr Cake"]').click();
  const filteredIds = [...document.querySelectorAll('.card')].map(card => card.dataset.id);
  list.scrollTop = 240;
  document.querySelector('.card').click();
  const swipeLeft = target => {
    touch('touchstart', target, 280, 200);
    touch('touchmove', target, 160, 205);
    touch('touchend', target, 120, 208);
  };
  document.querySelector('[data-scale="2"]').click();
  recipePane.scrollTop = 150;
  swipeLeft(recipePane);
  assert.equal(document.querySelector('.card.active').dataset.id, filteredIds[1]);
  assert.equal(document.querySelector('[data-scale="1"]').classList.contains('active'), true);
  assert.equal(recipePane.scrollTop, 0);
  assert.equal(isReading(), true);
  const currentId = document.querySelector('.card.active').dataset.id;
  swipeLeft(document.getElementById('detailFav'));
  assert.equal(document.querySelector('.card.active').dataset.id, currentId, 'Control swipes must not advance');
  document.getElementById('backBtn').click();
  assert.equal(list.scrollTop, 240, 'Next recipe must preserve original list position');
  document.querySelector(`[data-id="${filteredIds.at(-1)}"]`).click();
  swipeLeft(recipePane);
  assert.equal(document.querySelector('.card.active').dataset.id, filteredIds.at(-1));
  assert.equal(document.getElementById('toast').textContent, 'You’re at the last recipe');
  document.getElementById('backBtn').click();
  document.querySelector('[data-browse="All"]').click();
  const recipeSearch = document.getElementById('search');
  recipeSearch.value = 'bread';
  recipeSearch.dispatchEvent(new dom.window.Event('input'));
  const searchIds = [...document.querySelectorAll('.card')].map(card => card.dataset.id);
  document.querySelector('.card').click();
  swipeLeft(recipePane);
  assert.equal(document.querySelector('.card.active').dataset.id, searchIds[1], 'Next recipe must respect search');
  document.getElementById('backBtn').click();
  dom.window.compactMedia.matches = false;
  const search = document.getElementById('search');
  search.value = 'zzzz-no-matching-recipe';
  search.dispatchEvent(new dom.window.Event('input'));
  if (document.querySelector('.card') || document.querySelector('#detail h1')) {
    throw new Error('Empty search left a stale recipe visible');
  }

  console.log(`Smoke test passed: ${cards} recipe cards rendered, detail pane present.`);
})();
