import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Guarda todo como filas key/value en la tabla "store_data".
// Así el resto de la app (App.jsx) casi no tuvo que cambiar.

export async function getData(key) {
  const { data, error } = await supabase
    .from("store_data")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) {
    console.error("Error leyendo de Supabase:", key, error);
    return null;
  }
  if (!data) return null;
  return data.value;
}

export async function setData(key, value) {
  const { error } = await supabase
    .from("store_data")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) {
    console.error("Error guardando en Supabase:", error);
    return { ok: false, message: error.message || String(error) };
  }
  return { ok: true };
}

export async function deleteData(key) {
  const { error } = await supabase
    .from("store_data")
    .delete()
    .eq("key", key);
  if (error) {
    console.error("Error borrando en Supabase:", error);
    return { ok: false, message: error.message || String(error) };
  }
  return { ok: true };
}

// Sube una foto de producto al bucket "productos" (tiene que existir y ser
// público - ver instrucciones). Devuelve la URL pública o un error.
export async function uploadProductImage(file, productId) {
  try {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${productId}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("productos")
      .upload(path, file, { upsert: true, cacheControl: "3600" });
    if (uploadError) {
      console.error("Error subiendo imagen:", uploadError);
      return { ok: false, message: uploadError.message || String(uploadError) };
    }
    const { data } = supabase.storage.from("productos").getPublicUrl(path);
    return { ok: true, url: data.publicUrl };
  } catch (e) {
    console.error("Excepción subiendo imagen:", e);
    return { ok: false, message: e.message || String(e) };
  }
}
