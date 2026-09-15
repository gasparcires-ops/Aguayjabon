import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Home, Search, ClipboardList, ArrowLeft, LayoutGrid, List as ListIcon,
  Plus, Minus, X, Check, Image as ImageIcon,
} from "lucide-react";
import { getData, setData } from "./lib/storage";
import { C } from "./ui";
import ProductCard, { precioEfectivo } from "./components/ProductCard";

// Número de WhatsApp del local, con código de país, sin "+" ni espacios.
const WHATSAPP_NUMBER = "5493515940308";

const sans = "Nunito, system-ui, -apple-system, sans-serif";
const fmt = (n) => Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const methodLabel = { efectivo: "Efectivo", transferencia: "Transferencia", debito: "Débito", credito: "Crédito", mercadopago: "Mercado Pago / QR", otros: "Otros" };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// ---- búsqueda tolerante a errores de tipeo ----
function distancia(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + costo);
    }
  }
  return dp[m][n];
}
function puntajeTexto(query, texto) {
  const q = norm(query.trim());
  if (!q) return 0;
  const t = norm(texto || "");
  if (!t) return Infinity;
  if (t.includes(q)) return 0;
  const palabrasT = t.split(/\s+/).filter(Boolean);
  const palabrasQ = q.split(/\s+/).filter(Boolean);
  let total = 0;
  for (const pq of palabrasQ) {
    let mejor = Infinity;
    for (const pt of palabrasT) {
      if (pt.includes(pq) || pq.includes(pt)) { mejor = Math.min(mejor, 1); continue; }
      const tol = pq.length <= 4 ? 1 : pq.length <= 7 ? 2 : 3;
      const d = distancia(pq, pt);
      if (d <= tol) mejor = Math.min(mejor, 2 + d);
    }
    if (mejor === Infinity) return Infinity;
    total += mejor;
  }
  return total;
}
function puntajeProducto(query, p, subcat) {
  const enNombre = puntajeTexto(query, p.name);
  const enCategoria = puntajeTexto(query, subcat) + 0.5;
  const enDescripcion = p.description ? puntajeTexto(query, p.description) + 1 : Infinity;
  return Math.min(enNombre, enCategoria, enDescripcion);
}

// Opciones de diseño (ver README del handoff)
const OPCIONES = { vistaDefault: "grid", subsecciones: true, mostrarPromos: true };

const MIS_PEDIDOS_KEY = "aguayjabon_mis_pedidos";
const CACHE_KEY = "aguayjabon_catalogo_cache";

// ---- carrito: líneas por producto + variante elegida (igual que en la app interna) ----
const lineSig = (productId, modifiers) => productId + "|" + (modifiers || []).map((m) => m.name).sort().join(",");
const precioLinea = (product, modifiers) => precioEfectivo(product) + (modifiers || []).reduce((a, m) => a + (m.price || 0), 0);

