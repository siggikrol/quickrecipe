/* Predefined ingredient profiles. Product-dependent possibilities are not confirmed declarations. */
const IngredientAllergens = (() => {
  const profiles = [
  {
    "contains": [],
    "possible": [],
    "productDependent": false,
    "ingredients": [
      "Active dry yeast",
      "Allspice berries",
      "Allspice berry",
      "Ancho chilli powder or mild chilli powder",
      "Apples, chopped",
      "Apples, peeled and sliced",
      "Arborio rice",
      "Aubergine, sliced",
      "Avocado flesh, diced",
      "Baby potatoes, halved",
      "Baby spinach",
      "Baker’s ammonia",
      "Baking soda",
      "Banana",
      "Bananas, sliced",
      "Basmati rice, rinsed",
      "Bay leaf",
      "Bay leaf, for soup",
      "Bay leaf, for stock",
      "Bay leaves",
      "Beansprouts",
      "Beef bone marrow, diced",
      "Beef bones, chopped",
      "Beef chuck, cubed",
      "Beef chuck, diced",
      "Beef mince",
      "Beef steak, thinly sliced",
      "Beef, optional",
      "Beets",
      "Bicarbonate of soda",
      "Black cherry jam",
      "Black pepper",
      "Black pepper, freshly ground",
      "Black peppercorns",
      "Blood orange juice",
      "Blood orange zest, finely grated",
      "Blueberries",
      "Blueberries — sauce",
      "Boiling water — gelatin",
      "Bone-in chicken",
      "Boneless chicken breast, thinly sliced",
      "Boneless chicken thighs, diced",
      "Brandy",
      "Brewed coffee",
      "Broccoli florets, chopped",
      "Broccoli, small florets",
      "Brown sugar",
      "Brown sugar for sauce",
      "Brown sugar — brownie",
      "Brown sugar — caramel",
      "Brown sugar — crumb",
      "Brown sugar — sauce",
      "Brown sugar — topping",
      "Brown sugar, measured by volume",
      "Button mushrooms, halved",
      "Canned chopped tomatoes",
      "Canned kidney beans, drained",
      "Capers, drained and chopped",
      "Caraway seeds",
      "Caraway seeds, optional",
      "Cardamom",
      "Carrot, diced",
      "Carrot, grated",
      "Carrots",
      "Carrots, sliced",
      "Caster sugar",
      "Caster sugar — curd",
      "Cauliflower, florets",
      "Cayenne pepper",
      "Cherries",
      "Chia seeds",
      "Chicken bones and wings",
      "Chicken breast fillets",
      "Chicken breast, diced",
      "Chicken thigh fillets, diced",
      "Chicken thighs, bone-in and skin-on",
      "Chilli flakes",
      "Chopped dates",
      "Cinnamon",
      "Cinnamon — crumb",
      "Cloves",
      "Coarse desiccated coconut, measured by volume",
      "Cocoa powder",
      "Cocoa powder for dusting",
      "Cocoa powder or crushed freeze-dried strawberries, for coating",
      "Cocoa powder — garnish",
      "Cocoa powder — pastry",
      "Cocoa powder, for coating",
      "Coconut cream",
      "Coconut flakes",
      "Coconut milk",
      "Coconut oil",
      "Coconut oil, optional",
      "Coffee beans — garnish",
      "Cold brewed coffee",
      "Cooked beetroot, diced",
      "Cooked black beans, drained",
      "Cooked chicken, chilled and sliced",
      "Cooked chickpeas, drained",
      "Cooked rice, promptly chilled and refrigerated",
      "Cooked white beans, drained",
      "Cornflour",
      "Cornflour for dusting",
      "Cornstarch",
      "Courgette, diced",
      "Cream of tartar",
      "Crushed freeze-dried raspberries, for topping",
      "Crushed freeze-dried strawberries, for topping",
      "Cucumber, diced",
      "Cucumber, grated",
      "Dark brown sugar",
      "Dark syrup",
      "Dates",
      "Decorating sugar or coconut",
      "Desiccated coconut",
      "Desiccated coconut for coating",
      "Desiccated coconut for filling",
      "Desiccated coconut — finish",
      "Dried chickpeas",
      "Dried marjoram",
      "Dried mushrooms",
      "Dried oregano",
      "Earl Grey tea bags",
      "Edible flowers (optional)",
      "Extra coconut or matcha, for coating",
      "Extra coconut, for coating",
      "Extra freeze-dried raspberries, crushed, for topping",
      "Extra raspberry powder, for topping",
      "Extra water, for soaking and cooking peas",
      "Extra-virgin olive oil",
      "Fine instant coffee powder",
      "Finely grated fresh ginger",
      "Flaky salt",
      "Flaky sea salt",
      "Flaky sea salt for topping",
      "Flaxseed (optional)",
      "Freeze-dried apple powder",
      "Freeze-dried banana powder",
      "Freeze-dried blueberry powder",
      "Freeze-dried mango powder",
      "Freeze-dried pineapple powder",
      "Freeze-dried raspberries, ground and sifted",
      "Freeze-dried raspberry powder",
      "Freeze-dried strawberries, finely ground",
      "Freeze-dried strawberry powder",
      "Fresh basil leaves",
      "Fresh berries — garnish",
      "Fresh blueberries",
      "Fresh blueberries — topping",
      "Fresh chanterelles or porcini",
      "Fresh chives, chopped",
      "Fresh coriander, chopped",
      "Fresh dill",
      "Fresh dill, chopped",
      "Fresh ginger, grated",
      "Fresh herbs and horseradish, optional",
      "Fresh mint (optional)",
      "Fresh mixed berries — garnish",
      "Fresh parsley",
      "Fresh parsley or chives",
      "Fresh parsley or dill",
      "Fresh parsley, chopped",
      "Fresh parsley, to garnish",
      "Fresh raspberries",
      "Fresh raspberries — garnish",
      "Fresh raspberries — mashed",
      "Fresh raspberries — puréed",
      "Fresh raspberries — topping",
      "Fresh shiso leaves, finely sliced",
      "Fresh strawberries",
      "Fresh strawberries — garnish",
      "Fresh strawberries — puréed",
      "Fresh strawberries — topping",
      "Fresh tarragon, chopped",
      "Fresh thyme",
      "Fresh tomato, diced",
      "Fresh yeast",
      "Frozen peas",
      "Frozen spinach, thawed",
      "Garlic clove",
      "Garlic cloves",
      "Garlic cloves, for stock",
      "Garlic cloves, minced",
      "Garlic cloves, peeled",
      "Garlic, minced",
      "Garlic, optional",
      "Gelatin leaves",
      "Gelatine powder",
      "Gherkins, finely chopped",
      "Golden syrup",
      "Golden syrup — bowl",
      "Granulated sugar",
      "Grated carrot",
      "Green beans, trimmed",
      "Green lentils, rinsed",
      "Green peppercorns in brine, drained",
      "Ground allspice",
      "Ground cardamom",
      "Ground cinnamon",
      "Ground cinnamon for dusting",
      "Ground cloves",
      "Ground coriander",
      "Ground cumin",
      "Ground ginger",
      "Ground nutmeg",
      "Ground turmeric",
      "Ground white pepper",
      "Honey",
      "Horseradish, optional",
      "Hot brewed coffee",
      "Hot coffee",
      "Hot strong coffee — gelatin",
      "Instant coffee powder",
      "Instant dry yeast",
      "Instant espresso powder",
      "Instant yeast",
      "Jalapeño, finely chopped",
      "Jam",
      "Ketchup",
      "Kirsch, optional",
      "Lamb mince",
      "Lard",
      "Large carrot",
      "Large carrots",
      "Large onion",
      "Large onions",
      "Large potatoes",
      "Large white onion, for stock",
      "Leek",
      "Leek, sliced and washed",
      "Leek, white part, optional",
      "Lemon extract",
      "Lemon juice",
      "Lemon juice — curd",
      "Lemon slices — garnish",
      "Lemon zest",
      "Lemon zest for topping (optional)",
      "Lemon zest, finely grated",
      "Lemon, halved",
      "Lemongrass stalks, bruised",
      "Lettuce, shredded",
      "Lime juice",
      "Lime zest",
      "Long-grain rice, rinsed",
      "Lukewarm water",
      "Maple syrup",
      "Matcha powder",
      "Medium carrots",
      "Medium fermented dill pickles",
      "Medium onion",
      "Medium onion, chopped",
      "Medium potatoes",
      "Mild honey",
      "Mirin",
      "Mixed berries",
      "Mixed fresh berries — topping",
      "Mixed frozen berries",
      "Mixed salad leaves, washed",
      "Mushroom soaking liquid, strained",
      "Mushrooms",
      "Mushrooms, rehydrated and chopped",
      "Mushrooms, sliced",
      "Neutral oil",
      "Nutmeg",
      "Oil",
      "Olive oil",
      "Olive oil (optional)",
      "Onion",
      "Onion, finely chopped",
      "Onion, thinly sliced",
      "Onions",
      "Onions, thickly sliced",
      "Onions, thinly sliced",
      "Orange or lemon juice",
      "Orange zest",
      "Orange — juice and zest",
      "Orange, zest only",
      "Paprika",
      "Parsley and black pepper, to serve",
      "Parsley root",
      "Parsley sprigs",
      "Parsnip",
      "Parsnip, optional",
      "Parsnips",
      "Passion fruit",
      "Passion fruit purée",
      "Peppercorns",
      "Peppercorns, for soup",
      "Peppercorns, for stock",
      "Peppermint extract",
      "Peppermint stevia drops (optional)",
      "Pickle brine, plus extra to taste",
      "Pine nuts",
      "Pink grapefruit zest",
      "Pitted black olives, sliced",
      "Pitted dates, chopped",
      "Poppy seeds",
      "Poppy seeds for topping",
      "Pork loin cutlets",
      "Pork mince",
      "Pork ribs",
      "Pork ribs or chicken pieces",
      "Pork shoulder, boneless",
      "Pork tenderloin",
      "Potato starch",
      "Potatoes",
      "Potatoes, diced",
      "Potatoes, peeled",
      "Pumpkin seeds",
      "Pumpkin, peeled and diced",
      "Rapeseed or canola oil for hands and tin",
      "Raspberries",
      "Raspberries and blackberries",
      "Raspberries and redcurrants",
      "Raspberries — puréed",
      "Raspberries, mashed",
      "Raspberries, redcurrants or pomegranate seeds",
      "Red chilli, sliced",
      "Red lentils, rinsed",
      "Red onion, finely chopped",
      "Red onion, thinly sliced",
      "Red pepper, diced",
      "Red peppers, halved and deseeded",
      "Redcurrants",
      "Rice noodles",
      "Ripe avocado flesh",
      "Ripe banana, mashed",
      "Roasting juices, defatted",
      "Roasting juices, defatted (optional)",
      "Romaine lettuce, washed and dried",
      "Rose water, or to taste",
      "Russet potatoes",
      "Russet potatoes, peeled",
      "Saffron threads",
      "Salt",
      "Salt and black pepper",
      "Salt and pepper",
      "Salt and pepper, for topping",
      "Salt for filling, to taste",
      "Salt — base",
      "Salt — meringue",
      "Salt — pastry",
      "Salt, for boiling water",
      "Salt, for dough",
      "Salt, for stock",
      "Sauerkraut",
      "Sauerkraut, rinsed and drained",
      "Sea salt",
      "Sea salt flakes",
      "Sea salt for topping",
      "Shallot, finely chopped",
      "Short-grain rice",
      "Small leek",
      "Small rosemary sprig",
      "Small shallots, peeled",
      "Small tarragon sprigs",
      "Split peas",
      "Spring onions, sliced",
      "Sriracha",
      "Strawberries",
      "Strawberries — puréed",
      "Strawberries, mashed",
      "Strawberries, puréed",
      "Strawberries, raspberries and blackberries",
      "Strawberries, sliced",
      "Strong coffee",
      "Strong coffee, cooled",
      "Strong espresso",
      "Strong espresso, cooled",
      "Sugar",
      "Sugar for topping",
      "Sugar — base",
      "Sugar — berry sauce",
      "Sugar — crumble",
      "Sugar — crust",
      "Sugar — curd",
      "Sugar — dough",
      "Sugar — filling",
      "Sugar — glaze",
      "Sugar — meringue",
      "Sugar — pastry",
      "Sugar — sauce",
      "Sugar, for filling",
      "Sugar, for yeast",
      "Sugar, measured by volume",
      "Sukrin Melis powdered sweetener",
      "Sunflower oil",
      "Sunflower seeds (optional)",
      "Sweet potato, diced",
      "Sweetcorn cobs, husked",
      "Sweetcorn, drained",
      "Syrup",
      "Tamarind paste",
      "Tomato ketchup",
      "Tomato paste",
      "Tomatoes, chopped",
      "Vanilla bean paste",
      "Vanilla extract",
      "Vanilla extract — brownie",
      "Vanilla extract — filling",
      "Vanilla extract — meringue",
      "Vanilla extract — pastry",
      "Vanilla pod seeds",
      "Vanilla pod, seeds",
      "Vanilla sugar",
      "Veal bones, chopped",
      "Vegetable oil",
      "Vegetable oil, for dough",
      "Vegetable oil, for frying",
      "Vegetable oil, for onions",
      "Vodka",
      "Vodka, optional",
      "Warm water",
      "Water",
      "Water and salt, for boiling potatoes",
      "Water for adjusting yield",
      "Water — gelatin",
      "Water, for boiling",
      "Water, for broth",
      "Water, for glaze",
      "Water, for sausage",
      "Water, for steamer",
      "Water, for stock",
      "Water, just enough to cover the dates",
      "Water, plus extra as needed",
      "Water, to cover potatoes",
      "White cabbage, finely shredded",
      "White onion",
      "White sugar",
      "Whole chicken",
      "Whole chicken or bone-in pieces",
      "Yuzu juice or yuzu purée"
    ]
  },
  {
    "contains": [
      "gluten"
    ],
    "possible": [],
    "productDependent": false,
    "ingredients": [
      "Active rye sourdough starter",
      "Active sourdough starter",
      "Active starter",
      "Baguette, sliced",
      "Barley",
      "Beer, chilled",
      "Biscoff spread",
      "Biscoff spread — topping",
      "Bread flour",
      "Bread, thickly sliced",
      "Breadcrumbs",
      "Burger buns",
      "Couscous",
      "Croutons",
      "Dried lasagne sheets",
      "Dried macaroni",
      "Dried short pasta",
      "English muffins",
      "Extra flour for light dough",
      "Fettuccine",
      "Fine oats",
      "Flour",
      "Flour for dough",
      "Flour tortillas",
      "Flour — crumb",
      "Loaf of bread",
      "Long baguette",
      "Macaroni",
      "Oats",
      "Pearl barley",
      "Penne",
      "Plain flour",
      "Plain flour for batter",
      "Plain flour for dusting",
      "Plain flour — brownie",
      "Plain flour — crumble",
      "Plain flour — pastry",
      "Plain flour, for dough",
      "Plain flour, for yeast mixture",
      "Plain flour, including yeast mixture",
      "Plain flour, plus extra for dusting",
      "Prepared fermented rye soup starter",
      "Pretzels",
      "Rolled oats",
      "Rye",
      "Rye bread, to serve",
      "Rye flour",
      "Rye sourdough starter",
      "Sourdough bread, to serve",
      "Spaghetti",
      "Spelt flour (type 650)",
      "Wheat flour",
      "White bread, cubed",
      "Whole rye flour",
      "Whole wheat flour",
      "Wholegrain rye flour (type 2000)"
    ]
  },
  {
    "contains": [
      "gluten",
      "nuts"
    ],
    "possible": [
      "eggs",
      "milk",
      "soybeans"
    ],
    "productDependent": true,
    "ingredients": [
      "Almond and lemon biscuits",
      "Hazelnut wafer chocolates"
    ]
  },
  {
    "contains": [],
    "possible": [
      "nuts"
    ],
    "productDependent": true,
    "ingredients": [
      "Almond extract",
      "Cocoa powder or extra chopped hazelnuts, for coating",
      "Extra coconut or cashews, for coating"
    ]
  },
  {
    "contains": [
      "nuts"
    ],
    "possible": [],
    "productDependent": false,
    "ingredients": [
      "Almond flour",
      "Almonds",
      "Blanched almonds",
      "Cashews",
      "Cocoa powder and finely chopped pistachios, for coating",
      "Extra chopped hazelnuts, for coating",
      "Extra hazelnuts",
      "Finely chopped pistachios, for topping",
      "Finely chopped toasted almonds",
      "Finely ground hazelnuts",
      "Flaked almonds",
      "Flaked almonds — garnish",
      "Ground almonds",
      "Ground hazelnuts",
      "Hazelnuts",
      "Hazelnuts, roughly chopped",
      "Mixed nuts, chopped",
      "Mixed roasted nuts, chopped",
      "Pecan halves",
      "Pecans",
      "Pecans, chopped",
      "Pistachios",
      "Roasted cashews, finely ground",
      "Roasted hazelnuts, finely chopped",
      "Walnuts",
      "Walnuts, roughly chopped",
      "Whole blanched almonds",
      "Whole hazelnuts"
    ]
  },
  {
    "contains": [
      "fish"
    ],
    "possible": [],
    "productDependent": false,
    "ingredients": [
      "Anchovy fillets",
      "Anchovy fillets, chopped",
      "Canned tuna, drained",
      "Cod fillets",
      "Fish sauce",
      "Salmon fillets",
      "Tinned tuna, drained",
      "White fish bones, rinsed",
      "White fish fillets"
    ]
  },
  {
    "contains": [],
    "possible": [
      "sulphites"
    ],
    "productDependent": true,
    "ingredients": [
      "Apple cider vinegar",
      "Balsamic vinegar",
      "Candied cherries (optional)",
      "Candied citrus peel (optional)",
      "Candied orange peel",
      "Cocoa powder or finely chopped candied ginger, for coating",
      "Dried apricots",
      "Dried apricots, very finely chopped",
      "Dried cranberries",
      "Dried cranberries or figs",
      "Dry red wine",
      "Dry white wine",
      "Extra dried cherry, finely chopped",
      "Finely chopped dried cherries",
      "Freeze-dried cherry powder",
      "Good balsamic vinegar",
      "Lemon juice or white vinegar",
      "Madeira wine",
      "Raisins",
      "Red wine vinegar",
      "Rice vinegar",
      "Rum raisins",
      "Sultanas",
      "White vinegar",
      "White wine vinegar"
    ]
  },
  {
    "contains": [],
    "possible": [
      "gluten",
      "milk",
      "mustard",
      "soybeans",
      "sulphites"
    ],
    "productDependent": true,
    "ingredients": [
      "Bacon, diced",
      "Chorizo, diced",
      "Cooked bacon, crumbled",
      "Cooked ham, sliced",
      "Cooked sausages, sliced",
      "Guanciale, diced",
      "Pepperoni slices",
      "Pork sausages",
      "Raw pork sausages",
      "Raw white sausage",
      "Smoked bacon",
      "Smoked bacon or smoked pork ribs",
      "Smoked bacon pieces, optional",
      "Smoked sausage",
      "White sausage"
    ]
  },
  {
    "contains": [],
    "possible": [
      "gluten"
    ],
    "productDependent": true,
    "ingredients": [
      "Baking powder",
      "Baking powder — pastry",
      "Plain flour, optional"
    ]
  },
  {
    "contains": [
      "gluten"
    ],
    "possible": [
      "eggs",
      "milk",
      "soybeans"
    ],
    "productDependent": true,
    "ingredients": [
      "Biscuit crumbs for topping",
      "Chocolate cream biscuits / Oreo",
      "Chocolate sandwich cookies",
      "Chocolate sandwich-cookie crumbs",
      "Cinnamon biscuits",
      "Cinnamon biscuits or digestive biscuits",
      "Cream-filled wafer biscuits",
      "Crushed Biscoff biscuits, for topping",
      "Digestive biscuits",
      "Digestive oat biscuits",
      "Extra wafer biscuits",
      "Finely crushed digestive biscuits",
      "Finely crushed digestive biscuits, for coating",
      "Homeblest biscuits / digestive",
      "Katla oatmeal cookie dough (600 ml rolls)",
      "Ladyfinger biscuits",
      "Ladyfinger biscuits, finely ground",
      "Lotus Biscoff biscuits",
      "Lu Bastogne Duo biscuits",
      "Lu Bastogne biscuits",
      "Lu Bastogne biscuits — crushed",
      "Lu Bastogne cinnamon biscuits",
      "Lu Digestive biscuits — crushed",
      "McVities oat biscuits",
      "Oat biscuits",
      "Oreo biscuits",
      "Oreo biscuits — base",
      "Oreo biscuits — crushed",
      "Oreo biscuits — filling, roughly crushed",
      "Oreo biscuits — topping",
      "Oreo cookies",
      "Potato gnocchi",
      "Prince Polo chocolate wafers",
      "Puff pastry, thawed",
      "Spiced cream biscuits (Jóla kremkex)"
    ]
  },
  {
    "contains": [
      "sesame"
    ],
    "possible": [],
    "productDependent": false,
    "ingredients": [
      "Black sesame paste",
      "Sesame",
      "Sesame and poppy seeds",
      "Sesame oil",
      "Sesame seeds",
      "Tahini",
      "Toasted black sesame seeds",
      "Toasted black sesame seeds, for topping",
      "Toasted sesame seeds"
    ]
  },
  {
    "contains": [
      "milk"
    ],
    "possible": [],
    "productDependent": false,
    "ingredients": [
      "Blue cheese, crumbled",
      "Blueberry and strawberry skyr",
      "Butter",
      "Butter for greasing",
      "Butter for greasing and serving",
      "Butter for laminating",
      "Butter for sauce",
      "Butter — base",
      "Butter — bowl",
      "Butter — brownie",
      "Butter — caramel",
      "Butter — cream",
      "Butter — crumb",
      "Butter — crumble",
      "Butter — crust",
      "Butter — curd",
      "Butter — dough",
      "Butter — filling",
      "Butter — frosting",
      "Butter — sauce",
      "Butter — topping",
      "Butter, melted",
      "Butter, softened",
      "Buttermilk",
      "Cheddar, grated",
      "Clarified butter",
      "Cold butter",
      "Cold butter — pastry",
      "Cream",
      "Cream cheese",
      "Cream cheese, softened",
      "Cream — sauce",
      "Crème fraîche",
      "Cultured sour milk",
      "Double cream",
      "Double cream for filling",
      "Double cream for sauce",
      "Double cream — caramel",
      "Double cream — chocolate",
      "Double cream — ganache",
      "Double cream — lightly whipped",
      "Double cream — topping",
      "Dulce de leche",
      "Feta, crumbled",
      "Fresh mozzarella, sliced",
      "Full-fat cream cheese",
      "Ghee butter — base",
      "Gouda cheese",
      "Grated Cheddar",
      "Greek yoghurt",
      "Gruyère, grated",
      "Heavy cream",
      "Heavy cream — topping",
      "KEA berry skyr",
      "KEA blueberry and strawberry skyr",
      "KEA vanilla skyr",
      "Mascarpone",
      "Melted butter",
      "Milk",
      "Milk — frosting",
      "Milk — gelatin",
      "Milk — topping",
      "Milk, for glaze",
      "Mozzarella, grated",
      "Parmesan",
      "Parmesan, grated",
      "Pecorino Romano, grated",
      "Philadelphia cream cheese",
      "Plain natural yogurt",
      "Plain skyr",
      "Ricotta",
      "Soft butter — dough",
      "Soft unsalted butter",
      "Sour cream",
      "Sour cream — pastry",
      "Sweetened condensed milk",
      "Twaróg curd cheese",
      "Unsalted butter",
      "Vanilla skyr",
      "Vegetarian cheddar, grated",
      "Vegetarian feta, crumbled",
      "Vegetarian hard cheese, grated",
      "Vegetarian mozzarella, grated",
      "Warm milk, for dough",
      "Warm milk, for yeast mixture",
      "Warm milk, including yeast mixture",
      "Whipped cream",
      "Whipped cream for serving",
      "Whipping cream",
      "Whipping cream for covering the meringue",
      "Whipping cream for filling",
      "Whipping cream for garnish",
      "Whole milk",
      "Ísey blueberry and raspberry skyr"
    ]
  },
  {
    "contains": [
      "gluten"
    ],
    "possible": [
      "celery",
      "milk",
      "soybeans"
    ],
    "productDependent": true,
    "ingredients": [
      "Bottled fermented white borscht soup base"
    ]
  },
  {
    "contains": [],
    "possible": [
      "celery",
      "gluten",
      "milk",
      "soybeans"
    ],
    "productDependent": true,
    "ingredients": [
      "Broth",
      "Chicken or beef broth"
    ]
  },
  {
    "contains": [],
    "possible": [
      "milk"
    ],
    "productDependent": true,
    "ingredients": [
      "Butter or oil, for pan",
      "Sour cream, optional"
    ]
  },
  {
    "contains": [
      "milk"
    ],
    "possible": [],
    "productDependent": true,
    "ingredients": [
      "Buttermilk or kefir",
      "Farmer cheese or well-drained ricotta"
    ]
  },
  {
    "contains": [],
    "possible": [
      "eggs",
      "gluten",
      "milk",
      "soybeans"
    ],
    "productDependent": true,
    "ingredients": [
      "Candies, macarons or meringue decorations",
      "Candy canes",
      "Caramel chocolate chips",
      "Caramel chocolate drops",
      "Chocolate muesli",
      "Chocolate muesli granola",
      "Chocolate toffee candies",
      "Chocolate-coated cereal pieces",
      "Chocolate-coated cereal with caramel crunch and sea salt",
      "Chocolate-coated chewy caramel cereal clusters",
      "Chocolate-coated licorice pieces",
      "Chocolate-coated liquorice balls",
      "Chocolate-coated soft caramels",
      "Chocolate-covered liquorice fudge",
      "Chocolate-covered liquorice fudge, chopped",
      "Chocolate-filled peppermint hard candies",
      "Chocolate-liquorice chewy candies",
      "Coffee-flavoured liquorice candies for topping",
      "Colored candy melts",
      "Crisp rice cereal",
      "Crushed Tyrkisk Peber candies",
      "Crushed peppermint candy",
      "Dark chocolate with caramel pieces and sea salt, chopped",
      "Dark chocolate with caramel pieces and sea salt, melted",
      "Dumle Original caramels",
      "Dumle Polka caramels",
      "Dumle Polka peppermint caramels",
      "Eitt Sett chocolate licorice pieces",
      "Food colouring (optional)",
      "Green food colouring (optional)",
      "Icing sugar",
      "Icing sugar for dusting",
      "Icing sugar for dusting (optional)",
      "Icing sugar — cake",
      "Icing sugar — cream",
      "Icing sugar — meringue",
      "Icing sugar, for cake",
      "Icing sugar, for dusting",
      "Icing sugar, for glaze",
      "Icing sugar, to taste",
      "Licorice pieces",
      "Liquorice caramel balls — chopped",
      "Macarons (optional)",
      "Marshmallows",
      "Mini chocolate-coated marshmallow treats",
      "Mini marshmallows",
      "Nóa Síríus light caramels",
      "Panda liquorice caramel balls — chopped",
      "Pepper-filled licorice pieces",
      "Polly Original candies",
      "Ready-made white icing",
      "Red food coloring",
      "Red food colouring (optional)",
      "Rice Krispies",
      "Salted caramel Panda candies",
      "Salted caramel ice cream (optional)",
      "Salty liquorice candy powder",
      "Salty liquorice candy powder for dusting",
      "Smarties or M&M candies",
      "Soft caramels",
      "Sprinkles",
      "Sprinkles (optional)",
      "Strawberry Panda candies",
      "Sugar-coated chocolate liquorice balls",
      "Síríus caramel pieces",
      "Thick caramel",
      "Thick caramel sauce",
      "Thick dulce de leche or caramel",
      "Toffee pieces",
      "Vanilla custard powder",
      "Werther’s Salted Caramel Cream caramels"
    ]
  },
  {
    "contains": [
      "milk"
    ],
    "possible": [
      "eggs",
      "gluten",
      "soybeans"
    ],
    "productDependent": true,
    "ingredients": [
      "Caramel-filled milk chocolates, halved",
      "Cream toffee candies",
      "Milk chocolate with liquorice pieces, chopped",
      "Milk-chocolate-coated soft caramels",
      "Milk-chocolate-coated soft caramels, chopped",
      "Soft-caramel-filled milk chocolate, chopped"
    ]
  },
  {
    "contains": [
      "celery"
    ],
    "possible": [],
    "productDependent": false,
    "ingredients": [
      "Celeriac",
      "Celery root, piece",
      "Celery stalk",
      "Celery stalks",
      "Celery, diced",
      "Large celery root"
    ]
  },
  {
    "contains": [],
    "possible": [
      "celery"
    ],
    "productDependent": true,
    "ingredients": [
      "Celery stalk, optional"
    ]
  },
  {
    "contains": [],
    "possible": [
      "milk",
      "soybeans"
    ],
    "productDependent": true,
    "ingredients": [
      "Chocolate",
      "Chocolate chips",
      "Chocolate chips for topping",
      "Chocolate coating",
      "Chocolate decorations",
      "Chocolate drops",
      "Chocolate for dipping (optional)",
      "Chocolate kisses, one per cookie",
      "Chocolate shavings",
      "Chocolate, melted",
      "Dark baking chocolate",
      "Dark chocolate",
      "Dark chocolate (56%)",
      "Dark chocolate chips",
      "Dark chocolate chips, finely chopped",
      "Dark chocolate for coating",
      "Dark chocolate — bowl",
      "Dark chocolate — brownie",
      "Dark chocolate — chopped",
      "Dark chocolate — garnish",
      "Dark chocolate — melted",
      "Dark chocolate — topping",
      "Dark chocolate, chopped",
      "Dark chocolate, grated",
      "Dark chocolate, melted",
      "Dark chocolate, melted and cooled",
      "Dark or milk chocolate",
      "Extra chocolate chips",
      "Extra chocolate chips and M&M eggs",
      "M&M chocolate eggs",
      "Marabou Black Saltlakrits chocolate",
      "Mars bars",
      "Mini chocolate eggs",
      "Mint-filled chocolate thins (optional)",
      "Mint-filled dark chocolates for decoration",
      "Mint-filled dark chocolates, chopped",
      "Nóakropp chocolate pebbles — base",
      "Nóakropp chocolate pebbles — topping",
      "Rolo chocolates",
      "Rolo chocolates — halved",
      "Sugar-free chocolate",
      "Sweetened chocolate drink powder"
    ]
  },
  {
    "contains": [],
    "possible": [
      "eggs",
      "gluten",
      "milk",
      "nuts",
      "soybeans"
    ],
    "productDependent": true,
    "ingredients": [
      "Chocolate caramel nougat bars",
      "Chocolate caramel nougat bars, chopped"
    ]
  },
  {
    "contains": [
      "nuts"
    ],
    "possible": [
      "milk",
      "soybeans"
    ],
    "productDependent": true,
    "ingredients": [
      "Chocolate hazelnut spread",
      "Dark chocolate with hazelnuts and currants"
    ]
  },
  {
    "contains": [
      "nuts"
    ],
    "possible": [
      "eggs",
      "gluten",
      "milk",
      "soybeans"
    ],
    "productDependent": true,
    "ingredients": [
      "Chocolate-coated almond toffee, chopped",
      "Chocolate-coated caramel almonds with sea salt",
      "Hazelnut caramel chocolates, chopped",
      "Hazelnut caramel chocolates, chopped for topping",
      "Whole hazelnut caramel chocolates"
    ]
  },
  {
    "contains": [
      "gluten"
    ],
    "possible": [
      "milk",
      "soybeans"
    ],
    "productDependent": true,
    "ingredients": [
      "Chocolate-coated malt balls",
      "Extra Polly, cranberries, pretzels and coconut"
    ]
  },
  {
    "contains": [],
    "possible": [
      "eggs",
      "gluten"
    ],
    "productDependent": true,
    "ingredients": [
      "Cooked egg noodles or rice"
    ]
  },
  {
    "contains": [],
    "possible": [
      "gluten",
      "milk",
      "soybeans"
    ],
    "productDependent": true,
    "ingredients": [
      "Cooking oil spray",
      "Crispy fried onions, optional"
    ]
  },
  {
    "contains": [
      "crustaceans"
    ],
    "possible": [],
    "productDependent": false,
    "ingredients": [
      "Crab",
      "Lobster",
      "Prawns",
      "Raw prawns, peeled and deveined"
    ]
  },
  {
    "contains": [
      "peanuts"
    ],
    "possible": [],
    "productDependent": false,
    "ingredients": [
      "Crunchy peanut butter",
      "Peanut butter",
      "Peanuts",
      "Roasted peanuts, chopped",
      "Roasted unsalted peanuts",
      "Salted peanuts",
      "Smooth peanut butter"
    ]
  },
  {
    "contains": [],
    "possible": [
      "mustard",
      "sesame"
    ],
    "productDependent": true,
    "ingredients": [
      "Curry powder",
      "Garam masala",
      "Shichimi togarashi",
      "Shichimi togarashi for topping"
    ]
  },
  {
    "contains": [],
    "possible": [
      "eggs",
      "milk",
      "nuts",
      "soybeans"
    ],
    "productDependent": true,
    "ingredients": [
      "Daim chocolate balls",
      "Daim — roughly crushed",
      "Ferrero Rocher chocolates",
      "Marabou Daim bites — roughly chopped",
      "Marabou Daim pieces",
      "Marabou Daim pieces for topping",
      "Milka Daim chocolate",
      "Nutella",
      "Toblerone — melted"
    ]
  },
  {
    "contains": [
      "mustard"
    ],
    "possible": [],
    "productDependent": false,
    "ingredients": [
      "Dijon mustard"
    ]
  },
  {
    "contains": [
      "eggs"
    ],
    "possible": [],
    "productDependent": false,
    "ingredients": [
      "Egg",
      "Egg for layering and brushing",
      "Egg white",
      "Egg white for brushing",
      "Egg white for icing",
      "Egg whites",
      "Egg whites — filling",
      "Egg whites — meringue",
      "Egg whites, weighed",
      "Egg yolk",
      "Egg yolk — pastry",
      "Egg yolk, for glaze",
      "Egg yolks",
      "Egg yolks — curd",
      "Egg yolks — filling",
      "Egg yolks, weighed",
      "Egg — brownie",
      "Egg — curd",
      "Egg, beaten",
      "Egg, for glaze",
      "Eggs",
      "Eggs, beaten and weighed without shells",
      "Hard-boiled eggs",
      "Hard-boiled eggs, peeled",
      "Large egg",
      "Large egg yolks",
      "Large eggs, separated",
      "Mayonnaise",
      "Medium egg yolks",
      "Pasteurised egg yolks",
      "Pasteurised eggs in shell",
      "Pasteurised eggs, beaten",
      "Pasteurized egg yolks"
    ]
  },
  {
    "contains": [
      "eggs",
      "gluten"
    ],
    "possible": [],
    "productDependent": false,
    "ingredients": [
      "Egg noodles",
      "Hard-boiled eggs and bread, to serve"
    ]
  },
  {
    "contains": [],
    "possible": [
      "eggs",
      "milk"
    ],
    "productDependent": true,
    "ingredients": [
      "Egg or milk for brushing"
    ]
  },
  {
    "contains": [],
    "possible": [
      "milk",
      "nuts",
      "soybeans"
    ],
    "productDependent": true,
    "ingredients": [
      "Extra chocolate hazelnut spread (optional)"
    ]
  },
  {
    "contains": [
      "milk"
    ],
    "possible": [
      "soybeans"
    ],
    "productDependent": true,
    "ingredients": [
      "Extra dark, milk and white chocolate chips",
      "Milk chocolate",
      "Milk chocolate chips",
      "Milk chocolate for coating",
      "White chocolate",
      "White chocolate chips",
      "White chocolate for coating",
      "White chocolate — garnish",
      "White chocolate, chopped",
      "White chocolate, finely chopped",
      "Ísey chocolate vanilla skyr",
      "Ísey strawberry & white chocolate skyr"
    ]
  },
  {
    "contains": [
      "nuts"
    ],
    "possible": [
      "eggs",
      "milk",
      "soybeans"
    ],
    "productDependent": true,
    "ingredients": [
      "Extra honey-almond nougat chocolate",
      "Odense soft hazelnut nougat",
      "Soft hazelnut praline nougat"
    ]
  },
  {
    "contains": [
      "gluten"
    ],
    "possible": [],
    "productDependent": true,
    "ingredients": [
      "Flour or semolina for dusting"
    ]
  },
  {
    "contains": [
      "milk",
      "nuts"
    ],
    "possible": [
      "eggs",
      "soybeans"
    ],
    "productDependent": true,
    "ingredients": [
      "Honey-almond nougat milk chocolate",
      "Honey-almond nougat milk chocolate, chopped"
    ]
  },
  {
    "contains": [
      "eggs",
      "milk"
    ],
    "possible": [],
    "productDependent": false,
    "ingredients": [
      "Lemon curd",
      "Lemon curd — topping"
    ]
  },
  {
    "contains": [
      "gluten",
      "soybeans"
    ],
    "possible": [],
    "productDependent": false,
    "ingredients": [
      "Light soy sauce",
      "Soy sauce"
    ]
  },
  {
    "contains": [
      "lupin"
    ],
    "possible": [],
    "productDependent": false,
    "ingredients": [
      "Lupin flour"
    ]
  },
  {
    "contains": [
      "nuts"
    ],
    "possible": [
      "eggs"
    ],
    "productDependent": true,
    "ingredients": [
      "Marzipan",
      "Odense Kransekage ready-to-pipe marzipan",
      "Odense baking marzipan (pink pack)"
    ]
  },
  {
    "contains": [
      "milk",
      "nuts"
    ],
    "possible": [
      "eggs",
      "gluten",
      "soybeans"
    ],
    "productDependent": true,
    "ingredients": [
      "Milk chocolate with almond toffee pieces"
    ]
  },
  {
    "contains": [
      "molluscs"
    ],
    "possible": [],
    "productDependent": false,
    "ingredients": [
      "Mussels",
      "Oysters",
      "Scallops",
      "Squid"
    ]
  },
  {
    "contains": [
      "peanuts"
    ],
    "possible": [
      "eggs",
      "gluten",
      "milk",
      "soybeans"
    ],
    "productDependent": true,
    "ingredients": [
      "Peanut caramel chocolate bars",
      "Peanut caramel chocolate bars, chopped"
    ]
  },
  {
    "contains": [
      "nuts"
    ],
    "possible": [
      "gluten",
      "milk",
      "soybeans"
    ],
    "productDependent": true,
    "ingredients": [
      "Pistachio cream",
      "Pistachio cream spread"
    ]
  },
  {
    "contains": [],
    "possible": [
      "sesame"
    ],
    "productDependent": true,
    "ingredients": [
      "Sesame or poppy seeds, optional",
      "Sesame seeds, optional"
    ]
  },
  {
    "contains": [
      "soybeans"
    ],
    "possible": [],
    "productDependent": false,
    "ingredients": [
      "Soybeans",
      "Tofu"
    ]
  },
  {
    "contains": [
      "milk"
    ],
    "possible": [
      "eggs"
    ],
    "productDependent": true,
    "ingredients": [
      "Vanilla ice cream"
    ]
  },
  {
    "contains": [
      "milk"
    ],
    "possible": [
      "eggs",
      "nuts",
      "soybeans"
    ],
    "productDependent": true,
    "ingredients": [
      "White Toblerone — melted"
    ]
  },
  {
    "contains": [],
    "possible": [
      "fish",
      "gluten",
      "soybeans"
    ],
    "productDependent": true,
    "ingredients": [
      "Worcestershire sauce"
    ]
  }
];
  const normalize = name => String(name).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  const entries = new Map();
  for (const profile of profiles) for (const name of profile.ingredients) entries.set(normalize(name), profile);
  function lookup(name) {
    const profile = entries.get(normalize(name));
    return profile ? { allergens: [...profile.contains], possible: [...profile.possible], productDependent: profile.productDependent, known: true }
      : { allergens: [], possible: [], productDependent: true, known: false };
  }
  return { lookup, profiles };
})();
if (typeof module !== 'undefined') module.exports = IngredientAllergens;
