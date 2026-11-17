import type { Flag } from "../vocab.js";

/**
 * Rules that turn a normalized ingredient name ("ground beef", "soy sauce") into
 * restriction flags and a coarse category. Food.com ingredient names are already
 * stripped of quantities, so keyword rules with explicit exceptions are more
 * reliable than fuzzy matching to a nutrient database for this job.
 *
 * When a name is ambiguous ("sausage", "margarine"), the common case is flagged.
 * The UI always tells users to check labels.
 */

export type Category =
  | "meat" | "poultry" | "seafood" | "cheese" | "milk" | "butter" | "egg" | "produce" | "grain"
  | "legume" | "nut" | "oil" | "spice" | "condiment" | "sweetener" | "alcohol" | "baking" | "other";

/** Category defaults: rough USD per 100 g, storage days, grams used in a typical 4-serving recipe. */
export const CATEGORY_DEFAULTS: Record<Category, { price: number; shelfDays: number; grams: number }> = {
  meat: { price: 1.3, shelfDays: 3, grams: 450 },
  poultry: { price: 0.9, shelfDays: 2, grams: 450 },
  seafood: { price: 2.0, shelfDays: 2, grams: 400 },
  cheese: { price: 1.2, shelfDays: 30, grams: 100 },
  milk: { price: 0.12, shelfDays: 7, grams: 240 },
  butter: { price: 1.0, shelfDays: 60, grams: 30 },
  egg: { price: 0.6, shelfDays: 21, grams: 100 },
  produce: { price: 0.45, shelfDays: 7, grams: 150 },
  grain: { price: 0.3, shelfDays: 180, grams: 200 },
  legume: { price: 0.35, shelfDays: 365, grams: 250 },
  nut: { price: 1.5, shelfDays: 180, grams: 50 },
  oil: { price: 0.6, shelfDays: 365, grams: 15 },
  spice: { price: 4.0, shelfDays: 730, grams: 3 },
  condiment: { price: 0.6, shelfDays: 180, grams: 30 },
  sweetener: { price: 0.4, shelfDays: 365, grams: 50 },
  alcohol: { price: 1.2, shelfDays: 730, grams: 60 },
  baking: { price: 0.5, shelfDays: 365, grams: 8 },
  other: { price: 0.5, shelfDays: 30, grams: 50 },
};

/** Names that are not shopping items. */
const SKIP = /^(water|ice|ice cubes?|boiling water|cold water|warm water|hot water|lukewarm water|ice water|cooking spray|nonstick cooking spray)$/;

const w = (words: string) => new RegExp(`\\b(?:${words})\\b`);

