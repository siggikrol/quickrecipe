const assert = require('node:assert/strict');
const M = require('./recipe-calculations');
const stock = { id: 'stock', batchYield: { amount: 1, unit: 'L' }, ingredients: [['Onions', 100, 'g']] };
const sauce = { id: 'sauce', batchYield: { amount: 500, unit: 'ml' }, foundations: [{ recipeId: 'stock', amount: 250, unit: 'ml' }], ingredients: [['Butter', 0.1, 'kg']] };
const meal = { id: 'meal', yield: '10 servings', foundations: [{ recipeId: 'sauce', amount: 1, unit: 'L' }], ingredients: [['Butter', 50, 'g'], ['Milk', 100, 'ml'], ['Salt', null, 'g']] };
const other = { id: 'other', servings: 10, ingredients: [['Butter', 1, 'kg'], ['Milk', 1, 'L'], ['Butter', 1, 'L'], ['Salt', 2, 'g', '', 4], ['Spice', 2, '']] };
const collection = [stock, sauce, meal, other];
assert.equal(M.scaleRecipe(meal, 350).factor, 35);
assert.equal(M.scaleRecipe(meal, 355).factor, 35.5);
assert.throws(() => M.scaleRecipe({ id: 'cake', yield: '1 × 23 cm cake' }, 355));
assert.equal(M.scaleRecipe({ id: 'cake' }, 0).factor, 0);
assert.equal(M.servingYield({ yield: '10–12 servings' }), null);
assert.throws(() => M.scaleRecipe(meal, -1));
const result = M.calculateRequirements([{ recipeId: 'meal', portions: 350 }, { recipeId: 'other', portions: 10 }], collection);
assert.equal(result.ingredients.find(i => i.name === 'Onions').amount, 1750);
assert.equal(result.ingredients.find(i => i.name === 'Butter' && i.unit === 'g').amount, 9750);
assert.equal(result.ingredients.find(i => i.name === 'Milk').amount, 4500);
assert.equal(result.ingredients.filter(i => i.name === 'Butter').length, 2);
assert.equal(result.ingredients.find(i => i.name === 'Spice').unit, '');
assert.equal(result.ingredients.find(i => i.name === 'Salt').maximum, 4);
assert.equal(result.ingredients.find(i => i.name === 'Salt').asNeeded, true);
assert.equal(result.bases.find(b => b.id === 'sauce').amount, 35000);
assert.equal(result.bases.find(b => b.id === 'stock').amount, 17500);
assert.deepEqual(M.calculateRequirements([{ recipeId: 'meal', portions: 0 }], collection), { ingredients: [], bases: [] });
const circular = { ...stock, foundations: [{ recipeId: 'stock', amount: 1, unit: 'L' }] };
assert.throws(() => M.expandFoundationRequirements(circular, 1, [circular]), /Circular/);
assert.throws(() => M.calculateRequirements([{ recipeId: 'missing', portions: 1 }], collection), /unavailable/);
assert.throws(() => M.foundationMultiplier({ recipeId: 'stock', amount: 1, unit: 'kg' }, collection), /Incompatible/);
assert.deepEqual(M.batches(400, { mode: 'count', value: 4 }), { count: 4, perBatch: 100, total: 400 });
assert.deepEqual(M.batches(400, { mode: 'maximum', value: 80 }), { count: 5, perBatch: 80, total: 400 });
assert.equal(M.batches(355, { mode: 'maximum', value: 80 }).count, 5);
assert.equal(M.batches(355, { mode: 'maximum', value: 80 }).perBatch, 71);
assert.equal(M.batches(0).count, 0);
assert.throws(() => M.batches(1, { mode: 'maximum', value: 0 }));
assert.throws(() => M.batches(1, { mode: 'count', value: 1.5 }));
console.log('Shared calculations: portions, decimals, aggregation, units, ranges, zero, missing yields, nested foundations, cycles and batches passed.');
stock.ingredientAllergens = { Onions: ['celery'] };
sauce.ingredientAllergens = { Butter: ['milk'] };
meal.ingredientAllergens = { Butter: ['milk'], Milk: ['milk'], Salt: [] };
assert.deepEqual(M.deriveRecipeAllergens(meal, collection), { allergens: ['milk', 'celery'], possible: [], complete: true, labelDependent: [], unknown: [] });
meal.allergenAdjustments = { add: ['mustard'], remove: ['celery'] };
assert.deepEqual(M.deriveRecipeAllergens(meal, collection), { allergens: ['milk', 'mustard'], possible: [], complete: true, labelDependent: [], unknown: [] });
delete meal.ingredientAllergens.Salt;
assert.equal(M.deriveRecipeAllergens(meal, collection).complete, true);
assert.throws(() => M.deriveRecipeAllergens(circular, [circular]), /Circular/);
assert.equal(Object.keys(M.allergens).length, 14);
console.log('Allergens: ingredient declarations, nested inheritance, manual adjustments, unknown declarations and cycles passed.');

for (const name of ['Water', 'Warm water', 'Boiling water — gelatin', 'Water, for stock', 'Extra water, for soaking and cooking peas']) {
  const water = { id: 'water', ingredients: [[name, 100, 'ml']] };
  assert.deepEqual(M.deriveRecipeAllergens(water, [water]), { allergens: [], possible: [], complete: true, labelDependent: [], unknown: [] });
  water.ingredientAllergens = { [name]: ['milk'] };
  assert.deepEqual(M.deriveRecipeAllergens(water, [water]), { allergens: [], possible: [], complete: true, labelDependent: [], unknown: [] });
}
for (const name of ['Rose water, or to taste', 'Water or milk', 'Water with milk', 'Salt, for boiling water']) {
  assert.equal(M.isPlainWater(name), false);
  assert.equal(M.deriveRecipeAllergens({ id: 'mixture', ingredients: [[name, 100, 'ml']] }, []).complete, ['Rose water, or to taste', 'Salt, for boiling water'].includes(name));
}
console.log('Plain water: automatic allergen review and mixed-ingredient exclusions passed.');
