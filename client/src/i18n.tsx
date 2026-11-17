import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type Lang = "en" | "zh";

const en = {
  "app.tagline": "Get a craving. Grab a plate.",
  "app.lede": "Personal meal picks that fit your taste, your macros, your pantry and your budget.",
  "auth.login": "Log in", "auth.register": "Create account", "auth.email": "Email", "auth.password": "Password (8+ characters)",
  "auth.switchToRegister": "New here? Create an account", "auth.switchToLogin": "Have an account? Log in",
  "nav.home": "Home", "nav.bag": "Bag", "nav.today": "Today", "nav.group": "Group",
  "home.title": "Picks for you", "home.search": "Search recipes…", "home.all": "All",
  "home.everyday": "Everyday", "home.fitness": "Fitness", "home.left": "{kcal} kcal left today",
  "home.useItUp": "Use it up", "home.useItUpSub": "Recipes that finish what's at home",
  "home.more": "More ideas", "home.empty": "Nothing matches these filters. Try fewer restrictions or a longer cooking time.",
  "card.perServing": "/serving", "card.min": "min", "card.added": "In bag", "card.add": "Add to bag",
  "detail.information": "Information", "detail.why": "Why this pick", "detail.ingredients": "Ingredients", "detail.estimated": "Food.com recipe: nutrition is from the source; quantities are estimates for your shopping list.",
  "detail.have": "At home", "detail.need": "To buy", "detail.cooked": "I cooked this", "detail.addBag": "Add to bag",
  "detail.orderInstead": "Order similar instead", "detail.steps": "{steps} steps · {minutes} min · serves {servings}",
  "detail.logged": "Logged to today", "detail.save": "Save", "detail.saved": "Saved", "detail.notFor": "Not for me",
  "detail.protein": "protein", "detail.carbs": "carbs", "detail.fat": "fat", "detail.sodium": "sodium", "detail.sugar": "sugar",
  "bag.title": "Your bag", "bag.sub": "Review your items", "bag.empty": "Your bag is empty. Add recipes from Home.",
  "bag.shopping": "Shopping list", "bag.deliver": "Deliver to", "bag.noZip": "Set ZIP in profile", "bag.change": "Change",
  "bag.subtotal": "Estimated groceries", "bag.covered": "Already at home", "bag.checkoutInstacart": "Checkout on Instacart",
  "bag.checkoutKroger": "Add to Kroger cart", "bag.allHome": "Everything is already at home 🎉",
  "bag.pantry": "At home", "bag.pantrySub": "Your virtual fridge", "bag.addPantry": "Add an item you have…",
  "bag.daysLeft": "{days} d left", "bag.grams": "g",
  "today.title": "Today", "today.sub": "Fuel for your day", "today.kcalLeft": "{kcal} kcal to target",
  "today.over": "{kcal} kcal over target", "today.plan": "Plan my day", "today.planSub": "Breakfast, lunch and dinner near {kcal} kcal", "today.planTotal": "Plan total: {kcal} kcal · {protein} g protein (target {targetProtein} g)", "trends.title": "Last 14 days", "trends.sub": "{days} days logged", "trends.chartLabel": "Daily calories, average {avg} kcal against a {target} kcal target", "trends.legend": "Shaded band: {lo}–{hi} kcal (target ±10%). Orange bars are on target.", "trends.avgKcal": "avg kcal on logged days", "trends.avgProtein": "avg protein", "trends.onTarget": "days on target", "trends.takeout": "meals from takeout", "trends.grocery": "groceries ({n} orders)", "trends.waste": "expired unused ({n} items)", "group.people": "people", "group.voteTitle": "Can't decide?", "group.voteSub": "Send friends a link to vote on the top picks. No account needed; the vote closes in 7 days.", "group.startVote": "Start a vote", "group.voteLink": "Vote link", "poll.kicker": "GROUP VOTE", "poll.yourName": "Your name", "poll.namePlaceholder": "So friends know who voted", "poll.nameFirst": "Add your name first.", "poll.vote": "Vote", "poll.yourPick": "Your pick", "poll.footer": "Shared from PlateWise. Voting closes on {date}. Tap the map to see reviews and book.",
  "today.meals": "Logged meals", "today.noMeals": "Nothing logged yet.", "today.quick": "Quick log (takeout or snack)",
  "today.label": "What did you eat?", "today.kcal": "kcal", "today.log": "Log",
  "today.breakfast": "Breakfast", "today.lunch": "Lunch", "today.dinner": "Dinner",
  "group.title": "Group dining", "group.sub": "One table that works for everyone",
  "group.size": "People", "group.theme": "Occasion", "group.cuisine": "Cuisine", "group.anyCuisine": "Any",
  "group.budget": "Per person", "group.time": "Time", "group.travel": "Max travel", "group.who": "Who's coming",
  "group.addPerson": "Add person", "group.from": "From", "group.diet": "Diet", "group.find": "Find restaurants",
  "group.results": "Best tables", "group.none": "No restaurant fits everyone. Try a wider budget or longer travel time.",
  "group.maps": "Open in Google Maps", "group.call": "Call", "group.share": "Copy shortlist", "group.copied": "Copied",
  "group.demo": "Demo restaurants (fictional). Production uses Google Places.", "group.minutes": "{n} min",
  "profile.title": "Profile", "profile.language": "Language", "profile.mode": "Mode", "profile.goal": "Goal",
  "profile.kcal": "Daily calories", "profile.protein": "Daily protein (g)", "profile.cuisines": "Cuisines you love",
  "profile.diet": "Vegetarian type", "profile.allergens": "Allergens (FDA major 9)", "profile.religious": "Religious rules",
  "profile.other": "Other preferences", "profile.equipment": "Kitchen", "profile.maxMinutes": "Max cooking time (min)",
  "profile.budget": "Budget per meal ($)", "profile.zip": "ZIP code", "profile.area": "Neighborhood",
  "profile.save": "Save", "profile.saved": "Saved", "profile.logout": "Log out",
  "profile.note": "Allergen filtering depends on ingredient data. Always check labels. Not medical advice.",
  "pending.title": "Did you finish this?", "pending.grocery": "Did you buy the groceries on {provider}?",
  "pending.takeout": "Did you order \"{label}\" on {provider}?", "pending.restaurant": "Did you go to {label}?",
  "pending.yes": "Yes", "pending.no": "Not this time",
  "handoff.title": "Demo hand-off", "handoff.body": "Without API keys, PlateWise shows this page instead of opening {provider}. In production these items go straight to the {provider} cart.",
  "handoff.back": "Back to PlateWise",
  "common.cancel": "Cancel", "common.error": "Something went wrong",
  // reasons
  "r.taste.cuisine": "You like {cuisine} food", "r.taste.mode": "Fits your {mode} routine",
  "r.nutrition.kcal": "{kcal} kcal, close to this meal's {target} kcal target", "r.nutrition.protein": "{protein} g protein toward your {target} g",
  "r.convenience.pantry": "Uses {have} of {total} ingredients you have", "r.convenience.expiring": "Uses {count} item(s) expiring soon",
  "r.convenience.time": "Ready in {minutes} min", "r.cf.alsoLiked": "People who liked {title} also liked this",
  "r.familiar.similar": "Similar to {title} you liked", "r.price.perServing": "About ${usd} more per serving to buy",
  "r.warn.sugar": "{sugar} g sugar per serving", "r.warn.sodium": "{sodium} mg sodium per serving",
  "r.note.certifiedMeat": "Use certified halal/kosher meat",
  "r.group.taste": "{liked} of {total} people like {cuisine}", "r.group.cuisine": "Matches your {cuisine} pick",
  "r.group.fairness": "Farthest person travels {worst} min", "r.group.price": "${min}–{max} per person",
  "r.group.occasion": "Good for a {theme}", "r.group.reputation": "★ {rating} from {reviews} reviews", "r.group.visited": "You've been here before",
  "w.group.allergenCheck": "Tell the restaurant about allergies when booking", "w.group.callAhead": "Large group: call ahead",
} as const;

