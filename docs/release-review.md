# Release 51 — steps 11–14

The collection now contains **519 recipes in 33 files**, with **58 additions** in this release. All 461 existing recipes, including all 44 truffles, retain their IDs, quantities and methods. No recipes were removed.

## Completed scope

- Step 11: 20 reusable dough, pastry and sponge foundations, plus 6 finished pizzas and flatbreads.
- Step 12: 10 muffins, scones and loaves; 8 pies and tarts; 11 classic desserts; 3 additional confections.
- Step 13: recipe, translation, category, family, scaling, shopping, saved-data, responsive-layout and offline-update checks completed.
- Step 14: publication targets the existing GitHub Pages site from the main branch.

All 286 blueprint entries map to recipes. Repeated blueprint names share canonical IDs, including panna cotta, shortcrust pastry and sweet tart pastry. Additional confections are separate from the unchanged truffle collection. No recipes are held back from this batch.

## Validation

- The full smoke, translation, shopping, family and content suites pass. All 519 recipes have Polish and Icelandic text with unchanged cooking numbers.
- The content suite checks all 267 additions from steps 6–12 at all four scales, including rendered ingredient order, compact metric units, yields and prepared-base quantities.
- Baking-family checks verify both raw dough mass and baked choux-shell counts. Marking a base already prepared excludes its ingredients.
- The 58 new recipes were reviewed for ingredient use, method order, useful quantities, yields, relevant timings and temperatures. Declared dough portions are weighed before use; surplus is reserved. Baking templates state the base tin size and retain suitable batter depth when scaling.
- The existing 461 recipe objects were compared against the start-of-release baseline and are unchanged.
- Real Chrome checks at 390, 768 and 1280 pixel widths found no horizontal page overflow. Screenshots were visually inspected for ingredient, method and control layout.
- An isolated browser upgrade from version 49 to 51 retained a favourite, a shopping list, a custom recipe and the selected recipe. Offline reload retained the complete collection; the new baking and confection files and both translation dictionaries were fetched successfully offline.
- English, Polish and Icelandic categories sort alphabetically. The review found that this Chrome build omits Icelandic collation data; a fallback now preserves Icelandic letter order in category and family lists.
- Related-recipe links preserve the category and list position. Required pastry quantities open at the correct scale, and Back restores the previous recipe.
- App, service worker and HTML asset versions match at 51. The service worker caches every indexed recipe file; no saved-data reset or storage-key migration is introduced.

Automated and browser checks verify content structure and application behaviour. They do not constitute kitchen trials of the recipes.

## Additions

### Dough, pastry and sponge foundations — 20

- Neapolitan-Style Pizza Dough
- Quick Pizza Dough
- Shortcrust Pastry
- Sweet Tart Pastry
- Pâte Sablée
- Rough Puff Pastry
- Classic Puff Pastry
- Croissant Dough
- Danish Pastry Dough
- Brioche Dough
- Sweet Yeast Dough
- Choux Pastry
- Tulip Paste
- Strudel Dough
- Filo Dough
- Hot-Water Crust Pastry
- Cookie Crumb Base
- Génoise Sponge
- Joconde Sponge
- Dacquoise

### Pizza and flatbreads — 6

- Margherita Pizza
- Pepperoni Pizza
- Garlic Naan
- Pita Bread
- Flammkuchen
- Calzone

### Muffins, scones and loaves — 10

- Blueberry Muffins
- Chocolate Muffins
- Banana Muffins
- Lemon Poppy-Seed Muffins
- Plain Scones
- Cheese Scones
- Cinnamon Scones
- Banana Bread
- Lemon Loaf
- Carrot Loaf

### Pies and tarts — 8

- Apple Pie
- Lemon Tart
- Chocolate Tart
- Key Lime Pie
- Banoffee Pie
- Pecan Pie
- Quiche Lorraine
- Spinach & Feta Quiche

### Classic desserts — 11

- Tiramisu
- Crème Brûlée
- Vanilla Panna Cotta
- Chocolate Mousse
- Sticky Toffee Pudding
- Apple Crumble
- Bread Pudding
- Lemon Posset
- Profiteroles
- Chocolate Lava Cake
- Vanilla Ice Cream

### Confections — 3

- Chocolate Fudge
- Peanut Brittle
- Fruit & Nut Chocolate Bark

