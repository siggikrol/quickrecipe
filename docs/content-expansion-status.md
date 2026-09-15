# Content expansion: steps 6–10

Completed: **209 additions**, for **461 recipes** in 27 indexed files. There is no collection size limit. All 252 original recipes retain their stable IDs, ingredient quantities and methods. The existing Caesar dressing gains numeric metadata matching its already declared approximate 150 ml yield so the new Caesar salad can reference it.

## Completed steps

1. **Step 6 — Béchamel pilot:** Béchamel, Mornay, mustard béchamel and parsley sauce have finished yields, working parent/child navigation and calculated shopping quantities.
2. **Step 7 — Batch quality checks:** reviewed practical quantities, ingredient/method alignment, first-use ingredient order, yields, relevant timings and temperatures, and EN/PL/IS text. Added a content suite covering every addition at all four scales and the actual published recipe families.
3. **Step 8 — Foundations:** completed stocks, brown sauces, remaining béchamel derivatives, velouté, hollandaise, tomato, mayonnaise, butter/pan sauces and dips.
4. **Step 9 — Everyday meals:** completed breakfast, pasta, chicken and quick dinners.
5. **Step 10 — Wider meal collection:** completed meat, seafood, grains, vegetarian meals, sides, salads, soups and casseroles.

## Additions by file

| Batch | Recipes |
|---|---:|
| Foundation sauces, including the Béchamel pilot | 57 |
| Stocks and reductions | 10 |
| Dips and sweet sauces | 10 |
| Breakfast | 12 |
| Pasta and noodles | 14 |
| Chicken | 12 |
| Quick dinners | 11 |
| Beef, pork and sausage | 12 |
| Fish and seafood | 10 |
| Rice and grains | 10 |
| Vegetarian | 12 |
| Sides | 12 |
| Salads | 9 |
| Soups | 9 |
| Casseroles | 9 |
| **Total added** | **209** |

Repeated blueprint entries share one recipe ID and appear in the appropriate categories. For example, chicken noodle soup also appears under Soups, couscous salad under Salads, cottage pie under Casseroles & one-pot, and egg fried rice under Quick dinners. New soups remain distinct from the existing Polish versions. Tuna casserole uses potatoes; tuna pasta bake uses pasta. No existing recipes were removed.

## Yield and cooking review

There are 69 recipes with numeric finished yields and 109 recipes with foundation requirements. Foundation outputs affected by evaporation include final measuring, reducing or topping-up instructions. Measured portions of pesto, hummus and brown butter reserve any excess. Recipes with no downstream requirement can use servings instead. No mass-to-volume density conversion is assumed.

The review corrected a guacamole ingredient-order mismatch, distinguished separate flour uses in fish batter, made the pasta finishing ingredients explicit, and aligned casserole categories. Vegetarian-tagged cheese dishes specify vegetarian cheese where necessary. Cooking instructions include suitable doneness checks and storage directions where relevant.

These are content and calculation checks, not results from independent kitchen trials. Exact cooking time and yield can vary with equipment and ingredients. The existing Caesar dressing's declared yield remains approximate. The collection is not labelled kitchen-tested.

## Verification

- `npm test`: smoke, translation, shopping, family and content suites passed.
- All 461 recipes have complete PL/IS dictionary coverage; cooking numbers are preserved.
- All 209 additions render at ½×, 1×, 2× and 3× with scaled ingredients, foundations and yields. Large metric values use kg/L.
- Published Béchamel/Mornay navigation and shopping quantities pass. Demi-glace correctly combines the stock used directly and through Espagnole; marking stock already prepared removes its ingredients from both branches.
- Original recipe content was compared with the previous revision; only Caesar dressing yield metadata was added.
- App, service worker and HTML asset versions are aligned at 48. The local HTTP preview serves all 461 recipes from all 27 indexed files.
- `git diff --check` passed. Recipe data contains no web links.

Rendering checks use JSDOM. The local HTTP preview was verified, but this update did not receive an interactive browser visual review.

The [collection map](recipe-collection-map.md) records every covered blueprint entry and the remaining baking, pastry and dessert work. Those later phases are outside steps 6–10.
