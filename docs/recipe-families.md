# Recipe categories and families

## Content workflow

The collection map is in [recipe-collection-map.md](recipe-collection-map.md). The original 252 recipes are retained, with 209 additions completed in steps 6–10. Béchamel and its derivatives are published alongside stocks, other sauce families and everyday meals. Steps 11–12 add another 58 recipes, bringing the collection to 519, including raw pastry and dough foundations and baked choux/sponge components. See [content-expansion-status.md](content-expansion-status.md) for batch counts. Calculation fixtures in `family-test.js` are not published recipes.

The recipe editor has a **Categories & foundations** panel. Choose additional categories, optionally set a measured prepared yield, and select required foundations with their amounts. A foundation must have a measured yield before it can be selected. Future categories appear in this panel; browsing shows only categories containing recipes.

## Data contract

Existing `category` and `section` fields remain the primary membership. Optional additional memberships use:

```json
"categoryMemberships": [
  { "section": "meals", "category": "Quick dinners" }
]
```

Memberships do not create duplicate recipe entries. The All count, favourites and selection continue to use the stable recipe ID. Sections count distinct recipes; section counts may overlap when one recipe belongs to several sections. Category sorting follows the displayed name in the selected language.

A foundation declares its finished yield at 1×. This is a measured recipe output, not the sum of raw ingredients:

```json
"batchYield": { "amount": 1000, "unit": "ml" }
```

A derivative lists required prepared recipes separately from its additional ingredients:

```json
"foundations": [
  { "recipeId": "bechamel", "amount": 500, "unit": "ml" }
]
```

These fragments match the published Béchamel family. Every reference must resolve to a recipe with a positive declared finished yield. New bases specify a final measurement when needed. The existing Caesar dressing retains its approximate 150 ml yield and unchanged method. Multiple distinct foundations are supported. Repeated references to the same foundation within one recipe must be combined into a single amount.

Supported yield and requirement units: `g`, `kg`, `ml`, `L`, `pc`. Mass converts only to mass; volume only to volume; pieces only to pieces. There are no assumed densities. Invalid numbers, missing recipes, incompatible units, duplicate references and dependency cycles are rejected when loading seed data or saving recipes. A referenced foundation cannot be deleted through the editor.

The displayed yield uses `batchYield` when present. Optional `yield` text can still describe servings, but it must agree with the prepared quantity. Recipe text should not repeat fixed ingredient quantities or batch counts that would contradict scaling.

## Navigation and scaling

- Foundations show **Make from this**, derived from incoming references; there is no duplicate child list to maintain.
- Derivatives show **Requires**, with the prepared quantity multiplied by the selected scale and a link to each base.
- Opening a required base sets its scale to `required quantity × current scale ÷ base yield`, after compatible unit conversion. A custom scale button appears when that multiplier is outside ½×, 1×, 2× or 3×.
- Opening a derivative from **Make from this** starts at its own 1×; it does not assume all of a parent batch must be used.
- Opening either kind of related recipe preserves the current category, search, favourites filter and list position. A base outside those filters opens in the detail pane while the list stays in place. Choosing a new category, search or recipe starts a new browsing context.
- Back restores recipe, scale, ingredient focus, filters, search and scroll position. Nested links can be followed back through the chain.
- Search and favourites find derivatives independently of their parent.

## Shopping lists

Recipes without foundations keep their existing shopping flow and user-entered purchase quantities. Family recipes show a selection preview with calculated quantities.

For each required base, choose **Make from ingredients** or **Already prepared**. Making a base expands its ingredients recursively at the required scale. A prepared base is omitted from purchases, including all of its nested ingredients. The prepared quantity remains visible to help the user check how much they have.

Shared nested foundations add up the quantity needed by each branch. The ingredient total includes each branch's required fraction exactly once. The prepared base itself is never added alongside its expanded ingredients.

Ingredients combine only when their names match case-insensitively and their units are equal or safely convertible (`kg`/`g`, `L`/`ml`). Distinct preparation labels and incompatible units remain separate. No ingredient aliases or mass/volume equivalences are guessed. Ranges and as-needed additions are retained. Rounding happens only for display.

Users select ingredients individually or choose **Select all**. Saved family lists retain scale, prepared-base choices, selections, checked-off purchases and custom purchase amounts. On editing, computed quantities track scaling; manually overridden purchase text remains unchanged. Saving creates a snapshot, so browsing another recipe does not alter an existing shopping list.

## Validation

`npm test` includes the existing smoke, translation and shopping suites plus family validation, a shared-base dependency graph, all four scales, compatible conversions, prepared-base pruning, navigation restoration, category sorting, editor round trips and saved shopping-list behaviour. `content-test.js` also renders every added recipe at all four scales and checks practical metric formatting, ingredient order, known categories, finished yields, the published Béchamel family and shared stock quantities through demi-glace. These checks validate data and application behaviour; culinary review is separate and does not establish kitchen-tested results. All recipe files are included in the indexed offline cache.
