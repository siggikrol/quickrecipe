# Canteen Mode V1

Open **Pro** and enter the shared password. Refreshing keeps Pro open in the same tab. Leaving Pro locks it again. The existing recipe browser, favourites, shopping lists and timers remain available through Recipes.

## Plan → Calculate → Prepare → Cook

- **Week:** Set expected portions, then add existing recipes to configurable meal slots. The recipe picker and its search filter by slot: soups (including Polish soups), mains, sides/salads/breads, or cakes and desserts. Custom slots matching a recipe category filter to that category; other custom slots allow all recipes. Blank item portions inherit the day total; an explicit zero means zero. Recipes in the same slot form a variant group; their total is compared with the expected day count. Mismatches warn without blocking work.
- **Kitchen notes:** Add an optional note to a day for service times or preparation reminders. Notes are saved with the plan, copied with a day/week, and shown in Kitchen and on printouts.
- **Copy ingredients:** Copy totals for the selected days and course, with bases and raw ingredients kept separate. If clipboard access is unavailable, selectable text is shown.
- **Week actions:** Configure operating days and slots, copy a day/week, save/apply templates, or preview the weekly menu and allergen sheet. Copying generates new item IDs and clears completion/batch state for a copied week. Removing an operating day retains its menu but excludes it from requirements and production.
- **Allergen checks:** Ingredient cards turn green when checked and show their selected allergens while collapsed. Use **No allergens identified** to explicitly confirm none. The checked counter tracks progress; Save keeps the changes.
- **Recipe settings:** Declare the number of servings made by the original recipe. Exact existing “N servings” yields work automatically. Cakes, trays, ranges and unknown yields require a declaration; the app never guesses. This changes serving interpretation, not cooking quantities or methods.
- **Ingredients needed:** Toggle the highlighted day buttons to select one or multiple days. Entire week selects all days, or clears them when all are selected. Optionally choose a single meal slot. Bases to prepare and raw ingredients are shown separately. Invalid references or missing serving yields stop the calculation with an explanation instead of presenting partial totals as complete.
- **Kitchen:** Choose a day, check off prepared components and production items, and open full recipes or individual batches in the existing recipe interface. Back to kitchen restores the earlier recipe browsing context. Quantity changes invalidate affected completion checkmarks.
- **Batches:** Expand **Split into batches** when needed. Choose a batch count or maximum portions per batch. Maximum size uses enough equal batches to stay below the maximum (355 portions with a maximum of 80 gives five batches of 71). Requirements always use the full quantity.
- **Paper:** Preview and print weekly menus, daily production sheets, selected requirements and allergen sheets. Browser Print also supports Save as PDF. Print styles target A4 and omit navigation and controls.

## Shared architecture

`recipe-calculations.js` contains the shared calculation functions under `RecipeMath`:

- `scaleRecipe(recipe, targetYield)` resolves serving counts and returns the multiplier.
- `normalizeIngredientQuantity()` and `aggregateIngredients()` preserve ranges and as-needed entries and combine identical normalized names with compatible units.
- `expandFoundationRequirements()` traverses the existing `foundations` / `batchYield` graph and detects cycles and missing/incompatible yields.
- `calculateRequirements()` combines selected recipes using the same expansion code as the existing `familyShoppingPlan()` adapter.
- `deriveRecipeAllergens()` inherits declarations through nested foundations.
- `batches()` calculates execution quantities without modifying requirements.

Mass and volume never combine. Metric mass uses g/kg; volume uses ml/dl/L. Spoon, cup, count and unspecified units remain distinct. No density or ingredient synonym is inferred. Names use the existing ingredient normalization convention. Numeric precision is retained internally and rounded only for presentation. Hydration adjustments are passed into the shared engine explicitly, matching the recipe renderer.

`canteen-model.js` contains date, plan, portion, copying, selection and saved-plan validation functions. `canteen.js` implements the three views and their dialogs; it references the existing `recipes` collection and renderer. Translations live in the existing `i18n.js` dictionaries.

