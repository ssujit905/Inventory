import { useState, useEffect, useRef } from 'react';
import {
    Sparkles, Search, AlertTriangle, CheckCircle2,
    RefreshCw, Flame, Key, Eye, ShoppingBag, CreditCard,
    Activity, X, MessageCircle, Send, Bot, User, Loader2, BarChart2
} from 'lucide-react';
import {
    fetchStoreAnalytics,
    generateAIStoreDiagnosis,
    getLatestAIInsight,
    getGroqApiKey,
    updateGroqApiKey,
    chatWithAI
} from '../lib/aiDoctorService';
import type { AggregatedStoreData, AIInsightRecord } from '../lib/aiDoctorService';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

const QUICK_SUGGESTIONS = [
    'Why are customers not converting?',
    'What products should I add?',
    'How to reduce cart abandonment?',
    'Give me 3 quick wins for this week'
];

export default function AIStoreDoctor() {
    const [activeTab, setActiveTab] = useState<'diagnosis' | 'chat'>('diagnosis');
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

    // Chat state
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{
        id: 'welcome',
        role: 'assistant',
        content: "👋 Hi! I'm your AI Store Advisor. I have access to your live store data. Ask me anything about store performance, funnel conversion, or growth strategies!",
        timestamp: new Date()
    }]);
    const [chatInput, setChatInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);
    const chatBottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadData();
    }, [periodDays]);

    useEffect(() => {
        if (activeTab === 'chat') {
            chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatMessages, activeTab]);

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
            setAuditError(err.message || 'Audit failed. Check API Key.');
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

    const handleSendMessage = async (message?: string) => {
        const text = (message || chatInput).trim();
        if (!text || chatLoading || !metrics) return;

        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: text,
            timestamp: new Date()
        };

        setChatMessages(prev => [...prev, userMsg]);
        setChatInput('');
        setChatLoading(true);
        setChatError(null);

        try {
            const history = chatMessages
                .filter(m => m.id !== 'welcome')
                .map(m => ({ role: m.role, content: m.content }));
            const reply = await chatWithAI(text, metrics, history);
            const assistantMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: reply,
                timestamp: new Date()
            };
            setChatMessages(prev => [...prev, assistantMsg]);
        } catch (err: any) {
            setChatError(err.message || 'Failed to get AI response');
        } finally {
            setChatLoading(false);
        }
    };

    const formatBold = (text: string) => {
        return text.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-gray-900 dark:text-gray-100">$1</strong>');
    };

    const renderMarkdownContent = (md: string, compact = false) => {
        if (!md) return null;
        const lines = md.split('\n');

        return lines.map((line, idx) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
                const text = trimmed.replace(/^#{2,3}\s/, '');
                return compact ? (
                    <p key={idx} className="font-bold text-xs mt-2 mb-1" dangerouslySetInnerHTML={{ __html: formatBold(text) }} />
                ) : (
                    <h3 key={idx} className="text-sm font-black text-gray-900 dark:text-gray-100 mt-4 mb-2 flex items-center gap-2">
                        <Sparkles size={14} className="text-amber-500 flex-shrink-0" />
                        <span>{text}</span>
                    </h3>
                );
            }
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                const content = trimmed.substring(2);
                return (
                    <div key={idx} className="flex items-start gap-2 my-1 text-xs text-gray-600 dark:text-gray-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                        <span dangerouslySetInnerHTML={{ __html: formatBold(content) }} />
                    </div>
                );
            }
            if (/^\d+\.\s/.test(trimmed)) {
                return (
                    <div key={idx} className={`p-3 my-1.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 text-xs text-gray-700 dark:text-gray-200 leading-relaxed`}>
                        <span dangerouslySetInnerHTML={{ __html: formatBold(trimmed) }} />
                    </div>
                );
            }
            if (trimmed.length > 0) {
                return (
                    <p key={idx} className="text-xs text-gray-600 dark:text-gray-400 my-1 leading-relaxed"
                       dangerouslySetInnerHTML={{ __html: formatBold(trimmed) }}
                    />
                );
            }
            return null;
        });
    };

    const funnel = metrics?.funnel;

    return (
        <div className="space-y-4 pb-6">
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
                                Sensenova AI
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

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                        onClick={() => setShowKeyModal(true)}
                        className="py-2.5 px-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200/60 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                        <Key size={14} className="text-amber-500" />
                        <span>{apiKey ? 'Key Ready' : 'Set Key'}</span>
                    </button>

                    {activeTab === 'diagnosis' ? (
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
                    ) : (
                        <button
                            onClick={() => setChatMessages([{ id: 'welcome', role: 'assistant', content: "👋 Hi! I'm your AI Store Advisor. Ask me anything!", timestamp: new Date() }])}
                            className="py-2.5 px-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200/60 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold flex items-center justify-center gap-1.5"
                        >
                            <RefreshCw size={14} />
                            <span>Clear Chat</span>
                        </button>
                    )}
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

            {/* Sub-Tabs: Diagnosis vs Chat */}
            <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800/60 p-1 rounded-2xl w-full">
                <button
                    onClick={() => setActiveTab('diagnosis')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'diagnosis' ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-xs' : 'text-gray-500'}`}
                >
                    <BarChart2 size={14} />
                    <span>Diagnosis</span>
                </button>
                <button
                    onClick={() => setActiveTab('chat')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'chat' ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-xs' : 'text-gray-500'}`}
                >
                    <MessageCircle size={14} />
                    <span>Chat Advisor</span>
                    <span className="px-1 py-0.2 rounded-full text-[8px] font-black bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 uppercase">New</span>
                </button>
            </div>

            {/* TAB: DIAGNOSIS */}
            {activeTab === 'diagnosis' && (
                <div className="space-y-4">
                    {/* Funnel Overview */}
                    <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-black text-gray-900 dark:text-gray-100">
                                    Funnel & Drop-off
                                </h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                                    Customer Journey ({periodDays}D)
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
                                    <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400 flex items-center justify-between">
                                        <span>Generated: {new Date(insight.created_at || Date.now()).toLocaleDateString()}</span>
                                        <button onClick={() => setActiveTab('chat')} className="text-blue-500 font-bold flex items-center gap-1">
                                            <MessageCircle size={12} /> Ask Follow-up
                                        </button>
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
                </div>
            )}

            {/* TAB: CHAT ADVISOR */}
            {activeTab === 'chat' && (
                <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col" style={{ height: '68vh' }}>
                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                        {chatMessages.map(msg => (
                            <div key={msg.id} className={`flex items-start gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                <div className={`w-7 h-7 rounded-xl flex-shrink-0 flex items-center justify-center text-white ${msg.role === 'assistant' ? 'bg-gradient-to-tr from-blue-500 to-indigo-600' : 'bg-gray-700'}`}>
                                    {msg.role === 'assistant' ? <Bot size={14} /> : <User size={14} />}
                                </div>
                                <div className={`max-w-[82%] px-4 py-3 rounded-2xl text-xs leading-relaxed ${msg.role === 'user' ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-tr-xs' : 'bg-gray-50 dark:bg-gray-800/80 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-gray-700 rounded-tl-xs'}`}>
                                    {msg.role === 'assistant' ? renderMarkdownContent(msg.content, true) : <p>{msg.content}</p>}
                                    <div className={`text-[9px] mt-1 font-medium ${msg.role === 'user' ? 'text-blue-200 text-right' : 'text-gray-400'}`}>
                                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {chatLoading && (
                            <div className="flex items-start gap-2.5">
                                <div className="w-7 h-7 rounded-xl flex-shrink-0 flex items-center justify-center text-white bg-gradient-to-tr from-blue-500 to-indigo-600">
                                    <Bot size={14} />
                                </div>
                                <div className="px-4 py-3 rounded-2xl rounded-tl-xs bg-gray-50 dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700 flex items-center gap-2">
                                    <Loader2 size={13} className="animate-spin text-blue-500" />
                                    <span className="text-xs text-gray-500 font-medium">Analyzing store data...</span>
                                </div>
                            </div>
                        )}

                        {chatError && (
                            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 text-rose-600 text-xs flex items-center justify-between">
                                <span>{chatError}</span>
                                <button onClick={() => setChatError(null)}><X size={12} /></button>
                            </div>
                        )}
                        <div ref={chatBottomRef} />
                    </div>

                    {/* Quick Questions on Empty / Start */}
                    {chatMessages.length === 1 && !chatLoading && (
                        <div className="px-4 pb-2 flex-shrink-0">
                            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-1.5">Quick Questions</p>
                            <div className="flex flex-wrap gap-1.5">
                                {QUICK_SUGGESTIONS.map((s, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleSendMessage(s)}
                                        disabled={!metrics}
                                        className="px-2.5 py-1 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-700 dark:text-gray-300 hover:bg-blue-50 hover:text-blue-600 transition-all disabled:opacity-40"
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Input Bar */}
                    <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 bg-white dark:bg-gray-900">
                        <form
                            onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                            className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-500/30"
                        >
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                placeholder={metrics ? "Ask AI about conversion, sales..." : "Loading store data..."}
                                disabled={chatLoading || !metrics}
                                className="flex-1 bg-transparent text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none disabled:opacity-50"
                            />
                            <button
                                type="submit"
                                disabled={!chatInput.trim() || chatLoading || !metrics}
                                className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                            >
                                {chatLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* API Key Modal */}
            {showKeyModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 max-w-sm w-full border border-gray-100 dark:border-gray-800 shadow-2xl">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Key size={18} className="text-amber-500" />
                                <h3 className="text-sm font-black text-gray-900 dark:text-gray-100">AI API Key</h3>
                            </div>
                            <button onClick={() => setShowKeyModal(false)} className="text-gray-400">
                                <X size={18} />
                            </button>
                        </div>

                        <p className="text-[11px] text-gray-500 mb-3">
                            Stored securely in database settings.
                        </p>

                        <form onSubmit={handleSaveKey} className="space-y-3">
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="sk-..."
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
