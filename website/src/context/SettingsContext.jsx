import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { safeFetch } from '../lib/safeFetch';

const SettingsContext = createContext();

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }) => {
    const [settings, setSettings] = useState({});
    const [settingsLoading, setSettingsLoading] = useState(true);
    const [settingsError, setSettingsError] = useState(null);

    const fetchSettings = useCallback(async () => {
        setSettingsLoading(true);
        setSettingsError(null);
        try {
            const { data, error } = await safeFetch(() =>
                supabase.from('website_settings').select('*')
            );
            if (error) {
                console.error('Failed to load website settings:', error);
                setSettingsError(error.message || 'Settings unavailable');
            } else if (data) {
                const map = {};
                data.forEach(s => {
                    // Gateway secrets must only exist as Edge Function secrets.
                    if (!['esewa_secret_key', 'fonepay_secret_key'].includes(s.key)) map[s.key] = s.value;
                });
                setSettings(map);
            }
        } catch (err) {
            console.error('Unexpected error loading settings:', err);
            setSettingsError(err?.message || 'Settings unavailable');
        } finally {
            setSettingsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    // SECURITY: read-only on the public website. Settings (flash sale toggles,
    // store info, payment config) must only be changed from the inventory
    // desktop/mobile apps by authenticated staff — enforced by the
    // website_settings RLS policies (see fix_website_settings_rls.sql).
    // A previous version exposed saveSetting() (anon upsert) here, which let
    // any visitor rewrite store settings. Do not re-add a client write path.
    return (
        <SettingsContext.Provider value={{ settings, settingsLoading, settingsError, refetchSettings: fetchSettings }}>
            {children}
        </SettingsContext.Provider>
    );
};