/** Flags accumulate from every matching rule. `unless` vetoes a rule for known false positives. */
const FLAG_RULES: { re: RegExp; unless?: RegExp; flags: Flag[] }[] = [
  { re: w("beef|ground round|ground chuck|chuck roast|brisket|sirloin|veal|hamburger|corned beef|oxtail|beef bouillon"), unless: w("hamburger buns?|beefsteak tomato(?:es)?"), flags: ["meat", "beef"] },
  { re: w("steaks?|flank|rib ?eye|t-bone|filet mignon"), unless: w("salmon|tuna|swordfish|halibut|cod|fish|tofu|cauliflower|mushrooms?|portobello|beefsteak"), flags: ["meat", "beef"] },
  { re: w("pork|bacon|ham|hams|prosciutto|pancetta|chorizo|pepperoni|salami|lard|spareribs|pork rinds|kielbasa|bratwurst|hot dogs?|frankfurters?|sausages?"), unless: w("turkey bacon|turkey sausages?|chicken sausages?|turkey ham|hot dog buns?|vegetarian|veggie|soy"), flags: ["meat", "pork"] },
  { re: w("lamb|mutton|venison|goat|bison|rabbit"), unless: w("lamb'?s lettuce|goat cheese|goats? milk"), flags: ["meat"] },
  { re: w("chicken|turkey|duck|cornish hens?|poultry"), unless: w("chicken-of-the-sea"), flags: ["poultry"] },
  { re: w("shrimp|prawns?|crab|crabmeat|lobster|scallops?|clams?|mussels?|oysters?|oyster sauce|crawfish|crayfish|langostinos?|squid|calamari|octopus"), unless: w("oyster crackers|oyster mushrooms?|imitation crab"), flags: ["shellfish", "a:shellfish"] },
  { re: w("fish|salmon|tuna|cod|tilapia|halibut|trout|anchov(?:y|ies)|sardines?|mackerel|catfish|haddock|snapper|sole|flounder|swordfish|mahi mahi|bass|worcestershire|caesar dressing|imitation crab|surimi|bonito|dashi"), flags: ["fish", "a:fish"] },
  { re: w("gelatin|gelatine|jell-o|jello|marshmallows?|marshmallow creme"), flags: ["gelatin"] },
  { re: w("cheeses?|parmesan|parmigiano|mozzarella|cheddar|ricotta|feta|mascarpone|gruyere|monterey jack|colby|provolone|brie|gouda|velveeta|asiago|romano|queso"), unless: w("vegan|dairy-free|non-dairy"), flags: ["dairy", "a:milk"] },
  { re: /(?<!\b(?:peanut|apple|cocoa|almond|cashew|sunflower|nut|shea|seed|soy) )\bbutter\b|\bmargarine\b|\bghee\b/, unless: w("butter beans?|butternut|butterhead|butter lettuce|vegan|dairy-free"), flags: ["dairy", "a:milk"] },
  { re: w("milk|buttermilk|cream|half-and-half|half and half|yogurt|yoghurt|sour cream|creme fraiche|whey|casein|ice cream|alfredo sauce|cool whip|whipped topping|butterscotch chips|white chocolate|milk chocolate|cream of \\w+ soup|nonfat dry milk"), unless: w("coconut milk|coconut cream|cream of coconut|almond milk|soy milk|rice milk|oat milk|cream of tartar|non-dairy|dairy-free|vegan|creamer"), flags: ["dairy", "a:milk"] },
  { re: w("eggs?|egg whites?|egg yolks?|egg substitute|egg beaters|mayonnaise|mayo|meringue|egg noodles|egg roll wrappers?"), unless: w("eggplants?|vegan mayo|egg-free"), flags: ["egg", "a:egg"] },
  { re: w("peanuts?|peanut butter|peanut oil"), flags: ["a:peanut"] },
  { re: w("almonds?|almond milk|almond flour|almond extract|walnuts?|pecans?|cashews?|pistachios?|hazelnuts?|filberts?|macadamia(?: nuts?)?|pine nuts|brazil nuts?|nutella|praline|marzipan|amaretto"), flags: ["a:tree-nut"] },
  { re: w("sesame|sesame seeds|sesame oil|tahini"), flags: ["a:sesame"] },
  { re: w("soy|soya|soy sauce|tamari|tofu|edamame|miso|tempeh|teriyaki(?: sauce)?|hoisin(?: sauce)?|soy milk|soybeans?|textured vegetable protein|tvp"), flags: ["a:soy"] },
  { re: w("flour|bread|breads|breadcrumbs|bread crumbs|panko|crackers?|pasta|spaghetti|macaroni|penne|fettuccine|linguine|rigatoni|rotini|ziti|lasagna(?: noodles)?|noodles|couscous|bulgur|semolina|wheat|tortillas?|pita|bagels?|buns?|rolls?|croutons|pie crust|pie shell|puff pastry|phyllo|filo|biscuits?|biscuit mix|bisquick|cake mix|graham crackers?|wonton wrappers|egg roll wrappers?|soy sauce|teriyaki(?: sauce)?|hoisin(?: sauce)?|beer|seitan|stuffing mix|orzo|gnocchi|ramen|udon|cream of \\w+ soup|pizza dough|crescent rolls"),
    unless: /\b(?:rice|corn|almond|coconut|chickpea|oat|potato|tapioca|buckwheat|gluten-free|gluten free) (?:flour|pasta|noodles|tortillas?|crackers|bread)\b|\bcorn tortillas?\b|\brice noodles\b|\brice paper\b|\bgluten[- ]free\b|\btamari\b/, flags: ["a:wheat"] },
  { re: w("honey"), unless: w("honeydew"), flags: ["honey"] },
  { re: w("wine|beer|rum|vodka|brandy|cognac|liqueur|sherry|bourbon|whiskey|whisky|tequila|kahlua|amaretto|gin|marsala|sake|mirin|vermouth|champagne|triple sec|grand marnier|schnapps|cointreau|frangelico"), unless: w("wine vinegar|red wine vinegar|white wine vinegar|rice wine vinegar|sherry vinegar|non-alcoholic|cooking wine vinegar"), flags: ["alcohol"] },
  { re: w("onions?|garlic|shallots?|leeks?|scallions?|green onions?|spring onions?|chives|onion powder|garlic powder|garlic salt|onion soup mix|french-fried onions"), flags: ["allium"] },
  { re: w("potato(?:es)?|sweet potato(?:es)?|yams?|carrots?|beets?|radish(?:es)?|turnips?|parsnips?|ginger|gingerroot|garlic|onions?|shallots?|celery root|jicama|horseradish|rutabaga|taro"), unless: w("gingersnaps?|ginger ale|potato chips|potato flakes"), flags: ["root"] },
];

