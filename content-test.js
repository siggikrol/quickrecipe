const fs = require('node:fs');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const index = JSON.parse(fs.readFileSync('recipes/index.json'));
const files = Object.fromEntries(index.files.map(name => [name, JSON.parse(fs.readFileSync(`recipes/${name}`))]));
const collection = Object.values(files).flat();
const batches = ['foundation-sauces', 'stocks', 'dips', 'breakfast', 'pasta', 'chicken', 'quick-dinners', 'meat', 'seafood', 'rice', 'vegetarian', 'sides', 'salads', 'soups', 'casseroles'];
const additions = batches.flatMap(name => files[`${name}.json`]);
const byId = Object.fromEntries(collection.map(r => [r.id, r]));
assert.equal(new Set(collection.map(r => r.id)).size, collection.length, 'Recipe IDs must be globally unique');
const allowed = new Set(['id', 'title', 'category', 'section', 'desc', 'ingredients', 'steps', 'compactMetricUnits', 'yield', 'batchYield', 'foundations', 'categoryMemberships', 'prep', 'cook', 'bake', 'ferment', 'tempC']);
for (const r of additions) {
  assert(r, 'All content batches must be indexed');
  Object.keys(r).forEach(key => assert(allowed.has(key), `${r.id}: unexpected metadata ${key}`));
  assert(r.steps.length >= 4 && r.steps.length <= 7, `${r.id}: complete, concise method`);
  assert(r.ingredients.length > 0, `${r.id}: additional ingredients required`);
  assert(r.batchYield || /^\d+ servings$/.test(r.yield), `${r.id}: useful yield`);
  assert(['prep', 'cook', 'bake', 'ferment'].some(key => /\d/.test(r[key] || '')), `${r.id}: timing required`);
  assert.equal(r.compactMetricUnits, true, `${r.id}: practical metric units`);
  const names = r.ingredients.map(i => i[0].toLowerCase());
  assert.equal(new Set(names).size, names.length, `${r.id}: label separate uses rather than repeating an ingredient`);
  for (const [name, amount, unit] of r.ingredients) {
    assert(['g', 'kg', 'ml', 'L', 'tsp', 'tbsp', 'pc'].includes(unit), `${r.id}: measurable unit for ${name}`);
    assert(amount === null || Number.isFinite(amount) && amount > 0, `${r.id}: positive quantity for ${name}`);
    if (amount === null) assert(/water|optional/i.test(name), `${r.id}: essential ingredient needs a quantity`);
  }
}
const version = fs.readFileSync('app.js', 'utf8').match(/RECIPE_VERSION = '(\d+)'/)[1];
assert.equal(fs.readFileSync('sw.js', 'utf8').match(/VERSION = '(\d+)'/)[1], version);
for (const match of fs.readFileSync('index.html', 'utf8').matchAll(/(?:js|css)\?v=(\d+)/g)) assert.equal(match[1], version);

