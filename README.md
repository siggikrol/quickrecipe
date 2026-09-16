# QuickRecipe

Personal recipe browser with search, category filters, scaling and offline support.

Run locally with `python3 -m http.server 8766`, then open http://localhost:8766.
Install test dependencies with `npm ci`, then run the checks with `npm test`.

## Recipe files

The collection lives in `recipes/`, split by category:

- `bread.json`
- `cakes.json`
- `cookies.json`
- `truffles.json`
- `desserts.json`
- `cheesecakes.json`
- `dressings.json`
- `skyr-cakes.json`
- `meringue.json`
- `brownies.json`
- `polish-soups.json`
- `polish-breads.json`
- `stocks.json`, `foundation-sauces.json`, `dips.json`
- `breakfast.json`, `pasta.json`, `chicken.json`, `quick-dinners.json`
- `meat.json`, `seafood.json`, `rice.json`, `vegetarian.json`
- `sides.json`, `salads.json`, `soups.json`, `casseroles.json`
- `baking-foundations.json`, `pizza-flatbreads.json`, `muffins-scones-loaves.json`
- `pies-tarts.json`, `classic-desserts.json`, `confections.json`

`recipes/index.json` lists the files to load. Each file contains an array of recipe objects. Add recipes to the appropriate file; add new filenames to the index when introducing another file. IDs must be unique across the entire collection and should remain stable to preserve favourites and saved selections.

The app loads the indexed files together so search, favourites and swipe navigation work across the collection. Splitting files improves maintenance; it does not yet introduce lazy loading or pagination. Existing browser-saved recipes are merged by ID. If any category fails to load, the app retains the last saved collection rather than applying an incomplete update.

## Timing

Use `prep`, `cook`, `bake`, and `ferment` for preparation, stovetop cooking, baking, and resting/chilling respectively. Cards and recipe details share the same labelled timing display. Missing bake time does not hide prep or rest time. If all four fields are absent, the UI says “Time not specified”. Do not invent a total or infer that a missing baking time means no-bake.

## Publishing data changes

Keep the version in `app.js` (`RECIPE_VERSION`), `sw.js` (`VERSION`), and the stylesheet/script query versions (including `i18n.js`) in `index.html` aligned when releasing changes. The service worker reads the recipe index and caches every listed file; a failed download prevents the new offline cache from activating.

Recipe data contains cooking content and app settings only. Do not add source URLs or provenance metadata to recipe objects.

## Languages

The header offers compact EN / PL / IS buttons for English (default), Polish and Icelandic. The choice is stored in `quickrecipe.language` and works offline. `i18n.js` contains interface translations, unit labels and plural handling. Canonical recipe IDs, categories, ingredient quantities, temperatures and baker's roles remain unchanged.

`translations/pl.json` and `translations/is.json` contain recipe translations reviewed for cooking terminology and numeric fidelity. Each exact English source string is a key, allowing shared ingredient names and instructions to reuse a translation. The files cover titles, descriptions, ingredients, instructions, timing, yields and section headings. Search checks all three languages so switching languages preserves search results. Scaling runs on the English source data before translated labels are applied; pan dimensions stay fixed.

When adding or editing recipe text, add the new English strings to both dictionaries. Missing entries fall back to the original text and the list shows a brief notice. Editing still uses the original stored recipe, so changing language never rewrites your recipes or favourites. No translation service is contacted by the app.

Run `node translation-test.js` to check full collection coverage, unchanged numbers and unique translated titles. These checks supplement culinary-language review; they do not assess every aspect of translation quality.

## Shopping lists

Recipes with foundations additionally offer **Make from ingredients** or **Already prepared** for each base. Their shopping preview combines the required scaled ingredients through nested foundations and preserves manually entered purchase amounts. See [recipe families](docs/recipe-families.md) for the data contract and behaviour.

Use Create shopping list beside the portion controls, select ingredients, then View list. Lists contain ingredient names and optional shopping amounts (such as “2 bags”), independently of recipe scaling. Identical ingredient names appear once. Shopping lists in the header reopens saved lists; each list keeps its recipe title, shopping amounts and purchased checkmarks on this device in `quickrecipe.shopping.v1`. Editing selection uses a draft until View list is pressed.

Copy exports a plain-text checklist. Share opens the device share menu when supported; otherwise selectable text is provided for copying. Cancelling the device share menu leaves the list intact. Lists and controls use the selected language; shopping amounts remain exactly as entered. `shopping.js` is included in the offline cache.

## Collection planning and recipe families

The [collection map](docs/recipe-collection-map.md) compares the content blueprint with the current recipes and records duplicates, related recipes and gaps. There is no collection size limit.

Use **Categories & foundations** in the recipe editor to assign additional categories, set a measured prepared yield, and choose required foundations. Browse categories appear when populated and sort by their translated names. [Recipe family documentation](docs/recipe-families.md) describes validation, navigation, scaling and shopping-list rules. `family-test.js` uses unpublished arithmetic fixtures to exercise these features without adding unverified recipes to the collection.

Steps 6–10 add 209 recipes, bringing the collection to 461. The [expansion status](docs/content-expansion-status.md) records the completed batches and review limits. `content-test.js` checks every new recipe at ½×, 1×, 2× and 3×, plus published recipe-family shopping calculations.

Steps 11–14 add 58 more recipes for **519 total**, connect finished bakes to their foundations, and complete the release review. See the [release report](docs/release-review.md) for the additions and checks, and the [saved roadmap](docs/implementation-roadmap.md) for the approved scope.

## Dough folding timer

Ciabatta, Focaccia and Simple Sourdough have a timer beside their folding step.
Start after folding; Ciabatta defaults to its stated 30 minutes. For the other
two recipes, choose the interval yourself. The active timer stays visible while
browsing, survives reloads, and shows an overdue reminder when you return.
Tap **Folded — start next timer** after each fold, or **Finish timer** when done.
Each bread can run its own folding timer at the same time. Each has its own
countdown, reminder, and start count. The small “Started 1×” count increases each
time you start the next interval and survives reloads. Finishing the timer resets
that bread’s count for the next dough session. Other timers keep running.

Keep the app open, the phone unlocked and the volume audible for alerts. The
app requests a screen wake lock where supported. Use **Test / enable sound**
after reloading to reactivate audio. A suspended or closed web app cannot
reliably ring on time; also set a phone alarm if you need a locked-screen reminder.

## Canteen Mode

**Pro** adds weekly portion planning, recipe variants,
consolidated ingredient requirements, kitchen checklists, batches, declared
allergens and A4 print sheets. It shares the existing recipes and foundation
engine. See [Canteen Mode](docs/canteen.md) for the workflow, serving declarations,
local persistence and calculation rules.
