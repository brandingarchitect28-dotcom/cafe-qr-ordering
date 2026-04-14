/**
 * aiEnrichmentService.js
 *
 * Add-only enrichment layer for AI Menu Upload.
 *
 * Feature 3 — AI food details per item:
 *   ingredients, calories, protein, carbs, fat, description
 *
 * Feature 4 — Rule-based smart addons:
 *   Burger → cheese, extra patty | Pizza → extra cheese, toppings | etc.
 *
 * Zero changes to existing menu logic. Called only when user opts in.
 */

// ─── Feature 4: Rule-based addon suggestions ──────────────────────────────────

const ADDON_RULES = [
  {
    keywords: ['burger', 'patty', 'sliders'],
    addons: [
      { name: 'Extra Cheese',  price: 20 },
      { name: 'Extra Patty',   price: 50 },
      { name: 'Bacon Add-on',  price: 40 },
    ],
  },
  {
    keywords: ['pizza', 'flatbread'],
    addons: [
      { name: 'Extra Cheese',  price: 30 },
      { name: 'Extra Toppings', price: 40 },
      { name: 'Stuffed Crust', price: 50 },
    ],
  },
  {
    keywords: ['wrap', 'roll', 'burrito', 'kathi'],
    addons: [
      { name: 'Extra Sauce',   price: 15 },
      { name: 'Add Cheese',    price: 20 },
      { name: 'Extra Filling', price: 30 },
    ],
  },
  {
    keywords: ['coffee', 'latte', 'cappuccino', 'espresso', 'americano', 'mocha'],
    addons: [
      { name: 'Extra Shot',    price: 30 },
      { name: 'Soy Milk',     price: 25 },
      { name: 'Flavoured Syrup', price: 20 },
    ],
  },
  {
    keywords: ['shake', 'smoothie', 'milkshake', 'frappe'],
    addons: [
      { name: 'Extra Scoop',   price: 30 },
      { name: 'Whipped Cream', price: 20 },
      { name: 'Add Nuts',      price: 25 },
    ],
  },
  {
    keywords: ['sandwich', 'sub', 'hoagie', 'panini'],
    addons: [
      { name: 'Add Cheese',    price: 20 },
      { name: 'Extra Veggie',  price: 15 },
      { name: 'Double Filling', price: 40 },
    ],
  },
  {
    keywords: ['pasta', 'spaghetti', 'penne', 'noodle'],
    addons: [
      { name: 'Extra Cheese',  price: 25 },
      { name: 'Garlic Bread',  price: 30 },
      { name: 'Extra Sauce',   price: 20 },
    ],
  },
  {
    keywords: ['biryani', 'rice', 'pulao', 'fried rice'],
    addons: [
      { name: 'Raita',         price: 25 },
      { name: 'Papad',         price: 15 },
      { name: 'Extra Gravy',   price: 30 },
    ],
  },
  {
    keywords: ['dosa', 'idli', 'uttapam', 'vada'],
    addons: [
      { name: 'Extra Chutney', price: 10 },
      { name: 'Ghee',          price: 15 },
      { name: 'Extra Sambar',  price: 15 },
    ],
  },
];

/**
 * Get addon suggestions for an item name.
 * Rule-based — no API call, instant, zero cost.
 * Returns [] if no rule matches.
 */
export const getAddonSuggestions = (itemName = '') => {
  const lower = itemName.toLowerCase();
  for (const rule of ADDON_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      return rule.addons;
    }
  }
  return [];
};

// ─── Feature 3: AI food details via Claude ────────────────────────────────────

/**
 * Generate nutritional + ingredient details for one menu item.
 * Uses the Anthropic API via the existing fetch pattern.
 *
 * Returns:
 * {
 *   ingredients: string[],
 *   calories: string,
 *   protein: string,
 *   carbs: string,
 *   fat: string,
 *   description: string,
 * }
 * or null if the API call fails (caller should continue without enrichment).
 */
export const generateFoodDetails = async (itemName, existingDescription = '') => {
  if (!itemName?.trim()) return null;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are a nutritionist. For the menu item "${itemName}"${existingDescription ? ` (${existingDescription})` : ''}, provide estimated nutritional data.

Respond ONLY with valid JSON, no markdown, no preamble:
{
  "ingredients": ["ingredient1", "ingredient2"],
  "calories": "XXX kcal",
  "protein": "XXg",
  "carbs": "XXg",
  "fat": "XXg",
  "description": "One appetising sentence description (max 20 words)"
}

Use realistic approximations for a standard restaurant portion. Ingredients list max 6 items.`,
        }],
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '';

    // Strip any accidental markdown fences
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Validate shape — all fields must be present
    if (
      Array.isArray(parsed.ingredients) &&
      parsed.calories &&
      parsed.protein &&
      parsed.carbs &&
      parsed.fat &&
      parsed.description
    ) {
      return parsed;
    }

    return null;
  } catch (err) {
    console.warn('[aiEnrichmentService] generateFoodDetails failed for', itemName, ':', err.message);
    return null; // Failsafe — never block the flow
  }
};

/**
 * Enrich a batch of menu items.
 * Runs sequentially (not parallel) to avoid rate limiting.
 *
 * @param {Array<{name, description?, ...}>} items
 * @param {boolean} generateDetails  - from user preference
 * @param {boolean} generateAddons   - always true (rule-based, free)
 * @param {Function} onProgress      - called with (index, total) after each item
 * @returns {Promise<Array>}          - items with new optional fields added
 */
export const enrichItems = async (items, { generateDetails = true, generateAddons = true } = {}, onProgress) => {
  const enriched = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const extra = {};

    // Rule-based addons — instant, no API call
    if (generateAddons) {
      const suggestions = getAddonSuggestions(item.name);
      if (suggestions.length > 0) {
        extra.addons = suggestions;
      }
    }

    // AI nutritional details — optional, may be null
    if (generateDetails) {
      const details = await generateFoodDetails(item.name, item.description);
      if (details) {
        extra.ingredients  = details.ingredients;
        extra.calories     = details.calories;
        extra.protein      = details.protein;
        extra.carbs        = details.carbs;
        extra.fat          = details.fat;
        // Only override description if item has none
        if (!item.description?.trim()) {
          extra.description = details.description;
        }
      }
    }

    enriched.push({ ...item, ...extra });

    if (onProgress) onProgress(i + 1, items.length);
  }

  return enriched;
};
