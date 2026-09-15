import React from "react";
import { Plus, Minus, Image as ImageIcon } from "lucide-react";
import { C } from "../ui";

const fmt = (n) => Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const precioEfectivo = (p) => (p.enOferta && p.precioOferta > 0 ? p.precioOferta : p.price);

const fotoTrama = {
  backgroundImage: "repeating-linear-gradient(135deg, rgba(27,79,156,.045) 0 1px, transparent 1px 11px)",
};

export default function ProductCard({ product: p, subcat, qty, onAdd, onDec, onOpen, vista = "grid" }) {
  const precio = precioEfectivo(p);
  const enOferta = !!p.enOferta;

  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };

  if (vista === "lista") {
    return (
      <div onClick={onOpen} style={{
        display: "flex", alignItems: "center", gap: 12, background: "#fff", border: `1.5px solid ${C.borde}`,
        borderRadius: 15, padding: 9, cursor: "pointer",
      }}>
        <div style={{ width: 72, height: 72, borderRadius: 12, background: C.fotoFondo, flexShrink: 0, overflow: "hidden", position: "relative", ...fotoTrama }}>
          {p.imageUrl ? (
            <img src={p.imageUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ImageIcon size={20} style={{ color: C.textoTenue }} />
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, lineHeight: 1.25, fontWeight: 700, color: C.texto, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.name}</div>
          {subcat && <div style={{ fontSize: 11.5, fontWeight: 600, color: C.textoTenue, marginTop: 2 }}>{subcat}</div>}
          <div style={{ marginTop: 3 }}>
            {enOferta && <span style={{ fontSize: 12, fontWeight: 700, color: C.textoTenue, textDecoration: "line-through", marginRight: 6 }}>${fmt(p.price)}</span>}
            <span style={{ fontSize: 17, fontWeight: 900, color: enOferta ? C.rojo : C.azul }}>${fmt(precio)}</span>
          </div>
        </div>
        {qty > 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.azulSuave, borderRadius: 12, height: 46, padding: "0 6px", flexShrink: 0 }}>
            <button onClick={stop(onDec)} style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Minus size={15} /></button>
            <span style={{ fontSize: 14, fontWeight: 900, minWidth: 16, textAlign: "center", color: C.azul }}>{qty}</span>
            <button onClick={stop(onAdd)} style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: C.azul, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Plus size={15} /></button>
          </div>
        ) : (
          <button onClick={stop(onAdd)} style={{
            width: 46, height: 46, borderRadius: 14, border: "none", background: C.azul, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 6px 14px rgba(27,79,156,.3)",
          }}>
            <Plus size={22} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div onClick={onOpen} style={{
      background: "#fff", border: `1.5px solid ${C.borde}`, borderRadius: 16, padding: 8,
      display: "flex", flexDirection: "column", cursor: "pointer",
    }}>
      <div style={{ height: 118, borderRadius: 12, background: C.fotoFondo, overflow: "hidden", marginBottom: 8, position: "relative", ...fotoTrama }}>
        {p.imageUrl ? (
          <img src={p.imageUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ImageIcon size={26} style={{ color: C.textoTenue }} />
          </div>
        )}
        {enOferta && (
          <div style={{ position: "absolute", top: 6, left: 6, background: C.rojo, color: "#fff", fontSize: 9, fontWeight: 900, letterSpacing: "0.06em", padding: "4px 7px", borderRadius: 6 }}>
            OFERTA
          </div>
        )}
        {qty > 0 ? (
          <div style={{ position: "absolute", left: 6, right: 6, bottom: 6, height: 44, borderRadius: 14, background: C.azul, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 6px" }}>
            <button onClick={stop(onDec)} style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: "rgba(255,255,255,.16)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Minus size={16} /></button>
            <span style={{ fontSize: 16, fontWeight: 900, color: "#fff" }}>{qty}</span>
            <button onClick={stop(onAdd)} style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: "rgba(255,255,255,.16)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Plus size={16} /></button>
          </div>
        ) : (
          <button onClick={stop(onAdd)} style={{
            position: "absolute", bottom: 6, right: 6, width: 44, height: 44, borderRadius: 14, border: "none",
            background: C.azul, color: "#fff", fontSize: 26, lineHeight: 1, display: "flex", alignItems: "center",
            justifyContent: "center", boxShadow: "0 6px 14px rgba(27,79,156,.3)",
          }}>
            +
          </button>
        )}
      </div>
      <div style={{ marginBottom: 3 }}>
        {enOferta && <span style={{ fontSize: 12, fontWeight: 700, color: C.textoTenue, textDecoration: "line-through", marginRight: 6 }}>${fmt(p.price)}</span>}
        <span style={{ fontSize: 18, fontWeight: 900, color: enOferta ? C.rojo : C.azul }}>${fmt(precio)}</span>
      </div>
      <div style={{
        fontSize: 13, lineHeight: 1.28, fontWeight: 700, color: C.texto, minHeight: 34,
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
      }}>
        {p.name}
      </div>
      {subcat && <div style={{ fontSize: 11.5, fontWeight: 600, color: C.textoTenue, marginTop: 2 }}>{subcat}</div>}
    </div>
  );
}
