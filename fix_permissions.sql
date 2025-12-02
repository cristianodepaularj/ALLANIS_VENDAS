-- Execute este script no Editor SQL do Supabase para corrigir seu usuário

-- 1. Insere um perfil para seu usuário se não existir
-- 2. Define o papel como 'admin' para ter acesso total
insert into public.profiles (id, email, role, full_name)
select id, email, 'admin', raw_user_meta_data->>'full_name'
from auth.users
where email = 'cursos.csp1972@gmail.com' -- Seu email
on conflict (id) do update
set role = 'admin';

-- Verifica se deu certo
select * from public.profiles where email = 'cursos.csp1972@gmail.com';
