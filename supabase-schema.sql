-- Ejecutar esto en Supabase: Project > SQL Editor > New query > Run

create table if not exists store_data (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- Habilita Row Level Security y permite lectura/escritura pública
-- con la clave "anon". Es la forma simple de arrancar: cualquiera
-- que tenga la URL y la clave anon de tu proyecto podría leer o
-- escribir datos. Para un local chico es un riesgo aceptable al
-- principio, pero no es un login de verdad. Más adelante se puede
-- reemplazar por Supabase Auth si hace falta más seguridad.

alter table store_data enable row level security;

create policy "Permitir todo con anon key"
on store_data
for all
using (true)
with check (true);

-- Fotos de productos: el bucket "productos" se crea a mano desde
-- Storage > New bucket (marcado como público), y estas políticas le
-- dan permiso a la app para leer, subir y reemplazar imágenes ahí.

create policy "Permitir leer fotos de productos"
on storage.objects for select to public
using (bucket_id = 'productos');

create policy "Permitir subir fotos de productos"
on storage.objects for insert to public
with check (bucket_id = 'productos');

create policy "Permitir reemplazar fotos de productos"
on storage.objects for update to public
using (bucket_id = 'productos');
