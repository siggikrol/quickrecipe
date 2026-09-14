# QuickRecipe

Personal recipe browser with search, category filters, scaling and offline support.

Run locally with `python3 -m http.server 8766`, then open http://localhost:8766.
Run the checks with `npm test`.

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

`recipes/index.json` lists the files to load. Each file contains an array of recipe objects. Add recipes to the appropriate file; add new filenames to the index when introducing another file. IDs must be unique across the entire collection and should remain stable to preserve favourites and saved selections.

The app loads the indexed files together so search, favourites and swipe navigation work across the collection. Splitting files improves maintenance; it does not yet introduce lazy loading or pagination. Existing browser-saved recipes are merged by ID. If any category fails to load, the app retains the last saved collection rather than applying an incomplete update.

## Timing

Use `prep`, `cook`, `bake`, and `ferment` for preparation, stovetop cooking, baking, and resting/chilling respectively. Cards and recipe details share the same labelled timing display. Missing bake time does not hide prep or rest time. If all four fields are absent, the UI says “Time not specified”. Do not invent a total or infer that a missing baking time means no-bake.

## Publishing data changes

Keep the version in `app.js` (`RECIPE_VERSION`), `sw.js` (`VERSION`), and the stylesheet/script query versions in `index.html` aligned when releasing changes. The service worker reads the recipe index and caches every listed file; a failed download prevents the new offline cache from activating.

Source mappings and import notes are kept in `imports/`. Source metadata is not displayed in the recipe text.
