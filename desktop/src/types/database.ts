export type Profile = {
    id: string;
    full_name: string | null;
    email?: string | null;
    store_name?: string | null;
    role: 'admin' | 'staff' | 'vendor';
    permissions: 'read_only' | 'read_write';
    vendor_id?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    address?: string | null;
    city?: string | null;
    description?: string | null;
    bank_name?: string | null;
    bank_account_holder?: string | null;
    bank_account_number?: string | null;
    bank_branch?: string | null;
    esewa_id?: string | null;
    plan?: string | null;
    created_at: string;
}

export type Product = {
    id: string;
    name: string;
    sku: string;
    description: string | null;
    image_url: string | null;
    min_stock_alert: number;
    created_at: string;
}

export type ProductLot = {
    id: string;
    product_id: string;
    lot_number: string;
    expiry_date: string | null;
    quantity_remaining: number;
    cost_price: number;
    received_date: string;
    created_by: string | null;
}

export type Transaction = {
    id: string;
    product_id: string;
    lot_id: string | null;
    type: 'in' | 'sale' | 'adjustment' | 'expiry';
    quantity_changed: number;
    performed_by: string | null;
    created_at: string;
}
