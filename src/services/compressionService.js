/**
 * compressionService.js
 *
 * Browser-side media compression before upload/storage.
 *
 * IMAGE: Compresses to ≤ 200KB using Canvas API (no extra npm package needed).
 * VIDEO: Pexels URLs are already small (low-res mp4). For data-URI videos,
 *        warns if > 2MB and falls back to thumbnail image.
 *
 * Add-only — zero changes to existing upload logic.
 */

const MAX_IMAGE_BYTES = 200 * 1024;  // 200 KB
const MAX_VIDEO_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Compress a data-URI or blob URL image to under MAX_IMAGE_BYTES.
 * Returns a compressed data-URI string, or the original if compression fails.
 *
 * @param {string} imageSrc   - data: URI or https: URL
 * @param {number} quality    - initial JPEG quality (0–1), auto-reduced if needed
 * @returns {Promise<string>}  - compressed data-URI
 */
export const compressImage = async (imageSrc, quality = 0.85) => {
  if (!imageSrc) return imageSrc;

  // Skip compression for external URLs (Pexels CDN already optimised)
  if (imageSrc.startsWith('https://') || imageSrc.startsWith('http://')) {
    return imageSrc;
  }

  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');

        // Cap dimensions at 800×800 for menu thumbnails
        const MAX_DIM = 800;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
          width  = Math.round(width  * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width  = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Iteratively reduce quality until under MAX_IMAGE_BYTES
        let q = quality;
        let dataUrl = canvas.toDataURL('image/jpeg', q);

        while (dataUrl.length > MAX_IMAGE_BYTES * 1.37 && q > 0.2) {
          // base64 overhead ≈ 1.37×
          q -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', q);
        }

        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = imageSrc;
    });
  } catch (err) {
    console.warn('[compressionService] Image compression failed, using original:', err.message);
    return imageSrc; // Failsafe — never block the flow
  }
};

/**
 * Check a video URL/data-URI for size safety.
 * Pexels https links → always fine (streaming, not stored).
 * data: URIs → check size, warn if > MAX_VIDEO_BYTES.
 *
 * Returns { safe: boolean, warningMsg?: string }
 */
export const checkVideoSize = (videoSrc) => {
  if (!videoSrc) return { safe: true };

  // External URLs are fine — not stored in Firebase
  if (videoSrc.startsWith('https://') || videoSrc.startsWith('http://')) {
    return { safe: true };
  }

  // data: URI — estimate byte size
  const base64Part = videoSrc.split(',')[1] || '';
  const bytes = Math.round(base64Part.length * 0.75);

  if (bytes > MAX_VIDEO_BYTES) {
    return {
      safe: false,
      warningMsg: `Video is ${(bytes / 1024 / 1024).toFixed(1)}MB — too large to store. Falling back to image.`,
    };
  }

  return { safe: true };
};

/**
 * Process media before saving.
 * - Images: compress
 * - Videos: check size; if too large → return null so caller falls back to image
 *
 * @param {{ url: string, type: 'image'|'video', thumb?: string }} media
 * @returns {Promise<{ url: string, type: string } | null>}
 */
export const processMediaForStorage = async (media) => {
  if (!media?.url) return null;

  if (media.type === 'image') {
    const compressed = await compressImage(media.url);
    return { url: compressed, type: 'image' };
  }

  if (media.type === 'video') {
    const { safe, warningMsg } = checkVideoSize(media.url);
    if (!safe) {
      console.warn('[compressionService]', warningMsg);
      // Fall back to thumbnail if available
      if (media.thumb) {
        const compressed = await compressImage(media.thumb);
        return { url: compressed, type: 'image' };
      }
      return null;
    }
    // External video URL — safe to store as reference
    return { url: media.url, type: 'video' };
  }

  return null;
};