export default function Catalogo() {
  const [loaded, setLoaded] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [groups, setGroups] = useState([]);
  const [sales, setSales] = useState([]);

  const [pant, setPant] = useState("home");
  const [grupo, setGrupo] = useState(null);
  const [sub, setSub] = useState("all");
  const [orden, setOrden] = useState("rel");
  const [q, setQ] = useState("");
  const [vista, setVista] = useState(() => {
    try { return localStorage.getItem("aguayjabon_vista") || OPCIONES.vistaDefault; } catch (e) { return OPCIONES.vistaDefault; }
  });

  const [cart, setCart] = useState([]); // [{ lineId, productId, modifiers, qty }]
  const [hoja, setHoja] = useState(null);
  const [pick, setPick] = useState(1);
  const [modifierPick, setModifierPick] = useState(null);
  const [pedido, setPedido] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [pago, setPago] = useState("efectivo");
  const [notas, setNotas] = useState("");
  const [toast, setToast] = useState(null);
  const toastTimeout = useRef(null);

  const [misPedidos, setMisPedidos] = useState([]);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        setProducts(data.products || []);
        setCategories(data.categories || []);
        setGroups(data.groups || []);
        setSales(data.sales || []);
        setLoaded(true);
      }
    } catch (e) {}
    try {
      const mp = JSON.parse(localStorage.getItem(MIS_PEDIDOS_KEY) || "[]");
      setMisPedidos(mp);
    } catch (e) {}

    (async () => {
      const load = async (key, fallback) => {
        try {
          const v = await getData(key);
          return v !== null && v !== undefined ? v : fallback;
        } catch (e) {
          return fallback;
        }
      };
      const [p, c, g, s] = await Promise.all([
        load("products", []), load("categories", []), load("groups", []), load("sales", []),
      ]);
      setProducts(p);
      setCategories(c);
      setGroups(g);
      setSales(s);
      setLoaded(true);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ products: p, categories: c, groups: g, sales: s })); } catch (e) {}
    })();
  }, []);

  useEffect(() => {
    try { localStorage.setItem("aguayjabon_vista", vista); } catch (e) {}
  }, [vista]);

  const showToast = (msg) => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast(msg);
    toastTimeout.current = setTimeout(() => setToast(null), 1500);
  };

  const catName = (id) => categories.find((c) => c.id === id)?.name || "";
  const catGroupId = (categoryId) => categories.find((c) => c.id === categoryId)?.groupId || "";
  const groupName = (id) => groups.find((g) => g.id === id)?.name || "Otros";

  const disponibles = useMemo(() => products.filter((p) => p.price > 0 && p.stock > 0), [products]);

  const gruposDisponibles = useMemo(() => groups
    .filter((g) => disponibles.some((p) => catGroupId(p.categoryId) === g.id))
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" })), [groups, disponibles, categories]);

  // ---- carrito ----
  const add = (productId, modifiers = [], n = 1) => {
    const producto = products.find((p) => p.id === productId);
    setCart((c) => {
      const sig = lineSig(productId, modifiers);
      const idx = c.findIndex((l) => lineSig(l.productId, l.modifiers) === sig);
      if (idx >= 0) {
        const copy = [...c];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + n };
        return copy;
      }
      return [...c, { lineId: uid(), productId, modifiers, qty: n }];
    });
    if (producto) showToast(`${producto.name.split(" ").slice(0, 3).join(" ")} agregado`);
  };
  const dec = (lineId) => setCart((c) => {
    const idx = c.findIndex((l) => l.lineId === lineId);
    if (idx < 0) return c;
    const next = c[idx].qty - 1;
    if (next <= 0) return c.filter((l) => l.lineId !== lineId);
    const copy = [...c];
    copy[idx] = { ...copy[idx], qty: next };
    return copy;
  });
  // dec/add rápidos desde una tarjeta (sin variantes): operan sobre la única línea sin modificadores de ese producto
  const decProducto = (productId) => {
    const linea = cart.find((l) => l.productId === productId && (!l.modifiers || l.modifiers.length === 0));
    if (linea) dec(linea.lineId);
  };
  const addProducto = (productId) => add(productId, []);
  const qtyDeProducto = (productId) => cart.filter((l) => l.productId === productId && (!l.modifiers || l.modifiers.length === 0)).reduce((a, l) => a + l.qty, 0);

  const cartItems = useMemo(() => cart
    .map((l) => ({ ...l, product: products.find((p) => p.id === l.productId) }))
    .filter((l) => l.product), [cart, products]);
  const cartTotal = cartItems.reduce((a, i) => a + precioLinea(i.product, i.modifiers) * i.qty, 0);
  const cartCount = cartItems.reduce((a, i) => a + i.qty, 0);

  // ---- "los más pedidos" (últimos 30 días, calculado de sales) ----
  const masPedidos = useMemo(() => {
    const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30);
    const conteo = {};
    sales.forEach((s) => {
      if (new Date(s.date) < hace30) return;
      (s.items || []).forEach((it) => { conteo[it.productId] = (conteo[it.productId] || 0) + it.qty; });
    });
    const top = Object.entries(conteo)
      .map(([id, qty]) => ({ product: disponibles.find((p) => p.id === id), qty }))
      .filter((x) => x.product)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8)
      .map((x) => x.product);
    if (top.length >= 4) return top;
    const relleno = disponibles.filter((p) => !top.includes(p)).slice(0, 8 - top.length);
    return [...top, ...relleno];
  }, [sales, disponibles]);

  const ofertas = useMemo(() => disponibles.filter((p) => p.enOferta && p.precioOferta > 0), [disponibles]);

  // ---- pedido anterior (guardado en este dispositivo) ----
  const ultimoPedido = misPedidos[0] || null;
  const repetirPedido = (pedidoGuardado) => {
    const nuevasLineas = [];
    (pedidoGuardado.items || []).forEach((it) => {
      const p = products.find((x) => x.id === it.productId);
      if (p && p.price > 0 && p.stock > 0) {
        nuevasLineas.push({ lineId: uid(), productId: it.productId, modifiers: it.modifiers || [], qty: it.qty });
      }
    });
    setCart(nuevasLineas);
    setPant("home");
    showToast("Pedido agregado al carrito");
  };

  // ---- guardar / enviar pedido ----
  const guardarPedidoEnApp = async () => {
    try {
      let freshProducts = products;
      let freshSales = [];
      const fp = await getData("products");
      if (fp !== null && fp !== undefined) freshProducts = fp;
      const fs = await getData("sales");
      if (fs !== null && fs !== undefined) freshSales = fs;

      const nextNumber = freshSales.length + 1;
      const sale = {
        id: uid(),
        number: nextNumber,
        date: new Date().toISOString(),
        employeeId: null,
        employeeName: null,
        cliente: nombre.trim(),
        origen: "catalogo",
        confirmado: false,
        pending: true,
        method: null,
        metodoPrevisto: pago,
        nota: notas.trim(),
        items: cartItems.map((i) => ({
          productId: i.product.id, name: i.product.name, price: precioLinea(i.product, i.modifiers), qty: i.qty,
          modifiers: i.modifiers || [], categoryId: i.product.categoryId || null,
        })),
        subtotal: cartTotal,
        discountType: null,
        discountValue: 0,
        discountAmount: 0,
        total: cartTotal,
      };
      const nextSales = [sale, ...freshSales];
      const nextProducts = freshProducts.map((p) => {
        const cantidadVendida = cartItems.filter((i) => i.product.id === p.id).reduce((a, i) => a + i.qty, 0);
        return cantidadVendida > 0 ? { ...p, stock: Math.max(0, p.stock - cantidadVendida) } : p;
      });
      await setData("sales", nextSales);
      await setData("products", nextProducts);

      try {
        const nextMisPedidos = [sale, ...misPedidos].slice(0, 20);
        localStorage.setItem(MIS_PEDIDOS_KEY, JSON.stringify(nextMisPedidos));
        setMisPedidos(nextMisPedidos);
      } catch (e) {}
    } catch (e) {
      console.error("No se pudo guardar el pedido en la app:", e);
    }
  };

  const mensajeWhatsapp = () => {
    let msg = "Hola! Quiero hacer este pedido:\n\n";
    cartItems.forEach((i) => {
      const variante = (i.modifiers || []).length > 0 ? ` (${i.modifiers.map((m) => m.name).join(", ")})` : "";
      msg += `${i.qty}x ${i.product.name}${variante} - $${fmt(precioLinea(i.product, i.modifiers) * i.qty)}\n`;
    });
    msg += `\nTotal: $${fmt(cartTotal)}\n`;
    msg += `Forma de pago: ${methodLabel[pago]}\n`;
    if (notas.trim()) msg += `Aclaraciones: ${notas.trim()}\n`;
    if (nombre.trim()) msg += `\nNombre: ${nombre.trim()}`;
    return msg;
  };

  const enviarPedido = async () => {
    if (!nombre.trim()) return;
    setEnviando(true);
    await guardarPedidoEnApp();
    setEnviando(false);
    const texto = encodeURIComponent(mensajeWhatsapp());
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${texto}`, "_blank");
    setEnviado(true);
  };

  const seguirComprando = () => {
    setPedido(false); setEnviado(false); setCart([]); setNombre(""); setNotas("");
    setPant("home");
  };

  const abrirGrupo = (id) => { setGrupo(id); setSub("all"); setOrden("rel"); setPant("grupo"); };
  const abrirFicha = (productId) => {
    setHoja(productId);
    setPick(1);
    setModifierPick(null);
  };
  const agregarDesdeFicha = () => {
    const producto = products.find((p) => p.id === hoja);
    if (producto && producto.modifiers && producto.modifiers.length > 0 && !modifierPick) return; // falta elegir variante
    add(hoja, modifierPick ? [modifierPick] : [], pick);
    setHoja(null);
  };

  if (!loaded) {
    return <SkeletonHome />;
  }

  const productoFicha = hoja ? products.find((p) => p.id === hoja) : null;

  return (
    <div style={{ minHeight: "100vh", background: C.fondo, fontFamily: sans, color: C.texto, position: "relative", overflow: "hidden" }}>
      <style>{`
        * { box-sizing: border-box; } button { font-family: inherit; cursor: pointer; }
        .riel::-webkit-scrollbar { width: 0; height: 0; }
        .riel { scrollbar-width: none; }
        .snap { scroll-snap-type: x mandatory; }
        .snap > * { scroll-snap-align: start; }
      `}</style>

      <div style={{ paddingBottom: 178, minHeight: "100vh" }}>
        {pant === "home" && (
          <HomeScreen
            categorias={categories} grupos={gruposDisponibles} disponibles={disponibles}
            masPedidos={masPedidos} ofertas={ofertas} ultimoPedido={ultimoPedido}
            qtyDeProducto={qtyDeProducto} onAdd={addProducto} onDec={decProducto} onOpenFicha={abrirFicha} onAbrirGrupo={abrirGrupo}
            onIrBuscar={() => setPant("buscar")} onRepetir={repetirPedido}
            catName={catName}
          />
        )}
        {pant === "grupo" && grupo && (
          <GrupoScreen
            grupoId={grupo} groups={groups} categories={categories} disponibles={disponibles}
            sub={sub} setSub={setSub} orden={orden} setOrden={setOrden} vista={vista} setVista={setVista}
            qtyDeProducto={qtyDeProducto} onAdd={addProducto} onDec={decProducto} onOpenFicha={abrirFicha}
            onVolver={() => setPant("home")} catName={catName} catGroupId={catGroupId}
            subsecciones={OPCIONES.subsecciones}
          />
        )}
        {pant === "buscar" && (
          <BuscarScreen
            disponibles={disponibles} q={q} setQ={setQ} qtyDeProducto={qtyDeProducto} onAdd={addProducto} onDec={decProducto}
            onOpenFicha={abrirFicha} onVolver={() => setPant("home")} catName={catName}
          />
        )}
        {pant === "pedidos" && (
          <PedidosScreen misPedidos={misPedidos} onRepetir={repetirPedido} />
        )}
      </div>

      <TabBar pant={pant} setPant={setPant} />

      {cartCount > 0 && !pedido && (
        <button onClick={() => setPedido(true)} style={{
          position: "fixed", left: 14, right: 14, bottom: 98, height: 60, borderRadius: 17, background: C.azul,
          border: "none", boxShadow: "0 12px 26px rgba(15,62,134,.34)", display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "0 18px", zIndex: 40,
        }}>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#fff" }}>${fmt(cartTotal)}</div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: C.celesteClaro }}>{cartCount} producto{cartCount !== 1 ? "s" : ""} · tocá para revisar</div>
          </div>
          <span style={{ background: "#fff", color: C.azul, fontWeight: 900, fontSize: 13.5, padding: "10px 16px", borderRadius: 12 }}>Ver pedido</span>
        </button>
      )}

      {toast && (
        <div style={{
          position: "fixed", top: 66, left: "50%", transform: "translateX(-50%)", background: C.texto, color: "#fff",
          fontSize: 12.5, fontWeight: 800, padding: "9px 16px", borderRadius: 12, boxShadow: "0 10px 24px rgba(16,36,61,.3)", zIndex: 60,
        }}>
          {toast}
        </div>
      )}

      {productoFicha && (
        <FichaModal
          product={productoFicha} subcat={catName(productoFicha.categoryId)} groupNameTxt={groupName(catGroupId(productoFicha.categoryId))}
          pick={pick} setPick={setPick} modifierPick={modifierPick} setModifierPick={setModifierPick}
          onClose={() => setHoja(null)}
          onAgregar={agregarDesdeFicha}
        />
      )}

      {pedido && (
        <PedidoModal
          cartItems={cartItems} cartTotal={cartTotal} disponibles={disponibles}
          onAdd={(productId, modifiers) => add(productId, modifiers || [], 1)} onDec={dec}
          onOpenFicha={(id) => { setPedido(false); abrirFicha(id); }}
          nombre={nombre} setNombre={setNombre} pago={pago} setPago={setPago} notas={notas} setNotas={setNotas}
          enviado={enviado} enviando={enviando} onEnviar={enviarPedido} onCerrar={() => setPedido(false)}
          onVaciar={() => setCart([])} onSeguirComprando={seguirComprando}
        />
      )}
    </div>
  );
}

// ==================== INICIO ====================

function HomeScreen({ categorias, grupos, disponibles, masPedidos, ofertas, ultimoPedido, qtyDeProducto, onAdd, onDec, onOpenFicha, onAbrirGrupo, onIrBuscar, onRepetir, catName }) {
  return (
    <div>
      <div style={{ background: "#fff", borderBottom: `1.5px solid ${C.borde}`, padding: "56px 16px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <img src="/logo.jpg" alt="Agua y Jabón" style={{ width: 46, height: 46, objectFit: "contain", borderRadius: 11 }} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.azul, lineHeight: 1.1 }}>Agua y Jabón</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.textoSuave }}>Elegí tus productos y armá tu pedido</div>
          </div>
        </div>
        <button onClick={onIrBuscar} style={{
          width: "100%", height: 48, borderRadius: 13, background: C.fondo, border: `1.5px solid ${C.bordeFuerte}`,
          display: "flex", alignItems: "center", gap: 10, padding: "0 14px", textAlign: "left",
        }}>
          <Search size={17} style={{ color: C.textoTenue }} />
          <span style={{ fontSize: 14, color: C.textoTenue, fontWeight: 600 }}>Buscar producto...</span>
        </button>
      </div>

      <div style={{ padding: "16px 0 0" }}>
        {grupos.length > 0 && (
          <div className="riel" style={{ display: "flex", gap: 10, overflowX: "auto", padding: "0 16px 4px" }}>
            {grupos.map((g) => (
              <button key={g.id} onClick={() => onAbrirGrupo(g.id)} style={{ width: 78, flexShrink: 0, background: "none", border: "none", textAlign: "center" }}>
                <div style={{ width: 66, height: 66, borderRadius: 20, background: "#fff", border: `1.5px solid ${C.borde}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 6px" }}>
                  <span style={{ fontSize: 19, fontWeight: 900, color: C.azul }}>{g.name.slice(0, 2).toUpperCase()}</span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.texto, lineHeight: 1.2 }}>{g.name}</div>
              </button>
            ))}
          </div>
        )}

        {OPCIONES.mostrarPromos && (
          <div className="riel snap" style={{ display: "flex", gap: 10, overflowX: "auto", padding: "18px 16px 4px" }}>
            <div style={{ width: 300, flexShrink: 0, background: C.azul, borderRadius: 18, padding: "17px 19px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: -34, right: -34, width: 136, height: 136, borderRadius: "50%", background: "rgba(41,169,225,.28)" }} />
              <div style={{ position: "relative" }}>
                <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "0.12em", color: C.celesteClaro, fontFamily: "ui-monospace, monospace" }}>OFERTAS DE LA SEMANA</div>
                <div style={{ fontSize: 21, fontWeight: 900, color: "#fff", margin: "6px 0 10px", lineHeight: 1.15 }}>Aprovechá los precios especiales</div>
                <button onClick={() => onAbrirGrupo("todo")} style={{ background: "none", border: "none", color: "#fff", fontSize: 13, fontWeight: 800, padding: 0 }}>Ver ofertas →</button>
              </div>
            </div>
            <div style={{ width: 300, flexShrink: 0, background: "#fff", border: `1.5px solid ${C.azulBorde}`, borderRadius: 18, padding: "17px 19px" }}>
              <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "0.12em", color: C.celeste, fontFamily: "ui-monospace, monospace" }}>CÓMO FUNCIONA</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.texto, margin: "6px 0 4px", lineHeight: 1.25 }}>Armá el pedido y lo confirmamos por WhatsApp</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.textoSuave }}>Sin registro. Pagás al recibir.</div>
            </div>
          </div>
        )}

        {masPedidos.length > 0 && (
          <Riel titulo="Los más pedidos" onVerTodo={() => onAbrirGrupo("todo")}>
            {masPedidos.map((p) => (
              <div key={p.id} style={{ width: 150, flexShrink: 0 }}>
                <ProductCard product={p} subcat={catName(p.categoryId)} qty={qtyDeProducto(p.id)} onAdd={() => onAdd(p.id)} onDec={() => onDec(p.id)} onOpen={() => onOpenFicha(p.id)} vista="grid" />
              </div>
            ))}
          </Riel>
        )}

        {ultimoPedido && (
          <div style={{ padding: "18px 16px 4px" }}>
            <div style={{ fontSize: 19, fontWeight: 900, color: C.texto, marginBottom: 10 }}>Comprá de nuevo</div>
            <div style={{ background: "#fff", border: `1.5px solid ${C.borde}`, borderRadius: 16, padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.texto }}>Tu último pedido</div>
                <div style={{ fontSize: 12, color: C.textoTenue, marginTop: 2 }}>
                  {(ultimoPedido.items || []).length} producto{(ultimoPedido.items || []).length !== 1 ? "s" : ""} · ${fmt(ultimoPedido.total)} · {new Date(ultimoPedido.date).toLocaleDateString("es-AR")}
                </div>
              </div>
              <button onClick={() => onRepetir(ultimoPedido)} style={{ background: C.azulSuave, border: `1.5px solid ${C.azulBorde}`, color: C.azul, fontWeight: 800, fontSize: 13, padding: "10px 16px", borderRadius: 12, flexShrink: 0 }}>
                Agregar
              </button>
            </div>
          </div>
        )}

        {ofertas.length > 0 && (
          <div style={{ padding: "18px 16px 4px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 19, fontWeight: 900, color: C.texto }}>Ofertas</div>
              <div style={{ fontSize: 11, fontWeight: 900, color: C.rojo }}>{ofertas.length} PRODUCTOS</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
              {ofertas.map((p) => (
                <ProductCard key={p.id} product={p} subcat={catName(p.categoryId)} qty={qtyDeProducto(p.id)} onAdd={() => onAdd(p.id)} onDec={() => onDec(p.id)} onOpen={() => onOpenFicha(p.id)} vista="grid" />
              ))}
            </div>
          </div>
        )}

        {grupos.slice(0, 3).map((g) => {
          const productosDelGrupo = disponibles.filter((p) => {
            const cat = categorias.find((c) => c.id === p.categoryId);
            return cat && cat.groupId === g.id;
          }).slice(0, 6);
          if (productosDelGrupo.length === 0) return null;
          return (
            <Riel key={g.id} titulo={g.name} onVerTodo={() => onAbrirGrupo(g.id)}>
              {productosDelGrupo.map((p) => (
                <div key={p.id} style={{ width: 150, flexShrink: 0 }}>
                  <ProductCard product={p} subcat={catName(p.categoryId)} qty={qtyDeProducto(p.id)} onAdd={() => onAdd(p.id)} onDec={() => onDec(p.id)} onOpen={() => onOpenFicha(p.id)} vista="grid" />
                </div>
              ))}
            </Riel>
          );
        })}

        <div style={{ padding: "18px 16px" }}>
          <button onClick={() => onAbrirGrupo("todo")} style={{
            width: "100%", height: 54, borderRadius: 14, background: "#fff", border: `1.5px solid ${C.azulBorde}`,
            color: C.azul, fontWeight: 800, fontSize: 14.5,
          }}>
            Ver todo el catálogo
          </button>
        </div>

        <div style={{ textAlign: "center", fontSize: 11.5, fontWeight: 600, color: C.textoTenue, padding: "6px 16px 20px" }}>
          Lunes a sábados de 9 a 19 h · Entregas en el día
        </div>
      </div>
    </div>
  );
}

