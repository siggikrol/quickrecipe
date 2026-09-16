const assert = require('node:assert/strict');
const fs = require('node:fs');
const D = require('./ingredient-allergens');
const M = require('./recipe-calculations');
const recipes = JSON.parse(fs.readFileSync('recipes/index.json')).files.flatMap(file => JSON.parse(fs.readFileSync(`recipes/${file}`)));
const names = new Set();
for (const profile of D.profiles) {
  for (const id of [...profile.contains, ...profile.possible]) assert(Object.hasOwn(M.allergens, id), id);
  assert(!profile.contains.some(id => profile.possible.includes(id)));
  for (const name of profile.ingredients) { assert(!names.has(name.toLowerCase()), `Duplicate: ${name}`); names.add(name.toLowerCase()); }
}
for (const r of recipes) {
  for (const [name] of r.ingredients) assert(D.lookup(name).known, `Missing database entry: ${name}`);
  assert.deepEqual(M.deriveRecipeAllergens(r, recipes).unknown, [], r.title);
}
for (const [name, expected] of [['Bread flour', 'gluten'], ['Butter', 'milk'], ['Eggs', 'eggs'], ['Almond flour', 'nuts'],
  ['Peanut butter', 'peanuts'], ['Celery, diced', 'celery'], ['Dijon mustard', 'mustard'], ['Soybeans', 'soybeans'],
  ['Tahini', 'sesame'], ['Lupin flour', 'lupin'], ['Salmon fillets', 'fish'], ['Prawns', 'crustaceans'], ['Mussels', 'molluscs']]) {
  assert(D.lookup(name).allergens.includes(expected), `${name}: ${expected}`);
}
for (const name of ['Water', 'Salt', 'Coconut milk', 'Nutmeg', 'Cornflour', 'Pine nuts']) assert.deepEqual(D.lookup(name).allergens, [], name);
assert(!D.lookup('Peanut butter').allergens.includes('milk'));
assert(!D.lookup('Almond flour').allergens.includes('gluten'));
assert(!D.lookup('Mini chocolate eggs').allergens.includes('eggs'));
assert(!D.lookup('Chocolate kisses, one per cookie').allergens.includes('gluten'));
assert.deepEqual(D.lookup('Egg yolk — pastry').allergens, ['eggs']);
assert.deepEqual(D.lookup('Cold butter — pastry').allergens, ['milk']);
assert.deepEqual(D.lookup('Salt — pastry').allergens, []);
assert.deepEqual(D.lookup('Cocoa powder — pastry').allergens, []);
assert.deepEqual(D.lookup('Double cream — chocolate').allergens, ['milk']);
assert.deepEqual(D.lookup('Double cream — chocolate').possible, []);
for (const name of ['Broth', 'Dark chocolate', 'Worcestershire sauce', 'Dry white wine', 'Cooked egg noodles or rice']) {
  const profile = D.lookup(name); assert(profile.productDependent); assert(profile.possible.length, name);
}
assert(D.lookup('Dry white wine').possible.includes('sulphites'));
assert(!D.lookup('Dry white wine').allergens.includes('sulphites'));
assert.equal(D.lookup('Unspecified sauce mixture').known, false);
const unknown = M.deriveRecipeAllergens({ id: 'custom', ingredients: [['Unspecified sauce mixture', 1, 'g']] }, []);
assert.equal(unknown.complete, false); assert.deepEqual(unknown.unknown, ['Unspecified sauce mixture']);
const base = { id: 'base', ingredients: [['Broth', 1, 'L'], ['Butter', 10, 'g']] };
const soup = { id: 'soup', ingredients: [['Water', 1, 'L']], foundations: [{ recipeId: 'base' }] };
const derived = M.deriveRecipeAllergens(soup, [base, soup]);
assert(derived.allergens.includes('milk')); assert(derived.possible.includes('celery')); assert(derived.labelDependent.includes('Broth'));
const legacy = { id: 'legacy', ingredients: [['Butter', 1, 'g']], ingredientAllergens: { Butter: ['milk', 'soybeans'] } };
assert(M.ingredientProfile(legacy, 'Butter').saved);
assert.deepEqual(M.ingredientAllergens(JSON.parse(JSON.stringify(legacy)), 'Butter'), ['milk', 'soybeans']);
console.log(`Ingredient database: ${names.size} entries; all ${recipes.length} recipes covered; automatic, possible, unknown, nested and saved declarations passed.`);
