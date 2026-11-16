/**
 * Provider adapters: one interface for every outside platform, so the rest of
 * the app never knows whether it is talking to a live API or a mock. Without
 * credentials every grocery adapter returns an in-app demo hand-off page.
 */

export interface LineItem {
  foodId: string;
  name: string;
  grams: number;
}

export interface ShoppingLink {
  url: string;
  mode: "live" | "mock";
}

export interface GroceryProvider {
  id: "instacart" | "kroger";
  buildShoppingLink(title: string, items: LineItem[]): Promise<ShoppingLink>;
}

const mockLink = (provider: string, title: string, items: LineItem[]): ShoppingLink => ({
  url: `/handoff/${provider}?title=${encodeURIComponent(title)}&items=${encodeURIComponent(items.map((i) => `${i.name}:${Math.ceil(i.grams)}`).join("|"))}`,
  mode: "mock",
});

/**
 * Instacart Developer Platform: POST /idp/v1/products/products_link creates a
 * shareable shopping-list or recipe page. Field names follow the public docs;
 * verify the response shape against your API key's environment before launch.
 */
export class InstacartProvider implements GroceryProvider {
  readonly id = "instacart" as const;
  constructor(
    private readonly apiKey?: string,
    private readonly baseUrl = "https://connect.instacart.com",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async buildShoppingLink(title: string, items: LineItem[]): Promise<ShoppingLink> {
    if (!this.apiKey) return mockLink(this.id, title, items);
    const res = await this.fetchImpl(`${this.baseUrl}/idp/v1/products/products_link`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        title,
        link_type: "shopping_list",
        line_items: items.map((i) => ({ name: i.name, quantity: Math.ceil(i.grams), unit: "gram" })),
      }),
    });
    if (!res.ok) throw new Error(`Instacart responded ${res.status}`);
    const body = (await res.json()) as { products_link_url?: string; url?: string };
    const url = body.products_link_url ?? body.url;
    if (!url) throw new Error("Instacart response had no link");
    return { url, mode: "live" };
  }
}

/**
 * Kroger Public API can add items to a signed-in shopper's cart (OAuth 2.0
 * authorization-code flow) but cannot check out or read the cart. Until the
 * OAuth flow is configured this adapter returns the demo hand-off.
 */
export class KrogerProvider implements GroceryProvider {
  readonly id = "kroger" as const;
  async buildShoppingLink(title: string, items: LineItem[]): Promise<ShoppingLink> {
    return mockLink(this.id, title, items);
  }
}

/** Deep links. Delivery-app search URL formats are not documented APIs; re-test them before launch. */
export const deepLinks = {
  doordash: (q: string) => `https://www.doordash.com/search/store/${encodeURIComponent(q)}/`,
  ubereats: (q: string) => `https://www.ubereats.com/search?q=${encodeURIComponent(q)}`,
  /** Google Maps URLs (documented, no key needed). */
  googleMaps: (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,
};

export function groceryProviders(env = process.env): Record<GroceryProvider["id"], GroceryProvider> {
  return {
    instacart: new InstacartProvider(env.INSTACART_API_KEY, env.INSTACART_BASE_URL ?? undefined),
    kroger: new KrogerProvider(),
  };
}
