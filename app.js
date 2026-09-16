/* ─── State ─── */
let recipes = [];
let seedRecipes = [];
let recipeCatalogChanges = { retiredIds: [], renamedIds: {} };
const RECIPE_VERSION = '68';
const LS = {
  recipes:   'quickrecipe.recipes.v1',
  favs:      'quickrecipe.favs.v1',
  unit:      'quickrecipe.unit.v1',
  hydration: 'quickrecipe.hydration.v1',
  ui:        'quickrecipe.ui.v1',
  theme:     'quickrecipe.theme',
  ingredientOrder: 'quickrecipe.ingredientOrder',
};
let favs           = new Set();
let unit           = 'metric';
let selectedId     = null;
let scale          = 1;
let view           = 'amounts';
let quantitiesFirst = false;
let category       = 'All';
let recipeSection = 'All';
let listScrollTop = 0;
const recipeSections = [
  { id: 'baking', label: 'Bread & baking', categories: ['Bread', 'Polish Breads', 'Loaves', 'Rolls', 'Flatbreads', 'Pastries', 'Pizza & savoury dough', 'Baking components'] },
  { id: 'desserts', label: 'Cakes & desserts', categories: ['Cake', 'Cakes', 'Cheesecake', 'Cheesecakes', 'Skyr Cake', 'Meringue', 'Brownies', 'Cookies', 'Truffles', 'Dessert', 'Desserts', 'Muffins & scones', 'Pies & tarts', 'Classic desserts', 'Confections'] },
  { id: 'meals', label: 'Meals', categories: ['Breakfast', 'Polish Soups', 'Soups', 'Salads', 'Mains', 'Sides', 'Breakfast & brunch', 'Pasta & noodles', 'Rice & grains', 'Chicken', 'Beef, pork & sausage', 'Fish & seafood', 'Vegetarian', 'Quick dinners', 'Casseroles & one-pot'] },
  { id: 'sauces', label: 'Dressings & sauces', categories: ['Dressings', 'Sauce', 'Sauces', 'Dips', 'Stocks', 'Brown sauces', 'Béchamel', 'Velouté', 'Hollandaise', 'Tomato sauces', 'Mayonnaise', 'Butter & pan sauces', 'Sweet sauces'] },
];
function sectionForRecipe(r) {
  if (recipeSections.some(section => section.id === r.section)) return r.section;
  return recipeSections.find(section => section.categories.some(c => c.toLowerCase() === (r.category || '').toLowerCase()))?.id || 'meals';
}
let onlyFavs       = false;
let editingId      = null;
let hydrationState = {};
let wakeLock       = null;
let wakeLockRecipeId = null;

/* Focus mode — which ingredient section header is currently active */
let focusedSection = null;

/* ─── Theme ─── */
function getEffectiveTheme() {
  const stored = localStorage.getItem(LS.theme);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeBtn');
  if (btn) {
    btn.textContent = theme === 'dark' ? '☀' : '🌙';
    btn.title       = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }
}
function toggleTheme() {
  const next = getEffectiveTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(LS.theme, next);
  applyTheme(next);
}
function initTheme() {
  applyTheme(getEffectiveTheme());
  /* Keep in sync if OS preference changes while app is open */
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!localStorage.getItem(LS.theme)) applyTheme(getEffectiveTheme());
  });
}

/* ─── Helpers ─── */
function cloneValue(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
function load(k, fallback) {
  try {
    const x = localStorage.getItem(k);
    return x ? JSON.parse(x) : cloneValue(fallback);
  } catch {
    return cloneValue(fallback);
  }
}
function saveAll() {
  localStorage.setItem(LS.recipes,   JSON.stringify(recipes));
  localStorage.setItem(LS.favs,      JSON.stringify([...favs]));
  localStorage.setItem(LS.unit,      unit);
  localStorage.setItem(LS.hydration, JSON.stringify(hydrationState));
  localStorage.setItem(LS.ui,        JSON.stringify({ selectedId, category, onlyFavs, recipeSection }));
}

/* ─── Seed merge ─── */
async function loadSeedRecipes() {
  const read = async path => {
    const response = await fetch(`${path}?v=${RECIPE_VERSION}`);
    if (!response.ok) throw new Error(`Could not load ${path}: ${response.status}`);
    return response.json();
  };
  const index = await read('./recipes/index.json');
  if (!Array.isArray(index.files) || !index.files.length ||
      index.files.some(file => typeof file !== 'string' || !/^[a-z0-9-]+\.json$/.test(file))) {
    throw new Error('Invalid recipe index');
  }
  const groups = await Promise.all(index.files.map(file => read(`./recipes/${file}`)));
  if (groups.some(group => !Array.isArray(group))) throw new Error('Invalid recipe file');
  const loaded = groups.flat();
  if (loaded.some(r => !r || typeof r.id !== 'string' || !r.id || !r.title || !Array.isArray(r.ingredients) || !Array.isArray(r.steps)) ||
      new Set(loaded.map(r => r.id)).size !== loaded.length) throw new Error('Invalid or duplicate recipe');
  validateRecipeFamilies(loaded);
  const retiredIds = index.retiredIds || [];
  const renamedIds = index.renamedIds || {};
  if (!Array.isArray(retiredIds) || retiredIds.some(id => typeof id !== 'string') ||
      !renamedIds || typeof renamedIds !== 'object' || Array.isArray(renamedIds) ||
      Object.entries(renamedIds).some(([oldId, newId]) => oldId === newId || !loaded.some(r => r.id === newId)) ||
      retiredIds.some(id => loaded.some(r => r.id === id))) throw new Error('Invalid recipe catalog changes');
  // Activate migrations only after every recipe file has loaded successfully.
  recipeCatalogChanges = { retiredIds, renamedIds };
  return loaded;
}

function mergeSeedRecipes(existing) {
  const byId   = new Map(seedRecipes.map(r => [r.id, r]));
  const identity = r => JSON.stringify([r.title, r.category, r.ingredients.map(i => JSON.stringify(i)).sort()]);
  const retired = new Set(recipeCatalogChanges.retiredIds);
  const renamed = new Map();
  const merged = (existing || []).filter(r => !retired.has(r.id)).map(r => {
    const replacementId = recipeCatalogChanges.renamedIds[r.id];
    let seed = byId.get(replacementId || r.id);
    if (seed && replacementId) renamed.set(r.id, seed.id);
    if (!seed && r.title === 'Icelandic Rye Bread' && r.category === 'Bread' &&
        r.ingredients.some(i => /flour/i.test(i[0]) && ['dl', 'ml', 'L', 'cup', 'cups'].includes(i[2]))) {
      seed = byId.get('icelandic-rye-bread');
      if (seed) renamed.set(r.id, seed.id);
    }
    if (!seed) {
      const matches = seedRecipes.filter(candidate => identity(candidate) === identity(r));
      if (matches.length === 1) {
        seed = matches[0];
        renamed.set(r.id, seed.id);
      }
    }
    if (!seed) return r;
    const mergedRecipe = cloneValue(seed);
    if (Number.isFinite(r.servings) && r.servings > 0) mergedRecipe.servings = r.servings;
    if (r.ingredientAllergens && typeof r.ingredientAllergens === 'object') {
      mergedRecipe.ingredientAllergens = Object.fromEntries(seed.ingredients.filter(i => Array.isArray(r.ingredientAllergens[i[0]])).map(i => [i[0], cloneValue(r.ingredientAllergens[i[0]])]));
    }
    if (r.allergenAdjustments && JSON.stringify([r.ingredients, r.foundations || []]) === JSON.stringify([seed.ingredients, seed.foundations || []])) mergedRecipe.allergenAdjustments = cloneValue(r.allergenAdjustments);
    return mergedRecipe;
  });
  for (const [oldId, newId] of Object.entries(recipeCatalogChanges.renamedIds)) renamed.set(oldId, newId);
  favs = new Set([...favs].filter(id => !retired.has(id)).map(id => renamed.get(id) || id));
  for (const id of retired) delete hydrationState[id];
  if (renamed.size) {
    for (const [oldId, newId] of renamed) {
      if (Object.hasOwn(hydrationState, oldId)) {
        hydrationState[newId] ??= hydrationState[oldId];
        delete hydrationState[oldId];
      }
    }
    const saved = load(LS.ui, {});
    if (renamed.has(saved.selectedId)) {
      saved.selectedId = renamed.get(saved.selectedId);
      localStorage.setItem(LS.ui, JSON.stringify(saved));
    }
    shopping.migrateRecipeIds(renamed, seedRecipes);
    if (typeof canteen !== 'undefined') canteen.migrateRecipeIds(renamed);
  }
  const ids = new Set(merged.map(r => r.id));
  seedRecipes.forEach(r => { if (!ids.has(r.id)) merged.push(cloneValue(r)); });
  return [...new Map(merged.map(r => [r.id, r])).values()]
    .map(r => r.category === 'Sauce' ? { ...r, category: 'Dressings' } : r);
}
function restoreUiState() {
  const saved = load(LS.ui, { selectedId: null, category: 'All', onlyFavs: false });
  if (saved.selectedId && recipes.some(r => r.id === saved.selectedId)) selectedId = saved.selectedId;
  category = saved.category === 'Sauce' ? 'Dressings' : saved.category || 'All';
  recipeSection = recipeSections.some(section => section.id === saved.recipeSection) ? saved.recipeSection :
    category === 'All' ? 'All' : sectionForRecipe({ category });
  if (!recipes.some(r => r.category === category && sectionForRecipe(r) === recipeSection)) category = 'All';
  onlyFavs = Boolean(saved.onlyFavs);
  if (!selectedId && recipes[0]) selectedId = recipes[0].id;
}

/* ─── Unit conversion ─── */
const fmt = n => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};
const cToF     = c  => Math.round(c * 9 / 5 + 32);
const gToOz    = g  => g * 0.0352739619;
const mlToFloz = ml => ml * 0.0338140227;

