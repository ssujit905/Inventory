import { useState, useEffect } from 'react';
import {
    Sparkles, Search, AlertTriangle, CheckCircle2,
    RefreshCw, Flame, Key, Eye, ShoppingBag, CreditCard,
    Activity, X
} from 'lucide-react';
import {
    fetchStoreAnalytics,
    generateAIStoreDiagnosis,
    getLatestAIInsight,
    getGroqApiKey,
    updateGroqApiKey
} from '../lib/aiDoctorService';
import type { AggregatedStoreData, AIInsightRecord } from '../lib/aiDoctorService';

export default function AIStoreDoctor() {
    const [periodDays, setPeriodDays] = useState<number>(7);
    const [loading, setLoading] = useState(true);
    const [runningAudit, setRunningAudit] = useState(false);
    const [metrics, setMetrics] = useState<AggregatedStoreData | null>(null);
    const [insight, setInsight] = useState<AIInsightRecord | null>(null);
    const [auditError, setAuditError] = useState<string | null>(null);

    // API Key management
    const [showKeyModal, setShowKeyModal] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [savingKey, setSavingKey] = useState(false);

    useEffect(() => {
        loadData();
    }, [periodDays]);

    const loadData = async () => {
        setLoading(true);
        setAuditError(null);
        try {
            const [rawMetrics, latestInsight, key] = await Promise.all([
                fetchStoreAnalytics(periodDays),
                getLatestAIInsight(),
                getGroqApiKey()
            ]);
            setMetrics(rawMetrics);
            setInsight(latestInsight);
            setApiKey(key || '');
        } catch (err: any) {
            console.error('Failed to load store analytics:', err);
            setAuditError(err.message || 'Failed to load analytics');
        } finally {
            setLoading(false);
        }
    };

    const handleRunAudit = async () => {
        setRunningAudit(true);
        setAuditError(null);
        try {
            const newInsight = await generateAIStoreDiagnosis(periodDays);
            setInsight(newInsight);
            const updatedMetrics = await fetchStoreAnalytics(periodDays);
            setMetrics(updatedMetrics);
        } catch (err: any) {
            console.error('Audit failed:', err);
            setAuditError(err.message || 'Audit failed. Check Groq API Key.');
        } finally {
            setRunningAudit(false);
        }
    };

    const handleSaveKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!apiKey.trim()) return;
        setSavingKey(true);
        try {
            const ok = await updateGroqApiKey(apiKey.trim());
            if (ok) {
                setShowKeyModal(false);
            } else {
                setAuditError('Failed to save API key.');
            }
        } catch (err: any) {
            setAuditError(err.message || 'Failed to save key');
        } finally {
            setSavingKey(false);
        }
    };

    const renderMarkdownContent = (md: string) => {
        if (!md) return null;
        const lines = md.split('\n');

        return lines.map((line, idx) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('## ')) {
                return (
                    <h3 key={idx} className="text-base font-black text-gray-900 dark:text-gray-100 mt-5 mb-2 flex items-center gap-2">
                        <Sparkles size={14} className="text-amber-500 flex-shrink-0" />
                        <span>{trimmed.replace('## ', '')}</span>
                    </h3>
                );
            }
            if (trimmed.startsWith('### ')) {
                return (
                    <h4 key={idx} className="text-xs font-bold text-gray-800 dark:text-gray-200 mt-3 mb-1.5">
                        {trimmed.replace('### ', '')}
                    </h4>
                );
            }
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                const content = trimmed.substring(2);
                return (
                    <div key={idx} className="flex items-start gap-2 my-1.5 text-xs text-gray-600 dark:text-gray-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                        <span dangerouslySetInnerHTML={{ __html: formatBold(content) }} />
                    </div>
                );
            }
            if (/^\d+\.\s/.test(trimmed)) {
                return (
                    <div key={idx} className="p-3.5 my-2 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 text-xs text-gray-700 dark:text-gray-200 leading-relaxed">
                        <span dangerouslySetInnerHTML={{ __html: formatBold(trimmed) }} />
                    </div>
                );
            }
            if (trimmed.length > 0) {
                return (
                    <p key={idx} className="text-xs text-gray-600 dark:text-gray-400 my-1.5 leading-relaxed"
                       dangerouslySetInnerHTML={{ __html: formatBold(trimmed) }}
                    />
                );
            }
            return null;
        });
    };

    const formatBold = (text: string) => {
        return text.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-gray-900 dark:text-gray-100">$1</strong>');
    };

    const funnel = metrics?.funnel;

    return (
        <div className="space-y-5 pb-6">
            {/* Top Header Card */}
            <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-white shadow-md shadow-amber-500/20">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-gray-900 dark:text-gray-100 tracking-tight flex items-center gap-1.5">
                                AI Store Doctor
                            </h2>
                            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">
                                Groq Qwen-3.8 Free
                            </span>
                        </div>
                    </div>

                    {/* Period Selector */}
                    <div className="flex items-center bg-gray-50 dark:bg-gray-800 p-1 rounded-xl border border-gray-200/60 dark:border-gray-700">
                        <button
                            onClick={() => setPeriodDays(7)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${periodDays === 7 ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs' : 'text-gray-500'}`}
                        >
                            7D
                        </button>
                        <button
                            onClick={() => setPeriodDays(30)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${periodDays === 30 ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs' : 'text-gray-500'}`}
                        >
                            30D
                        </button>
                    </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                        onClick={() => setShowKeyModal(true)}
                        className="py-2.5 px-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200/60 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                        <Key size={14} className="text-amber-500" />
                        <span>{apiKey ? 'Key Ready' : 'Set Key'}</span>
                    </button>

                    <button
                        onClick={handleRunAudit}
                        disabled={runningAudit || loading}
                        className="py-2.5 px-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/20 disabled:opacity-50"
                    >
                        {runningAudit ? (
                            <>
                                <RefreshCw size={14} className="animate-spin" />
                                <span>Diagnosing...</span>
                            </>
                        ) : (
                            <>
                                <Activity size={14} />
                                <span>Run Audit</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Error Banner */}
            {auditError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={14} />
                        <span>{auditError}</span>
                    </div>
                    <button onClick={() => setAuditError(null)} className="text-rose-500">
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Funnel Overview */}
            <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-black text-gray-900 dark:text-gray-100">
                            Funnel & Drop-off
                        </h3>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                            Customer Journey
                        </p>
                    </div>
                    <span className="text-xs font-black text-emerald-600 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30">
                        {funnel?.overallConversionRate || 0}% Conv.
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                        <div className="flex items-center justify-between text-gray-400 text-[10px] font-bold uppercase">
                            <span>1. Visits</span>
                            <Eye size={12} className="text-blue-500" />
                        </div>
                        <div className="text-lg font-black text-gray-900 dark:text-gray-100 mt-1">
                            {funnel?.totalPageVisits || 0}
                        </div>
                    </div>

                    <div className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                        <div className="flex items-center justify-between text-gray-400 text-[10px] font-bold uppercase">
                            <span>2. Views</span>
                            <ShoppingBag size={12} className="text-indigo-500" />
                        </div>
                        <div className="text-lg font-black text-gray-900 dark:text-gray-100 mt-1">
                            {funnel?.totalProductViews || 0}
                        </div>
                        <div className="text-[10px] text-indigo-500 font-bold mt-0.5">{funnel?.viewToCartRate || 0}% to cart</div>
                    </div>

                    <div className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                        <div className="flex items-center justify-between text-gray-400 text-[10px] font-bold uppercase">
                            <span>3. In Cart</span>
                            <ShoppingBag size={12} className="text-amber-500" />
                        </div>
                        <div className="text-lg font-black text-gray-900 dark:text-gray-100 mt-1">
                            {funnel?.totalAddToCart || 0}
                        </div>
                        <div className="text-[10px] text-amber-500 font-bold mt-0.5">{funnel?.cartToCheckoutRate || 0}% to chkout</div>
                    </div>

                    <div className="p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
                        <div className="flex items-center justify-between text-emerald-600 text-[10px] font-bold uppercase">
                            <span>4. Orders</span>
                            <CheckCircle2 size={12} className="text-emerald-500" />
                        </div>
                        <div className="text-lg font-black text-emerald-700 dark:text-emerald-300 mt-1">
                            {funnel?.totalOrdersCompleted || 0}
                        </div>
                        <div className="text-[10px] text-emerald-600 font-bold mt-0.5">Purchased</div>
                    </div>
                </div>
            </div>

            {/* Zero-Result Searches (Missed Demand) */}
            <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 border border-rose-100 dark:border-rose-950/30 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Flame size={18} className="text-rose-500" />
                        <div>
                            <h3 className="text-sm font-black text-gray-900 dark:text-gray-100">
                                Missed Demand
                            </h3>
                            <p className="text-[10px] text-rose-500 font-bold uppercase tracking-widest">
                                0-Result Searches
                            </p>
                        </div>
                    </div>
                    <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                        {metrics?.zeroResultSearches.length || 0} Items
                    </span>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {metrics?.zeroResultSearches && metrics.zeroResultSearches.length > 0 ? (
                        metrics.zeroResultSearches.map((s, idx) => (
                            <div
                                key={idx}
                                className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100/60 dark:border-rose-900/30 text-xs"
                            >
                                <div className="flex items-center gap-1.5 font-bold text-gray-800 dark:text-gray-200">
                                    <Search size={12} className="text-rose-500" />
                                    <span>"{s.query}"</span>
                                </div>
                                <span className="text-[11px] font-black text-rose-600 px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/40">
                                    {s.zeroResultsCount} {s.zeroResultsCount === 1 ? 'search' : 'searches'}
                                </span>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-4 text-xs text-gray-400">
                            No zero-result searches in this period
                        </div>
                    )}
                </div>
            </div>

            {/* AI Executive Report */}
            <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-2">
                        <Sparkles size={18} className="text-indigo-500" />
                        <h3 className="text-sm font-black text-gray-900 dark:text-gray-100">
                            AI Store Diagnosis
                        </h3>
                    </div>

                    {insight && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-black">
                            Score: {insight.health_score}/100
                        </div>
                    )}
                </div>

                <div>
                    {insight ? (
                        <div>
                            {renderMarkdownContent(insight.summary_markdown)}
                            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400 text-center">
                                Generated: {new Date(insight.created_at || Date.now()).toLocaleDateString()}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-6">
                            <Sparkles size={28} className="mx-auto text-gray-300 dark:text-gray-700 mb-2" />
                            <p className="text-xs text-gray-500">Tap "Run Audit" to get your store diagnosis</p>
                        </div>
                    )}
                </div>
            </div>

            {/* API Key Modal */}
            {showKeyModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 max-w-sm w-full border border-gray-100 dark:border-gray-800 shadow-2xl">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Key size={18} className="text-amber-500" />
                                <h3 className="text-sm font-black text-gray-900 dark:text-gray-100">Groq API Key</h3>
                            </div>
                            <button onClick={() => setShowKeyModal(false)} className="text-gray-400">
                                <X size={18} />
                            </button>
                        </div>

                        <p className="text-[11px] text-gray-500 mb-3">
                            Saved in your Supabase database settings. Free tier, no credit card.
                        </p>

                        <form onSubmit={handleSaveKey} className="space-y-3">
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="gsk_..."
                                className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-mono focus:outline-none"
                                required
                            />
                            <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setShowKeyModal(false)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-500"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingKey}
                                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold uppercase"
                                >
                                    {savingKey ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
