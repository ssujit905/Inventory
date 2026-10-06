/**
 * Card/list thumbnails live next to the full image:
 *   products/abc123.jpg  ->  products/thumb_abc123.jpg  (640px JPEG)
 * Generated for every product image by the one-time bucket migration and by
 * desktop/mobile uploadImage for new uploads. Non-product URLs pass through.
 */
export function thumbUrl(url) {
    if (!url || typeof url !== 'string') return url;
    const m = url.match(/^(.*\/products\/)(?!thumb_)([^/?#]+?)(\.[a-z0-9]+)?([?#].*)?$/i);
    if (!m) return url;
    return `${m[1]}thumb_${m[2]}.jpg${m[4] || ''}`;
}
