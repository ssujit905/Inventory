import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { Printer, Calendar, Search, Loader2, CheckCircle2, Package, Eye, X, Settings, Building2, Save, CheckSquare, Square, Hash, ChevronRight, AlertCircle } from 'lucide-react'
import ReceiptTemplate from '../components/ReceiptTemplate'
import { useAuthStore } from '../hooks/useAuthStore'
import DashboardLayout from '../layouts/DashboardLayout'

type Sale = {
    id: string
    order_date: string
    customer_name: string
    customer_address: string
    phone1: string
    phone2?: string
    cod_amount: number
    destination_branch: string
    package?: string
    sale_items: {
        quantity: number
        product: { sku: string }
    }[]
}

export default function PrintCenter() {
    const { profile } = useAuthStore()
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
    const [sales, setSales] = useState<Sale[]>([])
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(false)
    const [printing, setPrinting] = useState(false)
    const [status, setStatus] = useState<string | null>(null)
    const [showPreview, setShowPreview] = useState(false)
    const [showSettings, setShowSettings] = useState(false)
    const [previewSale, setPreviewSale] = useState<Sale | null>(null)

    // Settings State
    const [businessName, setBusinessName] = useState('MOKSHA INVENTORY')
    const [tempBusinessName, setTempBusinessName] = useState(businessName)

    // Load Settings from Supabase
    useEffect(() => {
        const fetchSettings = async () => {
            const { data, error } = await supabase
                .from('settings')
                .select('value')
                .eq('key', 'business_name')
                .maybeSingle()

            if (data) {
                setBusinessName(data.value)
            } else if (error) {
                console.error('Error fetching settings:', error)
            }
        }
        fetchSettings()
    }, [])

    const handleSaveSettings = async () => {
        setLoading(true)
        try {
            const { error } = await supabase
                .from('settings')
                .upsert({ key: 'business_name', value: tempBusinessName })

            if (error) throw error

            setBusinessName(tempBusinessName)
            setShowSettings(false)
            setStatus('Settings saved successfully!')
            setTimeout(() => setStatus(null), 3000)
        } catch (err: any) {
            console.error('Save error:', err)
            setStatus(`Error saving settings: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    const fetchSales = async () => {
        setLoading(true)
        setStatus(null)
        setSelectedIds(new Set())

        try {
            const { data, error } = await supabase
                .from('sales')
                .select(`
          *,
          sale_items (
            quantity,
            product:products(sku)
          )
        `)
                .eq('order_date', date)
                .order('created_at', { ascending: true })

            if (error) {
                console.error('Fetch error:', error)
                setStatus(`Error: ${error.message}`)
            } else {
                setSales(data as any || [])
                if (!data || data.length === 0) {
                    setStatus('No sales found for this date')
                }
            }
        } catch (err: any) {
            console.error('Unexpected error:', err)
            setStatus(`Unexpected error: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    const toggleSelectAll = () => {
        if (selectedIds.size === sales.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(sales.map(s => s.id)))
        }
    }

    const toggleSelect = (id: string) => {
        const newSelected = new Set(selectedIds)
        if (newSelected.has(id)) {
            newSelected.delete(id)
        } else {
            newSelected.add(id)
        }
        setSelectedIds(newSelected)
    }

    const handlePrintSelected = async () => {
        if (selectedIds.size === 0) return
        setPrinting(true)
        setStatus(`Preparing ${selectedIds.size} invoices...`)

        try {
            // In Electron, we can use window.print() or direct IPC
            // Since we want batch, window.print() is easiest with the hidden area
            window.print()
            setStatus('Print sequence started. Check your printer.')
        } catch (err: any) {
            console.error('Print error:', err)
            setStatus(`Printing error: ${err.message || 'Unknown error'}`)
        }
        setPrinting(false)
    }

    const selectedSales = sales.filter(s => selectedIds.has(s.id))

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="px-5 max-w-7xl mx-auto space-y-6 pb-32">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Print Center</h1>
                        <p className="text-gray-400 font-medium text-xs">Manage thermal dispatch receipts and batch printing.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 min-w-[140px]">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full pl-9 pr-3 h-10 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-[11px] font-bold focus:ring-2 focus:ring-primary outline-none transition-all shadow-sm"
                            />
                        </div>
                        <button
                            onClick={fetchSales}
                            disabled={loading}
                            className={`h-10 px-4 rounded-xl text-[10px] font-bold flex items-center gap-2 transition-all active:scale-95 shadow-lg ${loading ? 'bg-gray-100 text-gray-400' : 'bg-primary text-white shadow-primary/20 hover:bg-primary/90'}`}
                        >
                            {loading ? <Loader2 className="animate-spin" size={14} /> : <Search size={14} />}
                            {loading ? 'Fetching...' : 'Fetch Orders'}
                        </button>
                        <button
                            onClick={() => { setTempBusinessName(businessName); setShowSettings(true); }}
                            className="h-10 w-10 flex items-center justify-center text-gray-400 hover:text-gray-900 dark:hover:text-white bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl transition-colors shadow-sm"
                            title="Print Settings"
                        >
                            <Settings size={18} />
                        </button>
                    </div>
                </div>

                {status && (
                    <div className={`fixed top-8 right-8 z-[200] flex items-center gap-3 px-6 py-4 rounded-3xl shadow-2xl text-white text-sm font-black animate-in slide-in-from-right-full duration-500 ${status.includes('Error') || status.includes('No') || status.includes('failed')
                        ? 'bg-rose-500 font-black'
                        : 'bg-emerald-500 font-black'
                        }`}>
                        <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                            {status.includes('Error') || status.includes('No') || status.includes('failed')
                                ? <AlertCircle size={14} strokeWidth={3} />
                                : <CheckCircle2 size={14} strokeWidth={3} />}
                        </div>
                        {status}
                    </div>
                )}

                {/* Sales Section Header */}
                <div className="flex items-center gap-2 px-1">
                    <CheckSquare size={14} strokeWidth={1.5} className="text-gray-400" />
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Dispatch Registry</h3>
                    <button 
                        onClick={toggleSelectAll}
                        className="ml-auto text-[10px] font-black text-primary uppercase tracking-tight flex items-center gap-1.5"
                    >
                        {selectedIds.size === sales.length ? <CheckSquare size={12} /> : <Square size={12} />}
                        {selectedIds.size === sales.length ? 'Deselect All' : `Select All (${sales.length})`}
                    </button>
                </div>

                <div className="space-y-2.5">
                    {loading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-32 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 animate-pulse" />
                        ))
                    ) : sales.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
                            <div className="flex flex-col items-center gap-3 opacity-30">
                                <Package size={40} strokeWidth={1.5} />
                                <p className="text-xs font-bold uppercase tracking-widest">No sales to dispatch</p>
                            </div>
                        </div>
                    ) : (
                        sales.map((sale, index) => {
                            const isSelected = selectedIds.has(sale.id);
                            const displayIndex = sales.length - index;
                            return (
                                <div 
                                    key={sale.id} 
                                    onClick={() => toggleSelect(sale.id)}
                                    className={`bg-white dark:bg-gray-900 rounded-xl border transition-all shadow-sm overflow-hidden active:scale-[0.99] ${isSelected ? 'border-primary ring-2 ring-primary/10' : 'border-gray-100 dark:border-gray-800'}`}
                                >
                                    {/* Card Header Strip */}
                                    <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
                                        <div className="flex items-center gap-2.5">
                                            <div className={`h-6 w-6 rounded-full flex items-center justify-center transition-colors ${isSelected ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}>
                                                {isSelected ? <CheckSquare size={12} /> : <span className="text-[10px] font-black">{displayIndex}</span>}
                                            </div>
                                            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                                                ID: {sale.id.slice(0, 8).toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="px-2 py-0.5 bg-gray-50 dark:bg-gray-800 text-gray-400 rounded-md text-[8px] font-black uppercase tracking-widest border border-gray-100 dark:border-gray-700">
                                                {sale.destination_branch}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Main Info Section */}
                                    <div className="px-3.5 pb-3">
                                        <div className="flex items-center gap-3">
                                            <div className={`h-11 w-11 rounded-xl flex items-center justify-center font-black text-lg border transition-colors ${isSelected ? 'bg-primary/10 text-primary border-primary/20' : 'bg-gray-50 dark:bg-gray-800 text-gray-400 border-gray-100 dark:border-gray-700'}`}>
                                                {sale.customer_name?.[0] || 'C'}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{sale.customer_name}</h3>
                                                <div className="flex items-center gap-1.5 text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                                                    <Building2 size={10} />
                                                    {sale.customer_address || 'No Address Provided'}
                                                </div>
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setPreviewSale(sale); setShowPreview(true); }}
                                                className="h-10 w-10 flex items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-primary transition-colors"
                                            >
                                                <Eye size={18} />
                                            </button>
                                        </div>

                                        {/* Item Tags */}
                                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                                            {sale.sale_items?.map((it, i) => (
                                                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/5 text-primary rounded-md text-[9px] font-bold border border-primary/10">
                                                    {it.product?.sku} <span className="opacity-50">x{it.quantity}</span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Detail Strip */}
                                    <div className="flex items-center gap-0 border-t border-gray-50 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-800/20">
                                        <div className="flex-1 px-3.5 py-2.5 border-r border-gray-50 dark:border-gray-800">
                                            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">COD Amount</p>
                                            <p className="text-[11px] font-black text-gray-900 dark:text-gray-100 mt-0.5">
                                                Rs. {sale.cod_amount.toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="flex-1 px-3.5 py-2.5 text-right">
                                            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">Phone</p>
                                            <p className="text-[10px] font-bold text-primary tracking-tight mt-0.5">{sale.phone1}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Floating Action Bar (Refined) */}
                {selectedIds.size > 0 && (
                    <div className="fixed bottom-6 left-5 right-5 flex justify-center z-[100] animate-in slide-in-from-bottom-8 duration-500">
                        <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border border-gray-100 dark:border-gray-800 p-2 rounded-2xl shadow-2xl flex items-center gap-2 max-w-sm w-full ring-1 ring-black/5">
                            <div className="flex-1 pl-4">
                                <p className="text-[8px] text-gray-400 font-bold uppercase tracking-widest">Queue</p>
                                <p className="text-xs font-black text-gray-900 dark:text-white">{selectedIds.size} Ready</p>
                            </div>
                            <button
                                onClick={handlePrintSelected}
                                disabled={printing}
                                className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-primary/20"
                            >
                                {printing ? <Loader2 className="animate-spin" size={14} /> : <Printer size={14} />}
                                {printing ? 'Printing...' : 'Print Batch'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Settings Modal */}
                {showSettings && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300 border border-gray-100 dark:border-gray-800">
                            <div className="p-8 border-b border-gray-50 dark:border-gray-800 flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Station Identity</h3>
                                    <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest">Global Branding Preference</p>
                                </div>
                                <button
                                    onClick={() => setShowSettings(false)}
                                    className="h-10 w-10 flex items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-rose-500 transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-8 space-y-6">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                        <Building2 size={12} /> Store Name
                                    </label>
                                    <input
                                        type="text"
                                        value={tempBusinessName}
                                        onChange={(e) => setTempBusinessName(e.target.value)}
                                        className="w-full h-12 px-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary focus:bg-white dark:focus:bg-gray-900 rounded-2xl text-sm font-bold text-gray-900 dark:text-gray-100 outline-none transition-all"
                                        placeholder="e.g. MOKSHA INVENTORY"
                                    />
                                    <p className="text-[10px] text-gray-400 font-medium italic mt-2 leading-tight"> This will sync across your Mac and Mobile devices.</p>
                                </div>
                            </div>
                            <div className="p-8 bg-gray-50/50 dark:bg-gray-800/30">
                                <button
                                    onClick={handleSaveSettings}
                                    disabled={loading}
                                    className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-black rounded-2xl transition-all shadow-xl shadow-primary/20 text-xs uppercase tracking-widest flex items-center justify-center gap-3"
                                >
                                    {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                    Sync Global Name
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Template Preview Modal */}
                {showPreview && previewSale && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-2xl w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                            <div className="p-5 border-b border-gray-50 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Thermal Preview</h3>
                                <button
                                    onClick={() => setShowPreview(false)}
                                    className="h-8 w-8 flex items-center justify-center rounded-lg bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 text-gray-400 hover:text-rose-500 transition-colors shadow-sm"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 bg-gray-100 dark:bg-gray-950/50 flex justify-center">
                                <div className="bg-white shadow-lg origin-top scale-[0.9]">
                                    <ReceiptTemplate sale={previewSale} businessName={businessName} />
                                </div>
                            </div>
                            <div className="p-5 bg-white dark:bg-gray-900 border-t border-gray-50 dark:border-gray-800">
                                <button
                                    onClick={() => { setShowPreview(false); toggleSelect(previewSale.id); }}
                                    className={`w-full font-black py-4 rounded-2xl transition-all text-[10px] uppercase tracking-widest ${selectedIds.has(previewSale.id)
                                            ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:text-gray-400'
                                            : 'bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/20'
                                        }`}
                                >
                                    {selectedIds.has(previewSale.id) ? 'Remove from Batch' : 'Add to Print Queue'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Hidden Print Area */}
                <div id="print-area" className="hidden print:block fixed inset-0 bg-white z-[9999]">
                    {selectedSales.map((sale) => (
                        <ReceiptTemplate key={sale.id} sale={sale} businessName={businessName} />
                    ))}
                </div>

                <style>{`
          @media print {
            body * {
              visibility: hidden;
            }
            #print-area, #print-area * {
              visibility: visible;
            }
            #print-area {
              position: absolute;
              left: 0;
              top: 0;
              width: 80mm;
            }
            .receipt-page {
              page-break-after: always;
            }
          }
        `}</style>
            </div>
        </DashboardLayout>
    )
}
