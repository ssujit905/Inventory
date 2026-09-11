import { useState, useEffect } from 'react';
import {
    Sparkles, Search, ArrowRight, AlertTriangle, CheckCircle2,
    TrendingDown, RefreshCw, Flame, Key, ShieldCheck,
    Eye, ShoppingBag, CreditCard, ChevronRight, Activity, X
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
            // Refresh underlying metrics as well
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

    // Format simple Markdown text into structured React elements
    const renderMarkdownContent = (md: string) => {
        if (!md) return null;
        const lines = md.split('\n');

        return lines.map((line, idx) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('## ')) {
                return (
                    <h3 key={idx} className="text-lg font-black text-gray-900 dark:text-gray-100 mt-6 mb-3 flex items-center gap-2">
                        <Sparkles size={16} className="text-amber-500" />
                        {trimmed.replace('## ', '')}
                    </h3>
                );
            }
            if (trimmed.startsWith('### ')) {
                return (
                    <h4 key={idx} className="text-sm font-bold text-gray-800 dark:text-gray-200 mt-4 mb-2">
                        {trimmed.replace('### ', '')}
                    </h4>
                );
            }
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                const content = trimmed.substring(2);
                return (
                    <div key={idx} className="flex items-start gap-2.5 my-1.5 text-sm text-gray-600 dark:text-gray-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                        <span dangerouslySetInnerHTML={{ __html: formatBold(content) }} />
                    </div>
                );
            }
            if (/^\d+\.\s/.test(trimmed)) {
                return (
                    <div key={idx} className="p-4 my-2.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 text-sm text-gray-700 dark:text-gray-200">
                        <span dangerouslySetInnerHTML={{ __html: formatBold(trimmed) }} />
                    </div>
                );
            }
            if (trimmed.length > 0) {
                return (
                    <p key={idx} className="text-sm text-gray-600 dark:text-gray-400 my-2 leading-relaxed"
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
        <div className="space-y-8">
            {/* Top Controls Bar */}
            <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-6 border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
                        <Sparkles size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 tracking-tight flex items-center gap-2">
                            AI Store Doctor
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                                Groq Qwen-3.8 Free
                            </span>
                        </h2>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                            Customer Search Intent & Conversion Drop-off Diagnostician
                        </p>
                    </div>
                </div>

                <div className="flex items-center flex-wrap gap-3">
                    {/* Period Selector */}
                    <div className="flex items-center bg-gray-50 dark:bg-gray-800 p-1 rounded-2xl border border-gray-200/60 dark:border-gray-700">
                        <button
                            onClick={() => setPeriodDays(7)}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${periodDays === 7 ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
                        >
                            Last 7 Days
                        </button>
                        <button
                            onClick={() => setPeriodDays(30)}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${periodDays === 30 ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
                        >
                            Last 30 Days
                        </button>
                    </div>

                    {/* API Key Configure Button */}
                    <button
                        onClick={() => setShowKeyModal(true)}
                        className="px-3.5 py-2 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200/60 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold hover:bg-gray-100 transition-colors flex items-center gap-2"
                        title="Configure AI API Key"
                    >
                        <Key size={14} className="text-amber-500" />
                        <span>{apiKey ? 'Key Configured' : 'Set API Key'}</span>
                    </button>

                    {/* Run AI Audit Button */}
                    <button
                        onClick={handleRunAudit}
                        disabled={runningAudit || loading}
                        className="px-5 py-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold uppercase tracking-widest shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all disabled:opacity-50"
                    >
                        {runningAudit ? (
                            <>
                                <RefreshCw size={14} className="animate-spin" />
                                <span>Diagnosing...</span>
                            </>
                        ) : (
                            <>
                                <Activity size={14} />
                                <span>Run AI Audit</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Error banner if any */}
            {auditError && (
                <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={16} />
                        <span>{auditError}</span>
                    </div>
                    <button onClick={() => setAuditError(null)} className="text-rose-500 hover:text-rose-700">
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Conversion Funnel Bar */}
            <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 tracking-tight">
                            Purchase Funnel & Drop-off Analysis
                        </h3>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                            Customer Drop-Off Progression (Last {periodDays} Days)
                        </p>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 text-xs font-bold">
                        <CheckCircle2 size={14} />
                        <span>{funnel?.overallConversionRate || 0}% Overall Conversion</span>
                    </div>
                </div>

                {/* 5 Funnel Stages */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    {/* Step 1: Page Visits */}
                    <div className="p-5 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 relative">
                        <div className="flex items-center justify-between text-gray-400 text-xs font-bold uppercase">
                            <span>1. Visits</span>
                            <Eye size={16} className="text-blue-500" />
                        </div>
                        <div className="text-2xl font-black text-gray-900 dark:text-gray-100 mt-2">
                            {funnel?.totalPageVisits || 0}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-1">Total page views</div>
                    </div>

                    {/* Step 2: Product Views */}
                    <div className="p-5 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 relative">
                        <div className="flex items-center justify-between text-gray-400 text-xs font-bold uppercase">
                            <span>2. Product Views</span>
                            <ShoppingBag size={16} className="text-indigo-500" />
                        </div>
                        <div className="text-2xl font-black text-gray-900 dark:text-gray-100 mt-2">
                            {funnel?.totalProductViews || 0}
                        </div>
                        <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold mt-1">
                            {funnel?.viewToCartRate || 0}% add to cart
                        </div>
                    </div>

                    {/* Step 3: Add to Cart */}
                    <div className="p-5 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 relative">
                        <div className="flex items-center justify-between text-gray-400 text-xs font-bold uppercase">
                            <span>3. Added to Cart</span>
                            <ShoppingBag size={16} className="text-amber-500" />
                        </div>
                        <div className="text-2xl font-black text-gray-900 dark:text-gray-100 mt-2">
                            {funnel?.totalAddToCart || 0}
                        </div>
                        <div className="text-[11px] text-amber-600 dark:text-amber-400 font-bold mt-1">
                            {funnel?.cartToCheckoutRate || 0}% go to checkout
                        </div>
                    </div>

                    {/* Step 4: Begin Checkout */}
                    <div className="p-5 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 relative">
                        <div className="flex items-center justify-between text-gray-400 text-xs font-bold uppercase">
                            <span>4. In Checkout</span>
                            <CreditCard size={16} className="text-violet-500" />
                        </div>
                        <div className="text-2xl font-black text-gray-900 dark:text-gray-100 mt-2">
                            {funnel?.totalBeginCheckout || 0}
                        </div>
                        <div className="text-[11px] text-violet-600 dark:text-violet-400 font-bold mt-1">
                            {funnel?.checkoutToOrderRate || 0}% finish order
                        </div>
                    </div>

                    {/* Step 5: Completed Orders */}
                    <div className="p-5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 relative">
                        <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase">
                            <span>5. Purchased</span>
                            <CheckCircle2 size={16} className="text-emerald-500" />
                        </div>
                        <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-2">
                            {funnel?.totalOrdersCompleted || 0}
                        </div>
                        <div className="text-[11px] text-emerald-600 font-bold mt-1">
                            Orders placed
                        </div>
                    </div>
                </div>
            </div>

            {/* Search Intent & Zero-Result Lost Demand */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Zero-Result Searches (Lost Demand) */}
                <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-rose-100 dark:border-rose-950/30 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-900/30 text-rose-600 flex items-center justify-center">
                                <Flame size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-gray-900 dark:text-gray-100 tracking-tight">
                                    Missed Demand (0 Results)
                                </h3>
                                <p className="text-[10px] text-rose-600 dark:text-rose-400 font-bold uppercase tracking-widest mt-0.5">
                                    Customers searched but found nothing!
                                </p>
                            </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">
                            {metrics?.zeroResultSearches.length || 0} Items
                        </span>
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                        Adding these requested products or synonyms directly converts lost visitors into buyers:
                    </p>

                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {metrics?.zeroResultSearches && metrics.zeroResultSearches.length > 0 ? (
                            metrics.zeroResultSearches.map((s, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center justify-between p-3 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100/60 dark:border-rose-900/30 text-sm"
                                >
                                    <div className="flex items-center gap-2.5 font-bold text-gray-800 dark:text-gray-200">
                                        <Search size={14} className="text-rose-500" />
                                        <span>"{s.query}"</span>
                                    </div>
                                    <span className="text-xs font-black text-rose-600 dark:text-rose-400 px-2.5 py-0.5 rounded-full bg-rose-100/80 dark:bg-rose-900/40">
                                        {s.zeroResultsCount} {s.zeroResultsCount === 1 ? 'search' : 'searches'}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-8 text-xs font-bold text-gray-400 uppercase tracking-widest">
                                No zero-result searches in this period
                            </div>
                        )}
                    </div>
                </div>

                {/* Top Overall Searches & Visited Pages */}
                <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center">
                                <Search size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-gray-900 dark:text-gray-100 tracking-tight">
                                    Top Search Terms
                                </h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                                    What visitors are looking for
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {metrics?.topSearches && metrics.topSearches.length > 0 ? (
                            metrics.topSearches.map((s, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 text-sm"
                                >
                                    <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-semibold">
                                        <span className="text-xs text-gray-400 w-4">{idx + 1}.</span>
                                        <span>"{s.query}"</span>
                                    </div>
                                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                                        {s.count} searches
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-8 text-xs font-bold text-gray-400 uppercase tracking-widest">
                                No search queries recorded yet
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* AI Executive Diagnosis Card */}
            <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-sm relative">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                            <Sparkles size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 tracking-tight">
                                AI Store Doctor Diagnosis
                            </h3>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                                Powered by Groq Cloud AI (Qwen 3.8 27B)
                            </p>
                        </div>
                    </div>

                    {insight && (
                        <div className="flex items-center gap-3">
                            <div className="text-right">
                                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Store Health Score</div>
                                <div className="text-2xl font-black text-gray-900 dark:text-gray-100">
                                    {insight.health_score} <span className="text-xs text-gray-400 font-normal">/ 100</span>
                                </div>
                            </div>
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${
                                insight.health_score >= 80 ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600' :
                                insight.health_score >= 60 ? 'bg-amber-50 dark:bg-amber-950 text-amber-600' :
                                'bg-rose-50 dark:bg-rose-950 text-rose-600'
                            }`}>
                                {insight.health_score}
                            </div>
                        </div>
                    )}
                </div>

                {/* Audit Body */}
                <div className="pt-6">
                    {insight ? (
                        <div className="prose dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
                            {renderMarkdownContent(insight.summary_markdown)}
                            <div className="mt-8 pt-4 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-400 flex items-center justify-between">
                                <span>Report generated on: {new Date(insight.created_at || Date.now()).toLocaleString()}</span>
                                <span className="text-blue-500 font-bold">100% Free AI Engine</span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <Sparkles size={36} className="mx-auto text-gray-300 dark:text-gray-700 mb-3" />
                            <h4 className="text-base font-bold text-gray-700 dark:text-gray-300">No AI Diagnosis Generated Yet</h4>
                            <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                                Click "Run AI Audit" above to analyze your website's search logs, visited products, and checkout drop-offs.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Groq API Key Configuration Modal */}
            {showKeyModal && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-8 max-w-md w-full border border-gray-100 dark:border-gray-800 shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <Key size={20} className="text-amber-500" />
                                <h3 className="text-lg font-black text-gray-900 dark:text-gray-100">Groq API Key</h3>
                            </div>
                            <button onClick={() => setShowKeyModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>

                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
                            Your Groq API key is stored securely in your Supabase database settings. It is 100% free with no credit card required.
                        </p>

                        <form onSubmit={handleSaveKey} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                                    API Key (starts with gsk_...)
                                </label>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder="gsk_..."
                                    className="w-full px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-mono text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    required
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowKeyModal(false)}
                                    className="px-4 py-2 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-900"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingKey}
                                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold tracking-wider uppercase transition-colors"
                                >
                                    {savingKey ? 'Saving...' : 'Save Key'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
