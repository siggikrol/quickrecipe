const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const recipes = JSON.parse(fs.readFileSync('recipes/index.json')).files.flatMap(file => JSON.parse(fs.readFileSync('recipes/' + file)));
const app = fs.readFileSync('app.js', 'utf8');
const plans = vm.runInNewContext(app.slice(app.indexOf('const sectionPlans'), app.indexOf('function sectionFor(')) + '; [sectionPlans,stepSectionPlans]');
const required = new Set(plans.flatMap(plan => Object.values(plan).flat().map(section => section[1])));
for (const recipe of recipes) {
  for (const key of ['title', 'desc', 'prep', 'cook', 'bake', 'ferment', 'yield']) if (recipe[key]) required.add(recipe[key]);
  for (const ingredient of recipe.ingredients) {
    required.add(ingredient[0]);
    required.add(ingredient[0].replace(/\s+—\s+.+$/, ''));
  }
  recipe.steps.forEach(step => required.add(step));
  for (const key of ['ingredientSections', 'stepSections']) recipe[key]?.forEach(section => required.add(section[1]));
}
function numbers(text) { return (text.match(/(?:\d+)?[¼½¾]|\d+(?:[.,]\d+)?/g) || []).map(n => n.replace(',', '.')); }
for (const lang of ['pl', 'is']) {
  const dictionary = JSON.parse(fs.readFileSync(`translations/${lang}.json`));
  const missing = [...required].filter(key => typeof dictionary[key] !== 'string' || !dictionary[key].trim());
  assert.deepEqual(missing, [], `${lang}: missing recipe translations`);
  const changedNumbers = [...required].filter(key => JSON.stringify(numbers(key)) !== JSON.stringify(numbers(dictionary[key])));
  assert.deepEqual(changedNumbers.map(key => [key, dictionary[key]]), [], `${lang}: changed numbers`);
  const unchangedSteps = recipes.flatMap(r => r.steps).filter(step => dictionary[step] === step);
  assert.deepEqual(unchangedSteps, [], `${lang}: untranslated instructions`);
  assert.equal(new Set(recipes.map(r => dictionary[r.title])).size, recipes.length, `${lang}: duplicate translated recipe titles`);
  console.log(`${lang}: all ${recipes.length} recipes covered; ${required.size} text entries; cooking numbers preserved.`);
}