function amountText(v, u, compactMetricUnits = false) {
  v *= scale;
  if (unit === 'metric' && compactMetricUnits && v >= 1000 && (u === 'g' || u === 'ml')) {
    return `${fmt(v / 1000)} ${u === 'g' ? 'kg' : 'L'}`;
  }
  if (unit === 'metric') return `${fmt(v)} ${unitLabel(u, v)}`;
  if (u === 'g')  return `${fmt(gToOz(v))} oz`;
  if (u === 'ml') return `${fmt(mlToFloz(v))} fl oz`;
  return `${fmt(v)} ${unitLabel(u, v)}`;
}

function ingredientAmountText(r, ing) {
  if (ing[1] === null) return view === 'bakers' ? '—' : t('As needed');
  if (view === 'bakers') return bakers(r, ing);
  const amount = amountText(adjustedIngredientValue(r, ing), ing[2], r.compactMetricUnits || (typeof canteen !== 'undefined' && canteen.productionRecipe));
  return Number.isFinite(ing[4]) ? `${amount} – ${amountText(ing[4], ing[2], r.compactMetricUnits || (typeof canteen !== 'undefined' && canteen.productionRecipe))}` : amount;
}

function yieldText(value, multiplier = scale) {
  if (multiplier === 1) return value;
  // Keep pan dimensions intact; only batch quantities should change.
  const dimensions = [];
  const panCount = value.match(/^(\d+(?:\.\d+)?\s*×\s*)(?=\d)/)?.[0] || '';
  const protectedValue = panCount + value.slice(panCount.length).replace(/\d+(?:\.\d+)?(?:\s*[×x–-]\s*\d+(?:\.\d+)?)*\s*(?:cm|mm|inches|inch|in)\b/gi, match => {
    dimensions.push(match);
    return '\uFFF0';
  });
  const plurals = { loaf: 'loaves', tray: 'trays', cake: 'cakes', tin: 'tins', bun: 'buns', roll: 'rolls', baguette: 'baguettes', serving: 'servings', slice: 'slices', glass: 'glasses', bowl: 'bowls', dish: 'dishes', nest: 'nests', batch: 'batches', wreath: 'wreaths', sandwich: 'sandwiches', truffle: 'truffles' };
  let changed = false;
  const scaled = protectedValue.replace(/(\d+(?:\.\d+)?)(?:([–-])(\d+(?:\.\d+)?))?(\s+(?:(?:large|small|chocolate|serving)\s+)?(?:loaves|loaf|trays?|cakes?|tins?|buns?|rolls?|baguettes?|servings?|slices?|glasses|glass|bowls?|dishes|dish|nests?|batches|batch|wreaths?|sandwiches|sandwich|truffles|truffle)\b)?/g,
    (_, low, dash, high, label = '') => {
      changed = true;
      const quantity = Number(low) * multiplier;
      const singular = !high && quantity === 1;
      label = label.replace(/\w+$/, noun => {
        const base = Object.keys(plurals).find(key => key === noun || plurals[key] === noun);
        return base ? (singular ? base : plurals[base]) : noun;
      });
      return `${fmt(quantity)}${high ? dash + fmt(Number(high) * multiplier) : ''}${label}`;
    });
  let dimensionIndex = 0;
  const result = scaled.replace(/\uFFF0/g, () => dimensions[dimensionIndex++]);
  return changed ? result : `${fmt(multiplier)}× batch · original yield: ${value}`;
}

/* ─── Baker's math ─── */
function flourTotal(r) {
  return r.ingredients.filter(x => x[3] === 'flour').reduce((n, x) => n + Number(x[1] || 0), 0);
}
function currentHydration(r) {
  return hydrationState[r.id] ?? Number(r.hydration || 0);
}
function adjustedIngredientValue(r, ing) {
  if (!r.adjustableHydration || ing[3] !== 'water') return Number(ing[1]);
  const waters    = r.ingredients.filter(x => x[3] === 'water');
  const baseTotal = waters.reduce((n, x) => n + Number(x[1] || 0), 0);
  if (!baseTotal) return Number(ing[1]);
  const target = flourTotal(r) * currentHydration(r) / 100;
  return target * (Number(ing[1]) / baseTotal);
}
function bakers(r, ing) {
  const flour = flourTotal(r);
  return flour ? `${fmt(adjustedIngredientValue(r, ing) / flour * 100)}%` : '—';
}

/* ─── Section plans for ingredients ─── */
const sectionPlans = {
  // ── Original recipes ──
  'drommekage': [[0, "Cake"], [7, "Coconut topping"]],
  'bounty-cake': [[0, "Coconut cake"], [3, "Chocolate cream"], [7, "Finish"]],
  'carrot-cake': [[0, "Cake"], [7, "Frosting"]],
  'cinnabon-rolls': [[0, "Dough"], [8, "Filling"], [12, "Frosting"]],
  'sourdough-spelt-crumb-brioche': [[0, "Dough"], [9, "Crumble Topping"]],
  'pavlova-lemon-curd': [[0, "Pavlova"], [5, "Lemon curd"]],
  'apple-crumb-cake': [[0, "Cake"], [11, "Crumb topping"]],
  'choc-orange-cheesecake': [[0, "Base"], [2, "Filling"], [10, "Topping"]],
  'date-cake-caramel': [[0, "Cake"], [2, "Cake"], [11, "Caramel sauce"]],
  'lemon-meringue-cheesecake': [[0, "Crust"], [3, "Filling"], [11, "Lemon curd"], [16, "Meringue"]],

  // ── Cheesecakes ──
  'vanilla-dream-with-warm-berry-sauce': [[0, "Base"], [3, "Filling"], [8, "Berry sauce"]],
  'berry-explosion-cheesecake': [[0, "Base"], [4, "Filling"], [11, "Topping"]],
  'oreo-cream-cheese-swirl-brownies': [[0, "Brownie batter"], [2, "Cheesecake swirl"], [5, "Brownie batter"], [11, "Topping"]],
  'triple-layer-oreo-cloud-cups': [[0, "Base"], [4, "Filling"], [8, "Topping"]],
  'toblerone-raspberry-swirl-cheesecake': [[0, "Base"], [2, "Cheesecake filling"], [10, "Raspberry swirl"]],
  'white-chocolate-daim-crunch-cheesecake': [[0, "Base"], [2, "White chocolate Daim filling"]],
  'lotus-biscoff-velvet-cheesecake': [[0, "Base"], [2, "Biscoff filling"], [7, "Topping"]],
  'strawberry-dark-chocolate-cheesecake': [[0, "Base"], [2, "Strawberry filling"], [10, "Topping"]],
  'lemon-curd-cheesecake-cups': [[0, "Base"], [2, "Cheesecake filling"], [7, "Topping"]],
  'espresso-martini-cheesecake-glasses': [[0, "Base"], [2, "Espresso cheesecake"], [9, "Garnish"]],
  'caramel-pecan-coffee-cheesecake': [[0, "Caramel pecans"], [3, "Base"], [5, "Filling"]],
  'torched-meringue-dark-chocolate-cheesecake': [[0, "Base"], [2, "Filling"], [10, "Meringue"]],
  'white-chocolate-orange-cheesecake': [[0, "Base"], [2, "Orange & white chocolate filling"]],
  'celebration-white-chocolate-daim-cheesecake': [[0, "Base"], [2, "White chocolate Daim filling"]],
  'brownie-black-cherry-meringue-bomb': [[0, "Brownie base"], [6, "Cheesecake"], [14, "Meringue"]],
  'caramel-rolo-cheesecake': [[0, "Base"], [2, "Caramel filling"]],
  'dumle-caramel-cheesecake-glasses': [[0, "Base"], [2, "Cheesecake filling"], [6, "Dumle caramel & garnish"]],
  'cinnamon-brown-sugar-caramel-cheesecake-cups': [[0, "Base"], [1, "Cheesecake filling"], [5, "Caramel topping"]],
  'white-chocolate-fresh-raspberry-cheesecake': [[0, "Base"], [2, "White chocolate & raspberry filling"], [11, "Topping"]],
  'polish-baked-curd-cheesecake': [[0, "Pastry"], [9, "Filling"]],
  'dark-caramel-ganache-cheesecake-cups': [[0, "Base"], [2, "Cheesecake filling"], [6, "Chocolate ganache"]],
  'strawberry-cheesecake-in-chocolate-bowls': [[0, "Chocolate bowls"], [1, "Strawberry cheesecake filling"], [6, "Base"], [8, "Garnish"]],

  // ── Skyr Cakes ──
  'raspberry-skyr-mousse-in-chocolate-bowls': [[0, "Chocolate bowls"], [1, "Vanilla skyr mousse"], [4, "Base"], [6, "Raspberry topping"]],
  'strawberry-cream-cheese-cups': [[0, "Strawberry glaze"], [5, "Cream cheese filling"], [9, "Base"], [11, "Garnish"]],
  'mini-blueberry-skyr-cups': [[0, "Base"], [2, "Blueberry sauce"], [7, "Skyr mousse"], [9, "Blueberry sauce"]],
  'vanilla-skyr-with-chocolate-granola-raspberries': [[0, "Base"], [1, "Vanilla skyr mousse"], [3, "Topping"]],
  'berry-skyr-sheet-cake': [[0, "Base"], [2, "Skyr mousse"], [4, "Topping"]],
  'chocolate-skyr-mousse-cups': [[0, "Chocolate skyr mousse"], [2, "Garnish"], [3, "Whipped cream topping"], [4, "Garnish"]],
  'strawberry-skyr-in-a-chocolate-rice-krispie-shell': [[0, "Rice Krispie shell"], [4, "Strawberry skyr mousse"], [6, "Garnish"]],
  'icelandic-flag-skyr-dessert': [[0, "Base"], [1, "Skyr mousse"], [3, "Flag decoration"]],
  'lemon-almond-skyr-cake': [[0, "Base"], [2, "Lemon skyr filling"], [9, "Garnish"]],
  'summer-berry-skyr-cake': [[0, "Base"], [2, "Berry skyr filling"], [8, "Garnish"]],
  'berry-bliss-skyr-cake': [[0, "Base"], [2, "Skyr mousse"], [4, "Topping"]],
  'berry-skyr-cups-with-chocolate-pebbles': [[0, "Base"], [3, "Skyr mousse"], [5, "Topping"]],
  'vanilla-skyr-with-salted-liquorice-caramel': [[0, "Base"], [2, "Vanilla skyr mousse"]]
};

