const fs = require('fs');
let code = fs.readFileSync('mobile/src/pages/SalesPage.tsx', 'utf-8');

const regex = /<div className="grid grid-cols-1 md:grid-cols-12 gap-5 px-6 py-4 items-center">[\s\S]*?<div className="md:col-span-2 flex items-center justify-end gap-2">/m;

const replacement = `<div className="flex flex-col gap-3 pl-12 pr-4 py-4 md:grid md:grid-cols-12 md:gap-5 md:pl-6 md:py-4 md:items-center">
                                                <div className="md:hidden flex items-start justify-between gap-3">
                                                    <span className="text-[11px] font-black text-gray-600 dark:text-gray-300">
                                                        {format(new Date(sale.order_date), 'MMM dd, yyyy')}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        {sale.is_website && (
                                                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded-md border border-sky-100 dark:border-sky-800 animate-pulse">
                                                                <Globe size={10} strokeWidth={3} />
                                                                <span className="text-[8px] font-black uppercase tracking-tighter">Web</span>
                                                            </div>
                                                        )}
                                                        <span className={\`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border \${getStatusColor(sale.parcel_status)}\`}>
                                                            {sale.parcel_status}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                                                    <div>
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Customer</p>
                                                        <p className="text-xs font-black text-gray-900 dark:text-gray-100 truncate">{sale.customer_name}</p>
                                                        <p className="text-[10px] text-gray-500 font-bold mt-0.5 line-clamp-1">{sale.phone1}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">COD Amount</p>
                                                        <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 flex items-center">
                                                            <IndianRupee size={10} className="mr-0.5" />
                                                            {sale.cod_amount?.toLocaleString() || '0'}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="hidden md:flex md:col-span-1 items-center gap-3">
                                                    <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-black">
                                                        {displayIndex}
                                                    </div>
                                                    <span className="text-[11px] font-black text-gray-600 dark:text-gray-300">
                                                        {format(new Date(sale.order_date), 'MMM dd, yyyy')}
                                                    </span>
                                                </div>
                                                <div className="hidden md:block md:col-span-2 min-w-0 pr-2">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="text-sm font-black text-gray-900 dark:text-gray-100 truncate">{sale.customer_name}</div>
                                                        {sale.is_website && (
                                                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded-md border border-sky-100 dark:border-sky-800 animate-pulse">
                                                                <Globe size={10} strokeWidth={3} />
                                                                <span className="text-[8px] font-black uppercase tracking-tighter">Web</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5 line-clamp-1">
                                                        {sale.phone1}{sale.phone2 ? \` / \${sale.phone2}\` : ''}
                                                    </div>
                                                </div>
                                                <div className="hidden md:block md:col-span-2 text-xs text-gray-600 dark:text-gray-300 truncate pr-2">
                                                    {sale.destination_branch}
                                                </div>
                                                <div className="hidden md:block md:col-span-2 min-w-0">
                                                    <div className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">
                                                        {sale.sale_items?.reduce((sum, item) => sum + (item.quantity || 1), 0)} Items
                                                    </div>
                                                </div>
                                                <div className="hidden md:flex md:col-span-1 items-center gap-1">
                                                    <IndianRupee size={12} className="text-gray-400" />
                                                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                                                        {sale.cod_amount?.toLocaleString() || '0'}
                                                    </span>
                                                </div>
                                                <div className="hidden md:block md:col-span-2">
                                                    <span className={\`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border \${getStatusColor(sale.parcel_status)}\`}>
                                                        {sale.parcel_status}
                                                    </span>
                                                </div>
                                                
                                                <div className="flex md:col-span-2 items-center justify-end gap-2 mt-1 md:mt-0">`;

if (regex.test(code)) {
    code = code.replace(regex, replacement);
    fs.writeFileSync('mobile/src/pages/SalesPage.tsx', code);
    console.log('Fixed SalesPage list layout');
} else {
    console.log('Regex failed');
}