/** First match wins. Broths and sauces come before the foods they are made of. */
const CATEGORY_RULES: [RegExp, Category][] = [
  [w("broth|stock|bouillon|consomme|soup mix|gravy"), "condiment"],
  [w("cream of \\w+ soup|condensed \\w+ soup"), "condiment"],
  [w("sauce|ketchup|catsup|mustard|vinegar|salsa|hot sauce|tabasco|dressing|relish|pesto|jam|jelly|preserves|marinade|mayonnaise|mayo|chutney|paste"), "condiment"],
  [w("wine|beer|rum|vodka|brandy|liqueur|sherry|bourbon|whiskey|tequila|kahlua|marsala|sake|mirin|vermouth|champagne"), "alcohol"],
  [w("oils?|shortening|lard|cooking spray"), "oil"],
  [w("red pepper flakes|crushed red pepper|cayenne pepper|black pepper|white pepper|ground pepper|peppercorns|lemon pepper"), "spice"],
  [/\b(?:bell|green|red|yellow|orange|jalapeno|poblano|serrano|chipotle|banana|sweet|roasted red|hot|chili|anaheim) peppers?\b/, "produce"],
  [w("salt|pepper|cayenne|paprika|cumin|cinnamon|oregano|basil|thyme|rosemary|chili powder|curry powder|turmeric|nutmeg|cloves|dried parsley|dill weed|bay leaf|bay leaves|sage|allspice|coriander|seasoning|spices?|vanilla|extract|red pepper flakes|garlic powder|onion powder|ground ginger|italian seasoning|herbs de provence|mustard seed|fennel seed|cardamom|saffron|garam masala|five-spice powder|msg"), "spice"],
  [w("baking powder|baking soda|yeast|cornstarch|gelatin|cream of tartar|food coloring|pectin"), "baking"],
  [w("sugar|brown sugar|powdered sugar|confectioners sugar|maple syrup|corn syrup|molasses|agave|honey|splenda|sweetener|chocolate chips|cocoa|chocolate|marshmallows?|caramel"), "sweetener"],
  [w("beef|steaks?|veal|hamburger|pork|bacon|ham|sausages?|chorizo|pepperoni|salami|lamb|venison|prosciutto|pancetta|kielbasa|hot dogs?"), "meat"],
  [w("chicken|turkey|duck|cornish hens?"), "poultry"],
  [w("shrimp|prawns?|crab|crabmeat|lobster|scallops?|clams?|mussels?|oysters?|fish|salmon|tuna|cod|tilapia|halibut|trout|anchovies|sardines|catfish|haddock|snapper|sole|flounder|swordfish|squid|calamari|imitation crab"), "seafood"],
  [w("peanuts?|almonds?|walnuts?|pecans?|cashews?|pistachios?|hazelnuts?|macadamia|pine nuts|nuts|sesame seeds|sunflower seeds|pumpkin seeds|flax ?seeds?|chia seeds|tahini|peanut butter|almond butter|coconut flakes|flaked coconut|shredded coconut"), "nut"],
  [w("cheeses?|parmesan|mozzarella|cheddar|ricotta|feta|mascarpone|gruyere|monterey jack|provolone|velveeta|queso|cream cheese"), "cheese"],
  [w("butter|margarine|ghee"), "butter"],
  [w("milk|buttermilk|cream|half-and-half|yogurt|sour cream|creme fraiche|whipped topping|cool whip|ice cream"), "milk"],
  [w("eggs?|egg whites?|egg yolks?|egg substitute"), "egg"],
  [w("beans?|lentils|chickpeas|garbanzo|black-eyed peas|split peas|hummus|tofu|tempeh|edamame"), "legume"],
  [w("flour|bread|breadcrumbs|bread crumbs|panko|crackers?|pasta|spaghetti|macaroni|penne|fettuccine|linguine|noodles|couscous|bulgur|rice|oats|oatmeal|quinoa|barley|cornmeal|grits|polenta|cereal|tortillas?|pita|bagels?|buns?|rolls?|croutons|pie crust|puff pastry|phyllo|biscuit mix|bisquick|cake mix|orzo|gnocchi"), "grain"],
  [w("tomato(?:es)?|lettuce|spinach|kale|cabbage|broccoli|cauliflower|zucchini|squash|pumpkin|cucumbers?|bell peppers?|peppers|jalapenos?|chilies|chiles|poblano|serrano|mushrooms?|corn|peas|green beans|asparagus|celery|avocados?|lemons?|limes?|lemon juice|lime juice|lemon zest|lime zest|orange juice|oranges?|apples?|bananas?|berries|strawberries|blueberries|raspberries|grapes|pineapple|mango|peaches|pears|cherries|raisins|cranberries|dates|figs|fruit|vegetables?|onions?|garlic|shallots?|leeks?|scallions?|green onions?|chives|potato(?:es)?|sweet potato(?:es)?|yams?|carrots?|beets?|radish(?:es)?|turnips?|parsnips?|ginger|eggplants?|olives|capers|artichokes?|parsley|cilantro|basil leaves|fresh basil|mint|dill|coconut milk|coconut|okra|sprouts|arugula|watercress|fennel|bok choy"), "produce"],
];

export interface LexiconResult {
  skip: boolean;
  flags: Flag[];
  category: Category;
}

export function classifyIngredient(rawName: string): LexiconResult {
  const name = rawName.toLowerCase().replace(/\s+/g, " ").trim();
  if (!name || SKIP.test(name)) return { skip: true, flags: [], category: "other" };
  const flags = new Set<Flag>();
  for (const r of FLAG_RULES) {
    if (r.re.test(name) && !(r.unless && r.unless.test(name))) for (const f of r.flags) flags.add(f);
  }
  const category = CATEGORY_RULES.find(([re]) => re.test(name))?.[1] ?? "other";
  return { skip: false, flags: [...flags].sort(), category };
}
