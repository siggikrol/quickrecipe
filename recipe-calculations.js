/* Shared calculation layer. Values stay unrounded until presentation. */
const RecipeMath = (() => {
  const units = { g: ['mass', 1, 'g'], kg: ['mass', 1000, 'g'], ml: ['volume', 1, 'ml'], L: ['volume', 1000, 'ml'], dl: ['volume', 100, 'ml'], pc: ['count', 1, 'pc'] };
  function nonnegative(value) { if (!Number.isFinite(value) || value < 0) throw new Error('Invalid quantity'); return value; }
  function measure(amount, unit) {
    const spec = units[unit];
    if (!spec || !Number.isFinite(amount) || amount <= 0) throw new Error('Invalid foundation measure');
    return { dimension: spec[0], amount: amount * spec[1], unit: spec[2] };
  }
  function foundationMultiplier(f, collection) {
    const parent = collection.find(r => r.id === f.recipeId);
    if (!parent?.batchYield) throw new Error('Missing foundation yield');
    const required = measure(f.amount, f.unit), output = measure(parent.batchYield.amount, parent.batchYield.unit);
    if (required.dimension !== output.dimension) throw new Error('Incompatible foundation units');
    return required.amount / output.amount;
  }
  function servingYield(recipe) {
    if (recipe.servings !== undefined) return Number.isFinite(recipe.servings) && recipe.servings > 0 ? recipe.servings : null;
    const match = /^(\d+(?:\.\d+)?) servings?$/.exec(recipe.yield || '');
    return match && Number(match[1]) > 0 ? Number(match[1]) : null;
  }
  function scaleRecipe(recipe, targetYield) {
    nonnegative(targetYield);
    const baseYield = servingYield(recipe);
    if (!baseYield && targetYield > 0) throw new Error('Declare the base serving count');
    return { recipeId: recipe.id, baseYield, targetYield, factor: targetYield === 0 ? 0 : targetYield / baseYield };
  }
  function normalizeIngredientQuantity(ingredient, quantity, maximum = quantity) {
    const name = String(ingredient[0]).replace(/\s+—\s+.+$/, '').trim();
    const unit = ingredient[2] || '';
    const conversion = units[unit] || [unit, 1, unit];
    const key = JSON.stringify([name.toLocaleLowerCase('en'), conversion[2]]);
    const asNeeded = quantity === null;
    if (!asNeeded) { nonnegative(quantity); nonnegative(maximum); if (maximum < quantity) throw new Error('Invalid quantity range'); }
    return { key, name, unit: conversion[2], amount: asNeeded ? 0 : quantity * conversion[1], maximum: asNeeded ? 0 : maximum * conversion[1], asNeeded };
  }
  function aggregateIngredients(requirements) {
    const totals = new Map();
    requirements.forEach(entry => {
      const item = totals.get(entry.key) || { ...entry, amount: 0, maximum: 0, asNeeded: false };
      item.amount += entry.amount; item.maximum += entry.maximum; item.asNeeded ||= entry.asNeeded; totals.set(entry.key, item);
    });
    return [...totals.values()];
  }
  function expandFoundationRequirements(recipe, multiplier, collection, options = {}) {
    nonnegative(multiplier);
    const raw = [], bases = new Map(), visiting = new Set();
    const ingredientValue = options.ingredientValue || ((r, ing) => ing[1]);
    function expand(r, factor) {
      if (visiting.has(r.id)) throw new Error('Circular recipe family');
      visiting.add(r.id);
      const seen = new Set();
      for (const f of r.foundations || []) {
        if (seen.has(f.recipeId)) throw new Error('Duplicate foundation'); seen.add(f.recipeId);
        const childFactor = foundationMultiplier(f, collection);
        const parent = collection.find(p => p.id === f.recipeId);
        const measured = measure(f.amount * factor, f.unit);
        const entry = bases.get(parent.id) || { id: parent.id, title: parent.title, amount: 0, unit: measured.unit };
        entry.amount += measured.amount; bases.set(parent.id, entry);
        if (!options.prepared?.[parent.id]) expand(parent, factor * childFactor);
      }
      for (const ing of r.ingredients) {
        const amount = ing[1] === null ? null : ingredientValue(r, ing) * factor;
        const maximum = Number.isFinite(ing[4]) ? ing[4] * factor : amount;
        raw.push(normalizeIngredientQuantity(ing, amount, maximum));
      }
      visiting.delete(r.id);
    }
    if (multiplier > 0) expand(recipe, multiplier);
    return { bases: [...bases.values()], ingredients: aggregateIngredients(raw) };
  }
  function calculateRequirements(menuItems, collection, options = {}) {
    const raw = [], bases = new Map();
    for (const item of menuItems) {
      const r = collection.find(r => r.id === item.recipeId);
      if (!r) { const error = new Error('Recipe unavailable'); error.recipeId = item.recipeId; throw error; }
      try {
        const scaled = scaleRecipe(r, item.portions);
        const expanded = expandFoundationRequirements(r, scaled.factor, collection, options);
        raw.push(...expanded.ingredients);
        expanded.bases.forEach(base => { const entry = bases.get(base.id) || { ...base, amount: 0 }; entry.amount += base.amount; bases.set(base.id, entry); });
      } catch (error) { error.recipeId = r.id; throw error; }
    }
    return { bases: [...bases.values()], ingredients: aggregateIngredients(raw) };
  }
  function batches(portions, config = {}) {
    nonnegative(portions);
    if (config.mode === 'maximum' && (!Number.isFinite(config.value) || config.value <= 0)) throw new Error('Invalid batch size');
    if (config.mode !== 'maximum' && config.value !== undefined && (!Number.isSafeInteger(config.value) || config.value < 1)) throw new Error('Invalid batch count');
    const count = portions === 0 ? 0 : config.mode === 'maximum' ? Math.ceil(portions / config.value) : (config.value || 1);
    return { count, perBatch: count ? portions / count : 0, total: portions };
  }
  const allergens = {
    gluten: 'Cereals containing gluten', crustaceans: 'Crustaceans', eggs: 'Eggs', fish: 'Fish', peanuts: 'Peanuts',
    soybeans: 'Soybeans', milk: 'Milk', nuts: 'Nuts', celery: 'Celery', mustard: 'Mustard', sesame: 'Sesame',
    sulphites: 'Sulphur dioxide / sulphites', lupin: 'Lupin', molluscs: 'Molluscs'
  };
  function deriveRecipeAllergens(recipe, collection, visiting = new Set()) {
    if (!recipe) throw new Error('Recipe unavailable');
    if (visiting.has(recipe.id)) throw new Error('Circular recipe family');
    visiting.add(recipe.id);
    const declared = new Set(); let complete = true;
    for (const ingredient of recipe.ingredients) {
      const entries = recipe.ingredientAllergens?.[ingredient[0]];
      if (!Array.isArray(entries)) { complete = false; continue; }
      for (const id of entries) { if (Object.hasOwn(allergens, id)) declared.add(id); else complete = false; }
    }
    for (const foundation of recipe.foundations || []) {
      const nested = deriveRecipeAllergens(collection.find(r => r.id === foundation.recipeId), collection, visiting);
      nested.allergens.forEach(id => declared.add(id)); complete &&= nested.complete;
    }
    for (const id of recipe.allergenAdjustments?.remove || []) { if (Object.hasOwn(allergens, id)) declared.delete(id); else complete = false; }
    for (const id of recipe.allergenAdjustments?.add || []) { if (Object.hasOwn(allergens, id)) declared.add(id); else complete = false; }
    visiting.delete(recipe.id);
    return { allergens: Object.keys(allergens).filter(id => declared.has(id)), complete };
  }
  return { allergens, deriveRecipeAllergens, measure, foundationMultiplier, servingYield, scaleRecipe, normalizeIngredientQuantity, aggregateIngredients, expandFoundationRequirements, calculateRequirements, batches };
})();
if (typeof module !== 'undefined') module.exports = RecipeMath;
