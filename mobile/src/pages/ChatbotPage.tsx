import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { MessageSquare, Save, Loader2, Bot, Shield, AlertCircle, CheckCircle2, Zap, BrainCircuit, Globe } from 'lucide-react'
import DashboardLayout from '../layouts/DashboardLayout'
import { useAuthStore } from '../hooks/useAuthStore'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'

export default function ChatbotPage() {
    const { profile } = useAuthStore()
    const [loading, setLoading] = useState(false)
    const [fetching, setFetching] = useState(true)
    const [status, setStatus] = useState<{ type: 'success' | 'error', text: string } | null>(null)

    // Settings State
    const [chatbotEnabled, setChatbotEnabled] = useState(true)
    const [tempChatbotEnabled, setTempChatbotEnabled] = useState(true)
    const [lastSynced, setLastSynced] = useState<Date | null>(null)

    const fetchSettings = async (showLoading = true) => {
        if (showLoading) setFetching(true)
        try {
            const { data, error } = await supabase
                .from('settings')
                .select('value')
                .eq('key', 'chatbot_enabled')
                .maybeSingle()

            if (error) throw error

            if (data) {
                const isEnabled = data.value === 'true'
                setChatbotEnabled(isEnabled)
                // Only update temp if user hasn't made local changes they haven't synced yet
                setTempChatbotEnabled(prevTemp => {
                    const currentSync = isEnabled;
                    // If temp matches old synced value, it means no local edits, so sync it.
                    // If it differs, user is in the middle of a change, don't overwrite.
                    return prevTemp === chatbotEnabled ? currentSync : prevTemp;
                });
                setLastSynced(new Date())
            }
        } catch (err) {
            console.error('Fetch error:', err)
        } finally {
            if (showLoading) setFetching(false)
        }
    }

    useEffect(() => {
        fetchSettings(true)
    }, [])

    useRealtimeRefresh(() => fetchSettings(false), {
        channelName: 'chatbot-settings-sync-v2',
        tables: ['settings'],
        enabled: true,
        pollMs: 5000 // More frequent polling for chatbot control
    })

    const handleSaveSettings = async () => {
        setLoading(true)
        try {
            const { error } = await supabase
                .from('settings')
                .upsert({ key: 'chatbot_enabled', value: String(tempChatbotEnabled) })

            if (error) throw error

            setChatbotEnabled(tempChatbotEnabled)
            setStatus({ type: 'success', text: 'Chatbot settings synchronized successfully!' })
            setTimeout(() => setStatus(null), 3000)
        } catch (err: any) {
            console.error('Save error:', err)
            setStatus({ type: 'error', text: `Error: ${err.message}` })
        } finally {
            setLoading(false)
        }
    }

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="max-w-7xl mx-auto space-y-8 pb-24">
                {/* Header Section */}
                <div className="flex flex-col gap-4 border-b dark:border-gray-800 pb-6">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 dark:text-gray-100 font-outfit tracking-tight">AI Messenger Bot</h1>
                        <p className="text-sm text-gray-500 font-medium mt-2 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Bot size={16} className="text-primary" /> Automation & Lead Collection
                        </p>
                    </div>
                </div>

                {status && (
                    <div className={`p-6 rounded-3xl text-sm font-black flex items-center gap-4 animate-in slide-in-from-top-4 ${status.type === 'success'
                        ? 'bg-green-100 text-green-700 border border-green-200 shadow-lg shadow-green-500/10'
                        : 'bg-rose-100 text-rose-700 border border-rose-200 shadow-lg shadow-rose-500/10'
                        }`}>
                        {status.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                        {status.text}
                    </div>
                )}

                {fetching ? (
                    <div className="py-24 text-center bg-white dark:bg-gray-900 rounded-[2.5rem] border border-gray-100 dark:border-gray-800">
                        <div className="flex flex-col items-center gap-4">
                            <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div>
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Waking up AI...</span>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-8">
                        {/* Control Panel Card */}
                        <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] overflow-hidden border border-gray-100 dark:border-gray-800 shadow-sm">
                            <div className="p-8 border-b border-gray-50 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Global Connectivity</h3>
                                        <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest leading-loose">Control your Facebook Messenger Automation</p>
                                    </div>
                                    <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${tempChatbotEnabled ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-gray-100 text-gray-400'}`}>
                                        <MessageSquare size={24} />
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 space-y-8">
                                {/* Toggle Switch Area */}
                                <div className="flex items-center justify-between p-6 bg-gray-50 dark:bg-gray-800 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700">
                                    <div className="flex gap-4">
                                        <div className={`mt-1 h-2 w-2 rounded-full animate-pulse ${tempChatbotEnabled ? 'bg-green-500' : 'bg-rose-500'}`} />
                                        <div>
                                            <h4 className="text-base font-black text-gray-900 dark:text-gray-100">
                                                Bot Status: <span className={tempChatbotEnabled ? 'text-primary' : 'text-gray-400'}>{tempChatbotEnabled ? 'ACTIVE' : 'DISABLED'}</span>
                                            </h4>
                                            <p className="text-xs text-gray-400 font-medium mt-1 leading-relaxed max-w-xs">
                                                When enabled, the bot will automatically respond to customer inquiries and collect orders on Messenger.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setTempChatbotEnabled(!tempChatbotEnabled)}
                                        className={`relative inline-flex h-8 w-14 items-center rounded-full transition-all focus:outline-none ring-offset-2 focus:ring-2 focus:ring-primary/20 ${tempChatbotEnabled ? 'bg-primary shadow-inner' : 'bg-gray-300 dark:bg-gray-700'
                                            }`}
                                    >
                                        <span
                                            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-xl transition-all duration-300 ease-spring ${tempChatbotEnabled ? 'translate-x-7' : 'translate-x-1'
                                                }`}
                                        />
                                    </button>
                                </div>

                                {/* Moved Sync Button Section here, just below the toggle area */}
                                <div className="mt-8 pt-8 border-t border-gray-50 dark:border-gray-800">
                                    <button
                                        onClick={handleSaveSettings}
                                        disabled={loading || tempChatbotEnabled === chatbotEnabled}
                                        className="w-full h-16 bg-primary hover:bg-primary/90 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white font-black rounded-2xl transition-all shadow-xl shadow-primary/20 text-sm uppercase tracking-widest flex items-center justify-center gap-3 active:scale-[0.98]"
                                    >
                                        {loading ? <Loader2 className="animate-spin" size={20} /> : <Zap size={20} />}
                                        Sync AI Controller
                                    </button>
                                    <div className="mt-4 flex flex-col items-center gap-2">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] italic text-center">Changes reflect globally on Messenger within 60 seconds.</p>
                                        {lastSynced && (
                                            <p className="text-[8px] text-gray-300 font-bold uppercase tracking-widest">
                                                Last Synced: {lastSynced.toLocaleTimeString()}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Feature List (Now Outside Main Card like Desktop) */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <FeatureBox
                                icon={<Globe size={18} />}
                                title="24/7 Presence"
                                desc="Your store never sleeps. Collect orders while you rest."
                            />
                            <FeatureBox
                                icon={<BrainCircuit size={18} />}
                                title="Smart FAQ"
                                desc="Automatically answers price, location, and delivery questions."
                            />
                            <FeatureBox
                                icon={<Shield size={18} />}
                                title="Lead Protection"
                                desc="Directly saves every order into your private dashboard."
                            />
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    )
}

function FeatureBox({ icon, title, desc }: { icon: any, title: string, desc: string }) {
    return (
        <div className="p-6 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl group hover:border-primary/30 transition-all">
            <div className="h-10 w-10 bg-gray-50 dark:bg-gray-800 text-gray-400 group-hover:bg-primary/10 group-hover:text-primary rounded-xl flex items-center justify-center mb-4 transition-all">
                {icon}
            </div>
            <h5 className="text-sm font-black text-gray-900 dark:text-gray-100 mb-1">{title}</h5>
            <p className="text-[11px] text-gray-400 font-medium leading-relaxed">{desc}</p>
        </div>
    )
}
