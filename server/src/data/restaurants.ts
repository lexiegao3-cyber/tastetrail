import type { RestaurantCuisine } from "../vocab.js";

/**
 * Fictional demo restaurants around Boston, MA so group dining works offline.
 * Names, phone numbers (555 test range) and ratings are invented. In production
 * the same fields come from Google Places API (New), keyed by place_id.
 */
export interface Restaurant {
  id: string;
  name: string;
  cuisine: RestaurantCuisine;
  lat: number;
  lng: number;
  priceMin: number;
  priceMax: number;
  rating: number;
  reviewCount: number;
  phone: string;
  /** 24h local opening hours; close may exceed 24 for after-midnight. */
  open: number;
  close: number;
  attrs: {
    largeTables?: boolean;
    quiet?: boolean;
    kidsMenu?: boolean;
    liveMusic?: boolean;
    bar?: boolean;
    vegetarian?: boolean;
    halal?: boolean;
    kosher?: boolean;
    reservable?: boolean;
  };
}

export const NEIGHBORHOODS = [
  { id: "back-bay", en: "Back Bay", zh: "后湾", lat: 42.3503, lng: -71.081 },
  { id: "cambridge", en: "Cambridge (Central Sq)", zh: "剑桥中央广场", lat: 42.3651, lng: -71.1037 },
  { id: "allston", en: "Allston", zh: "奥尔斯顿", lat: 42.3539, lng: -71.1337 },
  { id: "seaport", en: "Seaport", zh: "海港区", lat: 42.3489, lng: -71.0425 },
  { id: "south-end", en: "South End", zh: "南端", lat: 42.3388, lng: -71.0765 },
  { id: "somerville", en: "Somerville (Davis Sq)", zh: "萨默维尔", lat: 42.3967, lng: -71.1226 },
] as const;

export const RESTAURANTS: Restaurant[] = [
  { id: "ember-hotpot", name: "Ember Hotpot House", cuisine: "hotpot", lat: 42.3512, lng: -71.0627, priceMin: 30, priceMax: 45, rating: 4.6, reviewCount: 820, phone: "(555) 010-2001", open: 11, close: 23, attrs: { largeTables: true, vegetarian: true, reservable: true, bar: true } },
  { id: "red-broth", name: "Red Broth Hotpot Bar", cuisine: "hotpot", lat: 42.3647, lng: -71.1012, priceMin: 25, priceMax: 38, rating: 4.3, reviewCount: 410, phone: "(555) 010-2002", open: 12, close: 24, attrs: { largeTables: true, vegetarian: true, bar: true } },
  { id: "seoul-grill", name: "Seoul Grill Table", cuisine: "korean-bbq", lat: 42.3531, lng: -71.1302, priceMin: 28, priceMax: 50, rating: 4.5, reviewCount: 640, phone: "(555) 010-2003", open: 11, close: 23, attrs: { largeTables: true, reservable: true, bar: true } },
  { id: "kumo-sushi", name: "Kumo Sushi", cuisine: "japanese", lat: 42.3495, lng: -71.0798, priceMin: 35, priceMax: 70, rating: 4.7, reviewCount: 530, phone: "(555) 010-2004", open: 17, close: 22, attrs: { quiet: true, reservable: true, bar: true } },
  { id: "noodle-lab", name: "Noodle Lab Ramen", cuisine: "japanese", lat: 42.3962, lng: -71.1218, priceMin: 16, priceMax: 24, rating: 4.4, reviewCount: 920, phone: "(555) 010-2005", open: 11, close: 22, attrs: { vegetarian: true } },
  { id: "jade-garden", name: "Jade Garden Dim Sum", cuisine: "chinese", lat: 42.3505, lng: -71.0605, priceMin: 18, priceMax: 32, rating: 4.4, reviewCount: 1100, phone: "(555) 010-2006", open: 9, close: 21, attrs: { largeTables: true, kidsMenu: true, vegetarian: true, reservable: true } },
  { id: "sichuan-house", name: "Little Sichuan House", cuisine: "chinese", lat: 42.3659, lng: -71.1049, priceMin: 20, priceMax: 34, rating: 4.5, reviewCount: 760, phone: "(555) 010-2007", open: 11, close: 22, attrs: { largeTables: true, vegetarian: true } },
  { id: "basil-thai", name: "Basil & Lime Thai", cuisine: "thai", lat: 42.3394, lng: -71.0752, priceMin: 18, priceMax: 30, rating: 4.3, reviewCount: 480, phone: "(555) 010-2008", open: 11, close: 22, attrs: { vegetarian: true, quiet: true, reservable: true } },
  { id: "pho-corner", name: "Pho Corner", cuisine: "vietnamese", lat: 42.3528, lng: -71.1325, priceMin: 14, priceMax: 22, rating: 4.4, reviewCount: 860, phone: "(555) 010-2009", open: 10, close: 21, attrs: { kidsMenu: true, vegetarian: true } },
  { id: "saffron-table", name: "Saffron Table", cuisine: "indian", lat: 42.3641, lng: -71.1021, priceMin: 20, priceMax: 36, rating: 4.6, reviewCount: 590, phone: "(555) 010-2010", open: 11, close: 22, attrs: { vegetarian: true, halal: true, largeTables: true, reservable: true } },
  { id: "casa-verde", name: "Casa Verde Taqueria", cuisine: "mexican", lat: 42.3973, lng: -71.1209, priceMin: 12, priceMax: 20, rating: 4.2, reviewCount: 700, phone: "(555) 010-2011", open: 10, close: 23, attrs: { kidsMenu: true, vegetarian: true, bar: true } },
  { id: "luna-trattoria", name: "Luna Trattoria", cuisine: "italian", lat: 42.3382, lng: -71.0741, priceMin: 30, priceMax: 60, rating: 4.6, reviewCount: 450, phone: "(555) 010-2012", open: 17, close: 23, attrs: { quiet: true, reservable: true, bar: true, vegetarian: true } },
  { id: "pizza-forno", name: "Forno Pizza Co.", cuisine: "italian", lat: 42.3478, lng: -71.0441, priceMin: 16, priceMax: 28, rating: 4.3, reviewCount: 980, phone: "(555) 010-2013", open: 11, close: 23, attrs: { largeTables: true, kidsMenu: true, vegetarian: true, liveMusic: true } },
  { id: "olive-and-fig", name: "Olive & Fig Mezze", cuisine: "mediterranean", lat: 42.3491, lng: -71.0815, priceMin: 22, priceMax: 40, rating: 4.5, reviewCount: 380, phone: "(555) 010-2014", open: 11, close: 22, attrs: { vegetarian: true, halal: true, quiet: true, reservable: true } },
  { id: "smokehouse", name: "Harbor Smokehouse BBQ", cuisine: "american-bbq", lat: 42.3502, lng: -71.0432, priceMin: 22, priceMax: 40, rating: 4.4, reviewCount: 670, phone: "(555) 010-2015", open: 11, close: 23, attrs: { largeTables: true, kidsMenu: true, liveMusic: true, bar: true } },
  { id: "corner-diner", name: "Corner Street Diner", cuisine: "american", lat: 42.3375, lng: -71.0779, priceMin: 14, priceMax: 24, rating: 4.1, reviewCount: 540, phone: "(555) 010-2016", open: 7, close: 21, attrs: { kidsMenu: true, vegetarian: true, kosher: true } },
];
