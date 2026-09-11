import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const SettingsContext = createContext();

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }) => {
    const [settings, setSettings] = useState({});
    const [settingsLoading, setSettingsLoading] = useState(true);

    useEffect(() => {
        const fetchSettings = async () => {
            const { data } = await supabase.from('website_settings').select('*');
            if (data) {
                const map = {};
                data.forEach(s => {
                    // Gateway secrets must only exist as Edge Function secrets.
                    if (!['esewa_secret_key', 'fonepay_secret_key'].includes(s.key)) map[s.key] = s.value;
                });
                setSettings(map);
            }
            setSettingsLoading(false);
        };
        fetchSettings();
    }, []);

    // SECURITY: read-only on the public website. Settings (flash sale toggles,
    // store info, payment config) must only be changed from the inventory
    // desktop/mobile apps by authenticated staff — enforced by the
    // website_settings RLS policies (see fix_website_settings_rls.sql).
    // A previous version exposed saveSetting() (anon upsert) here, which let
    // any visitor rewrite store settings. Do not re-add a client write path.
    return (
        <SettingsContext.Provider value={{ settings, settingsLoading }}>
            {children}
        </SettingsContext.Provider>
    );
};
