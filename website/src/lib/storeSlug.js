export const slugify = (text) => (text || '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40);

export const storeSlug = (profile) => {
  const base = slugify(profile?.store_name || profile?.full_name) || 'store';
  const short = (profile?.id || '').slice(0, 8);
  return short ? `${base}-${short}` : base;
};

export const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || '');