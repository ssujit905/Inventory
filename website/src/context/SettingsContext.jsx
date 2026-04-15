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
                data.forEach(s => { map[s.key] = s.value; });
                setSettings(map);
            }
            setSettingsLoading(false);
        };
        fetchSettings();
    }, []);

    const saveSetting = async (key, value) => {
        const { error } = await supabase
            .from('website_settings')
            .upsert({ key, value }, { onConflict: 'key' });
        
        if (!error) {
            setSettings(prev => ({ ...prev, [key]: value }));
        }
        return { error };
    };

    return (
        <SettingsContext.Provider value={{ settings, settingsLoading, saveSetting }}>
            {children}
        </SettingsContext.Provider>
    );
};
