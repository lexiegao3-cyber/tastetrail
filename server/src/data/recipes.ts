import type { Cuisine, Equipment, Tag } from "../vocab.js";

/**
 * Demo recipe catalog (32 recipes, bilingual). Ingredient amounts are grams for
 * the whole recipe; nutrition is computed in SQL from the foods table. The ETL in
 * src/etl loads the Food.com dataset into the same tables when it is available.
 */
export interface SeedRecipe {
  id: string;
  en: string;
  zh: string;
  emoji: string;
  cuisine: Cuisine;
  tags: Tag[];
  minutes: number;
  steps: number;
  servings: number;
  equipment: Equipment[];
  ingredients: [foodId: string, grams: number][];
}

export const RECIPES: SeedRecipe[] = [
  { id: "overnight-oats", en: "Overnight Oats with Berries", zh: "隔夜燕麦莓果杯", emoji: "🥣", cuisine: "american", tags: ["breakfast", "quick", "meal-prep", "budget"], minutes: 5, steps: 3, servings: 1, equipment: [], ingredients: [["oats", 50], ["greek_yogurt", 100], ["milk", 100], ["blueberries", 60], ["honey", 10]] },
  { id: "eggs-on-toast", en: "Scrambled Eggs on Toast", zh: "炒蛋吐司", emoji: "🍳", cuisine: "american", tags: ["breakfast", "quick", "budget"], minutes: 10, steps: 4, servings: 1, equipment: ["stove"], ingredients: [["egg", 100], ["bread", 60], ["butter", 7], ["milk", 20], ["salt", 1]] },
  { id: "pb-banana-toast", en: "Peanut Butter Banana Toast", zh: "花生酱香蕉吐司", emoji: "🍌", cuisine: "american", tags: ["breakfast", "quick", "budget"], minutes: 5, steps: 2, servings: 1, equipment: [], ingredients: [["bread", 60], ["peanut_butter", 32], ["banana", 100]] },
  { id: "yogurt-parfait", en: "Greek Yogurt Parfait", zh: "希腊酸奶杯", emoji: "🫐", cuisine: "mediterranean", tags: ["breakfast", "quick", "high-protein"], minutes: 5, steps: 2, servings: 1, equipment: [], ingredients: [["greek_yogurt", 200], ["blueberries", 80], ["almonds", 20], ["honey", 10]] },
  { id: "mug-omelette", en: "Microwave Mug Omelette", zh: "微波蛋杯", emoji: "🥚", cuisine: "american", tags: ["breakfast", "quick", "high-protein"], minutes: 5, steps: 3, servings: 1, equipment: ["microwave"], ingredients: [["egg", 150], ["spinach", 30], ["bell_pepper", 40], ["cheddar", 20]] },
  { id: "chicken-fried-rice", en: "Chicken Fried Rice", zh: "鸡肉炒饭", emoji: "🍚", cuisine: "chinese", tags: ["quick", "high-protein", "comfort"], minutes: 20, steps: 5, servings: 2, equipment: ["stove"], ingredients: [["rice", 150], ["chicken_breast", 200], ["egg", 100], ["carrot", 60], ["scallion", 20], ["soy_sauce", 30], ["sesame_oil", 10], ["garlic", 6]] },
  { id: "tomato-egg", en: "Tomato & Egg Stir-fry", zh: "番茄炒蛋", emoji: "🍅", cuisine: "chinese", tags: ["quick", "budget", "comfort"], minutes: 12, steps: 4, servings: 2, equipment: ["stove"], ingredients: [["tomato", 300], ["egg", 200], ["scallion", 10], ["sugar", 8], ["olive_oil", 15], ["salt", 2], ["rice", 150]] },
  { id: "mapo-tofu", en: "Mapo Tofu", zh: "麻婆豆腐", emoji: "🌶️", cuisine: "chinese", tags: ["spicy", "comfort"], minutes: 20, steps: 5, servings: 3, equipment: ["stove"], ingredients: [["tofu", 400], ["ground_beef", 100], ["garlic", 8], ["ginger", 6], ["scallion", 15], ["soy_sauce", 20], ["gochujang", 20], ["rice", 200]] },
  { id: "broccoli-beef", en: "Garlic Broccoli Beef", zh: "西兰花炒牛肉", emoji: "🥦", cuisine: "chinese", tags: ["high-protein"], minutes: 25, steps: 6, servings: 2, equipment: ["stove"], ingredients: [["beef_sirloin", 250], ["broccoli", 300], ["garlic", 10], ["ginger", 6], ["soy_sauce", 30], ["sugar", 6], ["olive_oil", 15], ["rice", 150]] },
  { id: "sesame-noodles", en: "Cold Sesame Noodles", zh: "麻酱拌面", emoji: "🍜", cuisine: "chinese", tags: ["quick", "budget"], minutes: 15, steps: 4, servings: 2, equipment: ["stove"], ingredients: [["wheat_noodles", 200], ["tahini", 40], ["soy_sauce", 25], ["sesame_oil", 10], ["cucumber", 150], ["scallion", 15], ["garlic", 6], ["sugar", 6]] },
  { id: "egg-drop-soup", en: "Egg Drop Soup", zh: "蛋花汤", emoji: "🥣", cuisine: "chinese", tags: ["quick", "budget", "comfort"], minutes: 10, steps: 3, servings: 2, equipment: ["stove"], ingredients: [["chicken_broth", 700], ["egg", 100], ["scallion", 10], ["corn", 80]] },
  { id: "teriyaki-salmon", en: "Teriyaki Salmon Bowl", zh: "照烧三文鱼饭", emoji: "🍣", cuisine: "japanese", tags: ["high-protein"], minutes: 25, steps: 5, servings: 2, equipment: ["stove"], ingredients: [["salmon", 300], ["rice", 150], ["soy_sauce", 30], ["honey", 20], ["broccoli", 200], ["sesame_seeds", 6]] },
  { id: "oyakodon", en: "Oyakodon (Chicken & Egg Bowl)", zh: "亲子丼", emoji: "🍳", cuisine: "japanese", tags: ["comfort", "high-protein"], minutes: 20, steps: 4, servings: 2, equipment: ["stove"], ingredients: [["chicken_thigh", 250], ["egg", 150], ["onion", 100], ["soy_sauce", 30], ["sugar", 10], ["chicken_broth", 120], ["rice", 150]] },
  { id: "shoyu-ramen", en: "Shoyu Ramen", zh: "酱油拉面", emoji: "🍜", cuisine: "japanese", tags: ["comfort"], minutes: 20, steps: 4, servings: 2, equipment: ["stove"], ingredients: [["wheat_noodles", 180], ["chicken_broth", 800], ["egg", 100], ["scallion", 15], ["soy_sauce", 30], ["mushroom", 80], ["pork_loin", 150]] },
  { id: "kimchi-fried-rice", en: "Kimchi Fried Rice", zh: "泡菜炒饭", emoji: "🔥", cuisine: "korean", tags: ["quick", "spicy", "comfort"], minutes: 15, steps: 4, servings: 2, equipment: ["stove"], ingredients: [["rice", 150], ["kimchi", 200], ["egg", 100], ["bacon", 50], ["scallion", 15], ["sesame_oil", 10], ["gochujang", 20]] },
  { id: "veggie-bibimbap", en: "Veggie Bibimbap", zh: "蔬菜拌饭", emoji: "🥗", cuisine: "korean", tags: ["spicy"], minutes: 30, steps: 6, servings: 2, equipment: ["stove"], ingredients: [["rice", 150], ["spinach", 150], ["carrot", 80], ["mushroom", 100], ["egg", 100], ["gochujang", 30], ["sesame_oil", 10], ["garlic", 6]] },
  { id: "thai-basil-chicken", en: "Thai Basil Chicken", zh: "泰式罗勒鸡", emoji: "🌿", cuisine: "thai", tags: ["quick", "spicy", "high-protein"], minutes: 20, steps: 4, servings: 2, equipment: ["stove"], ingredients: [["chicken_thigh", 300], ["basil", 20], ["garlic", 10], ["fish_sauce", 15], ["soy_sauce", 15], ["sugar", 6], ["bell_pepper", 100], ["rice", 150]] },
  { id: "peanut-tofu-noodles", en: "Peanut Tofu Noodles", zh: "花生酱豆腐拌面", emoji: "🥜", cuisine: "thai", tags: ["quick", "budget"], minutes: 20, steps: 4, servings: 2, equipment: ["stove"], ingredients: [["wheat_noodles", 180], ["tofu", 250], ["peanut_butter", 40], ["soy_sauce", 25], ["lemon", 15], ["cabbage", 100], ["carrot", 60], ["scallion", 10]] },
  { id: "pork-rice-bowl", en: "Vietnamese Pork Rice Bowl", zh: "越南烤肉饭", emoji: "🍖", cuisine: "vietnamese", tags: ["high-protein"], minutes: 30, steps: 5, servings: 2, equipment: ["stove"], ingredients: [["pork_loin", 300], ["fish_sauce", 20], ["sugar", 10], ["garlic", 8], ["rice", 150], ["cucumber", 100], ["carrot", 60], ["cilantro", 8]] },
  { id: "chickpea-curry", en: "Coconut Chickpea Curry", zh: "椰香鹰嘴豆咖喱", emoji: "🥥", cuisine: "indian", tags: ["meal-prep", "comfort"], minutes: 30, steps: 5, servings: 3, equipment: ["stove"], ingredients: [["chickpeas", 480], ["coconut_milk", 200], ["canned_tomato", 200], ["onion", 150], ["garlic", 10], ["ginger", 10], ["spinach", 100], ["rice", 200]] },
  { id: "red-lentil-dal", en: "Red Lentil Dal", zh: "红扁豆咖喱", emoji: "🍲", cuisine: "indian", tags: ["meal-prep", "budget", "comfort"], minutes: 30, steps: 4, servings: 3, equipment: ["stove"], ingredients: [["lentils", 200], ["onion", 120], ["garlic", 10], ["ginger", 10], ["canned_tomato", 200], ["olive_oil", 15], ["vegetable_broth", 600], ["salt", 3]] },
  { id: "burrito-bowl", en: "Chicken Burrito Bowl", zh: "鸡肉卷饼碗", emoji: "🌯", cuisine: "mexican", tags: ["high-protein", "meal-prep"], minutes: 25, steps: 5, servings: 2, equipment: ["stove"], ingredients: [["chicken_breast", 250], ["rice", 120], ["black_beans", 240], ["corn", 100], ["salsa", 100], ["lettuce", 80], ["avocado", 100], ["cheddar", 40]] },
  { id: "bean-quesadilla", en: "Black Bean Quesadilla", zh: "黑豆芝士卷", emoji: "🫓", cuisine: "mexican", tags: ["quick", "budget"], minutes: 15, steps: 4, servings: 2, equipment: ["stove"], ingredients: [["tortilla", 120], ["black_beans", 200], ["cheddar", 80], ["bell_pepper", 80], ["salsa", 60]] },
  { id: "shrimp-tacos", en: "Shrimp Tacos", zh: "鲜虾塔可", emoji: "🌮", cuisine: "mexican", tags: ["quick", "high-protein"], minutes: 20, steps: 4, servings: 2, equipment: ["stove"], ingredients: [["shrimp", 250], ["tortilla", 120], ["cabbage", 100], ["avocado", 80], ["lemon", 30], ["cilantro", 10], ["olive_oil", 10]] },
  { id: "sweet-potato-bean-bowl", en: "Microwave Sweet Potato Bean Bowl", zh: "微波红薯黑豆碗", emoji: "🍠", cuisine: "mexican", tags: ["quick", "budget"], minutes: 10, steps: 3, servings: 1, equipment: ["microwave"], ingredients: [["sweet_potato", 250], ["black_beans", 120], ["salsa", 50], ["greek_yogurt", 50], ["cilantro", 5]] },
  { id: "spaghetti-pomodoro", en: "Spaghetti Pomodoro", zh: "番茄意面", emoji: "🍝", cuisine: "italian", tags: ["budget", "comfort"], minutes: 25, steps: 4, servings: 3, equipment: ["stove"], ingredients: [["pasta", 300], ["canned_tomato", 400], ["garlic", 10], ["olive_oil", 25], ["basil", 10], ["parmesan", 30]] },
  { id: "mushroom-pasta", en: "Creamy Mushroom Pasta", zh: "奶油蘑菇意面", emoji: "🍄", cuisine: "italian", tags: ["comfort"], minutes: 25, steps: 5, servings: 2, equipment: ["stove"], ingredients: [["pasta", 200], ["mushroom", 250], ["butter", 20], ["milk", 150], ["parmesan", 40], ["garlic", 8], ["spinach", 60], ["white_wine", 50]] },
  { id: "sheet-pan-chicken", en: "Sheet-pan Chicken & Veggies", zh: "烤鸡胸蔬菜盘", emoji: "🍗", cuisine: "american", tags: ["high-protein", "meal-prep"], minutes: 35, steps: 4, servings: 2, equipment: ["oven"], ingredients: [["chicken_breast", 350], ["sweet_potato", 300], ["broccoli", 200], ["olive_oil", 20], ["garlic", 6]] },
  { id: "beef-chili", en: "Beef & Bean Chili", zh: "牛肉豆子辣酱", emoji: "🫕", cuisine: "american", tags: ["meal-prep", "high-protein", "comfort"], minutes: 45, steps: 5, servings: 4, equipment: ["stove"], ingredients: [["ground_beef", 450], ["black_beans", 480], ["canned_tomato", 400], ["onion", 150], ["bell_pepper", 150], ["garlic", 10], ["salt", 3]] },
  { id: "tuna-avocado-salad", en: "Tuna Avocado Salad", zh: "金枪鱼牛油果沙拉", emoji: "🥑", cuisine: "american", tags: ["quick", "high-protein"], minutes: 10, steps: 3, servings: 1, equipment: [], ingredients: [["tuna_canned", 120], ["avocado", 100], ["cucumber", 100], ["lettuce", 80], ["lemon", 20], ["olive_oil", 10]] },
  { id: "quinoa-salad", en: "Mediterranean Quinoa Salad", zh: "地中海藜麦沙拉", emoji: "🥙", cuisine: "mediterranean", tags: ["meal-prep"], minutes: 25, steps: 4, servings: 3, equipment: ["stove"], ingredients: [["quinoa", 180], ["cucumber", 200], ["tomato", 200], ["feta", 80], ["chickpeas", 240], ["olive_oil", 25], ["lemon", 40]] },
  { id: "hummus-wrap", en: "Hummus Veggie Wrap", zh: "鹰嘴豆泥蔬菜卷", emoji: "🫔", cuisine: "mediterranean", tags: ["quick", "budget"], minutes: 10, steps: 3, servings: 1, equipment: [], ingredients: [["tortilla", 60], ["chickpeas", 100], ["tahini", 15], ["lemon", 10], ["cucumber", 60], ["tomato", 60], ["lettuce", 30]] },
];
