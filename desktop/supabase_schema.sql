-- Enable Row Level Security
alter table if exists public.profiles enable row level security;
alter table if exists public.products enable row level security;
alter table if exists public.product_lots enable row level security;
alter table if exists public.transactions enable row level security;

-- 1. Profiles Table (Extends Supabase Auth)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  full_name text,
  role text check (role in ('admin', 'staff')) default 'staff',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Products Table
create table if not exists public.products (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  sku text unique not null,
  description text,
  image_url text,
  min_stock_alert int default 10,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Product Lots (Batch Tracking)
create table if not exists public.product_lots (
  id uuid default gen_random_uuid() primary key,
  product_id uuid references public.products(id) on delete cascade not null,
  lot_number text not null,
  expiry_date date,
  quantity_remaining int default 0 check (quantity_remaining >= 0),
  cost_price decimal(10, 2) default 0.00,
  received_date timestamp with time zone default timezone('utc'::text, now()) not null,
  created_by uuid references public.profiles(id)
);

-- 4. Transactions (Stock History)
create table if not exists public.transactions (
  id uuid default gen_random_uuid() primary key,
  product_id uuid references public.products(id) on delete cascade not null,
  lot_id uuid references public.product_lots(id),
  type text check (type in ('in', 'sale', 'adjustment', 'expiry')) not null,
  quantity_changed int not null,
  performed_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- POLICIES (Simple for now: Authenticated users can read all, admins can write all)

-- Profiles
create policy "Public profiles are viewable by everyone." on public.profiles for select using (true);
create policy "Users can insert their own profile." on public.profiles for insert with check (auth.uid() = id);
create policy "Admins can manage all profiles." on public.profiles for all using (
  exists (
    select 1 from public.profiles 
    where id = auth.uid() and role = 'admin'
  )
);

-- Products
create policy "Enable read access for all users" on public.products for select using (true);
create policy "Enable insert for authenticated users only" on public.products for insert with check (auth.role() = 'authenticated');
create policy "Enable update for authenticated users only" on public.products for update using (auth.role() = 'authenticated');

-- Product Lots
create policy "Enable read access for all users" on public.product_lots for select using (true);
create policy "Enable insert for authenticated users only" on public.product_lots for insert with check (auth.role() = 'authenticated');
create policy "Enable update for authenticated users only" on public.product_lots for update using (auth.role() = 'authenticated');

-- Transactions
create policy "Enable read access for all users" on public.transactions for select using (true);
create policy "Enable insert for authenticated users only" on public.transactions for insert with check (auth.role() = 'authenticated');

-- 5. Expenses
create table if not exists public.expenses (
  id uuid default gen_random_uuid() primary key,
  description text not null,
  amount decimal(10, 2) not null,
  expense_date date not null,
  recorded_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.expenses enable row level security;

create policy "Enable read access for expenses" on public.expenses for select using (auth.uid() is not null);
create policy "Enable insert for expenses" on public.expenses for insert with check (auth.uid() is not null);
create policy "Enable edit for admins" on public.expenses for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- 6. Sales
create table if not exists public.sales (
  id uuid default gen_random_uuid() primary key,
  order_date date not null,
  destination_branch text not null,
  parcel_status text check (parcel_status in ('processing', 'sent', 'delivered', 'returned')) default 'processing',
  customer_name text not null,
  customer_address text not null,
  phone1 text not null check (length(phone1) = 10),
  phone2 text check (phone2 is null or length(phone2) = 10),
  cod_amount decimal(10, 2) not null default 0.00,
  product_id uuid references public.products(id) not null,
  quantity int not null check (quantity > 0),
  recorded_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.sales enable row level security;

create policy "Enable read access for sales" on public.sales for select using (auth.uid() is not null);
create policy "Enable insert for sales" on public.sales for insert with check (auth.uid() is not null);
create policy "Enable all for admins and updates for authenticated" on public.sales for all using (auth.uid() is not null);