export type Key = keyof typeof en;

const zh: Record<Key, string> = {
  "app.tagline": "馋了？来一盘。", "app.lede": "按你的口味、营养目标、冰箱存货和预算，推荐下一顿吃什么。",
  "auth.login": "登录", "auth.register": "注册", "auth.email": "邮箱", "auth.password": "密码（至少 8 位）",
  "auth.switchToRegister": "新用户？去注册", "auth.switchToLogin": "已有账号？去登录",
  "nav.home": "首页", "nav.bag": "购物袋", "nav.today": "今日", "nav.group": "聚餐",
  "home.title": "为你推荐", "home.search": "搜索菜谱…", "home.all": "全部",
  "home.everyday": "日常", "home.fitness": "健身", "home.left": "今天还剩 {kcal} kcal",
  "home.useItUp": "清冰箱", "home.useItUpSub": "用掉家里现有的食材",
  "home.more": "更多选择", "home.empty": "没有符合条件的菜谱。试试减少限制或放宽烹饪时间。",
  "card.perServing": "/份", "card.min": "分钟", "card.added": "已加入", "card.add": "加入购物袋",
  "detail.information": "详情", "detail.why": "推荐理由", "detail.ingredients": "食材", "detail.estimated": "Food.com 菜谱：营养数据来自原站，食材用量是为购物清单估算的。",
  "detail.have": "家里有", "detail.need": "需购买", "detail.cooked": "我做了这道", "detail.addBag": "加入购物袋",
  "detail.orderInstead": "改点外卖", "detail.steps": "{steps} 步 · {minutes} 分钟 · {servings} 人份",
  "detail.logged": "已记录到今天", "detail.save": "收藏", "detail.saved": "已收藏", "detail.notFor": "不感兴趣",
  "detail.protein": "蛋白质", "detail.carbs": "碳水", "detail.fat": "脂肪", "detail.sodium": "钠", "detail.sugar": "糖",
  "bag.title": "购物袋", "bag.sub": "确认要买的东西", "bag.empty": "购物袋是空的，去首页添加菜谱吧。",
  "bag.shopping": "购物清单", "bag.deliver": "配送到", "bag.noZip": "在个人资料里填写 ZIP", "bag.change": "修改",
  "bag.subtotal": "食材预估", "bag.covered": "家里已有", "bag.checkoutInstacart": "去 Instacart 结账",
  "bag.checkoutKroger": "加入 Kroger 购物车", "bag.allHome": "需要的食材家里都有 🎉",
  "bag.pantry": "家里有", "bag.pantrySub": "你的虚拟冰箱", "bag.addPantry": "添加家里已有的食材…",
  "bag.daysLeft": "剩 {days} 天", "bag.grams": "克",
  "today.title": "今日", "today.sub": "今天吃得怎么样", "today.kcalLeft": "距目标还差 {kcal} kcal",
  "today.over": "已超出目标 {kcal} kcal", "today.plan": "规划今天三餐", "today.planSub": "早中晚三餐，总热量约 {kcal} kcal", "today.planTotal": "合计：{kcal} kcal · 蛋白质 {protein} g（目标 {targetProtein} g）", "trends.title": "近 14 天", "trends.sub": "记录了 {days} 天", "trends.chartLabel": "每日热量，平均 {avg} kcal，目标 {target} kcal", "trends.legend": "阴影区间：{lo}–{hi} kcal（目标 ±10%），橙色柱表示达标。", "trends.avgKcal": "记录日平均热量", "trends.avgProtein": "平均蛋白质", "trends.onTarget": "达标天数", "trends.takeout": "外卖占比", "trends.grocery": "买菜花费（{n} 单）", "trends.waste": "过期未用（{n} 件）", "group.people": "人", "group.voteTitle": "选不出来？", "group.voteSub": "把前几名发给朋友投票，不用注册，7 天后关闭。", "group.startVote": "发起投票", "group.voteLink": "投票链接", "poll.kicker": "聚餐投票", "poll.yourName": "你的名字", "poll.namePlaceholder": "让大家知道是谁投的", "poll.nameFirst": "请先填写名字。", "poll.vote": "投这家", "poll.yourPick": "你的选择", "poll.footer": "来自 PlateWise，投票将于 {date} 截止。点地图可以看评价和预订。",
  "today.meals": "已记录", "today.noMeals": "今天还没有记录。", "today.quick": "快速记录（外卖或零食）",
  "today.label": "吃了什么？", "today.kcal": "kcal", "today.log": "记录",
  "today.breakfast": "早餐", "today.lunch": "午餐", "today.dinner": "晚餐",
  "group.title": "多人聚餐", "group.sub": "找一家所有人都满意的餐厅",
  "group.size": "人数", "group.theme": "场合", "group.cuisine": "菜系", "group.anyCuisine": "都行",
  "group.budget": "人均", "group.time": "时间", "group.travel": "最长路程", "group.who": "参与的人",
  "group.addPerson": "添加", "group.from": "出发地", "group.diet": "饮食", "group.find": "推荐餐厅",
  "group.results": "推荐结果", "group.none": "没有适合所有人的餐厅。试试放宽预算或路程。",
  "group.maps": "在 Google Maps 打开", "group.call": "打电话", "group.share": "复制候选清单", "group.copied": "已复制",
  "group.demo": "演示用的虚构餐厅；正式版使用 Google Places 数据。", "group.minutes": "{n} 分钟",
  "profile.title": "个人资料", "profile.language": "语言", "profile.mode": "模式", "profile.goal": "目标",
  "profile.kcal": "每日热量", "profile.protein": "每日蛋白质（克）", "profile.cuisines": "喜欢的菜系",
  "profile.diet": "素食类型", "profile.allergens": "过敏原（FDA 9 大类）", "profile.religious": "宗教忌口",
  "profile.other": "其他偏好", "profile.equipment": "厨具", "profile.maxMinutes": "最长烹饪时间（分钟）",
  "profile.budget": "每餐预算（美元）", "profile.zip": "ZIP 邮编", "profile.area": "所在区域",
  "profile.save": "保存", "profile.saved": "已保存", "profile.logout": "退出登录",
  "profile.note": "过敏原过滤依赖食材数据，请以包装标签为准。不构成医疗建议。",
  "pending.title": "完成了吗？", "pending.grocery": "你在 {provider} 买了这些食材吗？",
  "pending.takeout": "你在 {provider} 点了「{label}」吗？", "pending.restaurant": "你去了 {label} 吗？",
  "pending.yes": "是的", "pending.no": "这次没有",
  "handoff.title": "演示跳转", "handoff.body": "没有配置 API key 时，PlateWise 显示这个页面代替打开 {provider}。正式版会把这些食材直接加入 {provider} 购物车。",
  "handoff.back": "返回 PlateWise",
  "common.cancel": "取消", "common.error": "出错了",
  "r.taste.cuisine": "你喜欢{cuisine}", "r.taste.mode": "适合你的{mode}模式",
  "r.nutrition.kcal": "{kcal} kcal，接近这一餐 {target} kcal 的目标", "r.nutrition.protein": "{protein} 克蛋白质，目标 {target} 克",
  "r.convenience.pantry": "{total} 种食材里家里有 {have} 种", "r.convenience.expiring": "能用掉 {count} 样快过期的食材",
  "r.convenience.time": "{minutes} 分钟就能做好", "r.cf.alsoLiked": "喜欢「{title}」的人也喜欢这道",
  "r.familiar.similar": "和你喜欢的「{title}」相似", "r.price.perServing": "每份还需买约 ${usd} 的食材",
  "r.warn.sugar": "每份含糖 {sugar} 克", "r.warn.sodium": "每份含钠 {sodium} 毫克",
  "r.note.certifiedMeat": "肉类请购买清真/犹太洁食认证产品",
  "r.group.taste": "{total} 人里有 {liked} 人喜欢{cuisine}", "r.group.cuisine": "符合你选的{cuisine}",
  "r.group.fairness": "最远的人路程 {worst} 分钟", "r.group.price": "人均 ${min}–{max}",
  "r.group.occasion": "适合{theme}", "r.group.reputation": "★ {rating}（{reviews} 条评价）", "r.group.visited": "你来过这里",
  "w.group.allergenCheck": "订位时告诉餐厅过敏情况", "w.group.callAhead": "人数较多，建议提前打电话",
};

