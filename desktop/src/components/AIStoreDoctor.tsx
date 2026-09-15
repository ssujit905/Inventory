import { useState, useEffect, useRef } from 'react';
import {
    Sparkles, Search, AlertTriangle, CheckCircle2,
    RefreshCw, Flame, Key,
    Eye, ShoppingBag, CreditCard, Activity, X,
    MessageCircle, Send, Bot, User, Loader2, BarChart2
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
    'How can I reduce cart abandonment?',
    'What are my biggest revenue opportunities?',
    'Give me 3 quick wins for this week',
];

export default function AIStoreDoctor() {
    const [activeTab, setActiveTab] = useState<'diagnosis' | 'chat'>('diagnosis');
    const [periodDays, setPeriodDays] = useState<number>(7);
    const [loading, setLoading] = useState(true);
    const [runningAudit, setRunningAudit] = useState(false);
    const [metrics, setMetrics] = useState<AggregatedStoreData | null>(null);
    const [insight, setInsight] = useState<AIInsightRecord | null>(null);
    const [auditError, setAuditError] = useState<string | null>(null);

    const [showKeyModal, setShowKeyModal] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [savingKey, setSavingKey] = useState(false);

    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{
        id: 'welcome',
        role: 'assistant',
        content: "👋 Hi! I'm your AI Store Advisor. I have access to your live store data. Ask me anything about your store performance, conversion rates, product recommendations, or growth strategies!",
        timestamp: new Date()
    }]);
    const [chatInput, setChatInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);
    const chatBottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => { loadData(); }, [periodDays]);
    useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

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
            if (ok) setShowKeyModal(false);
            else setAuditError('Failed to save API key.');
        } catch (err: any) {
            setAuditError(err.message || 'Failed to save key');
        } finally {
            setSavingKey(false);
        }
    };

    const handleSendMessage = async (message?: string) => {
        const text = (message || chatInput).trim();
        if (!text || chatLoading || !metrics) return;
        const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: text, timestamp: new Date() };
        setChatMessages(prev => [...prev, userMsg]);
        setChatInput('');
        setChatLoading(true);
        setChatError(null);
        try {
            const history = chatMessages.filter(m => m.id !== 'welcome').map(m => ({ role: m.role, content: m.content }));
            const reply = await chatWithAI(text, metrics, history);
            setChatMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: reply, timestamp: new Date() }]);
        } catch (err: any) {
            setChatError(err.message || 'Failed to get AI response');
        } finally {
            setChatLoading(false);
        }
    };

    const formatBold = (text: string) => text.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold">$1</strong>');

    const renderMarkdown = (md: string, compact = false) => {
        if (!md) return null;
        return md.split('\n').map((line, idx) => {
            const t = line.trim();
            if (!t) return null;
            if (t.startsWith('## ') || t.startsWith('### ')) {
                const text = t.replace(/^#{2,3}\s/, '');
                return compact
                    ? <p key={idx} className="font-black text-sm mt-3 mb-1" dangerouslySetInnerHTML={{ __html: formatBold(text) }} />
                    : <h3 key={idx} className="text-lg font-black text-gray-900 dark:text-gray-100 mt-6 mb-3 flex items-center gap-2"><Sparkles size={16} className="text-amber-500" />{text}</h3>;
            }
            if (t.startsWith('- ') || t.startsWith('* ')) return (
                <div key={idx} className="flex items-start gap-2 my-1.5 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                    <span dangerouslySetInnerHTML={{ __html: formatBold(t.substring(2)) }} />
                </div>
            );
            if (/^\d+\.\s/.test(t)) return (
                compact
                    ? <div key={idx} className="text-sm my-1" dangerouslySetInnerHTML={{ __html: formatBold(t) }} />
                    : <div key={idx} className="p-4 my-2.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 text-sm" dangerouslySetInnerHTML={{ __html: formatBold(t) }} />
            );
            return <p key={idx} className="text-sm my-1 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatBold(t) }} />;
        });
    };

    const funnel = metrics?.funnel;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-6 border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
                        <Sparkles size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 tracking-tight flex items-center gap-2">
                            AI Store Doctor
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">Sensenova AI</span>
                        </h2>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">Conversion Diagnostician & AI Advisor</p>
                    </div>
                </div>
                <div className="flex items-center flex-wrap gap-3">
                    <div className="flex items-center bg-gray-50 dark:bg-gray-800 p-1 rounded-2xl border border-gray-200/60 dark:border-gray-700">
                        {[7, 30].map(d => (
                            <button key={d} onClick={() => setPeriodDays(d)}
                                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${periodDays === d ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}>
                                Last {d} Days
                            </button>
                        ))}
                    </div>
                    <button onClick={() => setShowKeyModal(true)} className="px-3.5 py-2 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200/60 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold hover:bg-gray-100 transition-colors flex items-center gap-2">
                        <Key size={14} className="text-amber-500" />
                        <span>{apiKey ? 'Key Configured' : 'Set API Key'}</span>
                    </button>
                    {activeTab === 'diagnosis' && (
                        <button onClick={handleRunAudit} disabled={runningAudit || loading}
                            className="px-5 py-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold uppercase tracking-widest shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all disabled:opacity-50">
                            {runningAudit ? <><RefreshCw size={14} className="animate-spin" /><span>Diagnosing...</span></> : <><Activity size={14} /><span>Run AI Audit</span></>}
                        </button>
                    )}
                </div>
            </div>

            {auditError && (
                <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2"><AlertTriangle size={16} /><span>{auditError}</span></div>
                    <button onClick={() => setAuditError(null)}><X size={16} /></button>
                </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800/60 p-1.5 rounded-2xl w-fit">
                <button onClick={() => setActiveTab('diagnosis')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'diagnosis' ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                    <BarChart2 size={15} /> Diagnosis
                </button>
                <button onClick={() => setActiveTab('chat')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'chat' ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                    <MessageCircle size={15} /> Chat with AI
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 uppercase tracking-wide">New</span>
                </button>
            </div>

            {/* DIAGNOSIS TAB */}
            {activeTab === 'diagnosis' && (
                <div className="space-y-8">
                    <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 tracking-tight">Purchase Funnel & Drop-off Analysis</h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Last {periodDays} Days</p>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 text-xs font-bold">
                                <CheckCircle2 size={14} />
                                <span>{funnel?.overallConversionRate || 0}% Overall Conversion</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                            {[
                                { label: '1. Visits', value: funnel?.totalPageVisits || 0, icon: <Eye size={16} className="text-blue-500" />, sub: 'Total page views', color: 'text-gray-500' },
                                { label: '2. Product Views', value: funnel?.totalProductViews || 0, icon: <ShoppingBag size={16} className="text-indigo-500" />, sub: `${funnel?.viewToCartRate || 0}% add to cart`, color: 'text-indigo-600 dark:text-indigo-400' },
                                { label: '3. Added to Cart', value: funnel?.totalAddToCart || 0, icon: <ShoppingBag size={16} className="text-amber-500" />, sub: `${funnel?.cartToCheckoutRate || 0}% go to checkout`, color: 'text-amber-600 dark:text-amber-400' },
                                { label: '4. In Checkout', value: funnel?.totalBeginCheckout || 0, icon: <CreditCard size={16} className="text-violet-500" />, sub: `${funnel?.checkoutToOrderRate || 0}% finish order`, color: 'text-violet-600 dark:text-violet-400' },
                            ].map((step, i) => (
                                <div key={i} className="p-5 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                                    <div className="flex items-center justify-between text-gray-400 text-xs font-bold uppercase"><span>{step.label}</span>{step.icon}</div>
                                    <div className="text-2xl font-black text-gray-900 dark:text-gray-100 mt-2">{step.value}</div>
                                    <div className={`text-[11px] font-bold mt-1 ${step.color}`}>{step.sub}</div>
                                </div>
                            ))}
                            <div className="p-5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
                                <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase"><span>5. Purchased</span><CheckCircle2 size={16} className="text-emerald-500" /></div>
                                <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-2">{funnel?.totalOrdersCompleted || 0}</div>
                                <div className="text-[11px] text-emerald-600 font-bold mt-1">Orders placed</div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-rose-100 dark:border-rose-950/30 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-900/30 text-rose-600 flex items-center justify-center"><Flame size={20} /></div>
                                    <div>
                                        <h3 className="text-lg font-black text-gray-900 dark:text-gray-100">Missed Demand (0 Results)</h3>
                                        <p className="text-[10px] text-rose-600 font-bold uppercase tracking-widest mt-0.5">Customers searched but found nothing!</p>
                                    </div>
                                </div>
                                <span className="px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">{metrics?.zeroResultSearches.length || 0} Items</span>
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                {metrics?.zeroResultSearches?.length ? metrics.zeroResultSearches.map((s, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100/60 text-sm">
                                        <div className="flex items-center gap-2.5 font-bold text-gray-800 dark:text-gray-200"><Search size={14} className="text-rose-500" /><span>"{s.query}"</span></div>
                                        <span className="text-xs font-black text-rose-600 px-2.5 py-0.5 rounded-full bg-rose-100/80">{s.zeroResultsCount} searches</span>
                                    </div>
                                )) : <div className="text-center py-8 text-xs font-bold text-gray-400 uppercase tracking-widest">No zero-result searches</div>}
                            </div>
                        </div>
                        <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-sm">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center"><Search size={20} /></div>
                                <div>
                                    <h3 className="text-lg font-black text-gray-900 dark:text-gray-100">Top Search Terms</h3>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">What visitors are looking for</p>
                                </div>
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                {metrics?.topSearches?.length ? metrics.topSearches.map((s, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 text-sm">
                                        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-semibold"><span className="text-xs text-gray-400 w-4">{idx + 1}.</span><span>"{s.query}"</span></div>
                                        <span className="text-xs font-bold text-gray-500">{s.count} searches</span>
                                    </div>
                                )) : <div className="text-center py-8 text-xs font-bold text-gray-400 uppercase tracking-widest">No search queries yet</div>}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-sm">
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-gray-100 dark:border-gray-800">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20"><Sparkles size={24} /></div>
                                <div>
                                    <h3 className="text-xl font-black text-gray-900 dark:text-gray-100">AI Store Doctor Diagnosis</h3>
                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">Powered by Sensenova AI</p>
                                </div>
                            </div>
                            {insight && (
                                <div className="flex items-center gap-3">
                                    <div className="text-right">
                                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Store Health Score</div>
                                        <div className="text-2xl font-black text-gray-900 dark:text-gray-100">{insight.health_score} <span className="text-xs text-gray-400 font-normal">/ 100</span></div>
                                    </div>
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${insight.health_score >= 80 ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600' : insight.health_score >= 60 ? 'bg-amber-50 dark:bg-amber-950 text-amber-600' : 'bg-rose-50 dark:bg-rose-950 text-rose-600'}`}>
                                        {insight.health_score}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="pt-6">
                            {insight ? (
                                <div className="prose dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
                                    {renderMarkdown(insight.summary_markdown)}
                                    <div className="mt-8 pt-4 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-400 flex items-center justify-between">
                                        <span>Generated: {new Date(insight.created_at || Date.now()).toLocaleString()}</span>
                                        <button onClick={() => setActiveTab('chat')} className="text-blue-500 font-bold flex items-center gap-1 hover:underline">
                                            <MessageCircle size={12} /> Ask AI a follow-up
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12">
                                    <Sparkles size={36} className="mx-auto text-gray-300 dark:text-gray-700 mb-3" />
                                    <h4 className="text-base font-bold text-gray-700 dark:text-gray-300">No AI Diagnosis Yet</h4>
                                    <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">Click "Run AI Audit" to analyze your store data.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* CHAT TAB */}
            {activeTab === 'chat' && (
                <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col" style={{ height: '72vh' }}>
                    <div className="px-8 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20"><Bot size={20} /></div>
                            <div>
                                <h3 className="text-base font-black text-gray-900 dark:text-gray-100">AI Store Advisor</h3>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Online · Has your store data</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => setChatMessages([{ id: 'welcome', role: 'assistant', content: "👋 Hi! I'm your AI Store Advisor. Ask me anything about your store!", timestamp: new Date() }])}
                            className="text-xs text-gray-400 hover:text-gray-600 font-bold flex items-center gap-1 px-3 py-1.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <RefreshCw size={12} /> Clear
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                        {chatMessages.map(msg => (
                            <div key={msg.id} className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                <div className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center text-white ${msg.role === 'assistant' ? 'bg-gradient-to-tr from-blue-500 to-indigo-600' : 'bg-gradient-to-tr from-gray-600 to-gray-800'}`}>
                                    {msg.role === 'assistant' ? <Bot size={16} /> : <User size={16} />}
                                </div>
                                <div className={`max-w-[75%] px-5 py-3.5 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-tr-sm' : 'bg-gray-50 dark:bg-gray-800/80 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-gray-700 rounded-tl-sm'}`}>
                                    {msg.role === 'assistant' ? renderMarkdown(msg.content, true) : <p>{msg.content}</p>}
                                    <div className={`text-[10px] mt-1.5 font-medium ${msg.role === 'user' ? 'text-blue-200 text-right' : 'text-gray-400'}`}>
                                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {chatLoading && (
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center text-white bg-gradient-to-tr from-blue-500 to-indigo-600"><Bot size={16} /></div>
                                <div className="px-5 py-4 rounded-2xl rounded-tl-sm bg-gray-50 dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700 flex items-center gap-2">
                                    <Loader2 size={14} className="animate-spin text-blue-500" />
                                    <span className="text-xs text-gray-500 font-medium">Thinking...</span>
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

                    {chatMessages.length === 1 && !chatLoading && (
                        <div className="px-6 pb-3 flex-shrink-0">
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">Quick Questions</p>
                            <div className="flex flex-wrap gap-2">
                                {QUICK_SUGGESTIONS.map((s, i) => (
                                    <button key={i} onClick={() => handleSendMessage(s)} disabled={!metrics}
                                        className="px-3.5 py-1.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-all disabled:opacity-40">
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="px-6 pb-6 pt-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
                        <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                            className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-2 focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:border-blue-400 transition-all">
                            <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                                placeholder={metrics ? 'Ask anything about your store...' : 'Loading store data...'}
                                disabled={chatLoading || !metrics}
                                className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none disabled:opacity-50" />
                            <button type="submit" disabled={!chatInput.trim() || chatLoading || !metrics}
                                className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0">
                                {chatLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                            </button>
                        </form>
                        <p className="text-[10px] text-gray-400 mt-2 text-center">AI has access to your live store metrics for the past {periodDays} days</p>
                    </div>
                </div>
            )}

            {/* API Key Modal */}
            {showKeyModal && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-8 max-w-md w-full border border-gray-100 dark:border-gray-800 shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3"><Key size={20} className="text-amber-500" /><h3 className="text-lg font-black text-gray-900 dark:text-gray-100">AI API Key</h3></div>
                            <button onClick={() => setShowKeyModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">Your API key is stored securely in your Supabase database settings.</p>
                        <form onSubmit={handleSaveKey} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">API Key</label>
                                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..."
                                    className="w-full px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-mono text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                            </div>
                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button type="button" onClick={() => setShowKeyModal(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-900">Cancel</button>
                                <button type="submit" disabled={savingKey} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase transition-colors">
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