/* ─── Section plans for steps (Focus mode) ─── */
const stepSectionPlans = {
  // ── Original recipes ──
  'drommekage': [[0, "Cake"], [3, "Coconut topping"]],
  'bounty-cake': [[0, "Coconut cake"], [2, "Chocolate cream"], [4, "Finish"]],
  'carrot-cake': [[0, "Cake"], [3, "Frosting"]],
  'cinnabon-rolls': [[0, "Dough"], [2, "Filling"], [5, "Frosting"]],
  'sourdough-spelt-crumb-brioche': [[0, "Dough & Ferment"], [3, "Crumble & Bake"]],
  'pavlova-lemon-curd': [[0, "Pavlova"], [3, "Lemon curd"]],
  'apple-crumb-cake': [[0, "Cake"], [3, "Crumb topping"]],
  'choc-orange-cheesecake': [[0, "Base"], [1, "Filling"], [4, "Topping"]],
  'date-cake-caramel': [[0, "Cake"], [4, "Caramel sauce"]],
  'lemon-meringue-cheesecake': [[0, "Crust"], [1, "Filling"], [3, "Lemon curd"], [4, "Meringue"]],

  // ── Cheesecakes ──
  'vanilla-dream-with-warm-berry-sauce': [[0, "Base"], [1, "Filling"], [3, "Berry sauce"]],
  'berry-explosion-cheesecake': [[0, "Base"], [1, "Filling"], [3, "Topping"]],
  'oreo-cream-cheese-swirl-brownies': [[0, "Brownie batter"], [1, "Cheesecake swirl"], [2, "Brownie batter"], [3, "Assembly & bake"]],
  'triple-layer-oreo-cloud-cups': [[0, "Base"], [1, "Filling"], [3, "Topping"]],
  'toblerone-raspberry-swirl-cheesecake': [[0, "Base"], [1, "Cheesecake filling"], [3, "Raspberry swirl"]],
  'white-chocolate-daim-crunch-cheesecake': [[0, "Base"], [1, "White chocolate Daim filling"]],
  'lotus-biscoff-velvet-cheesecake': [[0, "Base"], [1, "Biscoff filling"], [3, "Topping"]],
  'strawberry-dark-chocolate-cheesecake': [[0, "Base"], [1, "Strawberry filling"], [3, "Topping"]],
  'lemon-curd-cheesecake-cups': [[0, "Base"], [1, "Cheesecake filling"], [2, "Assembly & topping"]],
  'espresso-martini-cheesecake-glasses': [[0, "Base"], [1, "Espresso cheesecake"], [2, "Assembly & garnish"]],
  'caramel-pecan-coffee-cheesecake': [[0, "Caramel pecans"], [1, "Base"], [2, "Filling"]],
  'torched-meringue-dark-chocolate-cheesecake': [[0, "Base"], [1, "Filling"], [2, "Meringue"]],
  'white-chocolate-orange-cheesecake': [[0, "Base"], [1, "Orange & white chocolate filling"]],
  'celebration-white-chocolate-daim-cheesecake': [[0, "Base"], [1, "White chocolate Daim filling"]],
  'brownie-black-cherry-meringue-bomb': [[0, "Brownie base"], [1, "Cheesecake"], [2, "Meringue"]],
  'caramel-rolo-cheesecake': [[0, "Base"], [1, "Caramel filling"]],
  'dumle-caramel-cheesecake-glasses': [[0, "Base"], [1, "Cheesecake filling"], [2, "Dumle caramel & garnish"]],
  'cinnamon-brown-sugar-caramel-cheesecake-cups': [[0, "Base"], [1, "Cheesecake filling"], [2, "Caramel topping"]],
  'white-chocolate-fresh-raspberry-cheesecake': [[0, "Base"], [1, "White chocolate & raspberry filling"], [2, "Assembly & topping"]],
  'polish-baked-curd-cheesecake': [[0, "Pastry"], [1, "Filling"]],
  'dark-caramel-ganache-cheesecake-cups': [[0, "Base"], [1, "Cheesecake filling"], [2, "Chocolate ganache"]],
  'strawberry-cheesecake-in-chocolate-bowls': [[0, "Chocolate bowls"], [1, "Strawberry cheesecake filling"], [2, "Base"], [3, "Garnish"]],

  // ── Skyr Cakes ──
  'raspberry-skyr-mousse-in-chocolate-bowls': [[0, "Chocolate bowls"], [1, "Vanilla skyr mousse"], [2, "Base"], [3, "Raspberry topping"]],
  'strawberry-cream-cheese-cups': [[0, "Strawberry glaze"], [1, "Cream cheese filling"], [2, "Assembly & garnish"]],
  'mini-blueberry-skyr-cups': [[0, "Base"], [1, "Blueberry sauce"], [2, "Skyr mousse"]],
  'vanilla-skyr-with-chocolate-granola-raspberries': [[0, "Base"], [1, "Vanilla skyr mousse"], [2, "Assembly & topping"]],
  'berry-skyr-sheet-cake': [[0, "Base"], [1, "Skyr mousse"], [2, "Topping"]],
  'chocolate-skyr-mousse-cups': [[0, "Chocolate skyr mousse"], [1, "Muesli layer"], [2, "Whipped cream topping"]],
  'strawberry-skyr-in-a-chocolate-rice-krispie-shell': [[0, "Rice Krispie shell"], [1, "Strawberry skyr mousse"], [2, "Garnish"]],
  'icelandic-flag-skyr-dessert': [[0, "Base"], [1, "Skyr mousse"], [2, "Flag decoration"]],
  'lemon-almond-skyr-cake': [[0, "Base"], [1, "Lemon skyr filling"], [3, "Garnish & chill"]],
  'summer-berry-skyr-cake': [[0, "Base"], [1, "Berry skyr filling"], [3, "Garnish & chill"]],
  'berry-bliss-skyr-cake': [[0, "Base"], [1, "Skyr mousse"], [2, "Topping"]],
  'berry-skyr-cups-with-chocolate-pebbles': [[0, "Base"], [1, "Skyr mousse"], [2, "Topping"]],
  'vanilla-skyr-with-salted-liquorice-caramel': [[0, "Base"], [1, "Vanilla skyr mousse"], [2, "Topping"]]
};

function sectionFor(r, idx, name) {
  const plan = r.ingredientSections || sectionPlans[r.id];
  if (!plan) return '';   /* no plan → no sections, no Focus mode for this recipe */
  let sec = '';
  for (const [start, label] of plan) { if (idx >= start) sec = label; else break; }
  return sec;
}

function stepSectionFor(r, stepIdx) {
  const plan = r.stepSections || stepSectionPlans[r.id];
  if (!plan) return null;
  let sec = null;
  for (const [start, label] of plan) { if (stepIdx >= start) sec = label; else break; }
  return sec;
}

function cleanIngredientName(name) {
  return String(name).replace(/\s+—\s+.+$/, '');
}

/* ─── HTML escaping ─── */
function esc(s) {
  return String(s ?? '').replace(/[&<>'"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]
  ));
}

/* ─── Wake Lock ─── */
function canRequestWakeLock() {
  const secure = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  return Boolean(selectedId) && document.visibilityState === 'visible' && secure && 'wakeLock' in navigator;
}
async function requestWakeLock() {
  if (!canRequestWakeLock() || (wakeLock && wakeLockRecipeId === selectedId)) return;
  try {
    if (wakeLock) await releaseWakeLock();
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLockRecipeId = selectedId;
    wakeLock.addEventListener('release', () => { if (wakeLockRecipeId === selectedId) wakeLockRecipeId = null; });
  } catch { wakeLock = null; wakeLockRecipeId = null; }
}
async function releaseWakeLock() {
  if (!wakeLock) return;
  try { await wakeLock.release(); } catch {}
  wakeLock = null; wakeLockRecipeId = null;
}

