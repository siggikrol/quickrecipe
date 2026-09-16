const fs   = require('fs');
const assert = require('node:assert/strict');
const path = require('path');
const { JSDOM } = require('jsdom');

const html    = fs.readFileSync('./index.html',   'utf8');
const appJs   = fs.readFileSync('./i18n.js', 'utf8') + '\n' + fs.readFileSync('./ingredient-allergens.js', 'utf8') + '\n' + fs.readFileSync('./recipe-calculations.js', 'utf8') + '\n' + fs.readFileSync('./shopping.js', 'utf8') + '\n' + fs.readFileSync('./app.js', 'utf8');
const recipeIndex = JSON.parse(fs.readFileSync('./recipes/index.json', 'utf8'));
const recipeFiles = Object.fromEntries(recipeIndex.files.map(file => [file, JSON.parse(fs.readFileSync(path.join('recipes', file), 'utf8'))]));
const recipes = JSON.stringify(Object.values(recipeFiles).flat());
const translationFiles = Object.fromEntries(['pl', 'is'].map(lang => [lang, JSON.parse(fs.readFileSync(`./translations/${lang}.json`, 'utf8'))]));
const fetchedFiles = [];
function recipeResponse(url) {
  const pathname = new URL(url, 'http://localhost/').pathname;
  fetchedFiles.push(pathname);
  const translationMatch = pathname.match(/^\/translations\/(pl|is)\.json$/);
  const data = translationMatch ? translationFiles[translationMatch[1]] : pathname === '/recipes/index.json' ? recipeIndex : recipeFiles[pathname.replace('/recipes/', '')];
  return Promise.resolve({ ok: data !== undefined, status: data === undefined ? 404 : 200, json: () => Promise.resolve(structuredClone(data)) });
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources:  'usable',
  url:        'http://localhost/',
  beforeParse(window) {
    window.fetch = recipeResponse;
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
  assert.equal(document.querySelector('.ingredient').firstElementChild.className, 'ingredient-name');
  document.getElementById('ingredientOrderBtn').click();
  assert.equal(document.querySelector('.ingredient').firstElementChild.className, 'amount');
  assert.equal(document.getElementById('ingredientOrderBtn').getAttribute('aria-pressed'), 'true');
  document.querySelector('[data-scale="2"]').click();
  assert.equal(document.querySelector('.ingredient').firstElementChild.className, 'amount');
  assert.equal(dom.window.localStorage.getItem('quickrecipe.ingredientOrder'), 'quantity');
  document.getElementById('ingredientOrderBtn').click();
  assert.equal(document.querySelector('.ingredient').firstElementChild.className, 'ingredient-name');
  document.querySelector('[data-scale="1"]').click();
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

  document.querySelector('[data-browse="baking"]').click();
  document.querySelector('[data-cat="Bread"]').click();
  document.querySelector('[data-id="icelandic-rye-bread"]').click();
  assert.equal(document.querySelector('#detail .desc').textContent,
    'Traditional Icelandic sweet rye bread, slowly baked for 12 hours.');
  assert.deepEqual([...document.querySelectorAll('[data-scale]')].map(el => el.dataset.scale), ['0.5', '1', '2', '3']);
  const ryeAmounts = [
    ['0.5', ['750 g', '150 g', '170 g', '100 ml', '10 tsp', '0.5 tsp', '1 L']],
    ['1', ['1.5 kg', '300 g', '340 g', '200 ml', '20 tsp', '1 tsp', '2 L']],
    ['2', ['3 kg', '600 g', '680 g', '400 ml', '40 tsp', '2 tsp', '4 L']],
    ['3', ['4.5 kg', '900 g', '1.02 kg', '600 ml', '60 tsp', '3 tsp', '6 L']],
  ];
  for (const [multiplier, amounts] of ryeAmounts) {
    document.querySelector(`[data-scale="${multiplier}"]`).click();
    assert.deepEqual([...document.querySelectorAll('.ingredient .amount')].map(el => el.textContent), [...amounts, 'As needed']);
  }
  document.querySelector('[data-scale="1"]').click();
  assert.equal(dom.window.amountText(1500, 'g'), '1500 g');
  assert.equal(dom.window.amountText(2000, 'ml'), '2000 ml');
  document.querySelector('[data-browse="desserts"]').click();
  assert.deepEqual([...document.querySelectorAll('[data-cat]')].map(b => b.dataset.cat).sort(), ['All', 'Cake', 'Cheesecake', 'Dessert', 'Skyr Cake', 'Meringue', 'Brownies', 'Cookies', 'Truffles', 'Classic desserts', 'Confections', 'Muffins & scones', 'Pies & tarts'].sort());
  document.querySelector('[data-cat="Cookies"]').click();
  const cookieRecipes = JSON.parse(recipes).filter(r => r.category === 'Cookies');
  assert.equal(cookieRecipes.length, 81);
  assert.equal(document.querySelectorAll('.card').length, cookieRecipes.length);
  const cookiesById = new Map(cookieRecipes.map(r => [r.id, r]));
  assert.equal(cookiesById.get('chocolate-pistachio-biscotti').ingredients[0][1], 130);
  assert.equal(cookiesById.get('spiced-white-chocolate-cookies').ingredients[0][1], 130);
  assert.equal(cookiesById.get('classic-sarah-bernhardt-cookies').ingredients.find(i => i[0] === 'Egg whites')[1], 4);
  assert.ok(cookieRecipes.every(r => r.ingredients.every(i => i[1] === null || (i[1] > 0 && i[1] < 10000))));
  assert.ok(cookiesById.has('coffee-sarah-bernhardt-cookies') && cookiesById.has('raspberry-sarah-bernhardt-cookies'));

  assert.ok(cookieRecipes.every(r => r.section === 'desserts'));
  assert.ok(!cookieRecipes.some(r => /hreindyra|smakokur-a-nulleinni|oreo-jolahugmyndir|piparkokur-med-glassur/.test(r.id)));
  for (const recipe of cookieRecipes) {
    document.querySelector(`[data-id="${recipe.id}"]`).click();
    assert.equal(document.querySelector('#detail h1').textContent, recipe.title);
    assert.equal(document.querySelectorAll('.ingredient').length, recipe.ingredients.length);
    assert.equal(document.querySelectorAll('.steps li').length, recipe.steps.length);
    document.querySelector('[data-scale="2"]').click();
    const firstAmount = document.querySelector('.ingredient .amount').textContent;
    assert.equal(firstAmount, dom.window.amountText(recipe.ingredients[0][1], recipe.ingredients[0][2]));
    document.querySelector('[data-scale="1"]').click();
  }
  document.querySelector('[data-cat="Truffles"]').click();
  const truffles = JSON.parse(recipes).filter(r => r.category === 'Truffles');
  assert.equal(truffles.length, 44);
  assert.equal(document.querySelectorAll('.card').length, 44);
  for (const recipe of truffles) {
    document.querySelector(`[data-id="${recipe.id}"]`).click();
    assert.equal(document.querySelector('#detail h1').textContent, recipe.title);
    assert.deepEqual([...document.querySelectorAll('.steps li')].map(el => el.textContent), recipe.steps);
    for (const multiplier of [0.5, 1, 2, 3]) {
      document.querySelector(`[data-scale="${multiplier}"]`).click();
      const expected = recipe.ingredients.map(([, amount, unit]) => amount === null
        ? 'As needed' : `${Math.round(amount * multiplier * 100) / 100} ${unit}`);
      assert.deepEqual([...document.querySelectorAll('.ingredient .amount')].map(el => el.textContent), expected, `${recipe.id} at ${multiplier}×`);
      assert.equal(document.getElementById('recipeYield').textContent, `About ${Number(recipe.yield.match(/\d+/)[0]) * multiplier} truffles`);
    }
  }
  document.querySelector('[data-scale="1"]').click();
  document.querySelector('[data-cat="Skyr Cake"]').click();
  assert.ok([...document.querySelectorAll('.card .tag')].every(el => el.textContent === 'Skyr Cake'));
  const list = document.getElementById('list');
  list.scrollTop = 220;
  document.querySelector('.card').click();
  document.getElementById('backBtn').click();
  assert.equal(list.scrollTop, 220);
  assert.equal(document.querySelector('[data-cat="Skyr Cake"]').getAttribute('aria-pressed'), 'true');
  const globalSearch = document.getElementById('search');
  globalSearch.value = 'Caesar Salad Dressing';
  globalSearch.dispatchEvent(new dom.window.Event('input'));
  assert.equal(document.querySelectorAll('.card').length, 1);
  assert.equal(document.querySelector('.card h3').textContent, 'Caesar Salad Dressing');
  assert.equal(document.getElementById('chips').hidden, true);
  globalSearch.value = '';
  globalSearch.dispatchEvent(new dom.window.Event('input'));
  assert.equal(document.querySelector('[data-cat="Skyr Cake"]').getAttribute('aria-pressed'), 'true');
  document.querySelector('[data-browse="meals"]').click();
  assert.equal(document.querySelectorAll('.card').length, JSON.parse(recipes).filter(r => r.section === 'meals' || r.categoryMemberships?.some(m => m.section === 'meals')).length);
  document.querySelector('[data-cat="Polish Soups"]').click();
  assert.equal(document.querySelectorAll('.card').length, 10);
  document.querySelector('[data-browse="sauces"]').click();
  document.querySelector('[data-fav]').click();
  document.getElementById('favFilter').click();
  assert.equal(document.querySelectorAll('.card').length, 1);
  assert.equal(document.querySelector('.card h3').textContent, 'Caesar Salad Dressing');
  document.querySelector('[data-browse="All"]').click();
  assert.equal(document.querySelectorAll('.card').length, cards);

  assert.equal(document.querySelectorAll('.card .timing-stat').length > 0, true);
  for (const card of document.querySelectorAll('.card')) {
    const recipe = JSON.parse(recipes).find(r => r.id === card.dataset.id);
    const chips = [...card.querySelectorAll('.timing-stat')].map(el => el.textContent);
    const expected = [['Prep', recipe.prep], ['Cook', recipe.cook], ['Bake', recipe.bake], ['Rest', recipe.ferment]]
      .filter(([, value]) => value && String(value).trim()).map(([label, value]) => `${label} ${value}`);
    assert.deepEqual(chips, expected.length ? expected : ['Time not specified']);
  }
  assert.ok(document.querySelector('[data-id="caesar-dressing"]').textContent.includes('Prep 10 min'));
  assert.ok(dom.window.recipeTimingHtml({}).includes('Time not specified'));
  assert.equal(new Set(JSON.parse(recipes).map(r => r.id)).size, JSON.parse(recipes).length);
  assert.ok(recipeIndex.files.every(file => fetchedFiles.includes(`/recipes/${file}`)));
  const fetchRecipes = dom.window.fetch;
  dom.window.fetch = url => url.includes('cheesecakes.json') ? Promise.resolve({ ok: false, status: 404 }) : fetchRecipes(url);
  await assert.rejects(dom.window.loadSeedRecipes(), /cheesecakes/);
  dom.window.fetch = fetchRecipes;

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
    ['1 batch', 2, '2 batches'],
    ['2 nests', 0.5, '1 nest'],
    ['1 wreath', 3, '3 wreaths'],
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
  const swipeRight = () => {
    touch('touchstart', recipePane, 50, 200);
    touch('touchmove', recipePane, 170, 205);
    touch('touchend', recipePane, 210, 208);
  };
  document.querySelector('[data-scale="2"]').click();
  recipePane.scrollTop = 150;
  swipeLeft(recipePane);
  assert.equal(document.querySelector('.card.active').dataset.id, filteredIds[1]);
  assert.equal(document.querySelector('[data-scale="1"]').classList.contains('active'), true);
  assert.equal(recipePane.scrollTop, 0);
  assert.equal(isReading(), true);
  swipeLeft(recipePane);
  swipeLeft(recipePane);
  assert.equal(document.querySelector('.card.active').dataset.id, filteredIds[3]);
  for (const previousId of [filteredIds[2], filteredIds[1], filteredIds[0]]) {
    swipeRight();
    assert.equal(isReading(), true, 'Right swipe should stay in recipes while history remains');
    assert.equal(document.querySelector('.card.active').dataset.id, previousId);
  }
  assert.equal(document.querySelector('[data-scale="2"]').classList.contains('active'), true);
  assert.equal(recipePane.scrollTop, 150, 'Returning restores the earlier reading position');
  swipeLeft(recipePane);
  swipeRight();
  assert.equal(document.querySelector('.card.active').dataset.id, filteredIds[0], 'Forward then back retraces the same recipe');
  swipeRight();
  assert.equal(isReading(), false, 'Swiping right from the entry recipe returns to the list');
  assert.equal(list.scrollTop, 240);
  document.querySelector(`[data-id="${filteredIds[4]}"]`).click();
  swipeLeft(recipePane);
  swipeRight();
  assert.equal(document.querySelector('.card.active').dataset.id, filteredIds[4]);
  swipeRight();
  assert.equal(isReading(), false, 'Opening in the middle starts a fresh history');
  document.querySelector('.card').click();
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

  const imported = JSON.parse(recipes).filter(r => r.category === 'Meringue');
  assert.equal(imported.length, 29);
  assert.equal(new Set(imported.map(r => r.title)).size, 29);
  document.querySelector('[data-browse="desserts"]').click();
  document.querySelector('[data-cat="Meringue"]').click();
  assert.equal(document.querySelectorAll('.card').length, 29);
  for (const recipe of imported) {
    assert.equal(recipe.section, 'desserts');
    for (const ingredient of recipe.ingredients) {
      assert.ok(ingredient[1] === null || Number.isFinite(ingredient[1]));
      if (ingredient[4] !== undefined) assert.ok(ingredient[4] >= ingredient[1]);
    }
    for (const plan of [recipe.ingredientSections, recipe.stepSections]) {
      assert.equal(plan[0][0], 0);
      assert.ok(plan.every((entry, i) => i === 0 || entry[0] > plan[i - 1][0]));
    }
    document.querySelector(`[data-id="${recipe.id}"]`).click();
    assert.equal(document.querySelectorAll('.ingredient').length, recipe.ingredients.length);
    assert.equal(document.querySelectorAll('.steps li').length, recipe.steps.length);
    const text = document.getElementById('detail').textContent;
    assert.ok(!/[ðþæöáéíóúýÐÞÆÖÁÉÍÓÚÝ]/.test(text), recipe.title);
    assert.ok(!/NaN|undefined|nóa|þrist/i.test(text));
    document.querySelector('.ingredient-section').click();
    assert.equal(document.querySelector('.ingredient-section').getAttribute('aria-pressed'), 'true');
    assert.ok(document.querySelector('.steps li.dimmed'));
  }
  document.querySelector('[data-id="meringue-buttercrunch-brownie-meringue-torte"]').click();
  document.querySelector('[data-scale="2"]').click();
  assert.ok(document.getElementById('detail').textContent.includes('1200 ml – 1600 ml'));
  document.querySelector('[data-id="meringue-brown-sugar-rosette-sandwiches"]').click();
  document.querySelector('[data-scale="3"]').click();
  assert.ok(document.getElementById('detail').textContent.includes('As needed'));

  const brownies = JSON.parse(recipes).filter(r => r.category === 'Brownies');
  assert.equal(brownies.length, 18);
  assert.equal(new Set(brownies.map(r => r.title)).size, 18);
  document.querySelector('[data-browse="desserts"]').click();
  document.querySelector('[data-cat="Brownies"]').click();
  assert.equal(document.querySelectorAll('.card').length, 18);
  for (const recipe of brownies) {
    assert.equal(recipe.section, 'desserts');
    assert.ok(recipe.bake);
    assert.ok(recipe.tempC > 0);
    const card = document.querySelector(`[data-id="${recipe.id}"]`);
    assert.ok(card.textContent.includes(`Bake ${recipe.bake}`));
    card.click();
    assert.equal(document.querySelectorAll('.ingredient').length, recipe.ingredients.length);
    assert.equal(document.querySelectorAll('.steps li').length, recipe.steps.length);
    const text = document.getElementById('detail').textContent;
    assert.ok(!/[ðþæöáéíóúýÐÞÆÖÁÉÍÓÚÝ]|NaN|undefined/i.test(text), recipe.title);
    document.querySelector('[data-scale="2"]').click();
    const numeric = recipe.ingredients.findIndex(i => Number.isFinite(i[1]));
    const doubled = document.querySelectorAll('.ingredient .amount')[numeric].textContent;
    assert.equal(doubled, dom.window.amountText(recipe.ingredients[numeric][1], recipe.ingredients[numeric][2]));
    if (recipe.ingredientSections.length > 1) {
      document.querySelector('.ingredient-section').click();
      assert.ok(document.querySelector('.steps li.dimmed'));
    }
  }
  document.querySelector('[data-id="brownie-mint-meadow-chocolate-squares"]').click();
  document.querySelector('[data-scale="2"]').click();
  assert.ok(document.getElementById('detail').textContent.includes('2 tbsp – 4 tbsp'));
  assert.ok(!brownies.some(r => r.id === 'brownie-sweet-and-salty-cracker-brownies'));
  const staged = brownies.find(r => r.id === 'brownie-golden-pecan-caramel-brownie-squares');
  assert.ok(staged.steps.some(step => step.includes('20 minutes')));
  assert.ok(staged.steps.some(step => step.includes('10–12 minutes')));

  const soups = JSON.parse(recipes).filter(r => r.category === 'Polish Soups');
  assert.equal(soups.length, 10);
  assert.equal(new Set(soups.map(r => r.title)).size, 10);
  document.querySelector('[data-browse="meals"]').click();
  document.querySelector('[data-cat="Polish Soups"]').click();
  for (const recipe of soups) {
    assert.equal(recipe.section, 'meals');
    assert.ok(recipe.cook && recipe.prep);
    const card = document.querySelector(`[data-id="${recipe.id}"]`);
    assert.ok(card.textContent.includes(`Cook ${recipe.cook}`));
    card.click();
    assert.equal(document.querySelectorAll('.ingredient').length, recipe.ingredients.length);
    assert.equal(document.querySelectorAll('.steps li').length, recipe.steps.length);
    assert.ok(document.querySelector('.meta').textContent.includes(`Cook ${recipe.cook}`));
    assert.ok(!/NaN|undefined/.test(document.getElementById('detail').textContent));
    document.querySelector('[data-scale="2"]').click();
    assert.equal(document.querySelector('.ingredient .amount').textContent,
      dom.window.ingredientAmountText(recipe, recipe.ingredients[0]));
  }
  const soup = soups[0];
  dom.window.openModal(soup);
  assert.equal(document.getElementById('fCook').value, soup.cook);
  // Save a separate minimal recipe to verify the new editor field round-trips.
  dom.window.openModal();
  document.getElementById('fTitle').value = 'Cooking time test';
  document.getElementById('fIngredients').value = 'Water | 500 | ml';
  document.getElementById('fSteps').value = 'Bring to a simmer.';
  document.getElementById('fCook').value = '12 min';
  dom.window.saveRecipe();
  assert.ok(document.querySelector('.meta').textContent.includes('Cook 12 min'));

  const polishBreads = JSON.parse(recipes).filter(r => r.category === 'Polish Breads');
  assert.equal(polishBreads.length, 11);
  document.querySelector('[data-browse="baking"]').click();
  document.querySelector('[data-cat="Polish Breads"]').click();
  assert.equal(document.querySelectorAll('.card').length, 11);
  for (const recipe of polishBreads) {
    assert.equal(recipe.section, 'baking');
    assert.ok(recipe.prep && (recipe.bake || recipe.cook));
    document.querySelector(`[data-id="${recipe.id}"]`).click();
    assert.equal(document.querySelectorAll('.ingredient').length, recipe.ingredients.length);
    assert.equal(document.querySelectorAll('.steps li').length, recipe.steps.length);
    assert.ok(!/NaN|undefined/.test(document.getElementById('detail').textContent));
    document.querySelector('[data-scale="2"]').click();
    assert.equal(document.querySelector('.ingredient .amount').textContent,
      dom.window.ingredientAmountText(recipe, recipe.ingredients[0]));
  }
  const rye = polishBreads.find(r => r.title === 'Caraway Hearth Rye Loaf');
  assert.equal(rye.ingredients.filter(i => i[0] === 'Active rye sourdough starter').length, 1);
  assert.ok(rye.ferment.includes('5–8 hr'));
  assert.equal(polishBreads.find(r => r.title === 'Seeded Twisted Bread Rings').yield, '16 rings');
  assert.equal(polishBreads.find(r => r.title === 'Cabbage and Mushroom Pastry Bites').yield, '40 rolls');

  // Language changes translate recipe text without changing shared recipe data.
  document.querySelector('[data-browse="baking"]').click();
  document.querySelector('[data-cat="Bread"]').click();
  const whiteBread = JSON.parse(recipes).find(r => r.title === 'Classic White Bread');
  document.querySelector(`[data-id="${whiteBread.id}"]`).click();
  dom.window.scrollTo = () => {};
  const beforeLanguage = document.querySelector('.card.active').dataset.id;
  const beforeTitle = document.querySelector('#detail h1').textContent;
  const beforeAmount = document.querySelector('.ingredient .amount').textContent;
  dom.window.changeLanguage('pl');
  await wait(10);
  assert.equal(document.documentElement.lang, 'pl');
  assert.equal(document.getElementById('metricBtn').textContent, 'Metryczne');
  assert.equal(document.querySelector('[data-cat="Bread"]').textContent, 'Chleb');
  assert.equal(document.querySelector('#detail h1').textContent, translationFiles.pl[beforeTitle]);
  assert.equal(document.querySelector('.steps li').textContent, translationFiles.pl[whiteBread.steps[0]]);
  assert.equal(document.querySelector('.ingredient > span').textContent, 'Mąka chlebowa');
  assert.equal(document.querySelector('[data-language=pl]').getAttribute('aria-pressed'), 'true');
  assert.equal(document.querySelector('.ingredient .amount').textContent, beforeAmount);
  assert.equal(document.querySelector('.card.active').dataset.id, beforeLanguage);
  assert.equal(document.getElementById('languageNote').hidden, true);
  assert.equal(dom.window.recipeCount(22), '22 przepisy');
  assert.equal(dom.window.recipeCount(12), '12 przepisów');
  dom.window.changeLanguage('is');
  await wait(10);
  assert.equal(document.getElementById('backBtn').textContent, '← Til baka í uppskriftir');
  assert.equal(document.querySelector('.pane h2').textContent, 'Hráefni');
  assert.equal(document.querySelector('#detail h1').textContent, translationFiles.is[beforeTitle]);
  assert.equal(document.querySelector('.steps li').textContent, translationFiles.is[whiteBread.steps[0]]);
  assert.equal(document.querySelector('.ingredient > span').textContent, 'Brauðhveiti');
  assert.equal(dom.window.recipeText('My untranslated note'), 'My untranslated note');
  assert.equal(dom.window.unitLabel('tbsp', 2), 'msk.');
  document.querySelector('[data-scale="2"]').click();
  assert.equal(document.getElementById('recipeYield').textContent, '2 brauðhleifar');
  assert.equal(document.querySelector('.ingredient .amount').textContent, '1000 g');
  dom.window.changeLanguage('pl');
  await wait(10);
  assert.equal(document.getElementById('recipeYield').textContent, '2 bochenki');
  const polishSearch = document.getElementById('search');
  polishSearch.value = 'Mąka chlebowa';
  polishSearch.dispatchEvent(new dom.window.Event('input'));
  const polishResults = [...document.querySelectorAll('.card')].map(c => c.dataset.id);
  assert.ok(polishResults.length > 0);
  dom.window.changeLanguage('is');
  await wait(10);
  assert.deepEqual([...document.querySelectorAll('.card')].map(c => c.dataset.id), polishResults);
  polishSearch.value = '';
  polishSearch.dispatchEvent(new dom.window.Event('input'));
  const originalStored = JSON.parse(dom.window.localStorage.getItem('quickrecipe.recipes.v1')).find(r => r.id === whiteBread.id);
  assert.equal(originalStored.title, whiteBread.title);
  assert.deepEqual(originalStored.ingredients, whiteBread.ingredients);
  dom.window.openNextRecipe();
  dom.window.openNextRecipe();
  dom.window.openPreviousRecipe();
  assert.equal(document.querySelector('#detail h1').textContent, translationFiles.is.Ciabatta);
  assert.equal(dom.window.missingRecipeTranslation({...whiteBread, title:'A new personal recipe'}), true);

  assert.equal(dom.window.localStorage.getItem('quickrecipe.language'), 'is');
  assert.equal(dom.window.t('A custom category'), 'A custom category');
  dom.window.changeLanguage('invalid');
  assert.equal(document.documentElement.lang, 'is');
  dom.window.changeLanguage('en');
  await wait(10);
  assert.equal(document.getElementById('backBtn').textContent, '← Back to recipes');
  assert.equal(document.querySelector('.pane h2').textContent, 'Ingredients');
  assert.equal(document.getElementById('languageNote').hidden, true);

  // Renamed recipe IDs preserve favorites, selection and saved adjustments.
  const currentRecipe = JSON.parse(recipes).find(r => r.category === 'Cheesecake');
  const ryeBread = JSON.parse(recipes).find(r => r.id === 'icelandic-rye-bread');
  const outdatedRye = { ...ryeBread, id: 'old-rye-bread', compactMetricUnits: false,
    ingredients: ryeBread.ingredients.map(i => /flour/i.test(i[0]) ? [i[0], 10, 'dl', i[3]] : i) };
  const legacyRecipe = { ...currentRecipe, id: 'legacy-recipe-id', ingredients: [...currentRecipe.ingredients].reverse(), obsoleteMetadata: 'old value' };
  const retiredRecipe = { ...currentRecipe, id: recipeIndex.retiredIds[0], title: 'Retired recipe' };
  const renamedEntry = Object.entries(recipeIndex.renamedIds)[0];
  const renamedRecipe = { ...JSON.parse(recipes).find(r => r.id === renamedEntry[1]), id: renamedEntry[0], title: 'Previous title' };
  const customRecipe = { ...currentRecipe, id: 'personal-recipe', title: 'My personal recipe' };
  const migrated = new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = recipeResponse;
      w.localStorage.setItem('quickrecipe.ingredientOrder', 'quantity');
      w.localStorage.setItem('quickrecipe.shopping.v1', JSON.stringify({ [renamedRecipe.id]: {title: renamedRecipe.title, items:[{name:'Cream cheese',amount:'1 tub',bought:true}]} }));
      w.matchMedia = () => ({ matches: false, addEventListener() {} });
      w.localStorage.setItem('quickrecipe.recipes.v1', JSON.stringify([legacyRecipe, currentRecipe, customRecipe, outdatedRye, ryeBread, retiredRecipe, renamedRecipe]));
      w.localStorage.setItem('quickrecipe.favs.v1', JSON.stringify([legacyRecipe.id, outdatedRye.id, retiredRecipe.id, renamedRecipe.id]));
      w.localStorage.setItem('quickrecipe.hydration.v1', JSON.stringify({ [legacyRecipe.id]: 75, [retiredRecipe.id]: 60 }));
      w.localStorage.setItem('quickrecipe.ui.v1', JSON.stringify({ selectedId: renamedRecipe.id, category: 'All' }));
    },
  });
  const migrationScript = migrated.window.document.createElement('script');
  migrationScript.textContent = appJs;
  migrated.window.document.body.appendChild(migrationScript);
  await wait();
  const migratedStorage = migrated.window.localStorage;
  const migratedRecipes = JSON.parse(migratedStorage.getItem('quickrecipe.recipes.v1'));
  assert.equal(migratedRecipes.length, JSON.parse(recipes).length + 1);
  assert.equal(migratedRecipes.filter(r => r.id === currentRecipe.id).length, 1);
  assert.ok(!migratedRecipes.some(r => r.id === legacyRecipe.id || r.obsoleteMetadata));
  assert.ok(migratedRecipes.some(r => r.id === customRecipe.id));
  assert.deepEqual(JSON.parse(migratedStorage.getItem('quickrecipe.favs.v1')), [currentRecipe.id, ryeBread.id, renamedEntry[1]]);
  assert.equal(migratedRecipes.filter(r => r.title === ryeBread.title).length, 1);
  assert.deepEqual(migratedRecipes.find(r => r.id === ryeBread.id), ryeBread);
  assert.equal(migrated.window.document.querySelector('.ingredient').firstElementChild.className, 'amount');
  assert.equal(JSON.parse(migratedStorage.getItem('quickrecipe.ui.v1')).selectedId, renamedEntry[1]);
  assert.deepEqual(JSON.parse(migratedStorage.getItem('quickrecipe.hydration.v1')), { [currentRecipe.id]: 75 });
  assert.ok(!migratedRecipes.some(r => recipeIndex.retiredIds.includes(r.id)));
  const savedLists = JSON.parse(migratedStorage.getItem('quickrecipe.shopping.v1'));
  assert.ok(!savedLists[renamedEntry[0]]);
  assert.equal(savedLists[renamedEntry[1]].title, migratedRecipes.find(r => r.id === renamedEntry[1]).title);
  assert.deepEqual(savedLists[renamedEntry[1]].items, [{name:'Cream cheese',amount:'1 tub',bought:true}]);
  migrated.window.close();

  // Failed category refreshes keep the complete previously saved collection.
  const stored = [retiredRecipe, JSON.parse(recipes).find(r => r.category === 'Cheesecake'), { ...JSON.parse(recipes)[0], id: 'my-custom-recipe', title: 'My custom recipe' }];
  const failed = new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w) {
      w.fetch = url => url.includes('meringue.json') ? Promise.resolve({ ok: false, status: 503 }) : recipeResponse(url);
      w.matchMedia = () => ({ matches: false, addEventListener() {} });
      w.localStorage.setItem('quickrecipe.recipes.v1', JSON.stringify(stored));
      w.console.warn = () => {};
    },
  });
  const failedScript = failed.window.document.createElement('script');
  failedScript.textContent = appJs;
  failed.window.document.body.appendChild(failedScript);
  await wait();
  assert.deepEqual(JSON.parse(failed.window.localStorage.getItem('quickrecipe.recipes.v1')).map(r => r.id), stored.map(r => r.id));
  assert.ok(failed.window.document.getElementById('toast').textContent.includes('saved collection'));
  failed.window.close();

  console.log(`Smoke test passed: ${cards} recipe cards rendered, detail pane present.`);
})();
