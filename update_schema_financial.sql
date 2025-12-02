-- Create installments table
create table public.installments (
  id uuid default uuid_generate_v4() primary key,
  sale_id uuid references public.sales(id) on delete cascade,
  installment_number integer not null,
  due_date date not null,
  amount numeric not null,
  status text not null check (status in ('pending', 'paid', 'overdue')) default 'pending',
  paid_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create cash_registers table (controls open/close)
create table public.cash_registers (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id),
  opened_at timestamp with time zone default timezone('utc'::text, now()) not null,
  closed_at timestamp with time zone,
  initial_balance numeric default 0,
  final_balance numeric,
  status text not null check (status in ('open', 'closed')) default 'open'
);

-- Create cash_transactions table (money in/out)
create table public.cash_transactions (
  id uuid default uuid_generate_v4() primary key,
  register_id uuid references public.cash_registers(id) on delete cascade,
  sale_id uuid references public.sales(id), -- Optional, link to sale if applicable
  installment_id uuid references public.installments(id), -- Optional, link to installment payment
  description text not null,
  amount numeric not null, -- Positive for IN, Negative for OUT
  type text not null check (type in ('sale', 'installment_payment', 'opening', 'closing', 'withdrawal', 'deposit')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS Policies

-- Installments
alter table public.installments enable row level security;

create policy "Admins have full access to installments" on public.installments
  for all using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "Users can view installments" on public.installments
  for select using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
    )
  );

-- Cash Registers
alter table public.cash_registers enable row level security;

create policy "Admins have full access to cash_registers" on public.cash_registers
  for all using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "Users can manage their own cash_registers" on public.cash_registers
  for all using (
    auth.uid() = user_id
  );

-- Cash Transactions
alter table public.cash_transactions enable row level security;

create policy "Admins have full access to cash_transactions" on public.cash_transactions
  for all using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "Users can insert cash_transactions" on public.cash_transactions
  for insert with check (
    exists (
      select 1 from public.cash_registers
      where cash_registers.id = register_id and cash_registers.user_id = auth.uid()
    )
  );

create policy "Users can view their own register transactions" on public.cash_transactions
  for select using (
    exists (
      select 1 from public.cash_registers
      where cash_registers.id = register_id and cash_registers.user_id = auth.uid()
    )
  );
