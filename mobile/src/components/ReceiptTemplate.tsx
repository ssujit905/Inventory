import { format } from 'date-fns'

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

interface ReceiptTemplateProps {
    sale: Sale
    businessName?: string
}

export default function ReceiptTemplate({ sale, businessName = 'MOKSHA INVENTORY' }: ReceiptTemplateProps) {
    return (
        <div className="receipt-page w-[80mm] p-[4mm] bg-white text-black font-mono text-[10pt] leading-tight mx-auto mb-4 border-b-2 border-dashed border-gray-300 print:border-none print:mb-0">
            {/* Header */}
            <div className="text-center mb-4 space-y-1">
                <p className="font-black text-[14pt] uppercase border-b-2 border-black pb-1 inline-block min-w-[50%]">{businessName}</p>
                <div className="pt-1 text-[8pt] uppercase tracking-widest font-bold">
                    {format(new Date(sale.order_date), 'dd/MM/yyyy')} | {sale.id.slice(0, 8).toUpperCase()}
                </div>
            </div>

            {/* Ship To */}
            <div className="mb-4 space-y-0.5">
                <p className="text-[8pt] font-bold uppercase underline">Customer Details:</p>
                <p className="font-black text-[12pt]">{sale.customer_name}</p>
                <p className="text-[10pt]">{sale.phone1}</p>
                {sale.phone2 && <p className="text-[10pt]">{sale.phone2}</p>}
                <p className="text-[9pt] leading-tight mt-1 bg-gray-50 p-1 border border-gray-100 italic">{sale.customer_address}</p>
            </div>

            {/* Branch & Package */}
            <div className="grid grid-cols-2 gap-2 mb-4 text-[9pt]">
                <div>
                    <p className="text-[7pt] font-bold uppercase text-gray-500">Destination:</p>
                    <p className="font-bold">{sale.destination_branch}</p>
                </div>
                {sale.package && (
                    <div className="text-right">
                        <p className="text-[7pt] font-bold uppercase text-gray-500">Pkg Detail:</p>
                        <p className="font-bold">{sale.package}</p>
                    </div>
                )}
            </div>

            {/* Items Table */}
            <div className="mb-4">
                <div className="border-b-2 border-black flex justify-between pb-1 text-[8pt] font-black uppercase tracking-tight">
                    <span>Description</span>
                    <span>Qty</span>
                </div>
                <div className="divide-y divide-dotted divide-gray-300">
                    {sale.sale_items.map((item, idx) => (
                        <div key={idx} className="flex justify-between py-2 items-center">
                            <span className="font-black text-[11pt] tracking-tighter">{item.product.sku}</span>
                            <span className="font-bold text-[12pt]">x{item.quantity}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer / COD */}
            <div className="border-t-2 border-black pt-2 mt-4 space-y-1">
                <div className="flex justify-between items-center bg-black text-white p-2">
                    <span className="text-[10pt] font-bold uppercase">COD AMOUNT:</span>
                    <span className="text-[14pt] font-black">Rs. {sale.cod_amount.toLocaleString()}</span>
                </div>
            </div>

            <div className="text-center mt-6 pt-4 border-t border-dotted border-gray-400">
                <p className="text-[8pt] font-bold italic mb-1">Thank you for your business!</p>
                <div className="flex justify-center gap-1 opacity-50">
                    {[...Array(20)].map((_, i) => (
                        <span key={i} className="text-[6pt]">.</span>
                    ))}
                </div>
                <p className="text-[6pt] mt-2 text-gray-400">Printed via {businessName} Station</p>
            </div>

            {/* Footer spacer for thermal paper tail */}
            <div className="h-[20mm]"></div>
        </div>
    )
}
