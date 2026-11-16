import type { Flag } from "../vocab.js";

/**
 * Sample nutrition table (values per 100 g, approximate, rounded from typical
 * USDA FoodData Central entries). It lets the app run with no downloads; run the
 * ETL in src/etl to replace it with the real FoodData Central export.
 * Prices are rough U.S. grocery estimates in USD per 100 g, for budget ranking only.
 */
export interface Food {
  id: string;
  en: string;
  zh: string;
  kcal: number;
  protein: number;
  fat: number;
  satFat: number;
  carbs: number;
  sugar: number;
  fiber: number;
  sodiumMg: number;
  flags: Flag[];
  pricePer100g: number;
  shelfDays: number;
}

type Row = [string, string, string, number, number, number, number, number, number, number, number, Flag[], number, number];

// id, en, zh, kcal, protein, fat, satFat, carbs, sugar, fiber, sodium mg, flags, $/100g, shelf days
const ROWS: Row[] = [
  ["chicken_breast", "Chicken breast", "鸡胸肉", 120, 22.5, 2.6, 0.6, 0, 0, 0, 45, ["poultry"], 1.0, 3],
  ["chicken_thigh", "Chicken thigh", "鸡腿肉", 177, 18, 11, 3, 0, 0, 0, 80, ["poultry"], 0.8, 3],
  ["ground_beef", "Ground beef (85% lean)", "牛肉末", 250, 26, 15, 6, 0, 0, 0, 72, ["meat", "beef"], 1.3, 3],
  ["beef_sirloin", "Beef sirloin", "牛里脊", 180, 26, 8, 3, 0, 0, 0, 60, ["meat", "beef"], 2.2, 4],
  ["pork_loin", "Pork loin", "猪里脊", 143, 21, 6, 2, 0, 0, 0, 50, ["meat", "pork"], 1.1, 4],
  ["bacon", "Bacon", "培根", 417, 13, 40, 13, 1.4, 0, 0, 800, ["meat", "pork"], 1.6, 10],
  ["salmon", "Salmon fillet", "三文鱼", 208, 20, 13, 3, 0, 0, 0, 59, ["fish", "a:fish"], 2.4, 2],
  ["tuna_canned", "Canned tuna", "金枪鱼罐头", 116, 26, 1, 0.3, 0, 0, 0, 340, ["fish", "a:fish"], 1.2, 365],
  ["shrimp", "Shrimp", "虾仁", 85, 20, 0.5, 0.1, 0, 0, 0, 120, ["shellfish", "a:shellfish"], 2.0, 2],
  ["tofu", "Firm tofu", "老豆腐", 144, 17, 9, 1.3, 3, 0.5, 2, 14, ["a:soy"], 0.5, 7],
  ["egg", "Egg", "鸡蛋", 143, 12.6, 9.5, 3.1, 0.7, 0.4, 0, 142, ["egg", "a:egg"], 0.6, 21],
  ["milk", "Milk", "牛奶", 61, 3.2, 3.3, 1.9, 4.8, 5, 0, 43, ["dairy", "a:milk"], 0.12, 7],
  ["greek_yogurt", "Greek yogurt", "希腊酸奶", 59, 10, 0.4, 0.1, 3.6, 3.2, 0, 36, ["dairy", "a:milk"], 0.55, 14],
  ["cheddar", "Cheddar", "切达奶酪", 403, 25, 33, 21, 1.3, 0.5, 0, 621, ["dairy", "a:milk"], 1.3, 30],
  ["parmesan", "Parmesan", "帕玛森奶酪", 431, 38, 29, 19, 4, 0.9, 0, 1530, ["dairy", "a:milk"], 2.5, 60],
  ["feta", "Feta", "菲达奶酪", 264, 14, 21, 15, 4, 4, 0, 1116, ["dairy", "a:milk"], 1.5, 21],
  ["butter", "Butter", "黄油", 717, 0.9, 81, 51, 0.1, 0.1, 0, 11, ["dairy", "a:milk"], 1.0, 60],
  ["rice", "White rice (dry)", "大米", 365, 7.1, 0.7, 0.2, 80, 0.1, 1.3, 5, [], 0.3, 365],
  ["pasta", "Pasta (dry)", "意面", 371, 13, 1.5, 0.3, 75, 2.7, 3.2, 6, ["a:wheat"], 0.35, 365],
  ["wheat_noodles", "Wheat noodles (dry)", "面条", 371, 12, 1.5, 0.3, 74, 2, 3, 10, ["a:wheat"], 0.5, 365],
  ["bread", "Whole-wheat bread", "全麦面包", 252, 12, 3.5, 0.7, 43, 4.4, 6, 450, ["a:wheat"], 0.6, 7],
  ["tortilla", "Flour tortilla", "墨西哥饼皮", 304, 8, 8, 3, 50, 2, 3, 600, ["a:wheat"], 0.6, 14],
  ["oats", "Rolled oats", "燕麦片", 389, 17, 7, 1.2, 66, 1, 10.6, 2, [], 0.4, 365],
  ["quinoa", "Quinoa (dry)", "藜麦", 368, 14, 6, 0.7, 64, 0, 7, 5, [], 0.9, 365],
  ["lentils", "Red lentils (dry)", "红扁豆", 352, 25, 1.1, 0.2, 63, 2, 11, 6, [], 0.4, 365],
  ["black_beans", "Canned black beans", "黑豆罐头", 132, 8.9, 0.5, 0.1, 24, 0.3, 8.7, 240, [], 0.3, 365],
  ["chickpeas", "Canned chickpeas", "鹰嘴豆罐头", 164, 8.9, 2.6, 0.3, 27, 4.8, 7.6, 240, [], 0.3, 365],
  ["potato", "Potato", "土豆", 77, 2, 0.1, 0, 17, 0.8, 2.2, 6, ["root"], 0.15, 30],
  ["sweet_potato", "Sweet potato", "红薯", 86, 1.6, 0.1, 0, 20, 4.2, 3, 55, ["root"], 0.25, 21],
  ["carrot", "Carrot", "胡萝卜", 41, 0.9, 0.2, 0, 10, 4.7, 2.8, 69, ["root"], 0.2, 21],
  ["onion", "Onion", "洋葱", 40, 1.1, 0.1, 0, 9.3, 4.2, 1.7, 4, ["root", "allium"], 0.2, 30],
  ["garlic", "Garlic", "大蒜", 149, 6.4, 0.5, 0.1, 33, 1, 2.1, 17, ["root", "allium"], 1.0, 60],
  ["scallion", "Scallion", "葱", 32, 1.8, 0.2, 0, 7.3, 2.3, 2.6, 16, ["allium"], 0.6, 7],
  ["ginger", "Ginger", "姜", 80, 1.8, 0.8, 0.2, 18, 1.7, 2, 13, ["root"], 0.9, 21],
  ["broccoli", "Broccoli", "西兰花", 34, 2.8, 0.4, 0, 6.6, 1.7, 2.6, 33, [], 0.45, 7],
  ["spinach", "Spinach", "菠菜", 23, 2.9, 0.4, 0.1, 3.6, 0.4, 2.2, 79, [], 0.9, 5],
  ["bell_pepper", "Bell pepper", "彩椒", 26, 1, 0.3, 0, 6, 4.2, 2.1, 4, [], 0.6, 10],
  ["tomato", "Tomato", "番茄", 18, 0.9, 0.2, 0, 3.9, 2.6, 1.2, 5, [], 0.45, 7],
  ["canned_tomato", "Canned tomatoes", "番茄罐头", 32, 1.6, 0.3, 0, 7, 4, 1.9, 180, [], 0.25, 365],
  ["cucumber", "Cucumber", "黄瓜", 15, 0.7, 0.1, 0, 3.6, 1.7, 0.5, 2, [], 0.3, 7],
  ["avocado", "Avocado", "牛油果", 160, 2, 15, 2.1, 8.5, 0.7, 6.7, 7, [], 0.9, 5],
  ["lettuce", "Romaine lettuce", "生菜", 17, 1.2, 0.3, 0, 3.3, 1.2, 2.1, 8, [], 0.5, 7],
  ["mushroom", "Mushrooms", "蘑菇", 22, 3.1, 0.3, 0, 3.3, 2, 1, 5, [], 0.8, 7],
  ["cabbage", "Cabbage", "卷心菜", 25, 1.3, 0.1, 0, 5.8, 3.2, 2.5, 18, [], 0.2, 21],
  ["corn", "Sweet corn", "玉米粒", 86, 3.3, 1.4, 0.3, 19, 6, 2, 15, [], 0.3, 7],
  ["kimchi", "Kimchi", "韩式泡菜", 15, 1.1, 0.5, 0.1, 2.4, 1.1, 1.6, 498, ["fish", "a:fish", "a:shellfish"], 0.9, 60],
  ["basil", "Basil", "罗勒", 23, 3.2, 0.6, 0, 2.7, 0.3, 1.6, 4, [], 2.5, 5],
  ["cilantro", "Cilantro", "香菜", 23, 2.1, 0.5, 0, 3.7, 0.9, 2.8, 46, [], 2.0, 5],
  ["lemon", "Lemon", "柠檬", 29, 1.1, 0.3, 0, 9, 2.5, 2.8, 2, [], 0.6, 21],
  ["banana", "Banana", "香蕉", 89, 1.1, 0.3, 0.1, 23, 12, 2.6, 1, [], 0.25, 5],
  ["blueberries", "Blueberries", "蓝莓", 57, 0.7, 0.3, 0, 14.5, 10, 2.4, 1, [], 1.3, 7],
  ["peanut_butter", "Peanut butter", "花生酱", 588, 25, 50, 10, 20, 9, 6, 430, ["a:peanut"], 0.7, 120],
  ["almonds", "Almonds", "杏仁", 579, 21, 50, 3.8, 22, 4.4, 12.5, 1, ["a:tree-nut"], 1.6, 180],
  ["sesame_seeds", "Sesame seeds", "芝麻", 573, 18, 50, 7, 23, 0.3, 12, 11, ["a:sesame"], 1.5, 365],
  ["tahini", "Tahini", "芝麻酱", 595, 17, 54, 7.5, 21, 0.5, 9, 35, ["a:sesame"], 1.2, 180],
  ["olive_oil", "Olive oil", "橄榄油", 884, 0, 100, 14, 0, 0, 0, 2, [], 0.9, 365],
  ["sesame_oil", "Sesame oil", "香油", 884, 0, 100, 14, 0, 0, 0, 0, ["a:sesame"], 1.2, 365],
  ["coconut_milk", "Coconut milk", "椰浆", 197, 2, 21, 18.9, 2.8, 2, 0, 13, [], 0.5, 365],
  ["soy_sauce", "Soy sauce", "酱油", 53, 8, 0.6, 0.1, 4.9, 0.4, 0.8, 5500, ["a:soy", "a:wheat"], 0.5, 365],
  ["fish_sauce", "Fish sauce", "鱼露", 35, 5, 0, 0, 3.6, 3.6, 0, 7850, ["fish", "a:fish"], 0.6, 365],
  ["gochujang", "Gochujang", "韩式辣酱", 230, 5, 1.5, 0.2, 48, 25, 2, 2400, ["a:soy", "a:wheat"], 1.0, 180],
  ["salsa", "Jarred salsa", "莎莎酱", 36, 1.5, 0.2, 0, 7, 4, 1.9, 430, [], 0.6, 30],
  ["honey", "Honey", "蜂蜜", 304, 0.3, 0, 0, 82, 82, 0.2, 4, ["honey"], 0.9, 730],
  ["sugar", "Sugar", "白糖", 387, 0, 0, 0, 100, 100, 0, 1, [], 0.15, 730],
  ["salt", "Salt", "盐", 0, 0, 0, 0, 0, 0, 0, 38758, [], 0.1, 3650],
  ["chicken_broth", "Chicken broth", "鸡汤", 15, 1.6, 0.5, 0.1, 1, 0.4, 0, 370, ["poultry"], 0.3, 365],
  ["vegetable_broth", "Vegetable broth", "蔬菜高汤", 6, 0.2, 0, 0, 1.3, 0.6, 0, 330, [], 0.3, 365],
  ["white_wine", "White wine (cooking)", "白葡萄酒", 82, 0.1, 0, 0, 2.6, 1, 0, 5, ["alcohol"], 1.0, 365],
];

export const FOODS: Food[] = ROWS.map(
  ([id, en, zh, kcal, protein, fat, satFat, carbs, sugar, fiber, sodiumMg, flags, pricePer100g, shelfDays]) => ({
    id,
    en,
    zh,
    kcal,
    protein,
    fat,
    satFat,
    carbs,
    sugar,
    fiber,
    sodiumMg,
    flags,
    pricePer100g,
    shelfDays,
  }),
);