function Riel({ titulo, onVerTodo, children }) {
  return (
    <div style={{ padding: "18px 0 4px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", marginBottom: 10 }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: C.texto }}>{titulo}</div>
        <button onClick={onVerTodo} style={{ background: "none", border: "none", fontSize: 12.5, fontWeight: 800, color: C.azul }}>Ver todo</button>
      </div>
      <div className="riel" style={{ display: "flex", gap: 11, overflowX: "auto", padding: "0 16px" }}>
        {children}
      </div>
    </div>
  );
}

// ==================== RUBRO (GRUPO) ====================

function GrupoScreen({ grupoId, groups, categories, disponibles, sub, setSub, orden, setOrden, vista, setVista, qtyDeProducto, onAdd, onDec, onOpenFicha, onVolver, catName, catGroupId, subsecciones }) {
  const esTodo = grupoId === "todo";
  const grupoObj = esTodo ? null : groups.find((g) => g.id === grupoId);
  const nombreGrupo = esTodo ? "Todo el catálogo" : (grupoObj ? grupoObj.name : "Otros artículos");

  let productos = esTodo
    ? disponibles
    : disponibles.filter((p) => (catGroupId(p.categoryId) || "sin-grupo") === grupoId || (grupoId === "sin-grupo" && !catGroupId(p.categoryId)));

  const subcats = Array.from(new Set(productos.map((p) => catName(p.categoryId)).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

  if (sub !== "all") productos = productos.filter((p) => catName(p.categoryId) === sub);
  if (orden === "precio") productos = productos.slice().sort((a, b) => precioEfectivo(a) - precioEfectivo(b));
  if (orden === "oferta") productos = productos.filter((p) => p.enOferta);

  const vistaPlana = sub !== "all" || orden !== "rel";

  const porCategoria = {};
  productos.forEach((p) => {
    const cname = catName(p.categoryId) || "Otros";
    if (!porCategoria[cname]) porCategoria[cname] = [];
    porCategoria[cname].push(p);
  });
  const catsOrdenadas = Object.keys(porCategoria).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

  return (
    <div>
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: C.fondo, boxShadow: `0 1px 0 ${C.borde}`, paddingTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px 12px" }}>
          <button onClick={onVolver} style={{ width: 40, height: 40, borderRadius: 12, background: "#fff", border: `1.5px solid ${C.bordeFuerte}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <ArrowLeft size={18} style={{ color: C.azul }} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.texto, lineHeight: 1.1 }}>{nombreGrupo}</div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: C.textoTenue }}>{productos.length} producto{productos.length !== 1 ? "s" : ""}</div>
          </div>
          <button onClick={() => setVista(vista === "grid" ? "lista" : "grid")} style={{
            width: 40, height: 40, borderRadius: 12, background: vista === "lista" ? C.azul : "#fff",
            border: `1.5px solid ${vista === "lista" ? C.azul : C.bordeFuerte}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            {vista === "grid" ? <LayoutGrid size={17} style={{ color: C.azul }} /> : <ListIcon size={17} style={{ color: "#fff" }} />}
          </button>
        </div>

        {subcats.length > 1 && (
          <div className="riel" style={{ display: "flex", gap: 6, overflowX: "auto", padding: "0 16px 10px" }}>
            <ChipSub active={sub === "all"} onClick={() => setSub("all")}>Todo</ChipSub>
            {subcats.map((c) => <ChipSub key={c} active={sub === c} onClick={() => setSub(c)}>{c}</ChipSub>)}
          </div>
        )}

        <div className="riel" style={{ display: "flex", gap: 6, overflowX: "auto", padding: "0 16px 12px" }}>
          <ChipOrden active={orden === "rel"} onClick={() => setOrden("rel")}>Relevantes</ChipOrden>
          <ChipOrden active={orden === "precio"} onClick={() => setOrden("precio")}>Menor precio</ChipOrden>
          <ChipOrden active={orden === "oferta"} onClick={() => setOrden("oferta")}>Solo ofertas</ChipOrden>
        </div>
      </div>

      <div style={{ padding: "14px 16px 0" }}>
        {productos.length === 0 && <div style={{ textAlign: "center", padding: 40, color: C.textoTenue, fontSize: 14 }}>No hay productos que coincidan.</div>}

        {vista === "lista" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {productos.map((p) => (
              <ProductCard key={p.id} product={p} subcat={catName(p.categoryId)} qty={qtyDeProducto(p.id)} onAdd={() => onAdd(p.id)} onDec={() => onDec(p.id)} onOpen={() => onOpenFicha(p.id)} vista="lista" />
            ))}
          </div>
        ) : subsecciones && !vistaPlana ? (
          catsOrdenadas.map((cname) => (
            <div key={cname} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11.5, fontWeight: 900, color: C.textoSuave, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>{cname}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
                {porCategoria[cname].map((p) => (
                  <ProductCard key={p.id} product={p} subcat={null} qty={qtyDeProducto(p.id)} onAdd={() => onAdd(p.id)} onDec={() => onDec(p.id)} onOpen={() => onOpenFicha(p.id)} vista="grid" />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, marginBottom: 16 }}>
            {productos.map((p) => (
              <ProductCard key={p.id} product={p} subcat={catName(p.categoryId)} qty={qtyDeProducto(p.id)} onAdd={() => onAdd(p.id)} onDec={() => onDec(p.id)} onOpen={() => onOpenFicha(p.id)} vista="grid" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChipSub({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      flexShrink: 0, whiteSpace: "nowrap", padding: "10px 15px", borderRadius: 999, fontSize: 13, fontWeight: 800,
      background: active ? C.azul : "#fff", color: active ? "#fff" : C.azul, border: `1.5px solid ${active ? C.azul : C.azulBorde}`,
    }}>{children}</button>
  );
}
function ChipOrden({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      flexShrink: 0, whiteSpace: "nowrap", padding: "8px 13px", borderRadius: 10, fontSize: 12, fontWeight: 800,
      background: active ? C.texto : C.azulSuave, color: active ? "#fff" : C.textoSuave, border: "none",
    }}>{children}</button>
  );
}

// ==================== BUSCAR ====================

const BUSQUEDAS_FRECUENTES = ["Lavandina", "Cif", "Harpic", "Detergente", "Trapos", "Esponjas"];

function BuscarScreen({ disponibles, q, setQ, qtyDeProducto, onAdd, onDec, onOpenFicha, onVolver, catName }) {
  const inputRef = useRef(null);
  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);

  const query = q.trim();
  const resultados = useMemo(() => {
    if (!query) return disponibles.slice(0, 8);
    return disponibles
      .map((p) => ({ p, score: puntajeProducto(query, p, catName(p.categoryId)) }))
      .filter((x) => x.score !== Infinity)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.p);
  }, [query, disponibles]);

  return (
    <div>
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "#fff", borderBottom: `1.5px solid ${C.borde}`, padding: "56px 16px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={17} style={{ position: "absolute", left: 14, top: 15, color: C.azul }} />
            <input
              ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto..."
              style={{
                width: "100%", height: 48, borderRadius: 13, background: C.fondo, border: `2px solid ${C.azul}`,
                padding: "0 14px 0 40px", fontSize: 15, fontWeight: 700, color: C.texto, outline: "none",
              }}
            />
          </div>
          <button onClick={onVolver} style={{ background: "none", border: "none", fontSize: 14, fontWeight: 800, color: C.azul, flexShrink: 0 }}>Listo</button>
        </div>
      </div>

      <div style={{ padding: "16px" }}>
        {!query && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: C.textoSuave, letterSpacing: "0.1em", marginBottom: 10 }}>BÚSQUEDAS FRECUENTES</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {BUSQUEDAS_FRECUENTES.map((b) => (
                <ChipSub key={b} active={false} onClick={() => setQ(b)}>{b}</ChipSub>
              ))}
            </div>
          </div>
        )}

        <div style={{ fontSize: 11, fontWeight: 900, color: C.textoSuave, letterSpacing: "0.08em", marginBottom: 10 }}>
          {query ? `${resultados.length} RESULTADOS PARA "${q.trim().toUpperCase()}"` : "LOS MÁS BUSCADOS"}
        </div>

        {resultados.length === 0 ? (
          <div style={{ border: `1.5px dashed ${C.azulBorde}`, borderRadius: 16, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.texto, marginBottom: 4 }}>No encontramos eso</div>
            <div style={{ fontSize: 12.5, color: C.textoSuave }}>Probá con la marca, por ejemplo "Cif" o "Harpic".</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
            {resultados.map((p) => (
              <ProductCard key={p.id} product={p} subcat={catName(p.categoryId)} qty={qtyDeProducto(p.id)} onAdd={() => onAdd(p.id)} onDec={() => onDec(p.id)} onOpen={() => onOpenFicha(p.id)} vista="grid" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== MIS PEDIDOS ====================

function PedidosScreen({ misPedidos, onRepetir }) {
  return (
    <div style={{ padding: "56px 16px 16px" }}>
      <div style={{ fontSize: 27, fontWeight: 900, color: C.texto, marginBottom: 16 }}>Mis pedidos</div>
      {misPedidos.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: C.textoTenue, fontSize: 14 }}>
          Todavía no hiciste ningún pedido desde este celular.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {misPedidos.map((s) => {
          const entregado = !s.pending;
          return (
            <div key={s.id} style={{ background: "#fff", border: `1.5px solid ${C.borde}`, borderRadius: 16, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: C.textoTenue, fontFamily: "ui-monospace, monospace" }}>PEDIDO #{s.number}</div>
                <div style={{
                  fontSize: 11.5, fontWeight: 800, padding: "4px 10px", borderRadius: 999,
                  background: entregado ? C.verdeSuave : C.ambarSuave, color: entregado ? C.verde : C.ambar,
                }}>
                  {entregado ? "Entregado" : "Pendiente"}
                </div>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.texto, marginBottom: 10 }}>
                {(s.items || []).map((i) => `${i.qty}x ${i.name}${(i.modifiers || []).length > 0 ? ` (${i.modifiers.map((m) => m.name).join(", ")})` : ""}`).join(" · ")}
              </div>
              <div style={{ borderTop: "1.5px solid #EDF2F8", margin: "10px 0" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: C.azul }}>${fmt(s.total)}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: C.textoTenue }}>{new Date(s.date).toLocaleDateString("es-AR")}</div>
                </div>
                <button onClick={() => onRepetir(s)} style={{ background: C.azul, color: "#fff", fontWeight: 800, fontSize: 13, padding: "12px 17px", borderRadius: 12, border: "none" }}>
                  Repetir pedido
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== FICHA DE PRODUCTO ====================

function FichaModal({ product: p, subcat, groupNameTxt, pick, setPick, modifierPick, setModifierPick, onClose, onAgregar }) {
  const precioBase = precioEfectivo(p);
  const enOferta = !!p.enOferta;
  const tieneVariantes = p.modifiers && p.modifiers.length > 0;
  const precioFinal = precioBase + (modifierPick ? (modifierPick.price || 0) : 0);
  const puedeAgregar = !tieneVariantes || !!modifierPick;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,30,58,.45)", zIndex: 70, display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 520, margin: "0 auto", background: C.fondo, borderRadius: "20px 20px 0 0",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ height: 216, background: "#fff", borderBottom: `1.5px solid ${C.borde}`, position: "relative" }}>
          {p.imageUrl ? (
            <img src={p.imageUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ImageIcon size={40} style={{ color: C.textoTenue }} />
            </div>
          )}
          <button onClick={onClose} style={{
            position: "absolute", top: 12, right: 12, width: 38, height: 38, borderRadius: "50%", background: "#fff",
            border: `1.5px solid ${C.borde}`, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", color: C.celeste, marginBottom: 6 }}>
            {groupNameTxt}{subcat ? ` · ${subcat}` : ""}
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.22, color: C.texto, marginBottom: 8 }}>{p.name}</div>
          <div style={{ marginBottom: 10 }}>
            {enOferta && <span style={{ fontSize: 15, fontWeight: 700, color: C.textoTenue, textDecoration: "line-through", marginRight: 8 }}>${fmt(p.price)}</span>}
            <span style={{ fontSize: 27, fontWeight: 900, color: enOferta ? C.rojo : C.azul }}>${fmt(precioFinal)}</span>
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, fontWeight: 600, color: C.textoSuave, marginBottom: tieneVariantes ? 18 : 20 }}>
            {p.description || "Producto de limpieza de buena calidad, disponible para entrega en el día."}
          </div>

          {tieneVariantes && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.textoSuave, marginBottom: 8 }}>Elegí una opción</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {p.modifiers.map((m) => {
                  const activo = modifierPick && modifierPick.name === m.name;
                  return (
                    <button key={m.name} onClick={() => setModifierPick(m)} style={{
                      padding: "10px 14px", borderRadius: 11, fontSize: 13, fontWeight: 800,
                      border: `1.5px solid ${activo ? C.azul : C.azulBorde}`, background: activo ? C.azul : "#fff", color: activo ? "#fff" : C.azul,
                    }}>
                      {m.name}{m.price > 0 ? ` (+$${fmt(m.price)})` : ""}
                    </button>
                  );
                })}
              </div>
              {!modifierPick && <div style={{ fontSize: 12, color: C.textoTenue, marginTop: 8 }}>Elegí una opción para poder agregarlo</div>}
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: 56, background: "#fff", border: `1.5px solid ${C.bordeFuerte}`, borderRadius: 15, padding: "0 6px" }}>
              <button onClick={() => setPick(Math.max(1, pick - 1))} style={{ width: 42, height: 42, borderRadius: 12, border: "none", background: C.azulSuave, display: "flex", alignItems: "center", justifyContent: "center" }}><Minus size={18} /></button>
              <span style={{ fontSize: 16, fontWeight: 900, minWidth: 24, textAlign: "center" }}>{pick}</span>
              <button onClick={() => setPick(pick + 1)} style={{ width: 42, height: 42, borderRadius: 12, border: "none", background: C.azul, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Plus size={18} /></button>
            </div>
            <button onClick={onAgregar} disabled={!puedeAgregar} style={{
              flex: 1, height: 56, borderRadius: 15, background: puedeAgregar ? C.azul : C.azulApagado, color: "#fff", border: "none", fontWeight: 900,
              fontSize: 15, boxShadow: puedeAgregar ? "0 8px 18px rgba(27,79,156,.26)" : "none",
            }}>
              Agregar ${fmt(precioFinal * pick)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== TU PEDIDO ====================

function PedidoModal({ cartItems, cartTotal, disponibles, onAdd, onDec, onOpenFicha, nombre, setNombre, pago, setPago, notas, setNotas, enviado, enviando, onEnviar, onCerrar, onVaciar, onSeguirComprando }) {
  const sugeridos = disponibles.filter((p) => !cartItems.some((i) => i.productId === p.id)).slice(0, 4);

  if (enviado) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(15,30,58,.45)", zIndex: 70, display: "flex", alignItems: "flex-end" }}>
        <div style={{ width: "100%", maxWidth: 520, margin: "0 auto", background: C.fondo, borderRadius: "20px 20px 0 0", padding: "32px 20px" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 76, height: 76, borderRadius: "50%", background: C.verdeSuave, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Check size={34} style={{ color: C.verde }} />
            </div>
            <div style={{ fontSize: 23, fontWeight: 900, color: C.texto, marginBottom: 8 }}>Pedido enviado</div>
            <div style={{ fontSize: 13.5, color: C.textoSuave, marginBottom: 20, lineHeight: 1.4 }}>Se abrió WhatsApp con tu pedido. Mandalo y te confirmamos la entrega.</div>
            <div style={{ background: "#fff", border: `1.5px solid ${C.borde}`, borderRadius: 14, padding: 14, marginBottom: 20, textAlign: "left" }}>
              {cartItems.map((i) => (
                <div key={i.lineId} style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>
                  {i.qty}x {i.product.name}{(i.modifiers || []).length > 0 ? ` (${i.modifiers.map((m) => m.name).join(", ")})` : ""}
                </div>
              ))}
              <div style={{ borderTop: "1.5px solid #EDF2F8", margin: "8px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 900, color: C.azul }}>
                <span>Total</span><span>${fmt(cartTotal)}</span>
              </div>
            </div>
            <button onClick={onSeguirComprando} style={{ width: "100%", height: 54, borderRadius: 14, background: C.azul, color: "#fff", border: "none", fontWeight: 800, fontSize: 14.5 }}>
              Seguir comprando
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div onClick={onCerrar} style={{ position: "fixed", inset: 0, background: "rgba(15,30,58,.45)", zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        position: "absolute", top: 74, left: 0, right: 0, bottom: 0, maxWidth: 520, margin: "0 auto",
        background: C.fondo, borderRadius: "20px 20px 0 0", display: "flex", flexDirection: "column",
      }}>
        <div style={{ position: "sticky", top: 0, background: C.fondo, borderRadius: "20px 20px 0 0", padding: "16px 18px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 1 }}>
          <div style={{ fontSize: 19, fontWeight: 900 }}>Tu pedido</div>
          <button onClick={onCerrar} style={{ border: "none", background: "none", color: C.textoTenue }}><X size={22} /></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 18px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {cartItems.map((i) => {
              const precio = precioLinea(i.product, i.modifiers);
              return (
                <div key={i.lineId} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", borderRadius: 15, padding: 10 }}>
                  <div style={{ width: 58, height: 58, borderRadius: 12, background: C.fotoFondo, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {i.product.imageUrl ? <img src={i.product.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <ImageIcon size={18} style={{ color: C.textoTenue }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.product.name}</div>
                    {(i.modifiers || []).length > 0 && (
                      <div style={{ fontSize: 11, color: C.celeste, fontWeight: 700 }}>{i.modifiers.map((m) => m.name).join(", ")}</div>
                    )}
                    <div style={{ fontSize: 11.5, color: C.textoTenue, fontWeight: 600 }}>${fmt(precio)} c/u</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: C.azul, marginRight: 4 }}>${fmt(precio * i.qty)}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.azulSuave, borderRadius: 10, padding: "3px 5px", height: 40 }}>
                    <button onClick={() => onDec(i.lineId)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Minus size={13} /></button>
                    <span style={{ fontSize: 13, fontWeight: 900, minWidth: 14, textAlign: "center" }}>{i.qty}</span>
                    <button onClick={() => onAdd(i.productId, i.modifiers)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: C.azul, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Plus size={13} /></button>
                  </div>
                </div>
              );
            })}
          </div>

          {sugeridos.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13.5, fontWeight: 900, color: C.texto, marginBottom: 8 }}>Suele ir con esto</div>
              <div className="riel" style={{ display: "flex", gap: 9, overflowX: "auto" }}>
                {sugeridos.map((p) => (
                  <div key={p.id} style={{ width: 130, flexShrink: 0 }}>
                    <ProductCard product={p} subcat={null} qty={0} onAdd={() => onAdd(p.id)} onDec={() => {}} onOpen={() => onOpenFicha(p.id)} vista="grid" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <FieldPedido label="Tu nombre">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" style={inputPedido} />
          </FieldPedido>

          <FieldPedido label="Forma de pago">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.keys(methodLabel).map((m) => (
                <button key={m} onClick={() => setPago(m)} style={{
                  padding: "9px 13px", borderRadius: 10, fontSize: 12.5, fontWeight: 800, border: `1.5px solid ${pago === m ? C.azul : C.azulBorde}`,
                  background: pago === m ? C.azul : "#fff", color: pago === m ? "#fff" : C.azul,
                }}>
                  {methodLabel[m]}
                </button>
              ))}
            </div>
          </FieldPedido>

          <FieldPedido label="Aclaraciones (opcional)">
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: tocar timbre, dejar en portería..." style={{ ...inputPedido, minHeight: 76, resize: "vertical", fontWeight: 600 }} />
          </FieldPedido>

          <div style={{ background: "#fff", borderRadius: 14, padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: C.azul }}>Total</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: C.azul }}>${fmt(cartTotal)}</div>
          </div>

          <button onClick={onVaciar} style={{ display: "block", width: "100%", textAlign: "center", background: "none", border: "none", color: C.textoTenue, fontSize: 12.5, fontWeight: 700, padding: "4px 0 16px" }}>
            Vaciar pedido
          </button>
        </div>

        <div style={{ background: "#fff", borderTop: `1.5px solid ${C.borde}`, padding: "12px 16px 30px" }}>
          <button
            onClick={onEnviar} disabled={!nombre.trim() || enviando}
            style={{
              width: "100%", height: 58, borderRadius: 14, border: "none", color: "#fff", fontWeight: 900, fontSize: 15,
              background: nombre.trim() ? C.azul : C.azulApagado,
            }}
          >
            {enviando ? "Enviando..." : "Enviar pedido por WhatsApp"}
          </button>
          <div style={{ textAlign: "center", fontSize: 11.5, fontWeight: 600, color: C.textoSuave, marginTop: 6 }}>
            {nombre.trim() ? "Se abre WhatsApp con el pedido listo" : "Completá tu nombre para enviarlo"}
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldPedido({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: C.textoSuave, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
const inputPedido = {
  width: "100%", height: 52, borderRadius: 13, border: `2px solid ${C.bordeFuerte}`, padding: "0 14px",
  fontSize: 15, fontWeight: 700, color: C.texto, background: "#fff", outline: "none", fontFamily: sans,
};

// ==================== TAB BAR ====================

function TabBar({ pant, setPant }) {
  const tabs = [
    { id: "home", label: "Inicio", icon: Home },
    { id: "buscar", label: "Buscar", icon: Search },
    { id: "pedidos", label: "Pedidos", icon: ClipboardList },
  ];
  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0, background: "rgba(255,255,255,.94)", backdropFilter: "blur(14px)",
      borderTop: `1.5px solid ${C.borde}`, padding: "10px 8px 32px", display: "flex", zIndex: 50,
    }}>
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = pant === t.id || (t.id === "home" && pant === "grupo");
        return (
          <button key={t.id} onClick={() => setPant(t.id)} style={{
            flex: 1, background: "none", border: "none", display: "flex", flexDirection: "column",
            alignItems: "center", gap: 3, padding: "4px 0",
          }}>
            <Icon size={23} strokeWidth={2} style={{ color: active ? C.azul : C.textoTenue }} />
            <span style={{ fontSize: 10.5, fontWeight: 800, color: active ? C.azul : C.textoTenue }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ==================== SKELETON DE CARGA ====================

function SkeletonHome() {
  return (
    <div style={{ minHeight: "100vh", background: C.fondo, fontFamily: sans }}>
      <div style={{ background: "#fff", borderBottom: `1.5px solid ${C.borde}`, padding: "56px 16px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 46, height: 46, borderRadius: 11, background: C.fondo }} />
          <div style={{ width: 140, height: 18, borderRadius: 6, background: C.fondo }} />
        </div>
        <div style={{ height: 48, borderRadius: 13, background: C.fondo }} />
      </div>
      <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ height: 248, borderRadius: 16, background: "#fff", border: `1.5px solid ${C.borde}` }}>
            <div style={{ height: 118, borderRadius: "16px 16px 0 0", background: C.fotoFondo, margin: 8 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
