import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { Printer, Calendar, Search, Loader2, CheckCircle2, Package, Eye, X, Settings, Building2, Save, CheckSquare, Square, Hash, ChevronRight } from 'lucide-react'
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
            <div className="max-w-5xl mx-auto space-y-6 pb-32">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Print Center</h1>
                        <p className="text-gray-400 font-medium text-xs uppercase tracking-widest">80mm Thermal Dispatch Station</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none transition-all w-48 shadow-sm"
                            />
                        </div>
                        <button
                            onClick={fetchSales}
                            disabled={loading}
                            className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-white h-10 px-6 rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-primary/20"
                        >
                            {loading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                            Fetch Orders
                        </button>
                        <button
                            onClick={() => { setTempBusinessName(businessName); setShowSettings(true); }}
                            className="p-2.5 text-gray-400 hover:text-gray-900 dark:hover:text-white bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl transition-colors shadow-sm"
                            title="Print Settings"
                        >
                            <Settings size={20} />
                        </button>
                    </div>
                </div>

                {status && (
                    <div className={`p-4 rounded-xl flex items-center gap-3 border animate-in fade-in slide-in-from-top-4 duration-300 ${status.includes('Error') || status.includes('No') || status.includes('failed')
                            ? 'bg-rose-50 border-rose-100 text-rose-600 dark:bg-rose-900/10 dark:border-rose-900/20'
                            : 'bg-emerald-50 border-emerald-100 text-emerald-600 dark:bg-emerald-900/10 dark:border-emerald-900/20'
                        }`}>
                        <CheckCircle2 size={18} />
                        <p className="text-sm font-bold">{status}</p>
                    </div>
                )}

                {sales.length > 0 ? (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={toggleSelectAll}
                                    className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary hover:opacity-80 transition-opacity"
                                >
                                    {selectedIds.size === sales.length ? <CheckSquare size={16} /> : <Square size={16} />}
                                    {selectedIds.size === sales.length ? 'Deselect All' : 'Select All'}
                                </button>
                                <h2 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                    <Hash size={14} /> Records Found: {sales.length}
                                </h2>
                            </div>
                            {selectedIds.size > 0 && (
                                <span className="text-[10px] font-black bg-primary text-white px-3 py-1 rounded-full uppercase tracking-tighter">
                                    {selectedIds.size} Selected for Batch
                                </span>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {sales.map((sale) => (
                                <div
                                    key={sale.id}
                                    onClick={() => toggleSelect(sale.id)}
                                    className={`bg-white dark:bg-gray-900 p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group ${selectedIds.has(sale.id)
                                            ? 'border-primary ring-2 ring-primary/10 shadow-md'
                                            : 'border-gray-100 dark:border-gray-800 shadow-sm hover:border-primary/30'
                                        }`}
                                >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className={`transition-colors ${selectedIds.has(sale.id) ? 'text-primary' : 'text-gray-200 dark:text-gray-700'}`}>
                                            {selectedIds.has(sale.id) ? <CheckSquare size={20} /> : <Square size={20} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 truncate">
                                                {sale.customer_name}
                                                <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded uppercase font-black">{sale.destination_branch}</span>
                                            </p>
                                            <p className="text-xs text-gray-400 font-medium">{sale.id.slice(0, 8).toUpperCase()}</p>
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {sale.sale_items?.slice(0, 2).map((it, i) => (
                                                    <span key={i} className="text-[9px] font-bold bg-primary/5 text-primary px-2 py-0.5 rounded border border-primary/10">
                                                        {it.product?.sku} x{it.quantity}
                                                    </span>
                                                ))}
                                                {sale.sale_items?.length > 2 && <span className="text-[9px] font-bold text-gray-400">+{sale.sale_items.length - 2} more</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 ml-4" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={() => { setPreviewSale(sale); setShowPreview(true); }}
                                            className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
                                            title="Preview Template"
                                        >
                                            <Eye size={18} />
                                        </button>
                                        <div className="flex flex-col items-end gap-1">
                                            <p className="text-xs font-black text-gray-900 dark:text-gray-100 text-right font-mono">Rs. {sale.cod_amount.toLocaleString()}</p>
                                            <ChevronRight size={16} className={`transition-colors ${selectedIds.has(sale.id) ? 'text-primary' : 'text-gray-200 dark:text-gray-700'}`} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : !loading && !status && (
                    <div className="flex flex-col items-center justify-center py-32 text-gray-300 dark:text-gray-800">
                        <Package size={64} strokeWidth={1} className="mb-4 opacity-10" />
                        <p className="font-bold uppercase tracking-widest text-xs">Awaiting data fetch for {format(new Date(date), 'MMMM dd')}</p>
                    </div>
                )}

                {/* Floating Action Bar */}
                {selectedIds.size > 0 && (
                    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border border-gray-100 dark:border-gray-800 p-4 rounded-[2rem] shadow-2xl flex items-center gap-6 z-20 animate-in slide-in-from-bottom-8 duration-500 ring-1 ring-black/5">
                        <div className="px-6 border-r border-gray-100 dark:border-gray-800">
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Queue Status</p>
                            <p className="text-base font-black text-gray-900 dark:text-white">{selectedIds.size} Ready to Print</p>
                        </div>
                        <button
                            onClick={handlePrintSelected}
                            disabled={printing}
                            className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-white px-10 py-3.5 rounded-2xl font-black text-xs uppercase tracking-[0.1em] flex items-center gap-3 transition-all active:scale-95 shadow-xl shadow-primary/20"
                        >
                            {printing ? <Loader2 className="animate-spin" size={18} /> : <Printer size={18} />}
                            Batch Print Selected
                        </button>
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