const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), {
  url: 'http://localhost', runScripts: 'dangerously',
  beforeParse(w) {
    w.matchMedia = () => ({ matches: false, addEventListener() {} });
    w.scrollTo = () => {};
    w.fetch = async url => {
      const path = new URL(url, 'http://localhost').pathname;
      const data = path === '/recipes/index.json' ? index : path.startsWith('/recipes/') ? files[path.slice(9)] : JSON.parse(fs.readFileSync('.' + path));
      return { ok: true, json: async () => structuredClone(data) };
    };
  },
});
const w = dom.window, d = w.document;
const script = d.createElement('script');
script.textContent = ['i18n.js', 'shopping.js', 'app.js'].map(f => fs.readFileSync(f, 'utf8')).join('\n');
d.body.append(script);
const wait = () => new Promise(resolve => setTimeout(resolve, 80));
const near = (actual, expected, label, tolerance = 1e-8) => assert(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
// Check displayed quantities independently of the app's formatting helpers.
function checkAmount(text, amount, unit, label) {
  if (amount === null) return assert.equal(text, 'As needed', label);
  if (unit === 'kg') { amount *= 1000; unit = 'g'; }
  if (unit === 'L') { amount *= 1000; unit = 'ml'; }
  if (amount >= 1000 && ['g', 'ml'].includes(unit)) { amount /= 1000; unit = unit === 'g' ? 'kg' : 'L'; }
  const match = text.match(/^(\d+(?:\.\d+)?) (.+)$/);
  assert(match, `${label}: unreadable amount ${text}`);
  assert.equal(match[2], unit, label);
  near(Number(match[1]), amount, label, amount < 10 ? 0.00501 : 0.05001);
}
(async () => {
  await wait();
  w.validateRecipeFamilies(collection);
  const categories = w.eval('recipeSections');
  for (const r of additions) {
    for (const membership of [{ section: r.section, category: r.category }, ...(r.categoryMemberships || [])]) {
      assert(categories.find(s => s.id === membership.section)?.categories.includes(membership.category), `${r.id}: use an established category`);
    }
    for (const multiplier of [0.5, 1, 2, 3]) {
      w.eval(`selectedId = ${JSON.stringify(r.id)}; scale = ${multiplier}; unit = 'metric'; view = 'amounts'; renderDetail();`);
      assert.equal(d.querySelector('#detail h1').textContent, r.title);
      assert.equal(d.querySelectorAll('.steps li').length, r.steps.length, r.id);
      const rows = [...d.querySelectorAll('.ingredient')];
      assert.equal(rows.length, r.ingredients.length, r.id);
      rows.forEach((row, i) => {
        const ingredient = r.ingredients[i];
        assert.equal(row.querySelector('.ingredient-name').textContent, ingredient[0], `${r.id}: ingredient order`);
        checkAmount(row.querySelector('.amount').textContent, ingredient[1] === null ? null : ingredient[1] * multiplier, ingredient[2], `${r.id}: ${ingredient[0]} at ${multiplier}×`);
      });
      const foundationRows = [...d.querySelectorAll('.foundation-row')];
      assert.equal(foundationRows.length, r.foundations?.length || 0, r.id);
      foundationRows.forEach((row, i) => {
        const f = r.foundations[i];
        assert.equal(row.querySelector('button').textContent, byId[f.recipeId].title);
        checkAmount(row.querySelector('strong').textContent, f.amount * multiplier, f.unit, `${r.id}: base at ${multiplier}×`);
      });
      if (r.batchYield) checkAmount(d.getElementById('recipeYield').textContent, r.batchYield.amount * multiplier, r.batchYield.unit, `${r.id}: yield`);
      else assert.equal(Number(d.getElementById('recipeYield').textContent.match(/^\d+(?:\.\d+)?/)[0]), Number(r.yield.match(/^\d+/)[0]) * multiplier, `${r.id}: servings`);
    }
  }
  // Published Béchamel -> Mornay chain: 600 ml uses 500 ml Béchamel.
  for (const multiplier of [0.5, 1, 2, 3]) {
    const plan = w.familyShoppingPlan(byId.mornay, multiplier, {}, collection);
    const amounts = Object.fromEntries(plan.ingredients.map(i => [i.name, i.amount]));
    near(amounts['Whole milk'], 500 * multiplier, 'Mornay milk');
    near(amounts.Butter, 30 * multiplier, 'Mornay butter');
    near(amounts['Plain flour'], 30 * multiplier, 'Mornay flour');
    near(amounts['Gruyère, grated'], 60 * multiplier, 'Mornay Gruyère');
    // Demi-glace uses stock directly AND through Espagnole: 500 + 625 ml.
    const demi = w.familyShoppingPlan(byId['demi-glace'], multiplier, {}, collection);
    near(demi.bases.find(b => b.id === 'brown-beef-stock').amount, 1125 * multiplier, 'Shared beef stock');
    near(demi.ingredients.find(i => i.name === 'Beef bones, chopped').amount, 900 * multiplier, 'Shared stock bones');
    near(demi.ingredients.find(i => i.name === 'Onion, finely chopped').amount, 140 * multiplier, 'Stock and sauce onions');
    const prepared = w.familyShoppingPlan(byId['demi-glace'], multiplier, { 'brown-beef-stock': true }, collection);
    assert(!prepared.ingredients.some(i => i.name === 'Beef bones, chopped'));
    near(prepared.ingredients.find(i => i.name === 'Onion, finely chopped').amount, 50 * multiplier, 'Prepared stock leaves sauce onions');
  }
  w.eval("selectedId = 'mornay'; scale = 3; renderDetail();");
  d.querySelector('[data-foundation="bechamel"]').click();
  assert.equal(d.querySelector('#detail h1').textContent, 'Béchamel');
  assert.equal(d.getElementById('recipeYield').textContent, '1.5 L');
  for (const id of ['mornay', 'mustard-bechamel', 'parsley-sauce']) assert(d.querySelector(`[data-derivative="${id}"]`));
  d.querySelector('[data-family-back]').click();
  assert.equal(d.getElementById('recipeYield').textContent, '1.8 L');
  for (const lang of ['pl', 'is', 'en']) {
    await w.changeLanguage(lang); await wait();
    assert(!w.missingRecipeTranslation(byId.mornay));
    assert.equal(d.querySelectorAll('.foundation-row').length, 1);
  }
  dom.window.close();
  console.log(`Content: ${additions.length} recipes at all four scales; categories, yields, published families and shared-stock shopping passed.`);
})().catch(error => { dom.window.close(); console.error(error); process.exitCode = 1; });
