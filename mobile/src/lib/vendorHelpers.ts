import type { Profile } from '../types/database';

/**
 * Returns the vendor account id the current user belongs to:
 *   - role 'vendor'           -> their own profile id
 *   - role 'staff' + vendor_id -> their vendor's profile id (vendor-created staff)
 *   - main-store admin/staff  -> null
 */
export function getVendorId(profile: Profile | null | undefined): string | null {
    if (!profile) return null;
    if (profile.role === 'vendor') return profile.id;
    if (profile.role === 'staff' && profile.vendor_id) return profile.vendor_id;
    return null;
}

/** True when the user belongs to a vendor account (owner or their staff). */
export function isVendorMember(profile: Profile | null | undefined): boolean {
    return Boolean(getVendorId(profile));
}
