export const slugify = (text: string) => (text || '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40);

export const storeSlug = (storeName: string, id: string) => {
  const base = slugify(storeName) || 'store';
  const short = (id || '').slice(0, 8);
  return short ? `${base}-${short}` : base;
};

export const WEBSITE_BASE_URL = (import.meta.env.VITE_WEBSITE_URL as string) || 'http://localhost:5174';

export const buildStoreLink = (storeName: string, id: string) =>
  `${WEBSITE_BASE_URL}/store/${storeSlug(storeName, id)}`;
