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
  if (error || !data) return null;
  return data.value;
}

export async function setData(key, value) {
  const { error } = await supabase
    .from("store_data")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  return !error;
}
