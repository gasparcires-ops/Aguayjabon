// Agua y Jabón — sistema visual del rediseño.
// Copiar en src/ui.js e importar donde haga falta:  import { C, F, btn, card, chip, badge, input } from "./ui";

// ── Colores (todos salen del logo) ─────────────────────────────
export const C = {
  azul: "#1B4F9C",        // acción principal, marca
  azulOscuro: "#0F3E86",  // hover del principal, títulos, menú lateral
  azulSuave: "#E8F0FC",   // fondos seleccionados, chips activos
  azulBorde: "#C7DAF3",   // borde de botones secundarios
  celeste: "#29A9E1",     // acento, solo decorativo

  rojo: "#B0242A",        // SOLO borrar / error
  rojoSuave: "#FDECEC",
  rojoBorde: "#F3D2D3",

  ambar: "#A85C06",       // avisos: poco stock, falta precio
  ambarSuave: "#FDF3E2",
  ambarBorde: "#F5DFB4",

  verde: "#1F7A3D",       // stock ok
  verdeSuave: "#EAF6EE",

  texto: "#10243D",
  textoSuave: "#5B7791",
  textoTenue: "#8AA2BC",
  fondo: "#F2F6FB",
  blanco: "#FFFFFF",
  borde: "#E1EAF4",
  bordeFuerte: "#DBE6F2",
};

// ── Tipografía ─────────────────────────────────────────────────
// En index.html: <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">
export const F = {
  familia: "Nunito, system-ui, -apple-system, sans-serif",
  // Mínimos pensados para leer sin esfuerzo. No bajar de 14.
  micro: 14,
  cuerpo: 16,
  cuerpoFuerte: 17,
  titulo: 19,
  tituloGrande: 29,
  precio: 27,
  total: 34,
};

// ── Botones: la jerarquía es el 80% del rediseño ───────────────
// primario   → uno solo por pantalla (Cobrar, Guardar, Agregar producto)
// secundario → acciones frecuentes que no cierran nada
// terciario  → salidas y cancelaciones (sin caja, solo texto)
// peligro    → borrar. Siempre con confirmación.
const base = {
  fontFamily: F.familia,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 9,
  cursor: "pointer",
  borderRadius: 13,
  lineHeight: 1.1,
};

export function btn(tipo = "secundario", tamano = "md") {
  const tam = {
    sm: { padding: "11px 16px", fontSize: 14.5, minHeight: 42 },
    md: { padding: "15px 20px", fontSize: 16, minHeight: 50 },
    lg: { padding: "19px 24px", fontSize: 19, minHeight: 60 }, // el de cobrar
  }[tamano];

  const tipos = {
    primario: {
      background: C.azul, color: C.blanco, border: "none", fontWeight: 900,
      boxShadow: "0 8px 18px rgba(27,79,156,0.26)",
    },
    secundario: {
      background: C.blanco, color: C.azul,
      border: `1.5px solid ${C.azulBorde}`, fontWeight: 700,
    },
    terciario: {
      background: "transparent", color: C.textoSuave,
      border: "1.5px solid transparent", fontWeight: 700, boxShadow: "none",
    },
    peligro: {
      background: C.blanco, color: C.rojo,
      border: `1.5px solid ${C.rojoBorde}`, fontWeight: 700,
    },
  }[tipo];

  return { ...base, ...tam, ...tipos };
}

// Botón cuadrado de solo ícono (lápiz, tacho). Nunca menos de 42px.
export function iconBtn(tipo = "secundario") {
  const t = btn(tipo, "sm");
  return { ...t, width: 42, height: 42, padding: 0, borderRadius: 11 };
}

// ── Contenedores y piezas ──────────────────────────────────────
export const card = (destacado = false) => ({
  background: C.blanco,
  border: destacado ? `2px solid ${C.azul}` : `1.5px solid ${C.borde}`,
  boxShadow: destacado ? `0 0 0 4px ${C.azulSuave}` : "none",
  borderRadius: 16,
  padding: 16,
});

export const input = {
  fontFamily: F.familia,
  width: "100%",
  boxSizing: "border-box",
  border: `2px solid ${C.bordeFuerte}`,
  borderRadius: 12,
  padding: "15px 16px",
  fontSize: 17,
  fontWeight: 600,
  color: C.texto,
  background: C.blanco,
  outline: "none",
};

export const chip = (activo = false) => ({
  fontFamily: F.familia,
  borderRadius: 999,
  padding: "11px 20px",
  fontSize: 15.5,
  fontWeight: activo ? 800 : 700,
  cursor: "pointer",
  background: activo ? C.azul : C.blanco,
  color: activo ? C.blanco : C.azul,
  border: activo ? "1.5px solid transparent" : `1.5px solid ${C.azulBorde}`,
});

// Semáforo de stock: verde ok, ámbar poco, rojo último/sin stock.
export function badgeStock(stock, bajo = 3) {
  if (stock <= 0) return { texto: "Sin stock", estilo: badge(C.rojo, C.rojoSuave) };
  if (stock === 1) return { texto: "Último", estilo: badge(C.rojo, C.rojoSuave) };
  if (stock <= bajo) return { texto: `Quedan ${stock}`, estilo: badge(C.ambar, C.ambarSuave) };
  return { texto: `${stock} en stock`, estilo: badge(C.verde, C.verdeSuave) };
}

export function badge(color, fondo) {
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    background: fondo, color, borderRadius: 999,
    padding: "7px 12px", fontSize: 14, fontWeight: 800,
  };
}
