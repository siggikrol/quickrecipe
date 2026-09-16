const fs = require('node:fs');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const index = JSON.parse(fs.readFileSync('recipes/index.json'));
const files = Object.fromEntries(index.files.map(f => ['/recipes/' + f, JSON.parse(fs.readFileSync('recipes/' + f))]));
const wait = () => new Promise(resolve => setTimeout(resolve, 80));
// Arithmetic fixtures only; these formulas are not published recipes.
const base = { id: 'base-sauce', title: 'Base sauce', category: 'Sauces', section: 'sauces', batchYield: { amount: 1, unit: 'L' },
  ingredients: [['Milk', 800, 'ml', 'other'], ['Butter', 50, 'g', 'other'], ['Plain flour', 50, 'g', 'other']], steps: ['Mix.'] };
const cheese = { id: 'cheese-sauce', title: 'Arithmetic cheese sauce', category: 'Sauces', section: 'sauces', batchYield: { amount: 500, unit: 'ml' },
  foundations: [{ recipeId: base.id, amount: 500, unit: 'ml' }], ingredients: [['Cheese', 100, 'g', 'other']], steps: ['Add cheese.'] };
const butter = { id: 'butter-sauce', title: 'Butter sauce', category: 'Sauces', section: 'sauces', batchYield: { amount: 500, unit: 'ml' },
  foundations: [{ recipeId: base.id, amount: 0.25, unit: 'L' }], ingredients: [['Butter', 10, 'g', 'other']], steps: ['Add butter.'] };
const meal = { id: 'sauce-bake', title: 'Sauce bake', category: 'Mains', section: 'meals',
  categoryMemberships: [{ section: 'meals', category: 'Quick dinners' }, { section: 'sauces', category: 'Sauces' }],
  foundations: [{ recipeId: cheese.id, amount: 500, unit: 'ml' }, { recipeId: butter.id, amount: 500, unit: 'ml' }],
  ingredients: [['Butter', 20, 'g', 'other'], ['Salt', null, 'g', 'other']], steps: ['Combine.'] };
