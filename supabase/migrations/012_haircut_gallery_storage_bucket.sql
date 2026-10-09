-- =============================================================================
-- 012 — Storage: Configuração do Bucket 'haircut-gallery' e Permissão Pública
-- =============================================================================
-- Assegura que o bucket 'haircut-gallery' no Supabase Storage:
-- 1. Esteja configurado como PÚBLICO (public = true).
-- 2. Permita leitura anônima de todos os objetos (para o Chatbot PWA carregar as fotos).
-- 3. Evite erros de 400 Bad Request / 403 Forbidden nas requisições GET do navegador.
-- =============================================================================

-- 1. Garante a existência do bucket 'haircut-gallery' com flag public = true
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'haircut-gallery',
  'haircut-gallery',
  true,
  5242880, -- limite de 5MB por imagem
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/jpg', 'image/gif']
)
on conflict (id) do update set
  public = true,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/jpg', 'image/gif'];

-- 2. Habilita política de leitura pública irrestrita no bucket 'haircut-gallery'
drop policy if exists "Acesso público de leitura para haircut-gallery" on storage.objects;
create policy "Acesso público de leitura para haircut-gallery"
  on storage.objects
  for select
  to public
  using (bucket_id = 'haircut-gallery');

-- 3. Habilita inserção/atualização para usuários autenticados (painel admin)
drop policy if exists "Upload da galeria de cortes para usuários autenticados" on storage.objects;
create policy "Upload da galeria de cortes para usuários autenticados"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'haircut-gallery');

drop policy if exists "Atualização da galeria de cortes para usuários autenticados" on storage.objects;
create policy "Atualização da galeria de cortes para usuários autenticados"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'haircut-gallery');
