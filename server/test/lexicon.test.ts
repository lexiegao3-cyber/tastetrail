import { describe, expect, it } from "vitest";
import { classifyIngredient as c } from "../src/etl/lexicon.js";

const flags = (n: string) => c(n).flags;

describe("ingredient lexicon", () => {
  it("flags animal products and the FDA 9 allergens", () => {
    expect(flags("ground beef")).toEqual(["beef", "meat"]);
    expect(flags("bacon")).toEqual(["meat", "pork"]);
    expect(flags("boneless skinless chicken breasts")).toEqual(["poultry"]);
    expect(flags("raw shrimp")).toEqual(["a:shellfish", "shellfish"]);
    expect(flags("worcestershire sauce")).toEqual(["a:fish", "fish"]);
    expect(flags("sharp cheddar cheese")).toEqual(["a:milk", "dairy"]);
    expect(flags("mayonnaise")).toEqual(["a:egg", "egg"]);
    expect(flags("soy sauce")).toEqual(["a:soy", "a:wheat"]);
    expect(flags("toasted sesame oil")).toEqual(["a:sesame"]);
    expect(flags("chopped walnuts")).toEqual(["a:tree-nut"]);
    expect(flags("all-purpose flour")).toEqual(["a:wheat"]);
    expect(flags("cream of mushroom soup")).toEqual(["a:milk", "a:wheat", "dairy"]);
  });

  it("avoids common false positives", () => {
    expect(flags("peanut butter")).toEqual(["a:peanut"]);
    expect(flags("eggplant")).toEqual([]);
    expect(flags("coconut milk")).toEqual([]);
    expect(flags("cream of tartar")).toEqual([]);
    expect(flags("butternut squash")).toEqual([]);
    expect(flags("salmon steaks")).toEqual(["a:fish", "fish"]);
    expect(flags("hamburger buns")).toEqual(["a:wheat"]);
    expect(flags("corn tortillas")).toEqual([]);
    expect(flags("rice noodles")).toEqual([]);
    expect(flags("red wine vinegar")).toEqual([]);
    expect(flags("chickpeas")).toEqual([]);
    expect(flags("turkey sausage")).toEqual(["poultry"]);
    expect(flags("nutmeg")).toEqual([]);
    expect(flags("honeydew melon")).toEqual([]);
  });

  it("flags alcohol, gelatin, honey, allium and root vegetables", () => {
    expect(flags("dry white wine")).toEqual(["alcohol"]);
    expect(flags("unflavored gelatin")).toEqual(["gelatin"]);
    expect(flags("honey")).toEqual(["honey"]);
    expect(flags("garlic cloves")).toEqual(["allium", "root"]);
    expect(flags("carrots")).toEqual(["root"]);
  });

  it("assigns categories, broths before meats", () => {
    expect(c("chicken broth").category).toBe("condiment");
    expect(c("chicken broth").flags).toEqual(["poultry"]);
    expect(c("green bell pepper").category).toBe("produce");
    expect(c("black pepper").category).toBe("spice");
    expect(c("red pepper flakes").category).toBe("spice");
    expect(c("peanut butter").category).toBe("nut");
    expect(c("olive oil").category).toBe("oil");
    expect(c("cream cheese").category).toBe("cheese");
    expect(c("water").skip).toBe(true);
  });
});