/* ─── Recipe categories and foundations ─── */
let familyHistory = [];
function recipeMemberships(r) {
  const primary = { section: sectionForRecipe(r), category: r.category || 'Other' };
  return [...new Map([primary, ...(r.categoryMemberships || [])].map(m => [`${m.section}:${m.category}`, m])).values()];
}
function recipeInSection(r, section) { return recipeMemberships(r).some(m => m.section === section); }
function familyMeasure(amount, unitName) { return RecipeMath.measure(amount, unitName); }
function foundationMultiplier(f, collection = recipes) { return RecipeMath.foundationMultiplier(f, collection); }
function validateRecipeFamilies(collection) {
  const byId = new Map(collection.map(r => [r.id, r]));
  const visited = new Set(), visiting = new Set();
  function visit(r) {
    if (visiting.has(r.id)) throw new Error('Circular recipe family');
    if (visited.has(r.id)) return;
    visiting.add(r.id);
    if (r.batchYield) familyMeasure(r.batchYield.amount, r.batchYield.unit);
    if (r.categoryMemberships !== undefined && (!Array.isArray(r.categoryMemberships) || r.categoryMemberships.some(m =>
      !m || !recipeSections.some(s => s.id === m.section) || typeof m.category !== 'string' || !m.category.trim()))) throw new Error('Invalid recipe categories');
    if (r.foundations !== undefined && !Array.isArray(r.foundations)) throw new Error('Invalid foundations');
    const ids = new Set();
    for (const f of r.foundations || []) {
      if (!f || ids.has(f.recipeId)) throw new Error('Duplicate foundation');
      ids.add(f.recipeId);
      foundationMultiplier(f, collection);
      visit(byId.get(f.recipeId));
    }
    visiting.delete(r.id); visited.add(r.id);
  }
  collection.forEach(visit);
}
function familyAmount(amount, unitName) {
  if (amount === null) return t('As needed');
  if (unitName === 'kg') { amount *= 1000; unitName = 'g'; }
  if (unitName === 'L') { amount *= 1000; unitName = 'ml'; }
  if (unit === 'imperial' && ['g', 'ml'].includes(unitName)) {
    return `${fmt(unitName === 'g' ? gToOz(amount) : mlToFloz(amount))} ${unitName === 'g' ? 'oz' : 'fl oz'}`;
  }
  if (amount >= 1000 && ['g', 'ml'].includes(unitName)) { amount /= 1000; unitName = unitName === 'g' ? 'kg' : 'L'; }
  return `${fmt(amount)} ${unitLabel(unitName, amount)}`;
}
function foundationIngredientsHtml(r) {
  if (!r.foundations?.length) return '';
  return `<div class="foundation-ingredients"><h3>${esc(t('Requires'))}</h3>${r.foundations.map(f => {
    const parent = recipes.find(p => p.id === f.recipeId);
    return `<div class="foundation-row"><button class="family-link" data-foundation="${esc(f.recipeId)}">${esc(recipeText(parent?.title || f.recipeId))}</button><strong>${esc(familyAmount(f.amount * scale, f.unit))}</strong></div>`;
  }).join('')}</div>`;
}
function familyNavigationHtml(r) {
  const children = recipes.filter(child => child.foundations?.some(f => f.recipeId === r.id))
    .sort((a, b) => compareRecipeLabels(recipeText(a.title), recipeText(b.title)));
  return `${familyHistory.length ? `<button class="btn family-back" data-family-back>← ${esc(t('Back to previous recipe'))}</button>` : ''}
    ${children.length ? `<nav class="recipe-family" aria-label="${esc(t('Make from this'))}"><h3>${esc(t('Make from this'))}</h3><div>${children.map(child => `<button class="btn" data-derivative="${esc(child.id)}">${esc(recipeText(child.title))} →</button>`).join('')}</div></nav>` : ''}`;
}
function openFamilyRecipe(id, multiplier = 1) {
  if (!recipes.some(r => r.id === id)) return;
  familyHistory.push({ selectedId, scale, view, focusedSection, recipeSection, category, onlyFavs,
    search: document.getElementById('search').value, listScroll: document.getElementById('list').scrollTop,
    detailScroll: document.getElementById('detail').scrollTop, listScrollTop, recipeHistory: [...recipeHistory] });
  selectedId = id; scale = multiplier; view = 'amounts'; focusedSection = null;
  document.querySelector('.app').classList.add('reading-recipe');
  render(); document.getElementById('detail').scrollTop = 0;
  document.querySelector('[data-family-back]')?.focus({ preventScroll: true });
}
function returnFromFamily() {
  const previous = familyHistory.pop();
  if (!previous) return;
  ({ selectedId, scale, view, focusedSection, recipeSection, category, onlyFavs, listScrollTop, recipeHistory } = previous);
  document.getElementById('search').value = previous.search;
  render();
  document.getElementById('list').scrollTop = previous.listScroll;
  document.getElementById('detail').scrollTop = previous.detailScroll;
}
function bindFamilyNavigation() {
  const r = recipes.find(r => r.id === selectedId);
  document.querySelectorAll('[data-foundation]').forEach(b => b.onclick = () => {
    const f = r.foundations.find(f => f.recipeId === b.dataset.foundation);
    openFamilyRecipe(f.recipeId, scale * foundationMultiplier(f));
  });
  document.querySelectorAll('[data-derivative]').forEach(b => b.onclick = () => openFamilyRecipe(b.dataset.derivative));
  document.querySelector('[data-family-back]')?.addEventListener('click', returnFromFamily);
}
function familyShoppingPlan(r, multiplier, prepared = {}, collection = recipes) {
  validateRecipeFamilies(collection);
  if (!Number.isFinite(multiplier) || multiplier <= 0) throw new Error('Invalid recipe scale');
  return RecipeMath.expandFoundationRequirements(r, multiplier, collection, { prepared, ingredientValue: adjustedIngredientValue });
}
function familyShoppingAmount(item) {
  const measured = familyAmount(item.amount, item.unit);
  const range = item.maximum !== item.amount ? `${measured} – ${familyAmount(item.maximum, item.unit)}` : measured;
  return item.asNeeded ? (item.amount ? `${range} + ${t('As needed')}` : t('As needed')) : range;
}

