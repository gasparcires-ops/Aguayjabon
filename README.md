# Mi comercio — guía para ponerla 100% online con dominio propio

Esto convierte la app en un sitio real, con su propia base de datos y,
si querés, su propio dominio (ej: mitienda.com.ar). Vas a necesitar
crear 3 cuentas gratuitas: Supabase, GitHub y Vercel. Ninguna pide
tarjeta para el plan gratis.

---

## Paso 1 — Crear la base de datos (Supabase)

1. Andá a https://supabase.com y creá una cuenta gratis.
2. "New project". Ponele un nombre (ej: `mi-comercio`) y una contraseña
   (guardala, no hace falta acordarse de memoria pero la pide Supabase).
3. Esperá 1-2 minutos a que el proyecto se cree.
4. En el menú izquierdo, andá a **SQL Editor** → **New query**.
5. Abrí el archivo `supabase-schema.sql` de esta carpeta, copiá todo
   su contenido, pegalo ahí, y tocá **Run**.
6. Andá a **Project Settings** (ícono de engranaje) → **API**.
7. Copiá dos datos que vas a necesitar en el paso 3:
   - **Project URL**
   - **anon public key**

---

## Paso 2 — Subir el código a GitHub

1. Andá a https://github.com y creá una cuenta gratis (si no tenés).
2. Creá un repositorio nuevo (botón verde "New"), por ejemplo
   `mi-comercio`. Dejalo como **privado** si no querés que se vea
   públicamente.
3. Subí todos los archivos de esta carpeta a ese repositorio. Si nunca
   usaste git, la forma más simple es:
   - Instalá **GitHub Desktop** (https://desktop.github.com)
   - "Add local repository" → elegís esta carpeta
   - "Publish repository"

---

## Paso 3 — Publicar el sitio (Vercel)

1. Andá a https://vercel.com y creá una cuenta gratis, **entrando con
   tu cuenta de GitHub** (más simple, quedan conectadas solas).
2. "Add New" → "Project" → elegís el repositorio `mi-comercio`.
3. Antes de tocar "Deploy", abrí la sección **Environment Variables**
   y cargá las dos del paso 1:
   - `VITE_SUPABASE_URL` → tu Project URL
   - `VITE_SUPABASE_ANON_KEY` → tu anon public key
4. Tocá **Deploy**. En 1-2 minutos te da una URL propia, algo como
   `mi-comercio.vercel.app`. Ya está online y accesible desde
   cualquier dispositivo, sin pasar por Claude.

Cada vez que quieras actualizar la app (nuevas funciones), avisame acá,
yo te doy el código actualizado, lo subís al mismo repositorio de
GitHub, y Vercel lo vuelve a publicar solo.

---

## Paso 4 — Conectar tu propio dominio (opcional)

Si ya tenés un dominio comprado (o querés comprar uno):

1. En Vercel, entrá al proyecto → **Settings** → **Domains**.
2. Escribí tu dominio (ej: `mitienda.com.ar`) y tocá **Add**.
3. Vercel te va a mostrar 1-2 registros DNS para configurar
   (normalmente un registro tipo `A` o `CNAME`).
4. Andá al panel de donde compraste el dominio (NIC Argentina,
   GoDaddy, Namecheap, etc.), buscá la sección **DNS**, y cargá esos
   registros tal cual te los muestra Vercel.
5. Puede tardar entre unos minutos y un par de horas en propagarse.
   Cuando esté listo, Vercel marca el dominio como "Valid" y ya podés
   entrar a `https://mitienda.com.ar` directamente.

Si todavía no tenés un dominio, se puede comprar en NIC Argentina
(`.com.ar`, es el organismo oficial) o en sitios como Namecheap o
Google Domains — normalmente entre US$10 y US$20 por año.

---

## Notas importantes

- **Seguridad**: en este esquema simple, cualquiera que tenga la URL
  de tu proyecto de Supabase y la clave "anon" (que viaja en el
  código del sitio, así que técnicamente es pública) podría leer o
  escribir en la base de datos directamente, sin pasar por la
  pantalla de login de empleados. Para un local chico es un punto de
  partida razonable, pero no es un sistema con seguridad robusta.
  Si más adelante te preocupa, se puede agregar autenticación real
  (Supabase Auth) para que solo tu tienda pueda leer/escribir sus
  propios datos.
- **Costo**: Supabase, GitHub y Vercel tienen plan gratuito de sobra
  para un comercio chico. Lo único que podría tener costo es el
  dominio propio (paso 4), que es opcional — sin dominio, la URL
  `mi-comercio.vercel.app` funciona igual de bien.
- **Para probar en tu compu antes de publicar** (opcional, requiere
  tener Node.js instalado): copiá `.env.example` a `.env`, completá
  los valores de Supabase, y corré `npm install` seguido de
  `npm run dev`.