/** Labels for vocabulary values (cuisines, diets, allergens…). */
const VOCAB: Record<string, [string, string]> = {
  american: ["American", "美式"], chinese: ["Chinese", "中餐"], japanese: ["Japanese", "日料"], korean: ["Korean", "韩餐"],
  thai: ["Thai", "泰餐"], vietnamese: ["Vietnamese", "越南菜"], indian: ["Indian", "印度菜"], mexican: ["Mexican", "墨西哥菜"],
  italian: ["Italian", "意大利菜"], mediterranean: ["Mediterranean", "地中海菜"], hotpot: ["Hot pot", "火锅"],
  "korean-bbq": ["Korean BBQ", "韩式烤肉"], "american-bbq": ["BBQ", "美式烧烤"],
  breakfast: ["Breakfast", "早餐"], quick: ["Quick", "快手"], "high-protein": ["High protein", "高蛋白"], "meal-prep": ["Meal prep", "备餐"],
  budget: ["Budget", "省钱"], spicy: ["Spicy", "辣"], comfort: ["Comfort", "家常"],
  stove: ["Stove", "灶台"], oven: ["Oven", "烤箱"], microwave: ["Microwave", "微波炉"],
  maintain: ["Maintain", "保持"], lose: ["Lose fat", "减脂"], gain: ["Build muscle", "增肌"],
  everyday: ["Everyday", "日常"], fitness: ["Fitness", "健身"],
  none: ["None", "无"], flexitarian: ["Flexitarian", "弹性素食"], pescatarian: ["Pescatarian", "鱼素"], "lacto-ovo": ["Lacto-ovo", "蛋奶素"],
  lacto: ["Lacto", "奶素"], ovo: ["Ovo", "蛋素"], vegan: ["Vegan", "纯素"],
  milk: ["Milk", "牛奶"], egg: ["Egg", "鸡蛋"], fish: ["Fish", "鱼"], shellfish: ["Shellfish", "甲壳类"], "tree-nut": ["Tree nuts", "树坚果"],
  peanut: ["Peanut", "花生"], wheat: ["Wheat", "小麦"], soy: ["Soy", "大豆"], sesame: ["Sesame", "芝麻"],
  halal: ["Halal", "清真"], kosher: ["Kosher", "犹太洁食"], hindu: ["Hindu (no beef)", "印度教（不吃牛肉）"], jain: ["Jain", "耆那教"],
  buddhist: ["Buddhist vegetarian", "佛教素食"], "lent-fridays": ["Lent Fridays", "四旬期周五"],
  "gluten-free": ["Gluten-free", "无麸质"], "lactose-free": ["Lactose-free", "无乳糖"], "low-sugar": ["Low sugar", "控糖"], "low-sodium": ["Low sodium", "低盐"],
  friends: ["Friends", "朋友聚会"], birthday: ["Birthday", "生日"], date: ["Date", "约会"], team: ["Team", "团队聚餐"],
  business: ["Business", "商务"], family: ["Family", "家庭聚餐"],
  instacart: ["Instacart", "Instacart"], kroger: ["Kroger", "Kroger"], doordash: ["DoorDash", "DoorDash"], ubereats: ["Uber Eats", "Uber Eats"],
};

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: Key, params?: Record<string, string | number>) => string;
  v: (value: string) => string;
}

const I18n = createContext<Ctx | null>(null);

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem("platewise.lang");
    if (saved === "en" || saved === "zh") return saved;
  } catch {
    /* storage blocked */
  }
  return navigator.language?.startsWith("zh") ? "zh" : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("platewise.lang", l);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
  }, []);
  const value = useMemo<Ctx>(() => {
    const dict = lang === "zh" ? zh : en;
    const v = (value: string) => VOCAB[value]?.[lang === "zh" ? 1 : 0] ?? value;
    const t = (key: Key, params?: Record<string, string | number>) =>
      (dict[key] ?? en[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => {
        const p = params?.[k];
        return p === undefined ? "" : typeof p === "string" ? v(p) : String(p);
      });
    return { lang, setLang, t, v };
  }, [lang, setLang]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18n);
  if (!ctx) throw new Error("useI18n outside provider");
  return ctx;
}

export const hasKey = (k: string): k is Key => k in en;