const fixtures = [base, cheese, butter, meal];
function setup(saved) {
  const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), { url: 'http://localhost', runScripts: 'dangerously', beforeParse(w) {
    w.matchMedia = () => ({ matches: false, addEventListener() {} }); w.scrollTo = () => {};
    w.fetch = async url => {
      const pathname = new URL(url, 'http://localhost').pathname;
      const data = pathname === '/recipes/index.json' ? index : files[pathname] || JSON.parse(fs.readFileSync('.' + pathname));
      return { ok: true, json: async () => structuredClone(data) };
    };
    w.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
    w.HTMLDialogElement.prototype.close = function() { this.open = false; };
    if (saved) w.localStorage.setItem('quickrecipe.shopping.v1', saved);
  }});
  const script = dom.window.document.createElement('script');
  script.textContent = ['i18n.js', 'recipe-calculations.js', 'shopping.js', 'app.js'].map(f => fs.readFileSync(f, 'utf8')).join('\n');
  dom.window.document.body.append(script);
  return dom;
}
(async () => {
  const dom = setup(); await wait(); const w = dom.window, d = w.document;
  const json = value => JSON.parse(JSON.stringify(value));
  w.eval(`recipes.push(...${JSON.stringify(fixtures)}); render();`);
  // Related sauce links preserve the category, list, and scroll position.
  d.querySelector('[data-browse="sauces"]').click();
  d.querySelector('[data-cat="Béchamel"]').click();
  d.querySelector('[data-id="bechamel"]').click();
  const sauceCards = [...d.querySelectorAll('.card')].map(el => el.dataset.id);
  d.getElementById('list').scrollTop = 120;
  d.querySelector('[data-derivative="parsley-sauce"]').click();
  assert.equal(d.querySelector('#detail h1').textContent, 'Parsley Sauce');
  assert.equal(d.querySelector('[data-cat="Béchamel"]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual([...d.querySelectorAll('.card')].map(el => el.dataset.id), sauceCards);
  assert.equal(d.getElementById('list').scrollTop, 120);
  d.querySelector('[data-family-back]').click();
  assert.equal(d.querySelector('#detail h1').textContent, 'Béchamel');
  d.querySelector('[data-browse="All"]').click();
  assert(w.compareIcelandicLabels('Konfekt', 'Kökur') < 0);
  assert(w.compareIcelandicLabels('D', 'Ð') < 0);
  assert(w.compareIcelandicLabels('Þ', 'Æ') < 0);
  assert(w.compareIcelandicLabels('Æ', 'Ö') < 0);
  assert.equal(w.compareIcelandicLabels('Ö', 'O\u0308'), 0);
  w.validateRecipeFamilies(fixtures);
  assert.equal(w.foundationMultiplier(cheese.foundations[0], fixtures), 0.5);
  const invalid = [
    [{ ...cheese, foundations: [{ recipeId: 'missing', amount: 1, unit: 'ml' }] }],
    [base, { ...cheese, foundations: [{ recipeId: base.id, amount: 1, unit: 'g' }] }],
    [{ ...base, batchYield: { amount: 0, unit: 'ml' } }],
    [{ ...base, foundations: [{ recipeId: base.id, amount: 1, unit: 'ml' }] }],
    [{ ...base, foundations: [{ recipeId: cheese.id, amount: 1, unit: 'ml' }] }, cheese],
    [base, { ...cheese, foundations: [...cheese.foundations, ...cheese.foundations] }],
  ];
  invalid.forEach(collection => assert.throws(() => w.validateRecipeFamilies(collection)));
  for (const multiplier of [0.5, 1, 2, 3]) {
    const plan = w.familyShoppingPlan(meal, multiplier, {}, fixtures);
    const byName = Object.fromEntries(plan.ingredients.map(i => [i.name, i]));
    assert.equal(byName.Milk.amount, 600 * multiplier);
    assert.equal(byName.Butter.amount, 67.5 * multiplier);
    assert.equal(byName.Cheese.amount, 100 * multiplier);
    assert.equal(byName.Salt.asNeeded, true);
    assert.equal(plan.bases.find(b => b.id === base.id).amount, 750 * multiplier);
  }
  const prepared = w.familyShoppingPlan(meal, 1, { [cheese.id]: true }, fixtures);
  assert.equal(prepared.ingredients.find(i => i.name === 'Milk').amount, 200);
  assert(!prepared.ingredients.some(i => i.name === 'Cheese'));
  const both = w.familyShoppingPlan(meal, 1, { [cheese.id]: true, [butter.id]: true }, fixtures);
  assert.deepEqual(json(both.ingredients.map(i => i.name)), ['Butter', 'Salt']);
  const mixed = { ...meal, foundations: [], ingredients: [['Butter', 0.5, 'kg', 'other'], ['Butter', 50, 'g', 'other'], ['Butter', 1, 'tsp', 'other'], ['Salt', 1, 'g', 'other', 2], ['Salt', null, 'g', 'other']] };
  const merged = w.familyShoppingPlan(mixed, 2, {}, [mixed]);
  assert.equal(merged.ingredients.length, 3);
  assert.equal(merged.ingredients[0].amount, 1100);
  assert.equal(merged.ingredients[2].maximum, 4);
  assert.equal(w.familyShoppingAmount(merged.ingredients[2]), '2 g – 4 g + As needed');
  assert.equal(w.familyAmount(2000, 'ml'), '2 L');

  d.querySelector('[data-browse="meals"]').click();
  d.querySelector('[data-cat="Quick dinners"]').click();
  assert.equal(d.querySelectorAll(`[data-id="${meal.id}"]`).length, 1);
  d.querySelector(`[data-id="${meal.id}"]`).click();
  d.querySelector('[data-scale="2"]').click();
  d.getElementById('list').scrollTop = 123; d.getElementById('detail').scrollTop = 234;
  d.querySelector(`[data-foundation="${cheese.id}"]`).click();
  assert.equal(d.querySelector('#detail h1').textContent, cheese.title);
  assert.equal(d.querySelector('[data-cat="Quick dinners"]').getAttribute('aria-pressed'), 'true');
  assert.equal(d.getElementById('list').scrollTop, 123);
  assert.equal(d.querySelector(`[data-id="${cheese.id}"]`), null, 'An out-of-category base opens without replacing the list');

  assert.equal(d.getElementById('recipeYield').textContent, '1 L');
  d.querySelector(`[data-foundation="${base.id}"]`).click();
  assert.equal(d.getElementById('recipeYield').textContent, '1 L');
  assert.equal(d.querySelectorAll('[data-derivative]').length, 2);
  d.querySelector('[data-family-back]').click(); d.querySelector('[data-family-back]').click();
  assert.equal(d.querySelector('#detail h1').textContent, meal.title);
  assert.equal(d.querySelector('[data-cat="Quick dinners"]').getAttribute('aria-pressed'), 'true');
  assert.equal(d.getElementById('list').scrollTop, 123); assert.equal(d.getElementById('detail').scrollTop, 234);
  assert.equal(d.querySelector('[data-scale="2"]').classList.contains('active'), true);
  d.querySelector('#detailFav').click();
  assert(JSON.parse(w.localStorage.getItem('quickrecipe.favs.v1')).includes(meal.id));
  for (const lang of ['pl', 'is', 'en']) {
    w.changeLanguage(lang); await wait();
    const labels = [...d.querySelectorAll('[data-cat]')].slice(1).map(el => el.textContent);
    assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b, lang, { sensitivity: 'base' })));
    assert.equal(d.querySelector('.foundation-ingredients h3').textContent, { en: 'Requires', pl: 'Wymaga', is: 'Þarf' }[lang]);
  }
  d.querySelector('#shoppingStart').click();
  assert.equal(d.querySelectorAll('[data-prepared-base]').length, 3);
  d.querySelector('[data-family-select-all]').click();
  const makeChoice = (id, value) => { const select = d.querySelector(`[data-prepared-base="${id}"]`); select.value = value; select.dispatchEvent(new w.Event('change')); };
  makeChoice(cheese.id, 'prepared');
  assert(![...d.querySelectorAll('.family-shopping-item')].some(el => el.textContent.includes('Cheese')));
  assert([...d.querySelectorAll('.family-shopping-item')].some(el => el.textContent.includes('400 ml')));
  makeChoice(cheese.id, 'make');
  d.querySelector('[data-family-select-all]').click();
  d.querySelector('[data-view-list]').click();
  assert.equal(d.querySelectorAll('.shopping-row').length, 5);
  const butterRow = [...d.querySelectorAll('.shopping-row')].find(el => el.querySelector('.shopping-item-name span').textContent === 'Butter');
  assert.equal(butterRow.querySelector('.shopping-amount input').value, '135 g');
  butterRow.querySelector('.shopping-amount input').value = '1 pack';
  butterRow.querySelector('.shopping-amount input').dispatchEvent(new w.Event('input'));
  d.querySelector('[data-edit]').click();
  d.querySelector('[data-scale="3"]').click();
  d.querySelector('[data-view-list]').click();
  assert([...d.querySelectorAll('.shopping-amount input')].some(el => el.value === '1 pack'));
  assert([...d.querySelectorAll('.shopping-amount input')].some(el => el.value === '1.8 L'));
  const saved = w.localStorage.getItem('quickrecipe.shopping.v1');
  d.querySelector('dialog').close();
  w.openModal(meal);
  assert.equal(d.querySelectorAll('[data-membership-section]:checked').length, 2);
  assert.equal(d.querySelectorAll('#fFoundations .foundation-editor-row').length, 2);
  assert.deepEqual(json(w.readRecipeOrganization().foundations), meal.foundations);
  w.saveRecipe();
  assert.equal(w.eval('recipes.find(r => r.id === "sauce-bake").foundations.length'), 2);
  w.openModal(base); w.deleteRecipe();
  assert(w.eval('recipes.some(r => r.id === "base-sauce")'));
  assert(d.getElementById('toast').textContent.includes('used by another recipe'));
  w.closeModal();
  const search = d.getElementById('search'); search.value = 'Arithmetic cheese sauce'; search.dispatchEvent(new w.Event('input'));
  assert.equal(d.querySelectorAll('.card').length, 1);
  assert.equal(d.querySelector('.card').dataset.id, cheese.id);
  dom.window.close();
  const restored = setup(saved); await wait();
  restored.window.eval(`recipes.push(...${JSON.stringify(fixtures)}); render();`);
  const rd = restored.window.document;
  rd.querySelector('#shoppingListsBtn').click(); rd.querySelector('.shopping-list-link').click();
  assert([...rd.querySelectorAll('.shopping-amount input')].some(el => el.value === '1 pack'));
  rd.querySelector('[data-edit]').click();
  assert.equal(rd.querySelector('[data-scale="3"]').classList.contains('active'), true);
  assert.equal(rd.querySelectorAll('[data-family-shopping-key]:checked').length, 5);
  restored.window.close();
  console.log('Recipe families: validation, nested scaling, categories, navigation, translations, editor and shopping persistence passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
