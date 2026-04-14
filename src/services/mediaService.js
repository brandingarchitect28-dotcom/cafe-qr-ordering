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
  try {
    const res = await fetch(
      `${PEXELS_BASE}/videos/search?query=${encodeURIComponent(query + ' food')}&per_page=5&orientation=landscape`,
      { headers: { Authorization: apiKey } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const video = data.videos?.[0];
    if (!video) return null;

    // Pick lowest-resolution video file to minimise size
    const files = video.video_files || [];
    const sorted = files
      .filter(f => f.link && (f.file_type === 'video/mp4' || f.link.includes('.mp4')))
      .sort((a, b) => (a.width || 9999) - (b.width || 9999));

    const chosen = sorted[0];
    if (!chosen) return null;

    return { url: chosen.link, type: 'video', thumb: video.image };
  } catch {
    return null;
  }
};

/**
 * Fetch an image from Pexels for a food item.
 * Returns { url: string, type: 'image' } or null.
 */
export const fetchPexelsImage = async (query, apiKey) => {
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `${PEXELS_BASE}/v1/search?query=${encodeURIComponent(query + ' food dish')}&per_page=5&orientation=square`,
      { headers: { Authorization: apiKey } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const photo = data.photos?.[0];
    if (!photo) return null;

    // Use medium size to keep payload reasonable
    const url = photo.src?.medium || photo.src?.original;
    if (!url) return null;

    return { url, type: 'image' };
  } catch {
    return null;
  }
};

/**
 * Generate an AI image via the Anthropic messages API (tool_use → image).
 * Returns { url: string (data URI), type: 'image' } or null.
 */
export const generateAIImage = async (itemName) => {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Generate a realistic, appetising top-down food photo of "${itemName}". 
                    Respond ONLY with a base64-encoded JPEG image, nothing else.`,
        }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Claude may return image content block
    const imageBlock = data.content?.find(b => b.type === 'image');
    if (imageBlock?.source?.data) {
      return {
        url: `data:${imageBlock.source.media_type || 'image/jpeg'};base64,${imageBlock.source.data}`,
        type: 'image',
      };
    }
    return null;
  } catch {
    return null;
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
