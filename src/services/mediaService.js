/**
 * mediaService.js
 *
 * Media resolution chain for AI Menu Upload:
 *   1. Fetch VIDEO from Pexels (preferred)
 *   2. Fallback → Fetch IMAGE from Pexels
 *   3. Fallback → Generate AI image via Claude API
 *   4. Fallback → return null (never blocks flow)
 *
 * Add-only — zero changes to existing menu logic.
 * Called per-item during enrichment step in AIMenuUpload.jsx.
 */

// ─── Pexels ───────────────────────────────────────────────────────────────────

const PEXELS_BASE = 'https://api.pexels.com';

/**
 * Fetch a short loopable video from Pexels for a food item.
 * Returns { url: string, type: 'video' } or null.
 */
export const fetchPexelsVideo = async (query, apiKey) => {
  if (!apiKey) return null;

  // Try bare name first, then with " food" — better for regional dish names
  const queries = [query.trim(), `${query.trim()} food`];

  for (const q of queries) {
    try {
      const res = await fetch(
        `${PEXELS_BASE}/videos/search?query=${encodeURIComponent(q)}&per_page=3&orientation=landscape`,
        { headers: { Authorization: apiKey } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const video = data.videos?.[0];
      if (!video) continue;

      // Pick lowest-resolution video file to minimise size
      const files = video.video_files || [];
      const sorted = files
        .filter(f => f.link && (f.file_type === 'video/mp4' || f.link.includes('.mp4')))
        .sort((a, b) => (a.width || 9999) - (b.width || 9999));

      const chosen = sorted[0];
      if (chosen) return { url: chosen.link, type: 'video', thumb: video.image };
    } catch {
      continue;
    }
  }
  return null;
};

/**
 * Fetch an image from Pexels for a food item.
 * Returns { url: string, type: 'image' } or null.
 */
export const fetchPexelsImage = async (query, apiKey) => {
  if (!apiKey) return null;

  // Try two queries: bare name first (better for regional foods), then with " food dish"
  const queries = [query.trim(), `${query.trim()} food dish`];

  for (const q of queries) {
    try {
      const res = await fetch(
        `${PEXELS_BASE}/v1/search?query=${encodeURIComponent(q)}&per_page=3&orientation=square`,
        { headers: { Authorization: apiKey } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const photo = data.photos?.[0];
      if (!photo) continue;

      // Use medium size to keep payload reasonable
      const url = photo.src?.medium || photo.src?.original;
      if (url) return { url, type: 'image' };
    } catch {
      continue;
    }
  }
  return null;
};

/**
 * Fallback image when Pexels returns nothing.
 * Uses Unsplash Source API — no key required, always returns a food photo.
 * Returns { url: string, type: 'image' } — never null.
 */
export const generateAIImage = async (itemName) => {
  try {
    // Unsplash Source: free, no API key, CORS-safe, returns relevant food photo
    const query = encodeURIComponent(itemName.trim() + ' food');
    // Use a fixed size (400x400) — fast to load, good quality for menu cards
    const url = `https://source.unsplash.com/400x400/?${query}`;

    // Verify the URL is reachable (HEAD request, no body)
    const check = await fetch(url, { method: 'HEAD' });
    if (check.ok) {
      return { url, type: 'image' };
    }
    // If Unsplash is down, use a static food placeholder
    return {
      url: `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=400&fit=crop`,
      type: 'image',
    };
  } catch {
    // Absolute last resort — always return something
    return {
      url: `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=400&fit=crop`,
      type: 'image',
    };
  }
};

/**
 * Main resolver — runs the full chain and always returns something or null.
 * @param {string} itemName   - Menu item name used as search query
 * @param {string} pexelsKey  - Pexels API key (from café settings)
 * @param {'video'|'image'|'auto'} preference - User's media preference
 * @returns {{ url, type, thumb? } | null}
 */
export const resolveMedia = async (itemName, pexelsKey, preference = 'auto') => {
  const query = itemName.trim();
  if (!query) return null;

  // Step 1: Try Pexels video (skip if user wants images only)
  if (preference !== 'image' && pexelsKey) {
    const video = await fetchPexelsVideo(query, pexelsKey);
    if (video) return video;
  }

  // Step 2: Try Pexels image
  if (pexelsKey) {
    const image = await fetchPexelsImage(query, pexelsKey);
    if (image) return image;
  }

  // Step 3: AI image fallback
  const aiImage = await generateAIImage(query);
  if (aiImage) return aiImage;

  // Step 4: Give up gracefully — never block the flow
  return null;
};