/* ─── Chips ─── */
function categories() {
  const names = [...new Set(recipes.flatMap(r => recipeMemberships(r).filter(m => m.section === recipeSection).map(m => m.category)))];
  names.sort((a, b) => compareRecipeLabels(t(a), t(b)));
  return ['All', ...names];
}
function browseSection(id) {
  familyHistory = [];
  recipeSection = id;
  category = 'All';
  onlyFavs = false;
  document.getElementById('search').value = '';
  document.querySelector('.app').classList.remove('reading-recipe');
  render();
  document.getElementById('list').scrollTop = 0;
}
function renderChips() {
  const searching = Boolean(document.getElementById('search').value.trim());
  const sections = [{ id: 'All', label: 'All recipes' }, ...recipeSections];
  const nav = document.getElementById('sections');
  if (!nav.children.length) {
    nav.innerHTML = sections.map(section => `<button class="section-link" data-browse="${section.id}">${esc(t(section.label))} <span class="section-count"></span></button>`).join('');
    nav.querySelectorAll('[data-browse]').forEach(b => b.onclick = () => browseSection(b.dataset.browse));
    document.getElementById('sectionSelect').innerHTML = sections.map(section => `<option value="${section.id}">${esc(t(section.label))}</option>`).join('');
  }
  nav.querySelectorAll('[data-browse]').forEach(b => {
    const active = !searching && !onlyFavs && b.dataset.browse === recipeSection;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', active);
    b.querySelector('.section-count').textContent = recipes.filter(r => b.dataset.browse === 'All' || recipeInSection(r, b.dataset.browse)).length;
  });
  document.getElementById('sectionSelect').value = searching ? 'All' : recipeSection;
  const container = document.getElementById('chips');
  container.hidden = searching || recipeSection === 'All';
  const cats = categories();
  const current = [...container.querySelectorAll('[data-cat]')].map(b => b.dataset.cat);
  if (JSON.stringify(current) !== JSON.stringify(cats)) {
    container.innerHTML = cats.map(c => `<button class="chip" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
    container.querySelectorAll('[data-cat]').forEach(b => {
      b.onclick = () => { familyHistory = []; category = b.dataset.cat; render(); document.getElementById('list').scrollTop = 0; };
    });
  }
  container.querySelectorAll('[data-cat]').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === category);
    b.setAttribute('aria-pressed', b.dataset.cat === category);
  });
}

/* ─── List ─── */
function recipeTimingHtml(r) {
  const timings = [['Prep', r.prep], ['Cook', r.cook], ['Bake', r.bake], ['Rest', r.ferment]]
    .filter(([, value]) => value && String(value).trim());
  return timings.length
    ? timings.map(([label, value]) => `<span class="stat timing-stat">${label} ${esc(recipeText(value))}</span>`).join('')
    : '<span class="stat timing-stat">Time not specified</span>';
}

function matches(r, q) {
  const normal = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  q = normal(q);
  const text = [r.title, r.desc, ...recipeMemberships(r).flatMap(m => [m.category, t(m.category)]), ...r.ingredients.map(i => i[0])];
  return !q || text.some(value => [value, recipeTranslations.pl[value], recipeTranslations.is[value]].some(candidate => normal(candidate).includes(q)));
}
function filteredRecipes() {
  const q = document.getElementById('search').value.trim();
  return recipes.filter(r =>
    (q || (recipeMemberships(r).some(m => (recipeSection === 'All' || m.section === recipeSection) && (category === 'All' || m.category === category)))) &&
    (!onlyFavs || favs.has(r.id)) && matches(r, q)
  );
}
function renderList() {
  const q = document.getElementById('search').value.trim();
  const shown = filteredRecipes();
  hasRecipeTranslationFallback = shown.some(missingRecipeTranslation);
  // Related recipes can be opened without changing the current browsing filters.
  const viewingRelatedRecipe = familyHistory.length > 0 && recipes.some(r => r.id === selectedId);
  if (!viewingRelatedRecipe && !shown.some(r => r.id === selectedId)) {
    selectedId = shown[0]?.id || null;
    scale = 1; view = 'amounts'; focusedSection = null;
  }

  const scope = q ? `${({en:'Search',pl:'Szukaj',is:'Leit'})[language]} ${t(onlyFavs ? 'Favourites' : 'All recipes')}: “${q}”` : onlyFavs ? t('Favourites') :
    [recipeSections.find(section => section.id === recipeSection)?.label || 'All recipes', category === 'All' ? '' : category].filter(Boolean).map(t).join(' / ');
  document.getElementById('resultSummary').textContent = `${scope} · ${recipeCount(shown.length)}`;
  const list = document.getElementById('list');
  const previousScroll = list.scrollTop;
  list.innerHTML = shown.map(r => `
    <button class="card ${r.id === selectedId ? 'active' : ''}" data-id="${r.id}" aria-current="${r.id === selectedId ? 'true' : 'false'}">
      <div class="card-top">
        <div>
          <div class="tag">${esc(r.category || 'Recipe')}</div>
          <h3>${esc(recipeText(r.title))}</h3>
        </div>
        <span class="heart ${favs.has(r.id) ? 'on' : ''}" data-fav="${r.id}">${favs.has(r.id) ? '♥' : '♡'}</span>
      </div>
      <div class="desc">${esc(recipeText(r.desc || ''))}</div>
          ${r.ingredientAllergens || r.allergenAdjustments ? declaredAllergensHtml(r) : ''}
      <div class="stats">
        ${r.hydration ? `<span class="stat">${fmt(r.hydration)}% hydration</span>` : ''}
        ${recipeTimingHtml(r)}
      </div>
    </button>
  `).join('') || `<div class="empty"><div class="empty-icon">🔍</div>${q || onlyFavs || category !== 'All' ? 'No recipes found. Try another search or filter.' : 'No recipes here yet. Add a recipe to get started.'}</div>`;
  list.scrollTop = previousScroll;

  document.querySelectorAll('.card[data-id]').forEach(b => {
    b.onclick = e => {
      if (e.target.closest('[data-fav]')) return;
      familyHistory = [];
      selectedId = b.dataset.id;
      focusedSection = null; /* clear focus when switching recipe */
      saveAll(); scale = 1; view = 'amounts';
      render();
      openDetailPanel();
    };
  });
  document.querySelectorAll('[data-fav]').forEach(h => {
    h.onclick = e => { e.stopPropagation(); toggleFav(h.dataset.fav); };
  });
}

/* ─── Compact list/detail navigation ─── */
const compactLayout = window.matchMedia('(max-width: 860px)');
let recipeHistory = [];
function syncNavigation() {
  const open = document.querySelector('.app').classList.contains('reading-recipe');
  document.getElementById('list').inert = compactLayout.matches && open;
  document.getElementById('detail').inert = compactLayout.matches && !open;
}
function openDetailPanel() {
  familyHistory = [];
  recipeHistory = [];
  listScrollTop = document.getElementById('list').scrollTop;
  document.querySelector('.app').classList.add('reading-recipe');
  syncNavigation();
  document.getElementById('detail').scrollTop = 0;
  if (compactLayout.matches) document.getElementById('backBtn').focus();
}
function closeDetailPanel() {
  if (familyHistory.length) { returnFromFamily(); return; }
  recipeHistory = [];
  document.querySelector('.app').classList.remove('reading-recipe');
  syncNavigation();
  document.getElementById('list').scrollTop = listScrollTop;
  document.querySelector('.card.active')?.focus({ preventScroll: true });
}
compactLayout.addEventListener('change', syncNavigation);

function openNextRecipe() {
  const shown = filteredRecipes();
  const index = shown.findIndex(r => r.id === selectedId);
  if (index < 0 || index === shown.length - 1) {
    toast('You’re at the last recipe');
    return;
  }
  recipeHistory.push({ selectedId, scale, view, focusedSection, scrollTop: document.getElementById('detail').scrollTop });
  selectedId = shown[index + 1].id;
  scale = 1;
  view = 'amounts';
  focusedSection = null;
  render();
  // Keep the original list position for Back; only reset the recipe scroll.
  document.getElementById('detail').scrollTop = 0;
}

function openPreviousRecipe() {
  if (familyHistory.length) { returnFromFamily(); return; }
  const available = new Set(filteredRecipes().map(r => r.id));
  let previous;
  while (recipeHistory.length) {
    const entry = recipeHistory.pop();
    if (available.has(entry.selectedId)) { previous = entry; break; }
  }
  if (!previous) { closeDetailPanel(); return; }
  ({ selectedId, scale, view, focusedSection } = previous);
  render();
  document.getElementById('detail').scrollTop = previous.scrollTop;
}

function initRecipeGestures() {
  const detail = document.getElementById('detail');
  let swipe = null;
  const isReading = () => compactLayout.matches && document.querySelector('.app').classList.contains('reading-recipe');
  detail.addEventListener('touchstart', e => {
    swipe = null;
    if (!isReading() || e.touches.length !== 1 ||
        e.target.closest('button, input, label, select, textarea, a, [contenteditable]') ||
        window.getSelection()?.toString()) return;
    const touch = e.touches[0];
    swipe = { id: touch.identifier, x: touch.clientX, y: touch.clientY, started: performance.now(), horizontal: false };
  }, { passive: true });
  detail.addEventListener('touchmove', e => {
    if (!swipe) return;
    if (!isReading() || e.touches.length !== 1) { swipe = null; return; }
    const touch = e.touches[0];
    const dx = touch.clientX - swipe.x;
    const dy = Math.abs(touch.clientY - swipe.y);
    if (!swipe.horizontal) {
      if (Math.max(Math.abs(dx), dy) < 12) return;
      // Once a gesture starts scrolling, never turn it into navigation.
      if (Math.abs(dx) < dy * 2) { swipe = null; return; }
      swipe.horizontal = true;
    }
    if (e.cancelable) e.preventDefault();
    else swipe = null;
  }, { passive: false });
  detail.addEventListener('touchend', e => {
    const gesture = swipe;
    swipe = null;
    if (!gesture?.horizontal || !isReading() || e.touches.length ||
        performance.now() - gesture.started > 1000) return;
    const touch = [...e.changedTouches].find(t => t.identifier === gesture.id);
    if (!touch) return;
    const dx = touch.clientX - gesture.x;
    const dy = Math.abs(touch.clientY - gesture.y);
    if (dx >= 80 && dx > dy * 2) openPreviousRecipe();
    else if (dx <= -80 && -dx > dy * 2) openNextRecipe();
  }, { passive: true });
  detail.addEventListener('touchcancel', () => { swipe = null; }, { passive: true });
}

/* ─── Render ingredients with Focus support ─── */
function renderIngredients(r) {
  const hasSections = Boolean(r.ingredientSections || sectionPlans[r.id]);
  let last = '';
  return r.ingredients.map((i, idx) => {
    const sec  = sectionFor(r, idx, i[0]);
    /* Determine focus dimming */
    const ingDimmed = focusedSection && sec !== focusedSection;
    let html = '';
    if (sec && sec !== last) {
      const secFocused = focusedSection === sec;
      const secDimmed  = focusedSection && !secFocused;
      html += `<button
        class="ingredient-section${secFocused ? ' focused' : ''}${secDimmed ? ' dimmed' : ''}"
        data-section="${esc(sec)}"
        aria-pressed="${secFocused}"
        title="${secFocused ? 'Click to clear focus' : 'Click to focus this section'}"
      >${esc(recipeText(sec))}</button>`;
    }
    last = sec || last;
    const name = `<span class="ingredient-name">${esc(recipeText(cleanIngredientName(i[0])))}</span>`;
    const amount = `<span class="amount">${esc(ingredientAmountText(r, i))}</span>`;
    html += `<div class="ingredient${quantitiesFirst ? ' quantities-first' : ''}${ingDimmed ? ' dimmed' : ''}" data-section="${esc(sec)}">
      ${quantitiesFirst ? amount + name : name + amount}
    </div>`;
    return html;
  }).join('');
}

/* ─── Detail panel ─── */
function declaredAllergensHtml(r) {
  try {
    const declaration = RecipeMath.deriveRecipeAllergens(r, recipes);
    const names = declaration.allergens.map(id => t(RecipeMath.allergens[id])).join(' · ');
    return `<p class="declared-allergens"><strong>${esc(t('Allergens'))}:</strong> ${esc(names || t(declaration.complete ? 'None identified' : 'Not checked'))}${!declaration.complete ? `<br><span class="canteen-warning">${esc(t('Allergen information incomplete'))}</span>` : ''}</p>`;
  } catch { return `<p class="canteen-warning">${esc(t('Allergen declarations unavailable'))}</p>`; }
}

function renderDetail() {
  const r  = recipes.find(x => x.id === selectedId);
  const el = document.getElementById('detail');
  if (document.querySelector('.app').classList.contains('reading-recipe')) hasRecipeTranslationFallback = missingRecipeTranslation(r);

  if (!r) {
    releaseWakeLock();
    el.innerHTML = '<div class="empty" style="margin:28px"><div class="empty-icon">🍽️</div>Choose or add a recipe.</div>';
    saveAll();
    return;
  }

  if (wakeLockRecipeId && wakeLockRecipeId !== selectedId) releaseWakeLock();
  requestWakeLock();

  const temp      = unit === 'metric' ? `${r.tempC || 0}°C` : `${cToF(r.tempC || 0)}°F`;
  const hyd       = currentHydration(r);
  const hasFlour  = r.ingredients.some(i => i[3] === 'flour');
  const hasSecs   = Boolean(r.ingredientSections || sectionPlans[r.id]);

  const hydrationControl = r.adjustableHydration ? `
    <div class="hydration-box">
      <div class="hydration-row">
        <strong>Hydration</strong>
        <button class="mini-btn" id="hydMinus">−</button>
        <input id="hydRange" type="range" min="${r.hydrationMin || 50}" max="${r.hydrationMax || 90}" step="1" value="${hyd}">
        <button class="mini-btn" id="hydPlus">＋</button>
        <span class="hydration-value" id="hydValue">${fmt(hyd)}%</span>
        <button class="mini-btn" id="hydReset">Reset</button>
      </div>
      <div class="hydration-help">Adjusts the liquid automatically. Recipe range: ${fmt(r.hydrationMin)}–${fmt(r.hydrationMax)}%.</div>
    </div>` : '';

  /* Render steps: dim those outside the focused section */
  const stepsHtml = r.steps.map((s, idx) => {
    const stepSec = stepSectionFor(r, idx);
    const dimmed  = focusedSection && stepSec && stepSec !== focusedSection;
    return `<li class="${dimmed ? 'dimmed' : ''}" data-section="${esc(stepSec || '')}">${esc(recipeText(s))}${foldTimerControls(r, idx)}</li>`;
  }).join('');

  el.innerHTML = `
    <div class="detail-head">
      <div class="detail-title-row">
        <div>
          <div class="tag">${esc(r.category || 'Recipe')}${r.hydration ? ` · ${fmt(hyd)}% hydration` : ''}</div>
          <h1>${esc(recipeText(r.title))}</h1>
          <div class="desc">${esc(recipeText(r.desc || ''))}</div>
          ${r.ingredientAllergens || r.allergenAdjustments ? declaredAllergensHtml(r) : ''}
        </div>
        <div style="display:flex;gap:7px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn" id="detailFav">${favs.has(r.id) ? '♥ Saved' : '♡ Save'}</button>
        </div>
      </div>
      <div class="detail-actions" style="justify-content:flex-start">
        <div class="seg">
          ${[...new Set([0.5, 1, 2, 3, scale])].sort((a, b) => a - b).map(s => `<button data-scale="${s}" class="${scale === s ? 'active' : ''}">${s === 0.5 ? '½' : fmt(s)}×</button>`).join('')}
        </div>
        ${hasFlour ? `
        <div class="seg">
          <button data-view="amounts" class="${view === 'amounts' ? 'active' : ''}">Amounts</button>
          <button data-view="bakers"  class="${view === 'bakers'  ? 'active' : ''}">Baker's %</button>
        </div>` : ''}
      </div>
      ${hydrationControl}
      ${familyNavigationHtml(r)}
    </div>

    <div class="detail-body">
      <section class="pane${quantitiesFirst ? ' quantities-first' : ''}">
        <div class="ingredients-heading">
          <h2>Ingredients</h2>
          <button type="button" id="ingredientOrderBtn" class="ingredient-order" aria-label="Show quantities first" title="${quantitiesFirst ? 'Show ingredients first' : 'Show quantities first'}" aria-pressed="${quantitiesFirst}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10a8 8 0 0 1 13-5l3 3M20 3v5h-5M20 14a8 8 0 0 1-13 5l-3-3M4 21v-5h5"/></svg>
          </button>
        </div>
        ${hasSecs ? `<div class="focus-hint">Tap a section to focus it</div>` : ''}
        ${foundationIngredientsHtml(r)}
        ${renderIngredients(r)}
      </section>
      <section class="pane">
        <h2>Method${focusedSection ? ` · <span style="color:var(--accent)">${esc(recipeText(focusedSection))}</span>` : ''}</h2>
        <ol class="steps">${stepsHtml}</ol>
      </section>
    </div>

    <div class="meta">
      ${recipeTimingHtml(r)}
      ${r.tempC  ? `<span class="stat">${temp}</span>`               : ''}
      ${r.batchYield || r.yield ? `<span class="stat" id="recipeYield">${esc(r.batchYield ? familyAmount(r.batchYield.amount * scale, r.batchYield.unit) : translatedYield(r.yield))}</span>` : ''}
    </div>`;

  bindFoldTimers();
  bindFamilyNavigation();
  shopping.decorate(r);
  if (typeof canteen !== 'undefined') canteen.decorateRecipe();
  document.getElementById('ingredientOrderBtn').onclick = () => {
    quantitiesFirst = !quantitiesFirst;
    localStorage.setItem(LS.ingredientOrder, quantitiesFirst ? 'quantity' : 'ingredient');
    renderDetail();
    document.getElementById('ingredientOrderBtn').focus();
  };

  /* Scale */
  document.querySelectorAll('[data-scale]').forEach(b => {
    b.onclick = () => { scale = Number(b.dataset.scale); renderDetail(); };
  });
  /* View */
  document.querySelectorAll('[data-view]').forEach(b => {
    b.onclick = () => { view = b.dataset.view; renderDetail(); };
  });
  /* Hydration */
  if (r.adjustableHydration) {
    const setHyd = v => {
      hydrationState[r.id] = Math.max(Number(r.hydrationMin), Math.min(Number(r.hydrationMax), Number(v)));
      renderDetail();
    };
    document.getElementById('hydRange').oninput = e => setHyd(e.target.value);
    document.getElementById('hydMinus').onclick  = () => setHyd(hyd - 1);
    document.getElementById('hydPlus').onclick   = () => setHyd(hyd + 1);
    document.getElementById('hydReset').onclick  = () => { delete hydrationState[r.id]; renderDetail(); };
  }
  /* Fav / edit */
  document.getElementById('detailFav').onclick = () => toggleFav(r.id);

  /* ── Focus mode: ingredient section click handlers — class-only, no re-render ── */
  document.querySelectorAll('.ingredient-section[data-section]').forEach(btn => {
    btn.onclick = () => {
      const sec = btn.dataset.section;
      focusedSection = focusedSection === sec ? null : sec;
      applyFocusClasses();
    };
  });
}

/* ─── Focus: toggle classes without re-rendering ─── */
function applyFocusClasses() {
  /* Section header buttons */
  document.querySelectorAll('.ingredient-section[data-section]').forEach(btn => {
    const isFocused = btn.dataset.section === focusedSection;
    const isDimmed  = Boolean(focusedSection) && !isFocused;
    btn.classList.toggle('focused', isFocused);
    btn.classList.toggle('dimmed',  isDimmed);
    btn.setAttribute('aria-pressed', String(isFocused));
    btn.title = isFocused ? 'Click to clear focus' : 'Click to focus this section';
  });

  /* Ingredient rows */
  document.querySelectorAll('.ingredient[data-section]').forEach(el => {
    const s = el.dataset.section;
    el.classList.toggle('dimmed', Boolean(focusedSection) && s !== focusedSection);
  });

  /* Method steps */
  document.querySelectorAll('.steps li[data-section]').forEach(el => {
    const s = el.dataset.section;
    const hasSec = Boolean(s);
    el.classList.toggle('dimmed', Boolean(focusedSection) && hasSec && s !== focusedSection);
  });

  /* Method heading label */
  const methodH2 = document.querySelector('.pane:last-child > h2');
  if (methodH2) {
    methodH2.innerHTML = focusedSection
      ? `Method · <span style="color:var(--accent)">${esc(recipeText(focusedSection))}</span>`
      : 'Method';
  }
}

/* ─── Favourites ─── */
function toggleFav(id) {
  favs.has(id) ? favs.delete(id) : favs.add(id);
  saveAll();
  render();
  toast(favs.has(id) ? 'Saved to favourites' : 'Removed from favourites');
}

/* ─── Main render ─── */
function render() {
  document.getElementById('metricBtn').classList.toggle('active', unit === 'metric');
  document.getElementById('imperialBtn').classList.toggle('active', unit === 'imperial');
  document.getElementById('favFilter').classList.toggle('active', onlyFavs);
  document.getElementById('favFilter').setAttribute('aria-pressed', onlyFavs);
  ['metric', 'imperial'].forEach(value => document.getElementById(value + 'Btn').setAttribute('aria-pressed', unit === value));
  renderChips();
  renderList();
  renderDetail();
  syncNavigation();
  saveAll();
  if (typeof canteen !== 'undefined') canteen.render();
}

/* ─── Modal ─── */
function populateRecipeOrganization(r) {
  const suggestions = () => {
    const section = document.getElementById('fSection').value;
    const names = [...new Set([...(recipeSections.find(s => s.id === section)?.categories || []),
      ...recipes.flatMap(recipe => recipeMemberships(recipe).filter(m => m.section === section).map(m => m.category))])];
    document.getElementById('categorySuggestions').innerHTML = names.sort((a, b) => compareRecipeLabels(t(a), t(b)))
      .map(name => `<option value="${esc(name)}">${esc(t(name))}</option>`).join('');
  };
  suggestions(); document.getElementById('fSection').onchange = suggestions;
  const memberships = r?.categoryMemberships || [];
  document.getElementById('fMemberships').innerHTML = recipeSections.map(section => {
    const names = [...new Set([...section.categories, ...recipes.flatMap(recipe => recipeMemberships(recipe).filter(m => m.section === section.id).map(m => m.category))])]
      .sort((a, b) => compareRecipeLabels(t(a), t(b)));
    return `<details><summary>${esc(t(section.label))}</summary>${names.map(name => `<label class="membership-option"><input type="checkbox" data-membership-section="${section.id}" data-membership-category="${esc(name)}" ${memberships.some(m => m.section === section.id && m.category === name) ? 'checked' : ''}>${esc(t(name))}</label>`).join('')}</details>`;
  }).join('');
  document.getElementById('fBatchAmount').value = r?.batchYield?.amount ?? '';
  document.getElementById('fBatchUnit').value = r?.batchYield?.unit || 'ml';
  document.getElementById('fFoundations').innerHTML = '';
  (r?.foundations || []).forEach(addFoundationField);
  document.getElementById('addFoundation').onclick = () => addFoundationField();
}
function addFoundationField(f = {}) {
  const row = document.createElement('div'); row.className = 'foundation-editor-row';
  const available = recipes.filter(r => r.id !== editingId && r.batchYield).sort((a, b) => compareRecipeLabels(recipeText(a.title), recipeText(b.title)));
  row.innerHTML = `<select data-base aria-label="${esc(t('Foundation'))}"><option value="">${esc(t('Choose foundation'))}</option>${available.map(r => `<option value="${esc(r.id)}">${esc(recipeText(r.title))}</option>`).join('')}</select>
    <input data-base-amount type="number" min="0.001" step="any" aria-label="${esc(t('Foundation amount'))}">
    <select data-base-unit aria-label="${esc(t('Foundation unit'))}">${['ml', 'L', 'g', 'kg', 'pc'].map(u => `<option>${u}</option>`).join('')}</select>
    <button type="button" class="btn" data-remove-base>${esc(t('Remove'))}</button>`;
  row.querySelector('[data-base]').value = f.recipeId || '';
  row.querySelector('[data-base-amount]').value = f.amount ?? '';
  row.querySelector('[data-base-unit]').value = f.unit || 'ml';
  row.querySelector('[data-base]').onchange = e => {
    const base = recipes.find(r => r.id === e.target.value);
    if (base) row.querySelector('[data-base-unit]').value = base.batchYield.unit;
  };
  row.querySelector('[data-remove-base]').onclick = () => row.remove();
  document.getElementById('fFoundations').append(row);
}
function readRecipeOrganization() {
  const amount = document.getElementById('fBatchAmount').value;
  return {
    categoryMemberships: [...document.querySelectorAll('[data-membership-section]:checked')].map(el => ({ section: el.dataset.membershipSection, category: el.dataset.membershipCategory })),
    batchYield: amount === '' ? undefined : { amount: Number(amount), unit: document.getElementById('fBatchUnit').value },
    foundations: [...document.querySelectorAll('#fFoundations .foundation-editor-row')].map(row => ({
      recipeId: row.querySelector('[data-base]').value, amount: Number(row.querySelector('[data-base-amount]').value), unit: row.querySelector('[data-base-unit]').value,
    })),
  };
}
function openModal(r = null) {
  editingId = r?.id || null;
  document.getElementById('modalTitle').textContent = r ? 'Edit recipe' : 'Add recipe';
  document.getElementById('deleteBtn').style.visibility = r ? 'visible' : 'hidden';
  const set = (id, v = '') => document.getElementById(id).value = v;
  set('fTitle',       r?.title);
  set('fCategory',    r?.category || (recipeSections.find(section => section.id === recipeSection)?.categories[0] || 'Bread'));
  document.getElementById('fSection').innerHTML = recipeSections.map(section => `<option value="${section.id}">${esc(t(section.label))}</option>`).join('');
  set('fSection', r ? sectionForRecipe(r) : recipeSection === 'All' ? 'baking' : recipeSection);
  populateRecipeOrganization(r);
  set('fDesc',        r?.desc);
  set('fYield',       r?.yield);
  set('fTemp',        r?.tempC);
  set('fPrep',        r?.prep);
  set('fFerment',     r?.ferment);
  set('fBake',        r?.bake);
  set('fCook',        r?.cook);
  set('fHydration',   r?.hydration);
  set('fIngredients', r?.ingredients?.map(i => i.join(' | ')).join('\n'));
  set('fSteps',       r?.steps?.join('\n'));
  document.getElementById('modalBackdrop').classList.add('show');
  setTimeout(() => document.getElementById('fTitle').focus(), 50);
}
function closeModal() {
  document.getElementById('modalBackdrop').classList.remove('show');
}
function parseIngredients(txt) {
  return txt.split('\n').map(x => x.trim()).filter(Boolean).map(line => {
    let [name, amount, unitName, role = '', maximum] = line.split('|').map(x => x.trim());
    return [name, amount === '' ? null : Number(amount), unitName || '', role,
      ...(maximum === undefined || maximum === '' ? [] : [Number(maximum)])];
  });
}
function saveRecipe() {
  const title       = document.getElementById('fTitle').value.trim();
  const ingredients = parseIngredients(document.getElementById('fIngredients').value);
  const steps       = document.getElementById('fSteps').value.split('\n').map(x => x.trim()).filter(Boolean);
  if (!title || !ingredients.length || ingredients.some(i => !i[0] || (i[1] !== null && !Number.isFinite(i[1])) ||
      (i.length > 4 && (!Number.isFinite(i[4]) || i[1] === null || i[4] < i[1]))) || !steps.length) {
    toast('Add a name, valid ingredients and method steps');
    return;
  }
  const data = {
    ...cloneValue(recipes.find(r => r.id === editingId) || {}),
    id:        editingId || `r_${Date.now()}`,
    title,
    category:  document.getElementById('fCategory').value.trim() || 'Other',
    section:   document.getElementById('fSection').value,
    desc:      document.getElementById('fDesc').value.trim(),
    yield:     document.getElementById('fYield').value.trim(),
    tempC:     Number(document.getElementById('fTemp').value) || 0,
    prep:      document.getElementById('fPrep').value.trim(),
    ferment:   document.getElementById('fFerment').value.trim(),
    bake:      document.getElementById('fBake').value.trim(),
    cook:      document.getElementById('fCook').value.trim(),
    hydration: Number(document.getElementById('fHydration').value) || 0,
    ingredients,
    steps,
  };
  Object.assign(data, readRecipeOrganization());
  const previousRecipe = recipes.find(r => r.id === editingId);
  if (data.ingredientAllergens) data.ingredientAllergens = Object.fromEntries(ingredients.filter(i => Array.isArray(data.ingredientAllergens[i[0]])).map(i => [i[0], data.ingredientAllergens[i[0]]]));
  if (previousRecipe && JSON.stringify([previousRecipe.ingredients, previousRecipe.foundations]) !== JSON.stringify([data.ingredients, data.foundations])) delete data.allergenAdjustments;
  try { validateRecipeFamilies([...recipes.filter(r => r.id !== data.id), data]); }
  catch { toast(t('Check foundation quantities, yields and links. A recipe cannot depend on itself.')); return; }
  if (editingId) { recipes = recipes.map(r => r.id === editingId ? data : r); }
  else recipes.unshift(data);
  selectedId = data.id;
  recipeSection = sectionForRecipe(data);
  category   = 'All';
  onlyFavs = false;
  document.getElementById('search').value = '';
  saveAll();
  closeModal();
  render();
  openDetailPanel();
  toast(editingId ? 'Recipe updated' : 'Recipe added');
}
function deleteRecipe() {
  if (!editingId) return;
  if (recipes.some(r => (r.foundations || []).some(f => f.recipeId === editingId))) {
    toast(t('This foundation is used by another recipe. Remove that link before deleting it.')); return;
  }
  recipes    = recipes.filter(r => r.id !== editingId);
  favs.delete(editingId);
  selectedId = recipes[0]?.id || null;
  saveAll();
  closeModal();
  render();
  toast('Recipe deleted');
}

/* ─── Toast ─── */
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => t.classList.remove('show'), 1900);
}

/* ─── Dough folding timer ─── */
const FOLD_TIMER_KEY = 'quickrecipe.foldTimer.v1';
// Only ciabatta specifies an interval. Other doughs ask the cook to choose.
const foldTimerSteps = { ciabatta: { step: 2, minutes: 30 }, focaccia: { step: 2 }, 'simple-sourdough': { step: 2 } };
let foldTimers = [];
let foldAudio = null;
let foldLastSound = 0;
let foldPanelKey = '';
let foldTicker = null;
function foldTimerControls(recipe, step) {
  const plan = foldTimerSteps[recipe.id];
  if (!plan || plan.step !== step) return '';
  return `<form class="fold-timer-controls" data-fold-recipe="${esc(recipe.id)}">
    <div class="fold-timer-inline">
      <button class="fold-link" type="submit" ${foldTimers.some(timer => timer.recipeId === recipe.id) ? 'disabled' : ''}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6M12 2v3"/></svg>
        ${esc(t('Start timer'))}
      </button>
      <label class="fold-interval"><input name="minutes" type="number" inputmode="numeric" min="1" max="240" required placeholder="—" value="${plan.minutes || ''}" aria-label="${esc(t('Minutes until next fold'))}"><span>${esc(t('min'))}</span></label>
    </div>
    <details class="fold-timer-help">
      <summary>${esc(t('Keep app open for alerts'))}</summary>
      <p>${esc(t(plan.minutes ? 'Start after a fold to time the next one.' : 'Choose your interval; this recipe does not specify minutes between folds.'))}</p>
      <p>${esc(t('Keep the app open and your phone unlocked for alerts. For locked-screen reminders, also set a phone alarm.'))}</p>
    </details>
  </form>`;
}
function saveFoldTimer() {
  try {
    if (foldTimers.length) localStorage.setItem(FOLD_TIMER_KEY, JSON.stringify(foldTimers));
    else localStorage.removeItem(FOLD_TIMER_KEY);
  } catch { toast('Timer could not be saved. Keep this page open.'); }
}
function enableFoldSound() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) { toast('Sound is unavailable in this browser.'); return; }
    if (!foldAudio) foldAudio = new Audio();
    foldAudio.resume().then(() => {
      soundFoldTimer();
      toast('If you heard the test, sound is ready. Keep your phone volume up.');
    }).catch(() => toast('Sound is unavailable in this browser.'));
  } catch { toast('Sound is unavailable in this browser.'); }
}
function soundFoldTimer() {
  if (!foldAudio || foldAudio.state !== 'running') return;
  try {
    for (let i = 0; i < 3; i++) {
      const oscillator = foldAudio.createOscillator();
      const gain = foldAudio.createGain();
      const start = foldAudio.currentTime + i * 0.3;
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      oscillator.connect(gain); gain.connect(foldAudio.destination);
      oscillator.start(start); oscillator.stop(start + 0.25);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
  } catch {}
}
function bindFoldTimers() {
  document.querySelectorAll('[data-fold-recipe]').forEach(form => {
    form.onsubmit = event => {
      event.preventDefault();
      const minutes = Number(form.elements.minutes.value);
      if (foldTimers.some(timer => timer.recipeId === form.dataset.foldRecipe) || !Number.isInteger(minutes) || minutes < 1 || minutes > 240) return;
      foldTimers.push({ recipeId: form.dataset.foldRecipe, minutes, starts: 1, dueAt: Date.now() + minutes * 60000 });
      saveFoldTimer();
      enableFoldSound();
      requestWakeLock();
      tickFoldTimer();
    };
  });
}
function tickFoldTimer() {
  let panel = document.getElementById('foldTimerPanel');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'foldTimerPanel';
    panel.className = 'fold-timer-panel';
    panel.setAttribute('aria-label', t('Folding timer'));
    document.querySelector('.app').appendChild(panel);
  }
  panel.hidden = !foldTimers.length;
  document.querySelectorAll('[data-fold-recipe]').forEach(form => {
    form.querySelector('button').disabled = foldTimers.some(timer => timer.recipeId === form.dataset.foldRecipe);
  });
  if (!foldTimers.length) {
    foldLastSound = 0;
    foldPanelKey = '';
    clearInterval(foldTicker); foldTicker = null;
    return;
  }
  if (!foldTicker) foldTicker = setInterval(tickFoldTimer, 1000);
  const now = Date.now();
  const key = JSON.stringify([foldTimers, foldTimers.map(timer => now >= timer.dueAt), language]);
  if (key !== foldPanelKey) {
    foldPanelKey = key;
    panel.innerHTML = foldTimers.map(timer => {
      const recipe = recipes.find(r => r.id === timer.recipeId);
      const due = now >= timer.dueAt;
      return `<section class="fold-timer-row${due ? ' is-due' : ''}" data-fold-timer="${esc(timer.recipeId)}" aria-label="${esc(recipeText(recipe?.title || 'Bread'))}"><div class="fold-timer-heading"><strong>${esc(recipeText(recipe?.title || 'Bread'))}</strong>
      <span role="status">${esc(t(due ? 'Time to fold the dough!' : 'Next fold'))}</span>
      <span class="fold-countdown" role="timer"></span>
      <span class="fold-start-count">${esc(t('Started'))} ${timer.starts}×</span></div>
      <div class="fold-timer-actions">
      ${due ? `<button class="fold-link" data-fold-next>${esc(t('Folded — start next timer'))}</button>` : ''}
      <button class="fold-icon" data-fold-sound aria-label="${esc(t('Test / enable sound'))}" title="${esc(t('Test / enable sound'))}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4ZM15 8c3 2 3 6 0 8M18 5c5 4 5 10 0 14"/></svg>
      </button>
      <button class="fold-icon" data-fold-stop aria-label="${esc(t('Finish timer'))}" title="${esc(t('Finish timer'))}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
      </button></div></section>`;
    }).join('');
    panel.querySelectorAll('[data-fold-timer]').forEach(row => {
      const timer = foldTimers.find(timer => timer.recipeId === row.dataset.foldTimer);
      row.querySelector('[data-fold-next]')?.addEventListener('click', () => {
        if (!foldTimers.includes(timer) || Date.now() < timer.dueAt) return;
        timer.starts += 1;
        timer.dueAt = Date.now() + timer.minutes * 60000;
        foldLastSound = 0;
        saveFoldTimer(); enableFoldSound(); tickFoldTimer();
      });
      row.querySelector('[data-fold-stop]').onclick = () => {
        foldTimers = foldTimers.filter(active => active !== timer); saveFoldTimer(); tickFoldTimer();
      };
      row.querySelector('[data-fold-sound]').onclick = enableFoldSound;
    });
  }
  panel.querySelectorAll('[data-fold-timer]').forEach(row => {
    const timer = foldTimers.find(timer => timer.recipeId === row.dataset.foldTimer);
    const seconds = Math.max(0, Math.ceil((timer.dueAt - now) / 1000));
    const countdown = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    const display = row.querySelector('.fold-countdown');
    if (display.textContent !== countdown) display.textContent = countdown;
  });
  if (foldTimers.some(timer => now >= timer.dueAt) && document.visibilityState === 'visible' && Date.now() - foldLastSound >= 10000) {
    foldLastSound = Date.now(); soundFoldTimer();
    try { navigator.vibrate?.([200, 100, 200]); } catch {}
  }
}
function initFoldTimer() {
  try {
    const saved = JSON.parse(localStorage.getItem(FOLD_TIMER_KEY));
    // Restore older single timers as well as the current collection.
    for (const timer of Array.isArray(saved) ? saved : [saved]) {
      if (!timer || !recipes.some(r => r.id === timer.recipeId) ||
          foldTimers.some(active => active.recipeId === timer.recipeId) ||
          !Number.isInteger(timer.minutes) || timer.minutes < 1 || timer.minutes > 240 ||
          !Number.isFinite(timer.dueAt) || timer.dueAt <= 0) continue;
      foldTimers.push({ recipeId: timer.recipeId, minutes: timer.minutes, dueAt: timer.dueAt,
        starts: Number.isSafeInteger(timer.starts) && timer.starts > 0 && timer.starts < Number.MAX_SAFE_INTEGER ? timer.starts : 1 });
    }
  } catch {}
  tickFoldTimer();
  document.addEventListener('visibilitychange', tickFoldTimer);
  window.addEventListener('pageshow', tickFoldTimer);
}

/* ─── Bootstrap ─── */
async function init() {
  /* Apply theme immediately before anything renders */
  initTheme();

  /* Loading state */
  document.getElementById('list').innerHTML   = '<div class="loading"><div class="spinner"></div>Loading recipes…</div>';
  document.getElementById('detail').innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  /* Fetch seed recipes */
  let seedLoadFailed = false;
  try {
    seedRecipes = await loadSeedRecipes();
  } catch (e) {
    console.warn('Could not load the recipe collection', e);
    seedRecipes = [];
    seedLoadFailed = true;
  }

  await loadRecipeTranslations(RECIPE_VERSION);

  /* Restore state */
  favs           = new Set(load(LS.favs, []));
  unit           = localStorage.getItem(LS.unit) || 'metric';
  quantitiesFirst = localStorage.getItem(LS.ingredientOrder) === 'quantity';
  hydrationState = load(LS.hydration, {});
  const storedRecipes = load(LS.recipes, seedRecipes);
  // A missing category file must never remove recipes from the saved collection.
  recipes        = seedLoadFailed ? storedRecipes : mergeSeedRecipes(storedRecipes);
  selectedId     = recipes.find(r => r.id === 'ciabatta')?.id || recipes[0]?.id || null;
  restoreUiState();

  /* Static event listeners */
  document.getElementById('themeBtn').onclick       = toggleTheme;
  document.getElementById('search').oninput = () => { familyHistory = []; render(); document.getElementById('list').scrollTop = 0; };
  document.getElementById('sectionSelect').onchange = e => browseSection(e.target.value);
  document.getElementById('metricBtn').onclick      = () => { unit = 'metric';   saveAll(); render(); };
  document.getElementById('imperialBtn').onclick    = () => { unit = 'imperial'; saveAll(); render(); };
  document.getElementById('favFilter').onclick      = () => { familyHistory = []; onlyFavs = !onlyFavs; recipeSection = 'All'; category = 'All'; document.getElementById('search').value = ''; document.querySelector('.app').classList.remove('reading-recipe'); render(); document.getElementById('list').scrollTop = 0; };
  document.getElementById('addBtn').onclick         = () => openModal();
  document.getElementById('cancelBtn').onclick      = closeModal;
  document.getElementById('saveBtn').onclick        = saveRecipe;
  document.getElementById('deleteBtn').onclick      = deleteRecipe;
  document.getElementById('backBtn')?.addEventListener('click', closeDetailPanel);
  initRecipeGestures();
  document.getElementById('shoppingListsBtn').onclick = shopping.all;
  document.getElementById('modalBackdrop').onclick  = e => { if (e.target.id === 'modalBackdrop') closeModal(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWakeLock(); else releaseWakeLock();
  });
  window.addEventListener('pagehide', releaseWakeLock);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

  initFoldTimer();
  render();
  if (typeof canteen !== 'undefined') canteen.restoreSession();
  if (seedLoadFailed) {
    if (recipes.length) toast('Could not refresh recipes. Showing your saved collection.');
    else document.getElementById('list').innerHTML = '<div class="empty">Recipes could not be loaded. Check your connection and reload.</div>';
  }
}

init();
