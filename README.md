# QuickRecipe

Personal recipe browser with search, category filters, scaling and offline support.

Run locally with `python3 -m http.server 8766`, then open http://localhost:8766.
Install test dependencies with `npm ci`, then run the checks with `npm test`.

## Recipe files

The collection lives in `recipes/`, split by category:

- `bread.json`
- `cakes.json`
- `desserts.json`
- `cheesecakes.json`
- `dressings.json`
- `skyr-cakes.json`
- `meringue.json`
- `brownies.json`
- `polish-soups.json`
- `polish-breads.json`

`recipes/index.json` lists the files to load. Each file contains an array of recipe objects. Add recipes to the appropriate file; add new filenames to the index when introducing another file. IDs must be unique across the entire collection and should remain stable to preserve favourites and saved selections.

The app loads the indexed files together so search, favourites and swipe navigation work across the collection. Splitting files improves maintenance; it does not yet introduce lazy loading or pagination. Existing browser-saved recipes are merged by ID. If any category fails to load, the app retains the last saved collection rather than applying an incomplete update.

## Timing

Use `prep`, `cook`, `bake`, and `ferment` for preparation, stovetop cooking, baking, and resting/chilling respectively. Cards and recipe details share the same labelled timing display. Missing bake time does not hide prep or rest time. If all four fields are absent, the UI says “Time not specified”. Do not invent a total or infer that a missing baking time means no-bake.

## Publishing data changes

Keep the version in `app.js` (`RECIPE_VERSION`), `sw.js` (`VERSION`), and the stylesheet/script query versions (including `i18n.js`) in `index.html` aligned when releasing changes. The service worker reads the recipe index and caches every listed file; a failed download prevents the new offline cache from activating.

Source mappings and import notes are kept in `imports/`. Source metadata is not displayed in the recipe text.

## Languages

The header offers compact EN / PL / IS buttons for English (default), Polish and Icelandic. The choice is stored in `quickrecipe.language` and works offline. `i18n.js` contains interface translations, unit labels and plural handling. Canonical recipe IDs, categories, ingredient quantities, temperatures and baker's roles remain unchanged.

`translations/pl.json` and `translations/is.json` contain recipe translations reviewed for cooking terminology and numeric fidelity. Each exact English source string is a key, allowing shared ingredient names and instructions to reuse a translation. The files cover titles, descriptions, ingredients, instructions, timing, yields and section headings. Search checks all three languages so switching languages preserves search results. Scaling runs on the English source data before translated labels are applied; pan dimensions stay fixed.

When adding or editing recipe text, add the new English strings to both dictionaries. Missing entries fall back to the original text and the list shows a brief notice. Editing still uses the original stored recipe, so changing language never rewrites your recipes or favourites. No translation service is contacted by the app.

Run `node translation-test.js` to check full collection coverage, unchanged numbers and unique translated titles. These checks supplement culinary-language review; they do not assess every aspect of translation quality.

## Shopping lists

Use Create shopping list beside the portion controls, select ingredients, then View list. Lists contain ingredient names and optional shopping amounts (such as “2 bags”), independently of recipe scaling. Identical ingredient names appear once. Shopping lists in the header reopens saved lists; each list keeps its recipe title, shopping amounts and purchased checkmarks on this device in `quickrecipe.shopping.v1`. Editing selection uses a draft until View list is pressed.

Copy exports a plain-text checklist. Share opens the device share menu when supported; otherwise selectable text is provided for copying. Cancelling the device share menu leaves the list intact. Lists and controls use the selected language; shopping amounts remain exactly as entered. `shopping.js` is included in the offline cache.
