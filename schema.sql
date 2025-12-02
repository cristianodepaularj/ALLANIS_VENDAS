-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create profiles table (extends auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text not null,
  role text not null check (role in ('admin', 'user')),
  full_name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create clients table
create table public.clients (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  phone text,
  email text,
  address text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create products table
create table public.products (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  code text,
  price numeric not null,
  category text,
  unit text,
  stock_quantity integer default 0,
  min_stock_threshold integer default 5,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create sales table
create table public.sales (
  id uuid default uuid_generate_v4() primary key,
  client_id uuid references public.clients(id),
  user_id uuid references auth.users(id),
  total_amount numeric not null,
  payment_method text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create sale_items table
create table public.sale_items (
  id uuid default uuid_generate_v4() primary key,
  sale_id uuid references public.sales(id) on delete cascade,
  product_id uuid references public.products(id),
  quantity integer not null,
  unit_price numeric not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

-- Policies

-- Profiles: Public read (for now, or restricted to self/admin), Admin update
create policy "Public profiles are viewable by everyone" on public.profiles
  for select using (true);

create policy "Users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);

create policy "Admins can update profiles" on public.profiles
  for update using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Clients: Admin full access, User read-only (or full access as per req? Req says Admin can Create/Edit/Delete/List. User? Req says User access only Sales and Stock. But Sales needs Client selection. So User needs Read access to Clients.)
-- Req: "Admin pode: Cadastrar, Editar, Excluir, Listar". "User: Acesso somente à tela de vendas e estoque".
-- Implication: User needs to READ clients to select them in Sales.

create policy "Admins have full access to clients" on public.clients
  for all using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "Users can view clients" on public.clients
  for select using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
    )
  );

-- Products: Admin full access, User read-only (for Sales and Stock view)
create policy "Admins have full access to products" on public.products
  for all using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "Users can view products" on public.products
  for select using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
    )
  );

-- Sales: Admin full access, User create (make sale) and read (own sales? or all? Req doesn't specify restriction on viewing sales for User, but usually User sees own or all. Let's allow User to Insert and Select.)
-- Req: "Admin e User podem: ... (Stock)". "Tela de Vendas: ... Registrar a venda".
-- User needs to INSERT into sales and sale_items.

create policy "Admins have full access to sales" on public.sales
  for all using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "Users can view sales" on public.sales
  for select using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
    )
  );

create policy "Users can insert sales" on public.sales
  for insert with check (
    auth.uid() = user_id
  );

-- Sale Items
create policy "Admins have full access to sale_items" on public.sale_items
  for all using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "Users can view sale_items" on public.sale_items
  for select using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
    )
  );

create policy "Users can insert sale_items" on public.sale_items
  for insert with check (
    exists (
      select 1 from public.sales
      where sales.id = sale_id and sales.user_id = auth.uid()
    )
  );

-- Function to handle new user signup (trigger)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role, full_name)
  values (new.id, new.email, 'user', new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Create purchases table
create table public.purchases (
  id uuid default uuid_generate_v4() primary key,
  product_id uuid references public.products(id),
  quantity integer not null,
  purchase_date timestamp with time zone default timezone('utc'::text, now()) not null,
  file_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for purchases
alter table public.purchases enable row level security;

-- Purchases policies
create policy "Admins have full access to purchases" on public.purchases
  for all using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "Users can view purchases" on public.purchases
  for select using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
    )
  );

create policy "Users can insert purchases" on public.purchases
  for insert with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
    )
  );
