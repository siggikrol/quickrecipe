const fs = require('node:fs');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createHash, webcrypto } = require('node:crypto');
const testPassword = 'canteen-test-password';
const testHash = createHash('sha256').update(testPassword).digest('hex');
function setup(saved = {}, session = {}, fetchGate = Promise.resolve()) {
  const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), { url: 'http://localhost', runScripts: 'dangerously', beforeParse(w) {
    w.TextEncoder = TextEncoder; Object.defineProperty(w.crypto, 'subtle', { value: webcrypto.subtle });
    w.matchMedia = () => ({ matches: false, addEventListener() {} }); w.scrollTo = () => {}; w.confirm = () => true;
    w.fetch = async url => { await fetchGate; return { ok: true, json: async () => JSON.parse(fs.readFileSync(new URL(url, 'http://localhost').pathname.slice(1))) }; };
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
    Object.entries(session).forEach(([key, value]) => w.sessionStorage.setItem(key, value));
    Object.entries(saved).forEach(([key, value]) => w.localStorage.setItem(key, value));
  }});
  const script = dom.window.document.createElement('script');
  script.textContent = ['i18n.js', 'ingredient-allergens.js', 'recipe-calculations.js', 'shopping.js', 'canteen-model.js', 'app.js', 'canteen.js'].map(f => fs.readFileSync(f, 'utf8').replace(/const PRO_PASSWORD_SHA256 = '[a-f0-9]*';/, `const PRO_PASSWORD_SHA256 = '${testHash}';`)).join('\n');
  dom.window.document.body.append(script); return dom;
}
const wait = () => new Promise(resolve => setTimeout(resolve, 150));
async function unlock(w, password = testPassword) {
  w.document.getElementById('canteenBtn').click();
  const form = w.document.querySelector('[data-pro-unlock]');
  w.document.getElementById('proPassword').value = password;
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await wait();
}
(async () => {
  let releaseFetch;
  const delayed = setup({}, { 'quickrecipe.pro.active': 'true' }, new Promise(resolve => { releaseFetch = resolve; }));
  assert(delayed.window.document.body.classList.contains('canteen-active'));
  assert(delayed.window.document.body.classList.contains('canteen-loading'));
  await wait();
  assert(delayed.window.document.body.classList.contains('canteen-loading'));
  assert.equal(delayed.window.document.querySelectorAll('.canteen-day').length, 0);
  releaseFetch(); await wait();
  assert(!delayed.window.document.body.classList.contains('canteen-loading'));
  assert(delayed.window.document.body.classList.contains('canteen-active'));
  assert(!delayed.window.document.getElementById('canteenArea').hidden);
  delayed.window.close();
  let dom = setup(); await wait(); let w = dom.window, d = w.document;
  const change = (el, value) => { el.value = value; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  assert(d.getElementById('canteenArea').hidden);
  d.getElementById('canteenBtn').click();
  assert(d.querySelector('.pro-unlock').open);
  assert.equal(d.querySelectorAll('.canteen-day').length, 0);
  d.querySelector('[data-pro-cancel]').click();
  assert(d.getElementById('canteenArea').hidden);
  await unlock(w, 'wrong-password');
  assert(d.getElementById('canteenArea').hidden);
  assert(d.querySelector('[data-pro-error]').textContent.includes('Incorrect password'));
  assert.equal(d.getElementById('proPassword').value, '');
  d.querySelector('[data-pro-cancel]').click();
  await unlock(w);
  assert.equal(d.querySelectorAll('.canteen-day').length, 5);
  // Every standard slot restricts both the initial list and text searches, in all UI languages.
  const slotExamples = [
    ['Soup', 'Tomato Soup', 'Chocolate'],
    ['Main', 'Roast Chicken', 'Cheesecake'],
    ['Side', 'Mashed Potatoes', 'Cheesecake'],
    ['Dessert', 'Tiramisu', 'Chicken']
  ];
  for (const lang of ['en', 'pl', 'is']) {
    w.changeLanguage(lang);
    for (const [slotName, title, excludedSearch] of slotExamples) {
      const slotIndex = ['Soup', 'Main', 'Side', 'Dessert'].indexOf(slotName);
      d.querySelectorAll('.canteen-day:first-child [data-add]')[slotIndex].click();
      const ids = [...d.querySelectorAll('[data-recipe]')].map(button => button.dataset.recipe);
      assert(ids.length > 0, `${lang}/${slotName}: empty picker`);
      for (const id of ids) {
        const memberships = w.eval(`recipeMemberships(recipes.find(r => r.id === ${JSON.stringify(id)}))`);
        if (slotName === 'Soup') assert(memberships.some(m => ['Soups', 'Polish Soups', 'Soup'].includes(m.category)));
        if (slotName === 'Dessert') assert(memberships.some(m => m.section === 'desserts'));
        if (slotName === 'Side') assert(memberships.some(m => ['Sides', 'Side', 'Salads', 'Bread', 'Polish Breads'].includes(m.category)));
        if (slotName === 'Main') assert(memberships.some(m => m.section === 'meals' && !['Soups', 'Polish Soups', 'Sides', 'Salads'].includes(m.category)));
      }
      const input = d.querySelector('[data-search]');
      input.value = w.eval(`recipeText(${JSON.stringify(title)})`); input.dispatchEvent(new w.Event('input'));
      const expectedId = w.eval(`recipes.find(r => r.title === ${JSON.stringify(title)}).id`);
      assert(d.querySelector(`[data-recipe="${expectedId}"]`), `${lang}/${slotName}: matching recipe missing`);
      input.value = excludedSearch; input.dispatchEvent(new w.Event('input'));
      assert.equal(d.querySelectorAll('[data-recipe]').length, 0, `${lang}/${slotName}: search escaped slot filter`);
      d.querySelector('.canteen-dialog [data-close]').click();
    }
  }
  w.changeLanguage('en');
  change(d.querySelector('[data-day-note]'), 'Serve at 12:30 <staff>');
  change(d.querySelector('[data-default]'), '355');
  d.querySelector('[data-add]').click();
  const search = d.querySelector('[data-search]'); search.value = 'tomato'; search.dispatchEvent(new w.Event('input'));
  assert(d.querySelectorAll('[data-recipe]').length > 0);
  d.querySelector('[data-recipe]').click();
  assert.equal(d.querySelector('[data-portions]').placeholder, '355');
  change(d.querySelector('[data-portions]'), '0');
  assert(d.querySelector('.canteen-slot > .canteen-warning').textContent.includes('0 / 355'));
  d.querySelector('[data-copy-week]').click(); d.querySelector('[data-copy]').click();
  assert.equal(d.querySelector('[data-portions]').value, '0');
  change(d.querySelector('[data-portions]'), '355');
  d.querySelector('[data-settings]').click();
  assert.equal(d.querySelector('.automatic-allergens'), null);
  assert(d.querySelector('[data-servings]'));
  d.querySelector('.canteen-dialog [data-close]').click();
  d.querySelector('[data-allergen-details]').click();
  assert.equal(d.querySelectorAll('.automatic-allergens input[type="checkbox"]').length, 0);
  assert(d.querySelector('.canteen-dialog-head').textContent.includes('Allergens'));
  assert.equal(d.querySelector('[data-ingredient="1"]'), null);
  assert(!d.querySelector('.ingredient-allergen-list').textContent.includes('None listed'));
  const automaticSummary = d.querySelector('.automatic-allergens .declared-allergens').textContent;
  d.querySelector('.canteen-dialog [data-close]').click();
  d.querySelector('[data-allergen-details]').click();
  assert.equal(d.querySelector('.automatic-allergens .declared-allergens').textContent, automaticSummary);
  d.querySelector('.canteen-dialog [data-close]').click();
  // Simulate a declaration saved with the earlier checklist; editing portions must retain it.
  const plannedId = d.querySelector('[data-settings]').closest('[data-item]').dataset.item;
  w.eval(`{ const id = ${JSON.stringify(plannedId)}; const plans = JSON.parse(localStorage.getItem('quickrecipe.canteen.v1'));
    const item = Object.values(plans.weeks).flatMap(p => p.days.flatMap(d => d.items)).find(i => i.id === id);
    const r = recipes.find(r => r.id === item.recipeId); r.ingredientAllergens = { [r.ingredients[0][0]]: ['milk'] };
    r.allergenAdjustments = { add: ['mustard'], remove: [] }; saveAll(); }`);
  d.querySelector('[data-settings]').click(); change(d.querySelector('[data-servings]'), '10');
  assert.equal(d.querySelector('.automatic-allergens'), null);
  d.querySelector('[data-save-settings]').click();
  const badge = d.querySelector('[data-allergen-details]');
  assert(badge.classList.contains('allergen-identified'));
  assert(badge.textContent.includes('Contains allergens'));
  assert(!d.querySelector('.canteen-menu-item').textContent.includes('Milk'));
  assert(!d.querySelector('.canteen-menu-item .declared-allergens'));
  badge.click();
  assert(d.querySelector('.canteen-dialog .declared-allergens').textContent.includes('Milk'));
  assert(d.querySelector('.canteen-dialog .declared-allergens').textContent.includes('Mustard'));
  assert(!d.querySelector('.canteen-dialog [data-servings]'));
  d.querySelector('.canteen-dialog [data-close]').click();
  w.eval(`{const plans=JSON.parse(localStorage.getItem('quickrecipe.canteen.v1'));
    const item=Object.values(plans.weeks).flatMap(p=>p.days.flatMap(d=>d.items)).find(i=>i.id===${JSON.stringify(plannedId)});
    window.allergenRecipeIndex=recipes.findIndex(r=>r.id===item.recipeId);window.allergenRecipeBackup=recipes[window.allergenRecipeIndex];}`);
  for (const ingredient of ['Dark chocolate', 'Unknown sauce mixture', 'Water']) {
    w.eval(`recipes[window.allergenRecipeIndex]={...window.allergenRecipeBackup,ingredients:[[${JSON.stringify(ingredient)},10,'g']],foundations:[],ingredientAllergens:undefined,allergenAdjustments:undefined};canteen.render();`);
    const possible = d.querySelector('[data-allergen-details]');
    if (ingredient === 'Water') assert.equal(possible, null);
    else {
      assert(possible.classList.contains('allergen-possible'));
      assert(possible.textContent.includes('Possible allergens'));
      possible.click();
      assert(d.querySelector('.canteen-dialog').textContent.includes(ingredient === 'Dark chocolate' ? 'Soybeans' : 'Ingredient not in database'));
      d.querySelector('.canteen-dialog [data-close]').click();
    }
  }
  w.eval('recipes[window.allergenRecipeIndex]=window.allergenRecipeBackup;delete window.allergenRecipeBackup;delete window.allergenRecipeIndex;canteen.render();');
  d.querySelector('[data-allergen-details]').click();
  assert(d.querySelector('[data-ingredient="0"]').textContent.includes('Saved declaration'));
  assert.equal(d.querySelectorAll('[data-allergen], [data-reviewed]').length, 0);
  d.querySelector('.canteen-dialog [data-close]').click();

  d.querySelector('[data-tab="requirements"]').click();
  assert(d.querySelector('[data-requirements-output]').textContent.includes('Raw ingredients'));
  let copied = '';
  Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: { writeText: async text => { copied = text; } } });
  d.querySelector('[data-copy-ingredients]').click(); await wait();
  assert(copied.includes('Ingredients needed') && copied.includes('Raw ingredients'));
  Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } });
  d.querySelector('[data-copy-ingredients]').click(); await wait();
  assert.equal(d.querySelector('[data-copy-text]').value, copied);
  d.querySelector('.canteen-dialog [data-close]').click();
  assert.equal(d.querySelector('[data-select-day]').tagName, 'BUTTON');
  assert.equal(d.querySelector('[data-all-days]').getAttribute('aria-pressed'), 'true');
  d.querySelector('[data-all-days]').click();
  assert.equal(d.querySelectorAll('[data-select-day][aria-pressed="true"]').length, 0);
  assert(d.querySelector('[data-print-requirements]').disabled);
  assert(d.querySelector('[data-copy-ingredients]').disabled);
  d.querySelector('[data-select-day]').click();
  assert.equal(d.querySelectorAll('[data-select-day][aria-pressed="true"]').length, 1);
  assert(!d.querySelector('[data-print-requirements]').disabled);
  d.querySelectorAll('[data-select-day]')[1].click();
  assert.equal(d.querySelectorAll('[data-select-day][aria-pressed="true"]').length, 2);
  w.changeLanguage('pl');
  assert.equal(d.querySelectorAll('[data-select-day][aria-pressed="true"]').length, 2);
  w.changeLanguage('en');
  d.querySelector('[data-all-days]').click();
  assert.equal(d.querySelectorAll('[data-select-day][aria-pressed="true"]').length, 5);
  d.querySelector('[data-tab="kitchen"]').click();
  assert(d.querySelector('[data-production-item]').textContent.includes('355'));
  assert(d.querySelector('.canteen-day-note').textContent.includes('Serve at 12:30 <staff>'));
  assert.equal(d.querySelector('.canteen-batch-options').open, false);
  change(d.querySelector('[data-batch-mode]'), 'maximum');
  assert(d.querySelector('[data-batch-value]').parentElement.textContent.includes('Maximum portions per batch'));
  assert(d.querySelector('.canteen-batch-options').open); change(d.querySelector('[data-batch-value]'), '80');
  assert(d.querySelector('[data-production-item]').textContent.includes('5 × 71'));
  const check = d.querySelector('[data-complete]'); check.checked = true; check.dispatchEvent(new w.Event('change'));
  const savedProgress = JSON.parse(w.localStorage.getItem('quickrecipe.canteen.v1'));
  assert(Object.values(savedProgress.weeks).some(plan => Object.values(plan.production).some(progress => progress.completed && progress.batch?.value === 80)));
  const normalSelection = w.eval('selectedId');
  d.querySelector('[data-open-batch]').click();
  assert.equal(w.eval('scale'), 7.1);
  assert(d.querySelector('.canteen-recipe-context').textContent.includes('355'));
  d.querySelector('[data-return-kitchen]').click();
  assert.equal(w.eval('selectedId'), normalSelection);
  assert(d.querySelector('[data-complete]').checked);
  d.querySelector('[data-print-production]').click();
  assert(d.querySelector('#canteenPrint').textContent.includes('355'));
  assert(d.querySelector('#canteenPrint').textContent.includes('Serve at 12:30 <staff>'));
  assert(!d.querySelector('#canteenPrint button'));
  d.querySelector('.canteen-dialog [data-close]').click();
  d.querySelector('[data-tab="week"]').click();
  change(d.querySelector('[data-portions]'), '0');
  const savedRecipes = w.localStorage.getItem('quickrecipe.recipes.v1');
  const saved = w.localStorage.getItem('quickrecipe.canteen.v1');
  const selectedWeek = d.querySelector('[data-week]').value;
  const session = Object.fromEntries(Object.entries(w.sessionStorage));
  assert.equal(session['quickrecipe.pro.active'], 'true');
  dom.window.close(); dom = setup({ 'quickrecipe.canteen.v1': saved, 'quickrecipe.recipes.v1': savedRecipes }, session); await wait(); w = dom.window; d = w.document;
  assert(!d.getElementById('canteenArea').hidden);
  assert.equal(d.querySelector('.brand').textContent, 'QuickRecipe Pro');
  assert.equal(d.getElementById('canteenBtn').getAttribute('aria-pressed'), 'true');
  assert(!d.querySelector('.pro-unlock').open);
  change(d.querySelector('[data-week]'), selectedWeek);
  assert.equal(d.querySelector('[data-portions]').value, '0');
  assert.equal(d.querySelector('[data-day-note]').value, 'Serve at 12:30 <staff>');
  const itemId = Object.values(JSON.parse(saved).weeks).flatMap(plan => plan.days.flatMap(day => day.items))[0].recipeId;
  assert.equal(w.eval(`recipes.find(r => r.id === ${JSON.stringify(itemId)}).servings`), 10);
  assert(w.eval(`recipes.find(r => r.id === ${JSON.stringify(itemId)}).ingredientAllergens[recipes.find(r => r.id === ${JSON.stringify(itemId)}).ingredients[0][0]].includes('milk')`));
  assert(w.eval(`recipes.find(r => r.id === ${JSON.stringify(itemId)}).allergenAdjustments.add.includes('mustard')`));
  d.querySelector('[data-allergen-details]').click();
  assert(d.querySelector('[data-ingredient="0"]').textContent.includes('Saved declaration'));
  assert.equal(d.querySelector('[data-ingredient="1"]'), null);
  assert(!d.querySelector('.ingredient-allergen-list').textContent.includes('None listed'));
  assert.equal(d.querySelectorAll('[data-allergen], [data-reviewed]').length, 0);
  d.querySelector('.canteen-dialog [data-close]').click();
  w.changeLanguage('pl'); assert(d.querySelector('[data-tab="week"]').textContent.includes('Tydzień'));
  w.changeLanguage('is'); assert(d.querySelector('[data-tab="week"]').textContent.includes('Vika'));
  w.changeLanguage('en');
  d.querySelector('[data-tab="kitchen"]').click(); assert.equal(d.querySelector('[data-complete]').checked, false);
  d.querySelector('[data-exit]').click(); assert(d.getElementById('canteenArea').hidden);
  assert.equal(d.getElementById('canteenArea').innerHTML, '');
  assert.equal(w.sessionStorage.getItem('quickrecipe.pro.active'), null);
  w.eval('canteen.open()'); assert(d.querySelector('.pro-unlock').open); assert(d.getElementById('canteenArea').hidden);
  d.querySelector('[data-pro-cancel]').click();
  assert(!w.localStorage.getItem('quickrecipe.canteen.v1').includes(testPassword));
  dom.window.close();
  dom = setup({ 'quickrecipe.canteen.v1': '{invalid' }); await wait();
  await unlock(dom.window);
  assert(dom.window.document.querySelector('[data-backup]'));
  assert.equal(dom.window.localStorage.getItem('quickrecipe.canteen.v1'), '{invalid');
  dom.window.close();
  console.log('Canteen UI: password checks, cancellation, relocking, planning, search, overrides, copying, reload and return passed.');
})().catch(error => { console.error(error); process.exit(1); });
