import React, { useState, useEffect } from "react";
import { ShoppingCart, Search, Plus, Minus, X, Image as ImageIcon, Trash2 } from "lucide-react";
import { getData } from "./lib/storage";
import { C, btn, card, chip as chipStyle, input as inputBase } from "./ui";

// Número de WhatsApp del local, con código de país, sin "+" ni espacios.
const WHATSAPP_NUMBER = "5493515940308";

const sans = "Nunito, system-ui, -apple-system, sans-serif";
const fmt = (n) => Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const methodLabel = { efectivo: "Efectivo", transferencia: "Transferencia", debito: "Débito", credito: "Crédito", mercadopago: "Mercado Pago / QR", otros: "Otros" };

export default function Catalogo() {
  const [loaded, setLoaded] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [cart, setCart] = useState({});
  const [showOrder, setShowOrder] = useState(false);
  const [cliente, setCliente] = useState("");
  const [payMethod, setPayMethod] = useState("efectivo");
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    (async () => {
      const load = async (key, fallback) => {
        try {
          const v = await getData(key);
          return v !== null && v !== undefined ? v : fallback;
        } catch (e) {
          return fallback;
        }
      };
      setProducts(await load("products", []));
      setCategories(await load("categories", []));
      setGroups(await load("groups", []));
      setLoaded(true);
    })();
  }, []);

  const catName = (id) => categories.find((c) => c.id === id)?.name || "Otros artículos";
  const catGroupId = (categoryId) => categories.find((c) => c.id === categoryId)?.groupId || "";
  const groupName = (id) => groups.find((g) => g.id === id)?.name || "Otros";

  const disponibles = products.filter((p) => p.price > 0 && p.stock > 0);

  const filtrados = disponibles.filter((p) => {
    const q = search.trim().toLowerCase();
    if (q && !p.name.toLowerCase().includes(q)) return false;
    if (groupFilter !== "all") {
      const gid = catGroupId(p.categoryId) || "sin-grupo";
      if (gid !== groupFilter) return false;
    }
    return true;
  });

  const porGrupo = {};
  filtrados.forEach((p) => {
    const gid = catGroupId(p.categoryId) || "sin-grupo";
    const gname = gid === "sin-grupo" ? "Otros artículos" : groupName(gid);
    const cname = catName(p.categoryId);
    if (!porGrupo[gname]) porGrupo[gname] = {};
    if (!porGrupo[gname][cname]) porGrupo[gname][cname] = [];
    porGrupo[gname][cname].push(p);
  });
  const gruposOrdenados = Object.keys(porGrupo).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

  const gruposDisponibles = groups
    .filter((g) => disponibles.some((p) => catGroupId(p.categoryId) === g.id))
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));

  const addToCart = (id) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const changeQty = (id, delta) => setCart((c) => {
    const next = (c[id] || 0) + delta;
    const copy = { ...c };
    if (next <= 0) delete copy[id];
    else copy[id] = next;
    return copy;
  });

  const cartItems = Object.entries(cart)
    .map(([id, qty]) => ({ product: products.find((p) => p.id === id), qty }))
    .filter((i) => i.product);
  const cartTotal = cartItems.reduce((a, i) => a + i.product.price * i.qty, 0);
  const cartCount = cartItems.reduce((a, i) => a + i.qty, 0);

  const mensajeWhatsapp = () => {
    let msg = "Hola! Quiero hacer este pedido:\n\n";
    cartItems.forEach((i) => {
      msg += `${i.qty}x ${i.product.name} - $${fmt(i.product.price * i.qty)}\n`;
    });
    msg += `\nTotal: $${fmt(cartTotal)}\n`;
    msg += `Forma de pago: ${methodLabel[payMethod]}\n`;
    if (cliente.trim()) msg += `\nNombre: ${cliente.trim()}`;
    return msg;
  };

  const enviarPedido = () => {
    const texto = encodeURIComponent(mensajeWhatsapp());
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${texto}`, "_blank");
    setEnviado(true);
  };

  if (!loaded) {
    return <div style={{ padding: 40, textAlign: "center", color: C.textoSuave, fontFamily: sans }}>Cargando catálogo...</div>;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F2F6FB", fontFamily: sans, color: C.texto, paddingBottom: cartCount > 0 ? 76 : 0 }}>
      <style>{`* { box-sizing: border-box; } button { font-family: inherit; cursor: pointer; }`}</style>

      <div style={{ background: "#fff", borderBottom: "1px solid #E1EAF4", padding: "18px 16px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo.jpg" alt="Agua y Jabón" style={{ width: 52, height: 52, objectFit: "contain", borderRadius: 10 }} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.azul }}>Agua y Jabón</div>
            <div style={{ fontSize: 12.5, color: C.textoSuave }}>Elegí tus productos y armá tu pedido</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
        <div style={{ position: "relative", marginBottom: 12 }}>
          <Search size={18} style={{ position: "absolute", left: 14, top: 13, color: C.textoTenue }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto..." style={{ ...inputBase, padding: "12px 14px 12px 40px" }} />
        </div>

        {gruposDisponibles.length > 0 && (
          <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 16, paddingBottom: 2 }}>
            <button onClick={() => setGroupFilter("all")} style={{ ...chipStyle(groupFilter === "all"), flexShrink: 0, whiteSpace: "nowrap" }}>Todo</button>
            {gruposDisponibles.map((g) => (
              <button key={g.id} onClick={() => setGroupFilter(g.id)} style={{ ...chipStyle(groupFilter === g.id), flexShrink: 0, whiteSpace: "nowrap" }}>{g.name}</button>
            ))}
          </div>
        )}

        {gruposOrdenados.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: C.textoTenue, fontSize: 14 }}>No hay productos disponibles por ahora.</div>
        )}

        {gruposOrdenados.map((gname) => (
          <div key={gname} style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: C.azul, marginBottom: 10 }}>{gname}</div>
            {Object.keys(porGrupo[gname]).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })).map((cname) => (
              <div key={cname} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.textoSuave, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>{cname}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                  {porGrupo[gname][cname]
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
                    .map((p) => {
                      const qty = cart[p.id] || 0;
                      return (
                        <div key={p.id} style={{ ...card(), padding: 10, display: "flex", flexDirection: "column" }}>
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.name} style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 8, marginBottom: 8 }} />
                          ) : (
                            <div style={{ width: "100%", height: 110, borderRadius: 8, marginBottom: 8, background: "#F2F6FB", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <ImageIcon size={24} style={{ color: C.textoTenue }} />
                            </div>
                          )}
                          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, flex: 1 }}>{p.name}</div>
                          <div style={{ fontSize: 17, fontWeight: 900, color: C.azul, marginBottom: 8 }}>${fmt(p.price)}</div>
                          {qty > 0 ? (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: C.azulSuave, borderRadius: 10, padding: "4px 6px" }}>
                              <button onClick={() => changeQty(p.id, -1)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Minus size={14} /></button>
                              <span style={{ fontSize: 14, fontWeight: 800, minWidth: 18, textAlign: "center" }}>{qty}</span>
                              <button onClick={() => addToCart(p.id)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: C.azul, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Plus size={14} /></button>
                            </div>
                          ) : (
                            <button onClick={() => addToCart(p.id)} style={{ ...btn("primario", "sm"), boxShadow: "none", width: "100%" }}>
                              <Plus size={14} /> Agregar
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {cartCount > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.azul, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <button onClick={() => setShowOrder(true)} style={{ maxWidth: 760, width: "100%", background: "none", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", padding: 0 }}>
            <span style={{ fontSize: 14 }}>{cartCount} producto{cartCount !== 1 ? "s" : ""} · ${fmt(cartTotal)}</span>
            <span style={{ background: "#fff", color: C.azul, fontWeight: 800, fontSize: 13.5, padding: "8px 16px", borderRadius: 8 }}>Ver pedido</span>
          </button>
        </div>
      )}

      {showOrder && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,30,58,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }} onClick={() => setShowOrder(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#F2F6FB", borderRadius: "18px 18px 0 0", padding: 20, width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto" }}>
            {!enviado ? (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Tu pedido</div>
                  <button onClick={() => setShowOrder(false)} style={{ border: "none", background: "none", color: C.textoTenue }}><X size={20} /></button>
                </div>

                {cartItems.map((i) => (
                  <div key={i.product.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #EDF2F8" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{i.product.name}</div>
                      <div style={{ fontSize: 12, color: C.textoTenue }}>${fmt(i.product.price)} c/u</div>
                    </div>
                    <button onClick={() => changeQty(i.product.id, -1)} style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid #DBE6F2", background: "#fff" }}><Minus size={13} /></button>
                    <span style={{ fontSize: 13.5, fontWeight: 700, minWidth: 18, textAlign: "center" }}>{i.qty}</span>
                    <button onClick={() => addToCart(i.product.id)} style={{ width: 26, height: 26, borderRadius: 7, border: "none", background: C.azul, color: "#fff" }}><Plus size={13} /></button>
                    <button onClick={() => setCart((c) => { const copy = { ...c }; delete copy[i.product.id]; return copy; })} style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid #F0C9C9", background: "#fff", color: C.rojo }}><Trash2 size={13} /></button>
                  </div>
                ))}

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 900, color: C.azul, margin: "14px 0" }}>
                  <span>Total</span><span>${fmt(cartTotal)}</span>
                </div>

                <Field label="Tu nombre">
                  <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre y apellido" style={inputBase} />
                </Field>
                <Field label="Forma de pago">
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={inputBase}>
                    {Object.keys(methodLabel).map((m) => <option key={m} value={m}>{methodLabel[m]}</option>)}
                  </select>
                </Field>

                <button onClick={enviarPedido} disabled={!cliente.trim()} style={{ ...btn("primario", "lg"), width: "100%", marginTop: 8, opacity: cliente.trim() ? 1 : 0.5 }}>
                  Enviar pedido por WhatsApp
                </button>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "20px 10px" }}>
                <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>¡Listo!</div>
                <div style={{ fontSize: 13.5, color: C.textoSuave, marginBottom: 18 }}>Se abrió WhatsApp con tu pedido. Mandalo para confirmarlo.</div>
                <button onClick={() => { setShowOrder(false); setEnviado(false); setCart({}); setCliente(""); }} style={{ ...btn("primario", "lg"), width: "100%" }}>
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12.5, color: C.textoSuave, marginBottom: 5, fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  );
}