Plans are stored in `quickrecipe.canteen.v1` with version 1, a map of Monday dates to weeks, and named templates. Each week stores seven dated days, active weekday indices, configurable slot IDs/names, recipe references, nullable overrides, variant labels and production state. Dates use calendar arithmetic independent of daylight-saving transitions. Completion signatures track production quantities; checkmarks never deduct ingredients. Batch settings and checklist state survive reloads. Invalid saved plans are retained for backup rather than silently overwritten.

## Recipe metadata and allergens

Existing recipe arrays and ingredient tuple positions are unchanged. Optional recipe fields are:

```json
{
  "servings": 10,
  "ingredientAllergens": {
    "Butter": ["milk"],
    "Salt": []
  },
  "allergenAdjustments": {
    "add": ["mustard"],
    "remove": []
  }
}
```

`ingredientAllergens` is an adjunct to existing ingredient tuples, keyed by their exact original name within that recipe. It is ingredient-level declaration data, independent of any Canteen plan. An absent entry is undeclared; an empty array means the operator reviewed that ingredient and declared none. Seed recipe metadata is not populated by guessing allergens from names. The 14 supported IDs are gluten, crustaceans, eggs, fish, peanuts, soybeans, milk, nuts, celery, mustard, sesame, sulphites, lupin and molluscs.

Recipe adjustments apply after ingredient and foundation inheritance; explicit additions win if the same allergen is also excluded. Unreviewed ingredients or foundations retain an incomplete-declarations notice. No output claims allergy safety. Recipe settings can save the current declaration and open required foundations for review.

Serving declarations and matching ingredient declarations survive catalogue merges. Manual recipe adjustments are discarded when the ingredient/foundation composition changes. The existing recipe editor preserves declarations for unchanged ingredient names and removes orphaned declarations. Recipe ID migrations update saved plans and templates without changing item IDs.

There is no automatic task generation from ingredient names. Current method sections describe recipe components rather than structured preparation actions; the kitchen view therefore lists actual prepared foundations and production quantities. Original methods remain available in the recipe renderer.

## Validation

Run `npm test`. This includes the original six suites plus planning-model, shared-calculation and Canteen UI suites. Coverage includes zero overrides, decimal scales, nested foundations/cycles, compatible/incompatible units, ranges, unknown yields, allergens, batches, copying, reloads, translations, print structure and restoring recipe selection. Version 68 aligns app, HTML assets and offline caching, including all new modules.

All planning and progress is local to this browser. V1 has no inventory, ordering, suppliers, costing, accounts or server synchronization.


## Layout regression checks

Pro uses the available desktop width and keeps every configured day in the same
row at 1024px and above. At tablet widths the week scrolls within its own strip;
on phones the days stack. Short views are top-aligned. Switching views resets
page scrolling, while returning from a recipe restores the kitchen position.

With an isolated Chrome instance started with a remote debugging port, run:

```sh
# Set PRO_TEST_PASSWORD in your environment to the configured Pro password.
QUICKRECIPE_URL=http://127.0.0.1:8766 CHROME_DEBUG_URL=http://127.0.0.1:9336 npm run test:browser
```

The suite uses a disposable browser context, so it does not change saved plans
in the normal browser. It checks 3-, 5-, and 7-day weeks at eight widths from
320px to 1800px, empty views on a tall screen, tab scroll resets, tablet edits,
recipe/batch navigation, dialogs, print styles, all three languages and saved
production progress. Screenshots are saved under `tmp/canteen-layout-qa/`.


## Simple password lock

Pro requires a password before rendering its views. Only the password's SHA-256
check value is configured in `canteen.js`; the password is never saved in browser
storage. A session flag keeps Pro open across refreshes in the same tab. Incorrect passwords and cancelled prompts leave Pro closed.
Leaving Pro removes its rendered content and clears the session flag.

This is a casual browser-side lock, not authentication or encryption. Someone
who can modify browser code can bypass it, and saved plans remain in local
storage. Server-side access control is required for stronger protection.
