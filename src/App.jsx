import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ShoppingCart, Package, Receipt, Plus, Minus, Trash2, X, Search,
  Wallet, CreditCard, ArrowLeftRight, AlertTriangle, Printer, Pencil,
  Users, BarChart3, Tag, Percent, LogOut, Lock, ChevronRight, Sliders,
  Download, ScanBarcode, Upload, FileSpreadsheet, Banknote, MessageSquare,
  TrendingUp, Wand2, Smartphone, Landmark, MoreHorizontal, Copy, PackagePlus,
  DollarSign, CircleAlert, Check, ClipboardList, Image as ImageIcon, Truck,
} from "lucide-react";
import { getData, setData, deleteData, uploadProductImage } from "./lib/storage";
import { agregarLoteStock, sincronizarLotesConStock, consumirFIFO, restaurarLote, lotesEfectivos, conCostoVigente } from "./lib/lotes";
import { coincide, buscar } from "./lib/buscar";
import { generarReporte } from "./lib/reporte";
import { descargarEtiquetasPDF } from "./lib/etiquetas";
import * as XLSX from "xlsx";
import JsBarcode from "jsbarcode";
import { C, F, btn, iconBtn, card, chip as chipStyle, input as inputBase, badgeStock } from "./ui";

const LOW_STOCK = 5;
// Recargo según medio de pago (se suma sobre el total ya con descuento aplicado)
const SURCHARGE_RATES = { credito: 0.10, mercadopago: 0.01 };
const sans = "Nunito, system-ui, -apple-system, sans-serif";
const mono = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

const fmt = (n) =>
  Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
// Devuelve un texto si el precio nuevo parece un error de tipeo (bajo el costo o cambio muy brusco), o null.
const avisoPrecio = (p, nuevo) => {
  const nv = Number(nuevo);
  if (!(nv >= 0)) return null;
  if (p && p.cost > 0 && nv < p.cost) return `el precio $${nv.toLocaleString("es-AR")} queda por DEBAJO del costo ($${Number(p.cost).toLocaleString("es-AR")})`;
  const viejo = p ? Number(p.price) || 0 : 0;
  if (viejo > 0 && nv > 0 && (nv < viejo / 3 || nv > viejo * 3)) return `el precio pasa de $${viejo.toLocaleString("es-AR")} a $${nv.toLocaleString("es-AR")} (cambio muy brusco, ¿falta o sobra un cero?)`;
  return null;
};
const precioVenta = (p) => (p && p.enOferta && p.precioOferta > 0 ? p.precioOferta : p ? p.price : 0);
// Costo real de lo que queda en stock, sumando cada lote al costo que tenía
// cuando entró (en vez de multiplicar todo el stock por el costo actual).
// Un producto puede tener varios códigos de barras (por ejemplo, un mismo
// desodorante en distintas fragancias, mismo precio): `barcode` es el
// principal (el que se imprime en etiquetas) y `barcodesExtra` el resto.
// Cada código extra puede venir asociado a un modificador (ej: la fragancia),
// así al escanearlo se agrega directo esa variante. Se aceptan también los
// guardados como texto simple (v20).
const extraCode = (e) => (typeof e === "string" ? e : (e && e.code) || "");
const extraMod = (e) => (typeof e === "string" ? "" : (e && e.modifier) || "");
const codigosDe = (p) => [p.barcode, ...(p.barcodesExtra || []).map(extraCode)].filter(Boolean);
// Nombre del modificador asociado a un código escaneado ("" si no tiene).
const modDeCodigo = (p, code) => {
  if (p.barcode === code) return p.barcodeMod || "";
  const e = (p.barcodesExtra || []).find((x) => extraCode(x) === code);
  return e ? extraMod(e) : "";
};
const costoStockProducto = (p) => lotesEfectivos(p).reduce((a, l) => a + l.qty * (l.costoUnitario || 0), 0);

export default function PuntoDeVenta() {
  const [loaded, setLoaded] = useState(false);
  const [nuevaVersionDisponible, setNuevaVersionDisponible] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [groups, setGroups] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [sales, setSales] = useState([]);
  const [accountUsers, setAccountUsers] = useState([]);
  const [account, setAccount] = useState(() => {
    try { return localStorage.getItem("agua_y_jabon_account") || null; } catch (e) { return null; }
  });
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [accountLoginError, setAccountLoginError] = useState("");
  const [accountForm, setAccountForm] = useState(null);

  const [activeEmployeeId, setActiveEmployeeId] = useState(null);
  const [loginPickId, setLoginPickId] = useState(null);
  const [pinInput, setPinInput] = useState("");
  const [loginError, setLoginError] = useState("");

  const [tab, setTab] = useState("inicio");
  const [alertasSistema, setAlertasSistema] = useState([]); // avisos de cosas raras (ventas bajo costo, precios sospechosos)
  const [cart, setCart] = useState([]); // {lineId, productId, name, price, modifiers:[{name,price}], qty}
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [payMethod, setPayMethod] = useState(null);
  const [discount, setDiscount] = useState({ type: "pct", value: 0 });
  const [showDiscount, setShowDiscount] = useState(false);

  const [receipt, setReceipt] = useState(null);
  const [viewingSale, setViewingSale] = useState(null);
  const [productForm, setProductForm] = useState(null);
  const [categoryForm, setCategoryForm] = useState(null);
  const [employeeForm, setEmployeeForm] = useState(null);
  const [modifierPicker, setModifierPicker] = useState(null); // product being added
  const [saveError, setSaveError] = useState("");
  const [range, setRange] = useState("hoy");

  const [cajaActual, setCajaActual] = useState(null);
  const [cajaHistorial, setCajaHistorial] = useState([]);
  const [observaciones, setObservaciones] = useState([]);
  const [compras, setCompras] = useState([]); // historial de cargas de stock (panel "Cargar stock")
  const [productosMayoristas, setProductosMayoristas] = useState([]); // artículos propios del panel "Mayoristas" (no tocan stock ni catálogo normal)
  const [labelProduct, setLabelProduct] = useState(null);
  const [sheetLabelOpen, setSheetLabelOpen] = useState(false);
  const [priceListOpen, setPriceListOpen] = useState(false);
  const [presupuestoNextNum, setPresupuestoNextNum] = useState(1);
  const [presupuestos, setPresupuestos] = useState([]);
  const [presupuestoGenerado, setPresupuestoGenerado] = useState(null);
  const [stockAdjustProduct, setStockAdjustProduct] = useState(null);
  const [priceEditProduct, setPriceEditProduct] = useState(null);
  const fileInputRef = useRef(null);

  const loadAll = async (opts = {}) => {
    const load = async (key, fallback) => {
      try {
        const v = await getData(key);
        return v !== null && v !== undefined ? v : fallback;
      } catch (e) {
        return fallback;
      }
    };
    setProducts((await load("products", [])).map(conCostoVigente));
    setCategories(await load("categories", []));
    setGroups(await load("groups", []));
    setEmployees(await load("employees", []));
    setSales(await load("sales", []));
    if (!opts.skipUsers) {
      let users = await load("app_users", []);
      if (!users || users.length === 0) {
        users = [{ id: uid(), username: "aguayjabon", password: "gaspar" }];
        try { await setData("app_users", users); } catch (e) {}
      }
      setAccountUsers(users);
    }
    setCajaActual(await load("caja_actual", null));
    setCajaHistorial(await load("caja_historial", []));
    setObservaciones(await load("observaciones", []));
    setCompras(await load("compras", []));
    setProductosMayoristas(await load("productos_mayoristas", []));
    setPresupuestoNextNum(await load("presupuesto_next_num", 1));
    setPresupuestos(await load("presupuestos", []));
    setAlertasSistema(await load("alertas_sistema", []));
  };

  useEffect(() => {
    (async () => {
      await loadAll();
      setLoaded(true);
    })();
  }, []);

  // Si la pestaña estuvo muchas horas abierta sin usarse (turno de otro
  // empleado, computadora que quedó prendida toda la noche), al volver a
  // primer plano refresca todo desde la base para no trabajar con datos
  // viejos que después pisen lo que se cargó mientras tanto.
  useEffect(() => {
    if (!loaded || !account) return;
    const onFocusOrVisible = () => {
      if (document.visibilityState === "hidden") return;
      loadAll({ skipUsers: true });
    };
    document.addEventListener("visibilitychange", onFocusOrVisible);
    window.addEventListener("focus", onFocusOrVisible);
    // Además, aunque la pestaña nunca pierda el foco (por ejemplo si solo se
    // apaga el monitor toda la noche sin bloquear ni cambiar de ventana),
    // refresca sola cada 3 minutos para no quedar mostrando datos viejos.
    const interval = setInterval(() => loadAll({ skipUsers: true }), 3 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onFocusOrVisible);
      window.removeEventListener("focus", onFocusOrVisible);
      clearInterval(interval);
    };
  }, [loaded, account]);

  // Avisa si se publicó una versión nueva de la app (por ejemplo, subiste un
  // cambio a GitHub y Vercel ya lo desplegó) mientras esta pestaña sigue
  // abierta con el código viejo cargado en memoria.
  useEffect(() => {
    let versionInicial = null;
    const chequearVersion = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        const data = await res.json();
        if (versionInicial === null) {
          versionInicial = data.version;
        } else if (data.version !== versionInicial) {
          setNuevaVersionDisponible(true);
        }
      } catch (e) {}
    };
    chequearVersion();
    const interval = setInterval(chequearVersion, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const persist = async (key, value) => {
    try {
      // Guardar "null" viola la restricción de la tabla (la columna no admite
      // vacíos); cuando el valor lógico es "sin dato" (ej: caja cerrada),
      // directamente se borra la fila en vez de intentar guardar un null.
      const result = value === null || value === undefined ? await deleteData(key) : await setData(key, value);
      if (!result || !result.ok) {
        console.error("Fallo al guardar", key, result);
        setSaveError(`No se pudo guardar (${result && result.message ? result.message : "sin conexión"}). Probá de nuevo.`);
      } else {
        setSaveError("");
      }
    } catch (e) {
      console.error("Excepción al guardar", key, e);
      setSaveError(`No se pudo guardar (${e && e.message ? e.message : "error de red"}). Probá de nuevo.`);
    }
  };
  const saveProducts = (n) => { const v = n.map(conCostoVigente); setProducts(v); persist("products", v); };
  const saveCategories = (n) => { setCategories(n); persist("categories", n); };
  const saveGroups = (n) => { setGroups(n); persist("groups", n); };
  const saveEmployees = (n) => { setEmployees(n); persist("employees", n); };
  const saveSales = (n) => { setSales(n); persist("sales", n); };
  const saveAccountUsers = (n) => { setAccountUsers(n); persist("app_users", n); };
  const saveObservaciones = (n) => { setObservaciones(n); persist("observaciones", n); };
  const saveCompras = (n) => { setCompras(n); persist("compras", n); };
  const saveProductosMayoristas = (n) => { setProductosMayoristas(n); persist("productos_mayoristas", n); };

  // Registro de cosas raras (se guarda en la base; se ve en Inicio hasta que lo marcás como visto).
  const logAlertas = async (nuevos) => {
    if (!nuevos || nuevos.length === 0) return;
    let actuales = alertasSistema;
    try { const f = await getData("alertas_sistema"); if (f) actuales = f; } catch (e) {}
    const quien = activeEmployee ? activeEmployee.name : account;
    const items = nuevos.map((a) => ({ id: uid(), fecha: new Date().toISOString(), visto: false, quien, ...a }));
    const next = [...items, ...actuales].slice(0, 300);
    setAlertasSistema(next); persist("alertas_sistema", next);
  };
  const marcarAlertasVistas = () => {
    const next = alertasSistema.map((a) => ({ ...a, visto: true }));
    setAlertasSistema(next); persist("alertas_sistema", next);
  };

  // Trae los productos más recientes de la base justo antes de escribir, para
  // no pisar cambios hechos desde otra pestaña/dispositivo mientras esta
  // quedó abierta sin refrescar (mismo problema que causaba que "desaparecieran"
  // productos cargados desde otro lado).
  const withFreshProducts = async (updater) => {
    let fresh = products;
    try {
      const fp = await getData("products");
      if (fp !== null && fp !== undefined) fresh = fp;
    } catch (e) {}
    const next = updater(fresh);
    saveProducts(next);
    return next;
  };

  const abrirCaja = async (amount) => {
    const nueva = { openingAmount: amount, openedAt: new Date().toISOString(), employeeName: activeEmployee ? activeEmployee.name : account };
    setCajaActual(nueva);
    await persist("caja_actual", nueva);
  };
  const cerrarCaja = async (counted) => {
    if (!cajaActual) return;
    // Trae ventas y el historial de caja frescos antes de cerrar, para no
    // calcular "esperado" con datos viejos ni pisar cierres de otra pestaña.
    let freshSales = sales;
    let freshHistorial = cajaHistorial;
    try {
      const fs2 = await getData("sales");
      if (fs2 !== null && fs2 !== undefined) freshSales = fs2;
      const fh = await getData("caja_historial");
      if (fh !== null && fh !== undefined) freshHistorial = fh;
    } catch (e) {}

    const ventasEfectivo = freshSales
      .filter((s) => s.method === "efectivo" && new Date(s.date) >= new Date(cajaActual.openedAt))
      .reduce((a, s) => a + s.total, 0);
    const esperado = cajaActual.openingAmount + ventasEfectivo;
    const registro = { id: uid(), ...cajaActual, closedAt: new Date().toISOString(), ventasEfectivo, esperado, counted, diferencia: counted - esperado };
    const nextHist = [registro, ...freshHistorial];
    setCajaHistorial(nextHist);
    await persist("caja_historial", nextHist);
    setCajaActual(null);
    await persist("caja_actual", null);
  };

  const exportarCajaExcel = () => {
    const rows = [
      ["Fecha apertura", "Empleado", "Apertura $", "Ventas efectivo", "Esperado $", "Contado $", "Diferencia $", "Fecha cierre", "Estado"],
    ];
    cajaHistorial.forEach((c) => {
      rows.push([
        new Date(c.openedAt).toLocaleString("es-AR"),
        c.employeeName || "",
        c.openingAmount,
        c.ventasEfectivo,
        c.esperado,
        c.counted,
        c.diferencia,
        new Date(c.closedAt).toLocaleString("es-AR"),
        "Cerrada",
      ]);
    });
    if (cajaActual) {
      const ventasEfectivoActual = sales
        .filter((s) => s.method === "efectivo" && new Date(s.date) >= new Date(cajaActual.openedAt))
        .reduce((a, s) => a + s.total, 0);
      rows.push([
        new Date(cajaActual.openedAt).toLocaleString("es-AR"),
        cajaActual.employeeName || "",
        cajaActual.openingAmount,
        ventasEfectivoActual,
        cajaActual.openingAmount + ventasEfectivoActual,
        "", "", "",
        "Abierta (en curso)",
      ]);
    }
    if (rows.length === 1) {
      alert("Todavía no hay movimientos de caja para exportar.");
      return;
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 20 }, { wch: 16 }, { wch: 13 }, { wch: 15 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 20 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimientos de caja");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `movimientos-caja-${stamp}.xlsx`);
  };

  const consumirNumeroPresupuesto = () => {
    const n = presupuestoNextNum;
    setPresupuestoNextNum(n + 1);
    persist("presupuesto_next_num", n + 1);
    return n;
  };
  const generarPresupuesto = ({ cliente, validez, items, total }) => {
    const numero = consumirNumeroPresupuesto();
    const registro = { id: uid(), numero, fecha: new Date().toISOString(), cliente, validez, items, total };
    const next = [registro, ...presupuestos];
    setPresupuestos(next);
    persist("presupuestos", next);
    setPresupuestoGenerado(registro);
  };
  const eliminarPresupuesto = (id) => {
    const next = presupuestos.filter((p) => p.id !== id);
    setPresupuestos(next);
    persist("presupuestos", next);
  };

  const addObservacion = (text) => {
    const clean = text.trim();
    if (!clean) return;
    const next = [{ id: uid(), text: clean, author: account, date: new Date().toISOString() }, ...observaciones];
    saveObservaciones(next);
  };
  const deleteObservacion = (id) => saveObservaciones(observaciones.filter((o) => o.id !== id));

  const deleteSale = async (id) => {
    let freshSales = sales;
    let freshProducts = products;
    let freshMayoristas = productosMayoristas;
    try {
      const fs = await getData("sales");
      if (fs !== null && fs !== undefined) freshSales = fs;
      const fp = await getData("products");
      if (fp !== null && fp !== undefined) freshProducts = fp;
      const fm = await getData("productos_mayoristas");
      if (fm !== null && fm !== undefined) freshMayoristas = fm;
    } catch (e) {}
    const sale = freshSales.find((s) => s.id === id);
    if (!sale) return;
    if (sale.origen === "mayorista") {
      // Una venta a mayorista puede mezclar líneas de distinto origen (algunas
      // de un artículo propio de mayoristas, otras del stock real de la
      // tienda); cada línea sabe de dónde salió en `item.source` (las ventas
      // viejas, de un solo artículo, lo heredan de `sale.source`).
      const origenItem = (i) => i.source || sale.source || "mayorista";
      const itemsStock = sale.items.filter((i) => origenItem(i) === "stock");
      const itemsMayo = sale.items.filter((i) => origenItem(i) !== "stock");

      if (itemsMayo.length > 0) {
        // Stock aparte: se devuelve al artículo del panel de mayoristas, no al
        // stock ni al costeo FIFO normal.
        const nextMayoristas = freshMayoristas.map((p) => {
          const qtyVendida = itemsMayo.filter((i) => i.productId === p.id).reduce((a, i) => a + i.qty, 0);
          return qtyVendida > 0 ? { ...p, stock: (p.stock || 0) + qtyVendida } : p;
        });
        saveProductosMayoristas(nextMayoristas);
      }
      if (itemsStock.length > 0) {
        // Líneas vendidas desde el stock real: vuelven al producto de
        // siempre, siguiendo la misma lógica de lotes FIFO que cualquier otra
        // venta.
        const nextProducts = freshProducts.map((p) => {
          const itemsProducto = itemsStock.filter((i) => i.productId === p.id);
          const qtyVendida = itemsProducto.reduce((a, i) => a + i.qty, 0);
          if (qtyVendida <= 0) return p;
          const costoUnitario = itemsProducto[0] && itemsProducto[0].cost != null ? itemsProducto[0].cost : (p.cost || 0);
          return restaurarLote(p, qtyVendida, costoUnitario, sale.date);
        });
        saveProducts(nextProducts);
      }
      saveSales(freshSales.filter((s) => s.id !== id));
      return;
    }
    // Ventas normales (no mayorista) devuelven el stock al producto de
    // siempre, siguiendo la misma lógica de lotes FIFO que cualquier otra
    // venta.
    const nextProducts = freshProducts.map((p) => {
      // suma TODAS las líneas de ese producto en la venta (antes solo tomaba
      // la primera, así que un producto pedido con dos variantes distintas
      // no devolvía bien el stock de la segunda).
      const itemsProducto = sale.items.filter((i) => i.productId === p.id);
      const qtyVendida = itemsProducto.reduce((a, i) => a + i.qty, 0);
      if (qtyVendida <= 0) return p;
      // El stock devuelto vuelve como lote al frente de la cola, al costo que
      // tenía cuando se vendió (si esa venta ya lo tenía grabado), para que
      // sea lo primero en salir de nuevo y no se pierda el costeo FIFO.
      const costoUnitario = itemsProducto[0] && itemsProducto[0].cost != null ? itemsProducto[0].cost : (p.cost || 0);
      return restaurarLote(p, qtyVendida, costoUnitario, sale.date);
    });
    saveProducts(nextProducts);
    saveSales(freshSales.filter((s) => s.id !== id));
  };

  const doLogin = () => {
    const match = accountUsers.find((u) => u.username === loginUser.trim() && u.password === loginPass);
    if (match) {
      setAccount(match.username);
      try { localStorage.setItem("agua_y_jabon_account", match.username); } catch (e) {}
      setLoginUser(""); setLoginPass(""); setAccountLoginError("");
    } else {
      setAccountLoginError("Usuario o contraseña incorrectos");
    }
  };
  const doLogout = () => {
    setAccount(null);
    try { localStorage.removeItem("agua_y_jabon_account"); } catch (e) {}
  };
  const saveAccountUser = () => {
    const username = accountForm.username.trim();
    const password = accountForm.password;
    if (!username || !password) return;
    if (accountForm.id) {
      saveAccountUsers(accountUsers.map((u) => (u.id === accountForm.id ? { ...u, username, password } : u)));
    } else {
      if (accountUsers.some((u) => u.username === username)) return;
      saveAccountUsers([...accountUsers, { id: uid(), username, password }]);
    }
    setAccountForm(null);
  };
  const deleteAccountUser = (id) => {
    if (accountUsers.length <= 1) return;
    saveAccountUsers(accountUsers.filter((u) => u.id !== id));
  };

  const activeEmployee = employees.find((e) => e.id === activeEmployeeId) || null;
  const needsLogin = employees.length > 0 && !activeEmployeeId;

  const pickEmployee = (emp) => {
    if (emp.pin) {
      setLoginPickId(emp.id);
      setPinInput("");
      setLoginError("");
    } else {
      setActiveEmployeeId(emp.id);
    }
  };
  const confirmPin = () => {
    const emp = employees.find((e) => e.id === loginPickId);
    if (emp && pinInput === emp.pin) {
      setActiveEmployeeId(emp.id);
      setLoginPickId(null);
      setPinInput("");
    } else {
      setLoginError("PIN incorrecto");
    }
  };

  // ---- carrito ----
  const cartTotals = useMemo(() => {
    const subtotal = cart.reduce((acc, l) => {
      const extras = (l.modifiers || []).reduce((a, m) => a + m.price, 0);
      return acc + (l.price + extras) * l.qty;
    }, 0);
    let discountAmount = 0;
    if (discount.value > 0) {
      discountAmount = discount.type === "pct" ? (subtotal * discount.value) / 100 : discount.value;
      discountAmount = Math.min(discountAmount, subtotal);
    }
    const totalSinRecargo = subtotal - discountAmount;
    const surchargeRate = (payMethod && SURCHARGE_RATES[payMethod]) || 0;
    const surchargeAmount = totalSinRecargo * surchargeRate;
    return {
      subtotal,
      discountAmount,
      totalSinRecargo,
      surchargeRate,
      surchargeAmount,
      total: totalSinRecargo + surchargeAmount,
    };
  }, [cart, discount, payMethod]);

  const lineSig = (productId, modifiers) => productId + "|" + modifiers.map((m) => m.name).sort().join(",");

  const addToCart = (product, modifiers = []) => {
    if (product.stock <= 0) return;
    const sig = lineSig(product.id, modifiers);
    setCart((prev) => {
      const existing = prev.find((l) => lineSig(l.productId, l.modifiers || []) === sig);
      const currentQty = prev.filter((l) => l.productId === product.id).reduce((a, l) => a + l.qty, 0);
      if (currentQty >= product.stock) return prev;
      if (existing) {
        return prev.map((l) => (l.lineId === existing.lineId ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, { lineId: uid(), productId: product.id, name: product.name, price: precioVenta(product), modifiers, qty: 1 }];
    });
  };

  const handleProductTap = (product) => {
    if (product.modifiers && product.modifiers.length > 0) {
      setModifierPicker(product);
    } else {
      addToCart(product, []);
    }
  };

  const changeQty = (lineId, delta) => {
    setCart((prev) => {
      const line = prev.find((l) => l.lineId === lineId);
      if (!line) return prev;
      const product = products.find((p) => p.id === line.productId);
      const otherQty = prev.filter((l) => l.productId === line.productId && l.lineId !== lineId).reduce((a, l) => a + l.qty, 0);
      const next = line.qty + delta;
      if (product && next + otherQty > product.stock) return prev;
      return prev.map((l) => (l.lineId === lineId ? { ...l, qty: next } : l)).filter((l) => l.qty > 0);
    });
  };
  const removeLine = (lineId) => setCart((prev) => prev.filter((l) => l.lineId !== lineId));

  const cobrar = async (pending = false) => {
    if (cart.length === 0) return;
    if (!pending && !payMethod) return; // no dejar cobrar sin elegir forma de pago a propósito
    const bajoCostoCart = cart.filter((l) => { const pr = products.find((p) => p.id === l.productId); return pr && pr.cost > 0 && l.price < pr.cost; });
    if (bajoCostoCart.length > 0) {
      const txt = bajoCostoCart.map((l) => { const pr = products.find((p) => p.id === l.productId); return `• ${l.name}: se vende a $${fmt(l.price)} y cuesta $${fmt(pr.cost)}`; }).join("\n");
      if (!window.confirm(`⚠️ Estás vendiendo por DEBAJO DEL COSTO:\n\n${txt}\n\n¿Cobrar igual?`)) return;
    }
    // Trae los datos más recientes justo antes de guardar, para no pisar
    // ventas o productos cargados desde otro momento mientras esta pestaña
    // estaba abierta sin refrescar.
    let freshProducts = products;
    let freshSales = sales;
    try {
      const fp = await getData("products");
      if (fp !== null && fp !== undefined) freshProducts = fp;
      const fsales = await getData("sales");
      if (fsales !== null && fsales !== undefined) freshSales = fsales;
    } catch (e) {}

    const nextNumber = freshSales.length + 1;

    // Descuenta el stock vendido siguiendo FIFO (lote más viejo primero) y
    // guarda qué costo tenía realmente lo que se vendió, para congelarlo en
    // la venta. Así, si después cargás stock nuevo a otro costo, la ganancia
    // de esta venta ya registrada no se mueve.
    const costoPorProducto = {};
    const nextProducts = freshProducts.map((p) => {
      const soldQty = cart.filter((l) => l.productId === p.id).reduce((a, l) => a + l.qty, 0);
      if (soldQty <= 0) return p;
      const { lotes, costoUnitarioPromedio } = consumirFIFO(p, soldQty);
      costoPorProducto[p.id] = costoUnitarioPromedio;
      return { ...p, stock: p.stock - soldQty, lotes };
    });

    const sale = {
      id: uid(),
      number: nextNumber,
      date: new Date().toISOString(),
      employeeId: activeEmployee ? activeEmployee.id : null,
      employeeName: activeEmployee ? activeEmployee.name : null,
      items: cart.map((l) => {
        const product = freshProducts.find((p) => p.id === l.productId);
        return {
          productId: l.productId, name: l.name, price: l.price, qty: l.qty,
          modifiers: l.modifiers || [], categoryId: product ? product.categoryId : null,
          cost: costoPorProducto[l.productId] != null ? costoPorProducto[l.productId] : (product ? product.cost || 0 : 0),
        };
      }),
      subtotal: cartTotals.subtotal,
      discountType: discount.value > 0 ? discount.type : null,
      discountValue: discount.value > 0 ? discount.value : 0,
      discountAmount: cartTotals.discountAmount,
      surchargeRate: pending ? 0 : cartTotals.surchargeRate,
      surchargeAmount: pending ? 0 : cartTotals.surchargeAmount,
      total: pending ? cartTotals.totalSinRecargo : cartTotals.total,
      method: pending ? null : payMethod,
      pending: pending,
    };
    const nextSales = [sale, ...freshSales];
    saveSales(nextSales);
    saveProducts(nextProducts);
    const perdidas = sale.items.filter((i) => i.cost > 0 && i.price < i.cost);
    if (perdidas.length > 0) {
      logAlertas(perdidas.map((i) => ({
        tipo: "ventaBajoCosto",
        texto: `Venta #${sale.number}: ${i.name} x${i.qty} a $${fmt(i.price)} (costo $${fmt(i.cost)}) · pérdida $${fmt((i.cost - i.price) * i.qty)}`,
      })));
    }
    setCart([]);
    setDiscount({ type: "pct", value: 0 });
    setShowDiscount(false);
    setPayMethod(null);
    setReceipt(sale);
  };

  const marcarComoPagado = async (saleId, method) => {
    let freshSales = sales;
    try {
      const fsales = await getData("sales");
      if (fsales !== null && fsales !== undefined) freshSales = fsales;
    } catch (e) {}
    const next = freshSales.map((s) => (s.id === saleId ? { ...s, pending: false, method, paidAt: s.date, date: new Date().toISOString() } : s));
    saveSales(next);
  };
  const marcarComoConfirmado = async (saleId) => {
    let freshSales = sales;
    try {
      const fsales = await getData("sales");
      if (fsales !== null && fsales !== undefined) freshSales = fsales;
    } catch (e) {}
    const next = freshSales.map((s) => (s.id === saleId ? { ...s, confirmado: true, confirmadoPor: activeEmployee ? activeEmployee.name : account } : s));
    saveSales(next);
  };

  // ---- productos ----
  const genBarcode = (existingProducts) => {
    const nums = existingProducts
      .map((p) => p.barcode)
      .filter((b) => /^20\d{9,}$/.test(b))
      .map((b) => parseInt(b, 10));
    const next = (nums.length ? Math.max(...nums) : 200000000000) + 1;
    return String(next);
  };
  const openNewProduct = () => setProductForm({ name: "", price: "", stock: "", categoryId: "", modifiers: [], barcode: "", cost: "", costoLista: "", descuentoPct: "", imageUrl: "", description: "", enOferta: false, precioOferta: "" });
  const openEditProduct = (p) => setProductForm({
    ...p, price: String(p.price), stock: String(p.stock), modifiers: p.modifiers || [], barcode: p.barcode || "", barcodeMod: p.barcodeMod || "",
    barcodesExtra: (p.barcodesExtra || []).map((e) => ({ code: extraCode(e), modifier: extraMod(e) })),
    cost: p.cost ? String(p.cost) : "", costoLista: p.costoLista ? String(p.costoLista) : "", descuentoPct: p.descuentoPct ? String(p.descuentoPct) : "",
    imageUrl: p.imageUrl || "", description: p.description || "", enOferta: !!p.enOferta, precioOferta: p.precioOferta ? String(p.precioOferta) : "",
  });
  const duplicateProduct = (p) => setProductForm({
    name: p.name + " (copia)", price: String(p.price), stock: "0",
    categoryId: p.categoryId || "", modifiers: p.modifiers || [], barcode: "", cost: p.cost ? String(p.cost) : "",
    costoLista: p.costoLista ? String(p.costoLista) : "", descuentoPct: p.descuentoPct ? String(p.descuentoPct) : "",
    imageUrl: p.imageUrl || "", description: p.description || "", enOferta: false, precioOferta: "",
  });
  const saveProduct = async (formData, keepOpen) => {
    const name = formData.name.trim();
    const price = parseFloat(formData.price);
    const stock = parseInt(formData.stock, 10);
    if (!name || isNaN(price) || price < 0 || isNaN(stock) || stock < 0) return;
    const costoLista = parseFloat(formData.costoLista);
    const descuentoPct = parseFloat(formData.descuentoPct);
    let cost;
    let costoListaFinal = 0, descuentoPctFinal = 0;
    if (!isNaN(costoLista) && costoLista > 0 && !isNaN(descuentoPct) && descuentoPct > 0) {
      cost = costoLista * (1 - descuentoPct / 100);
      costoListaFinal = costoLista;
      descuentoPctFinal = descuentoPct;
    } else {
      cost = parseFloat(formData.cost);
      cost = isNaN(cost) ? 0 : cost;
    }
    let barcode = (formData.barcode || "").trim();
    if (!barcode) barcode = genBarcode(products);
    const vistos = new Set([barcode]);
    const barcodesExtra = [];
    (formData.barcodesExtra || []).forEach((e) => {
      const code = extraCode(e).trim();
      if (!code || vistos.has(code)) return;
      vistos.add(code);
      barcodesExtra.push({ code, modifier: extraMod(e) });
    });
    const precioOferta = parseFloat(formData.precioOferta);
    {
      const previo = formData.id ? products.find((p) => p.id === formData.id) : null;
      const av = avisoPrecio({ cost, price: previo ? previo.price : 0, name }, price);
      if (av) logAlertas([{ tipo: "precioRaro", texto: `${name}: ${av}` }]);
    }
    const data = {
      name, price, stock, categoryId: formData.categoryId || "", modifiers: formData.modifiers || [], barcode, barcodeMod: formData.barcodeMod || "", barcodesExtra,
      cost, costoLista: costoListaFinal, descuentoPct: descuentoPctFinal, imageUrl: formData.imageUrl || "",
      description: (formData.description || "").trim(),
      enOferta: !!formData.enOferta && !isNaN(precioOferta) && precioOferta > 0,
      precioOferta: !isNaN(precioOferta) ? precioOferta : 0,
    };
    await withFreshProducts((fresh) => {
      if (!formData.id) {
        // Producto nuevo: si arranca con stock, ese es su primer lote.
        return [...fresh, { id: uid(), ...data, lotes: stock > 0 ? [{ id: uid(), qty: stock, costoUnitario: cost || 0, fecha: new Date().toISOString() }] : [], ultimoCosto: cost > 0 ? cost : undefined }];
      }
      return fresh.map((p) => {
        if (p.id !== formData.id) return p;
        // Si el stock cambió a mano desde este formulario, reconcilia los
        // lotes: si subió, es una carga nueva al costo indicado; si bajó, es
        // una corrección y se descuenta de lo más nuevo primero.
        const lotes = sincronizarLotesConStock(p, stock, cost);
        const ultimoCosto = stock > (p.stock || 0) || lotes.length === 0 ? (cost > 0 ? cost : p.ultimoCosto) : p.ultimoCosto;
        return { ...p, ...data, lotes, ultimoCosto };
      });
    });
    if (keepOpen) {
      setProductForm({ name: "", price: "", stock: "", categoryId: formData.categoryId || "", modifiers: [], barcode: "", cost: "", costoLista: "", descuentoPct: "" });
    } else {
      setProductForm(null);
    }
  };
  const deleteProduct = async (id) => { await withFreshProducts((fresh) => fresh.filter((p) => p.id !== id)); };
  const setProductOferta = async (id, enOferta, precioOferta) => {
    await withFreshProducts((fresh) => fresh.map((p) => (p.id === id ? { ...p, enOferta, precioOferta: precioOferta || 0 } : p)));
  };
  const sumarStock = async (product, amount) => {
    if (!amount || amount <= 0) return;
    // Restock rápido: se asume el mismo costo que ya tenía cargado el producto.
    // Para cargar stock a un costo distinto, usar el panel "Cargar stock".
    await withFreshProducts((fresh) => fresh.map((p) => (p.id === product.id ? agregarLoteStock(p, amount, p.ultimoCosto || p.cost) : p)));
  };
  // Carga de stock con costo propio (panel dedicado "Cargar stock"). Además
  // de sumar al producto, registra el movimiento en un historial de compras.
  const cargarStockConCosto = async (productId, qty, costoUnitario) => {
    if (!qty || qty <= 0) return;
    let freshProducts = products;
    let freshCompras = compras;
    try {
      const fp = await getData("products");
      if (fp !== null && fp !== undefined) freshProducts = fp;
      const fc = await getData("compras");
      if (fc !== null && fc !== undefined) freshCompras = fc;
    } catch (e) {}
    const product = freshProducts.find((p) => p.id === productId);
    if (!product) return;
    const nextProducts = freshProducts.map((p) => (p.id === productId ? agregarLoteStock(p, qty, costoUnitario) : p));
    const compra = {
      id: uid(), date: new Date().toISOString(), productId, productName: product.name,
      qty, costoUnitario, total: qty * costoUnitario,
    };
    const nextCompras = [compra, ...freshCompras];
    saveProducts(nextProducts);
    saveCompras(nextCompras);
  };

  // ---- Mayoristas: artículos y ventas aparte, no tocan stock ni catálogo ----
  const guardarProductoMayorista = async (formData) => {
    const name = (formData.name || "").trim();
    const price = parseFloat(formData.price);
    const cost = parseFloat(formData.cost);
    const stock = parseInt(formData.stock, 10);
    if (!name || isNaN(price) || price < 0) return;
    const data = {
      name, price, cost: isNaN(cost) ? 0 : cost, stock: isNaN(stock) ? 0 : stock,
    };
    let freshMayoristas = productosMayoristas;
    try {
      const fm = await getData("productos_mayoristas");
      if (fm !== null && fm !== undefined) freshMayoristas = fm;
    } catch (e) {}
    const next = formData.id
      ? freshMayoristas.map((p) => (p.id === formData.id ? { ...p, ...data } : p))
      : [...freshMayoristas, { id: uid(), ...data }];
    saveProductosMayoristas(next);
  };
  const eliminarProductoMayorista = async (id) => {
    let freshMayoristas = productosMayoristas;
    try {
      const fm = await getData("productos_mayoristas");
      if (fm !== null && fm !== undefined) freshMayoristas = fm;
    } catch (e) {}
    saveProductosMayoristas(freshMayoristas.filter((p) => p.id !== id));
  };
  // Venta a mayorista: genera una venta normal (así suma en "Cómo vamos" y en
  // lo vendido/ganancia). Puede salir de dos lugares distintos:
  //  - "mayorista": del artículo propio de este panel (stock aparte).
  //  - "stock": de un producto real de la tienda (mismo stock de siempre,
  //    descontado por FIFO), pero al precio que se cobre acá, que puede ser
  //    distinto del precio normal de venta.
  // `cart` es un array de líneas { source, productId, qty, price, cost? },
  // cada una pudiendo venir de un lugar distinto (artículo mayorista propio o
  // stock real de la tienda) — así una sola venta puede llevar varios
  // artículos mezclados, como cualquier venta normal.
  const venderMayorista = async ({ cart, method, cliente, pending = false }) => {
    if (!Array.isArray(cart) || cart.length === 0 || (!method && !pending)) return;
    let freshSales = sales;
    let freshProducts = products;
    let freshMayoristas = productosMayoristas;
    try {
      const fs = await getData("sales");
      if (fs !== null && fs !== undefined) freshSales = fs;
      const fp = await getData("products");
      if (fp !== null && fp !== undefined) freshProducts = fp;
      const fm = await getData("productos_mayoristas");
      if (fm !== null && fm !== undefined) freshMayoristas = fm;
    } catch (e) {}

    let workProducts = freshProducts;
    let workMayoristas = freshMayoristas;
    const items = [];
    let total = 0;
    let tocoStock = false;
    let tocoMayoristas = false;

    for (const linea of cart) {
      const qty = Number(linea.qty) || 0;
      const price = Number(linea.price) || 0;
      if (qty <= 0 || isNaN(price) || price < 0) continue;

      if (linea.source === "stock") {
        const producto = workProducts.find((p) => p.id === linea.productId);
        if (!producto) continue;
        const { lotes, costoUnitarioPromedio } = consumirFIFO(producto, qty);
        workProducts = workProducts.map((p) => (p.id === producto.id ? { ...p, stock: p.stock - qty, lotes } : p));
        tocoStock = true;
        items.push({ productId: producto.id, name: producto.name, price, qty, modifiers: [], categoryId: producto.categoryId || null, cost: costoUnitarioPromedio, source: "stock" });
      } else {
        const producto = workMayoristas.find((p) => p.id === linea.productId);
        if (!producto) continue;
        // El costo de esta venta se puede ajustar en el momento (por si esta
        // compra puntual salió a otro precio); eso además actualiza el costo
        // de referencia del artículo para la próxima vez.
        const costoUsado = linea.cost != null && !isNaN(linea.cost) ? Number(linea.cost) : (producto.cost || 0);
        workMayoristas = workMayoristas.map((p) => (p.id === producto.id ? { ...p, stock: (p.stock || 0) - qty, cost: costoUsado } : p));
        tocoMayoristas = true;
        items.push({ productId: producto.id, name: producto.name, price, qty, modifiers: [], categoryId: null, cost: costoUsado, source: "mayorista" });
      }
      total += price * qty;
    }

    if (items.length === 0) return;
    if (tocoStock) saveProducts(workProducts);
    if (tocoMayoristas) saveProductosMayoristas(workMayoristas);

    const sale = {
      id: uid(),
      number: freshSales.length + 1,
      date: new Date().toISOString(),
      employeeId: activeEmployee ? activeEmployee.id : null,
      employeeName: activeEmployee ? activeEmployee.name : null,
      origen: "mayorista",
      cliente: (cliente || "").trim(),
      items,
      subtotal: total,
      discountType: null, discountValue: 0, discountAmount: 0,
      surchargeRate: 0, surchargeAmount: 0,
      total,
      // Pendiente de pago: el stock ya salió, pero no suma en lo vendido ni en
      // la caja hasta que se marque como cobrado (con la forma de pago real).
      method: pending ? null : method,
      pending: !!pending,
    };
    saveSales([sale, ...freshSales]);
    return sale;
  };

  const editarPrecioRapido = async (product, price) => {
    if (isNaN(price) || price < 0) return;
    const av = avisoPrecio(product, price);
    if (av) logAlertas([{ tipo: "precioRaro", texto: `${product.name}: ${av}` }]);
    await withFreshProducts((fresh) => fresh.map((p) => (p.id === product.id ? { ...p, price } : p)));
  };

  const aplicarPrecios = async (cambios) => {
    const mapa = new Map(cambios.map((c) => [c.id, c.price]));
    const raros = cambios.filter((c) => { const pr = products.find((x) => x.id === c.id); return pr && pr.cost > 0 && c.price < pr.cost; });
    if (raros.length) logAlertas(raros.map((c) => ({ tipo: "precioRaro", texto: `${c.name}: precio $${fmt(c.price)} por debajo del costo (cambio masivo)` })));
    await withFreshProducts((fresh) => fresh.map((p) => (mapa.has(p.id) ? { ...p, price: mapa.get(p.id) } : p)));
  };

  const generarCodigosFaltantes = () => {
    let working = [...products];
    let count = 0;
    working = working.map((p) => {
      if (!p.barcode || !p.barcode.trim()) {
        count++;
        return { ...p, barcode: genBarcode(working) };
      }
      return p;
    });
    if (count === 0) {
      alert("Todos los productos ya tienen código de barras.");
      return;
    }
    saveProducts(working);
    alert(`Se generaron ${count} código(s) de barras nuevos.`);
  };

  // ---- importar artículos desde Excel ----
  const normKey = (s) => String(s).trim().toLowerCase();
  const handleImportExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      // Trae categorías y productos frescos antes de mezclar el Excel, para
      // no pisar cambios hechos desde otra pestaña mientras esta estaba abierta.
      let freshCategories = categories;
      let freshProducts = products;
      try {
        const fc = await getData("categories");
        if (fc !== null && fc !== undefined) freshCategories = fc;
        const fp = await getData("products");
        if (fp !== null && fp !== undefined) freshProducts = fp;
      } catch (err) {}

      let newCategories = [...freshCategories];
      const ensureCategory = (name) => {
        const trimmed = String(name || "").trim();
        if (!trimmed) return "";
        const existing = newCategories.find((c) => normKey(c.name) === normKey(trimmed));
        if (existing) return existing.id;
        const cat = { id: uid(), name: trimmed };
        newCategories = [...newCategories, cat];
        return cat.id;
      };

      let updated = [...freshProducts];
      let added = 0, editedCount = 0;
      rows.forEach((row) => {
        const get = (...keys) => {
          for (const k of Object.keys(row)) {
            if (keys.includes(normKey(k))) return row[k];
          }
          return "";
        };
        const name = String(get("nombre", "producto", "name")).trim();
        if (!name) return;
        const price = parseFloat(get("precio", "price", "precio de venta")) || 0;
        const stock = parseInt(get("stock", "cantidad", "existencias"), 10) || 0;
        const cost = parseFloat(get("precio de compra", "costo", "cost")) || 0;
        const barcode = String(get("codigo de barras", "código de barras", "barcode", "codigo") || "").trim();
        const catName = String(get("categoria", "categoría", "category") || "").trim();
        const categoryId = ensureCategory(catName);

        const existingIdx = updated.findIndex((p) =>
          (barcode && codigosDe(p).includes(barcode)) || (!barcode && normKey(p.name) === normKey(name))
        );
        if (existingIdx >= 0) {
          updated[existingIdx] = {
            ...updated[existingIdx], name, price, stock, cost,
            barcode: barcode || updated[existingIdx].barcode,
            categoryId: categoryId || updated[existingIdx].categoryId,
          };
          editedCount++;
        } else {
          updated.push({ id: uid(), name, price, stock, cost, barcode, categoryId, modifiers: [] });
          added++;
        }
      });
      saveCategories(newCategories);
      saveProducts(updated);
      alert(`Importación completa: ${added} productos nuevos, ${editedCount} actualizados.`);
    } catch (err) {
      alert("No se pudo leer el archivo. Verificá que sea un Excel (.xlsx) válido.");
    }
    e.target.value = "";
  };
  const downloadPlantilla = () => {
    const catName = (id) => categories.find((c) => c.id === id)?.name || "";
    const wsData = [["Nombre", "Precio", "Precio de compra", "Stock", "Categoría", "Código de barras"]];
    if (products.length === 0) {
      wsData.push(["Detergente Magistral 500ml", 3500, 2200, 10, "Detergentes", ""]);
    } else {
      products
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
        .forEach((p) => {
          wsData.push([p.name, p.price || 0, p.cost || 0, p.stock || 0, catName(p.categoryId), p.barcode || ""]);
        });
    }
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Artículos");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, products.length === 0 ? "plantilla-articulos.xlsx" : `articulos-agua-y-jabon-${stamp}.xlsx`);
  };

  const saveCategory = () => {
    const name = categoryForm.name.trim();
    if (!name) return;
    const dup = categories.find((c) => c.name.toLowerCase() === name.toLowerCase() && c.id !== categoryForm.id);
    if (dup) {
      // Ya existe una categoría con ese nombre: en vez de crear una duplicada,
      // fusiona en la existente (o si se estaba editando, mueve los productos ahí).
      if (categoryForm.id) {
        saveProducts(products.map((p) => (p.categoryId === categoryForm.id ? { ...p, categoryId: dup.id } : p)));
        saveCategories(categories.filter((c) => c.id !== categoryForm.id));
      }
      setCategoryForm(null);
      return;
    }
    if (categoryForm.id) {
      saveCategories(categories.map((c) => (c.id === categoryForm.id ? { ...c, name, groupId: categoryForm.groupId || "" } : c)));
    } else {
      saveCategories([...categories, { id: uid(), name, groupId: categoryForm.groupId || "" }]);
    }
    setCategoryForm(null);
  };
  const deleteCategory = (id) => {
    saveCategories(categories.filter((c) => c.id !== id));
    saveProducts(products.map((p) => (p.categoryId === id ? { ...p, categoryId: "" } : p)));
  };
  const quickCreateCategory = (name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return null;
    const existing = categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing.id;
    const cat = { id: uid(), name: trimmed, groupId: "" };
    saveCategories([...categories, cat]);
    return cat.id;
  };
  const fusionarCategoriasDuplicadas = () => {
    const grupos = {};
    categories.forEach((c) => {
      const key = c.name.trim().toLowerCase();
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(c);
    });
    let nextProducts = products;
    let nextCategories = categories;
    let fusiones = 0;
    Object.values(grupos).forEach((lista) => {
      if (lista.length <= 1) return;
      const [ganadora, ...resto] = lista;
      const idsAFusionar = resto.map((c) => c.id);
      nextProducts = nextProducts.map((p) => (idsAFusionar.includes(p.categoryId) ? { ...p, categoryId: ganadora.id } : p));
      nextCategories = nextCategories.filter((c) => !idsAFusionar.includes(c.id));
      fusiones += resto.length;
    });
    if (fusiones > 0) {
      saveProducts(nextProducts);
      saveCategories(nextCategories);
    }
    return fusiones;
  };

  const saveGroup = (form) => {
    const name = form.name.trim();
    if (!name) return;
    const dup = groups.find((g) => g.name.toLowerCase() === name.toLowerCase() && g.id !== form.id);
    if (dup) {
      if (form.id) {
        saveCategories(categories.map((c) => (c.groupId === form.id ? { ...c, groupId: dup.id } : c)));
        saveGroups(groups.filter((g) => g.id !== form.id));
      }
      return;
    }
    if (form.id) {
      saveGroups(groups.map((g) => (g.id === form.id ? { ...g, name } : g)));
    } else {
      saveGroups([...groups, { id: uid(), name }]);
    }
  };
  const deleteGroup = (id) => {
    saveGroups(groups.filter((g) => g.id !== id));
    saveCategories(categories.map((c) => (c.groupId === id ? { ...c, groupId: "" } : c)));
  };
  const setCategoryGroup = (categoryId, groupId) => {
    saveCategories(categories.map((c) => (c.id === categoryId ? { ...c, groupId } : c)));
  };
  const toggleProductCategory = (productId, categoryId) => {
    saveProducts(products.map((p) => {
      if (p.id !== productId) return p;
      return { ...p, categoryId: p.categoryId === categoryId ? "" : categoryId };
    }));
  };

  const saveEmployee = () => {
    const name = employeeForm.name.trim();
    if (!name) return;
    const pin = (employeeForm.pin || "").replace(/\D/g, "").slice(0, 4);
    if (employeeForm.id) {
      saveEmployees(employees.map((e) => (e.id === employeeForm.id ? { ...e, name, pin } : e)));
    } else {
      saveEmployees([...employees, { id: uid(), name, pin }]);
    }
    setEmployeeForm(null);
  };
  const deleteEmployee = (id) => {
    saveEmployees(employees.filter((e) => e.id !== id));
    if (activeEmployeeId === id) setActiveEmployeeId(null);
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch = coincide(search, p.name + " " + (categories.find((c) => c.id === p.categoryId)?.name || "") + " " + codigosDe(p).join(" "));
    const matchesCat = catFilter === "all" || p.categoryId === catFilter;
    return matchesSearch && matchesCat;
  });

  // ---- pistola de código de barras ----
  // Los lectores de código de barras funcionan como un teclado: escriben el
  // código y mandan Enter. Alcanza con que el cursor esté en el buscador.
  const [scanMsg, setScanMsg] = useState("");
  const handleScan = (code) => {
    const clean = code.trim();
    if (!clean) return;
    const found = products.find((p) => codigosDe(p).includes(clean));
    if (found) {
      const modNombre = modDeCodigo(found, clean);
      const modObj = modNombre ? (found.modifiers || []).find((m) => m.name === modNombre) : null;
      if (modObj) addToCart(found, [modObj]);
      else handleProductTap(found);
      setSearch("");
      setScanMsg("");
    } else {
      setScanMsg(`Sin coincidencias para el código ${clean}`);
      setTimeout(() => setScanMsg(""), 2500);
    }
  };

  // ---- exportar copia ----
  const exportBackup = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      products, categories, employees, sales,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `backup-comercio-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Reporte compacto (texto) para pasárselo a Claude y que interprete el negocio.
  const descargarReporte = () => {
    const texto = generarReporte({ sales, products, categories, compras, cajaHistorial, metodos: methodLabel });
    const blob = new Blob([texto], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-negocio-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const methodLabel = { efectivo: "Efectivo", transferencia: "Transferencia", debito: "Débito", credito: "Crédito", mercadopago: "Mercado Pago", otros: "Otros" };
  const methodIcon = { efectivo: Wallet, transferencia: ArrowLeftRight, debito: CreditCard, credito: CreditCard, mercadopago: Smartphone, otros: MoreHorizontal };

  if (!loaded) {
    return <div style={{ padding: 40, textAlign: "center", color: "#5B7791", fontFamily: sans }}>Cargando...</div>;
  }

  if (!account) {
    return (
      <AccountLoginScreen
        loginUser={loginUser} setLoginUser={setLoginUser}
        loginPass={loginPass} setLoginPass={setLoginPass}
        onLogin={doLogin} error={accountLoginError}
      />
    );
  }

  if (needsLogin) {
    return (
      <LoginScreen
        employees={employees}
        onPick={pickEmployee}
        pickId={loginPickId}
        pinInput={pinInput}
        setPinInput={setPinInput}
        onConfirmPin={confirmPin}
        onCancelPin={() => { setLoginPickId(null); setPinInput(""); setLoginError(""); }}
        error={loginError}
      />
    );
  }

  const soldToday = sales
    .filter((s) => new Date(s.date).toDateString() === new Date().toDateString() && !s.pending)
    .reduce((a, s) => a + s.total, 0);
  const pendingProductsCount = products.filter((p) => !p.price || p.price === 0 || !p.cost || p.cost === 0).length;
  const pedidosWebSinConfirmar = sales.filter((s) => s.origen === "catalogo" && !s.confirmado).length;

  return (
    <div style={{ minHeight: "100%", background: "#F2F6FB", fontFamily: sans, color: "#10243D" }}>
      <style>{`
        * { box-sizing: border-box; } button { font-family: inherit; cursor: pointer; } input, select { font-family: inherit; }
        button:active { transform: scale(0.98); }
        input::placeholder { color: #5B7791; opacity: 1; }
        .vender-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-bottom: 20px; }
        .vender-layout { display: block; }
        .vender-cart { margin-top: 4px; max-height: 65vh; display: flex; flex-direction: column; }
        .app-shell { display: flex; flex-direction: column; min-height: 100vh; }
        .sidebar { background: ${C.azulOscuro}; color: #fff; flex-shrink: 0; }
        .sidebar-nav-primary { display: flex; flex-direction: row; overflow-x: auto; gap: 4px; padding: 8px 10px; }
        .sidebar-nav-secondary { display: flex; flex-direction: row; overflow-x: auto; gap: 4px; padding: 0 10px 10px; }
        .app-main { flex: 1; min-width: 0; }
        @media (min-width: 900px) {
          .vender-layout { display: flex; align-items: flex-start; gap: 20px; }
          .vender-products { flex: 1; min-width: 0; }
          .vender-cart { width: 360px; flex-shrink: 0; position: sticky; top: 16px; margin-top: 0; max-height: calc(100vh - 32px); }
          .vender-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
          .app-shell { flex-direction: row; }
          .sidebar { width: 268px; min-height: 100vh; position: sticky; top: 0; align-self: flex-start; display: flex; flex-direction: column; }
          .sidebar-nav-primary { flex-direction: column; overflow-x: visible; padding: 10px 14px; gap: 3px; }
          .sidebar-nav-secondary { flex-direction: column; overflow-x: visible; padding: 4px 14px 14px; gap: 2px; margin-top: auto; }
        }
        @media print {
          .app-shell { display: none !important; }
          .no-print { display: none !important; }
          .modal-overlay { position: static !important; background: none !important; display: block !important; z-index: auto !important; }
          .modal-content { position: static !important; max-height: none !important; overflow: visible !important; background: none !important; border-radius: 0 !important; padding: 0 !important; max-width: none !important; margin: 0 !important; }
          .receipt-print { max-width: 320px; margin: 0 auto; border: none !important; }
          .quote-print { border: none !important; }
          @page { size: 80mm auto; margin: 2mm; }
        }
      `}</style>

      {nuevaVersionDisponible && (
        <div className="no-print" style={{
          position: "sticky", top: 0, zIndex: 100, background: "#A85C06", color: "#fff", padding: "10px 16px",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12, fontSize: 13.5, fontWeight: 600, flexWrap: "wrap",
        }}>
          <span>Hay una actualización de la app disponible.</span>
          <button onClick={() => window.location.reload()} style={{ background: "#fff", color: "#A85C06", border: "none", borderRadius: 8, padding: "6px 14px", fontWeight: 800, fontSize: 13 }}>
            Actualizar ahora
          </button>
        </div>
      )}

      <div className="app-shell">
        <div className="sidebar">
          <button onClick={() => setTab("inicio")} style={{ background: "none", border: "none", textAlign: "left", padding: "20px 14px 14px", cursor: "pointer" }}>
            <div style={{ width: 64, height: 64, background: "#fff", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <img src="/logo.jpg" alt="Agua y Jabón" style={{ width: 52, height: 52, objectFit: "contain", borderRadius: 8 }} />
            </div>
            <div style={{ fontSize: 19, fontWeight: 900, color: "#fff" }}>Agua y Jabón</div>
            {activeEmployee && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.12)", color: "#fff", borderRadius: 999, padding: "4px 10px", fontSize: 12.5, fontWeight: 700, marginTop: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ADE80" }} /> Atiende: {activeEmployee.name}
              </div>
            )}
          </button>

          <div className="sidebar-nav-primary">
            {[
              { id: "vender", label: "Vender", icon: ShoppingCart },
              { id: "articulos", label: "Productos", icon: Package },
              { id: "cargarStock", label: "Cargar stock", icon: PackagePlus },
              { id: "caja", label: "Caja del día", icon: Banknote },
              { id: "resumen", label: "Cómo vamos", icon: BarChart3 },
              { id: "panel", label: "Panel de control", icon: TrendingUp },
              { id: "precios", label: "Precios", icon: Tag },
              { id: "presupuestos", label: "Presupuestos", icon: ClipboardList },
            ].map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 11, border: "none",
                  background: active ? "rgba(255,255,255,0.14)" : "transparent", color: "#fff", fontWeight: active ? 800 : 600,
                  fontSize: 15.5, whiteSpace: "nowrap", width: "100%", textAlign: "left",
                }}>
                  <Icon size={18} /> {t.label}
                </button>
              );
            })}
          </div>

          <div className="sidebar-nav-secondary">
            {[
              { id: "historial", label: "Historial", icon: Receipt },
              { id: "mayoristas", label: "Mayoristas", icon: Truck },
              { id: "catalogoAdmin", label: "Catálogo", icon: ImageIcon },
              { id: "equipo", label: "Equipo", icon: Users },
              { id: "avisos", label: "Avisos", icon: MessageSquare },
              { id: "accesos", label: "Accesos", icon: Lock },
            ].map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  display: "flex", alignItems: "center", gap: 9, padding: "9px 14px", borderRadius: 9, border: "none",
                  background: active ? "rgba(255,255,255,0.14)" : "transparent", color: "rgba(255,255,255,0.75)", fontWeight: active ? 700 : 500,
                  fontSize: 13.5, whiteSpace: "nowrap", width: "100%", textAlign: "left",
                }}>
                  <Icon size={15} /> {t.label}
                </button>
              );
            })}
            <button onClick={exportBackup} title="Exportar copia de seguridad" style={{
              display: "flex", alignItems: "center", gap: 9, padding: "9px 14px", borderRadius: 9, border: "none",
              background: "transparent", color: "rgba(255,255,255,0.75)", fontWeight: 500, fontSize: 13.5, whiteSpace: "nowrap", width: "100%", textAlign: "left",
            }}>
              <Download size={15} /> Exportar
            </button>
            {employees.length > 0 && (
              <button onClick={() => setActiveEmployeeId(null)} style={{
                display: "flex", alignItems: "center", gap: 9, padding: "9px 14px", borderRadius: 9, border: "none",
                background: "transparent", color: "rgba(255,255,255,0.75)", fontWeight: 500, fontSize: 13.5, whiteSpace: "nowrap", width: "100%", textAlign: "left",
              }}>
                <LogOut size={15} /> Cambiar
              </button>
            )}
            <button onClick={doLogout} title="Cerrar sesión" style={{
              display: "flex", alignItems: "center", gap: 9, padding: "9px 14px", borderRadius: 9, border: "none",
              background: "transparent", color: "#FCA5A5", fontWeight: 600, fontSize: 13.5, whiteSpace: "nowrap", width: "100%", textAlign: "left",
            }}>
              <Lock size={15} /> Salir
            </button>
          </div>
        </div>

        <div className="app-main">
          <div style={{ maxWidth: 1180, margin: "0 auto", padding: 16 }}>
            {saveError && <div style={{ background: "#FDECEC", color: "#B3261E", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{saveError}</div>}

            {tab === "inicio" && (
              <InicioView
                employeeName={activeEmployee ? activeEmployee.name : account}
                cajaActual={cajaActual}
                soldToday={soldToday}
                productsCount={products.length}
                pendingCount={pendingProductsCount}
                products={products} categories={categories}
                onEditProduct={(p) => { setTab("articulos"); openEditProduct(p); }}
                pedidosWebCount={pedidosWebSinConfirmar}
                avisos={alertasSistema} onAvisosVistos={marcarAlertasVistas}
                setTab={setTab}
                onCargarProducto={() => { setTab("articulos"); openNewProduct(); }}
              />
            )}
            {tab === "vender" && (
              <VenderTab
                allProducts={products} products={filteredProducts} categories={categories} search={search} setSearch={setSearch}
                catFilter={catFilter} setCatFilter={setCatFilter} cart={cart} cartTotals={cartTotals}
                onProductTap={handleProductTap} changeQty={changeQty} removeLine={removeLine}
                payMethod={payMethod} setPayMethod={setPayMethod} methodLabel={methodLabel} methodIcon={methodIcon}
                discount={discount} setDiscount={setDiscount} showDiscount={showDiscount} setShowDiscount={setShowDiscount}
                cobrar={cobrar} onScan={handleScan} scanMsg={scanMsg}
              />
            )}
        {tab === "articulos" && (
          <ArticulosTab
            products={products} categories={categories} groups={groups}
            openNewProduct={openNewProduct} openEditProduct={openEditProduct} deleteProduct={deleteProduct}
            openNewCategory={() => setCategoryForm({ name: "", groupId: "" })} openEditCategory={(c) => setCategoryForm(c)} deleteCategory={deleteCategory}
            fileInputRef={fileInputRef} onImportExcel={handleImportExcel} onDownloadPlantilla={downloadPlantilla}
            onPrintLabel={(p) => setLabelProduct(p)}
            onGenerarCodigos={generarCodigosFaltantes}
            onDuplicate={duplicateProduct}
            onSumarStock={(p) => setStockAdjustProduct(p)}
            onEditarPrecio={(p) => setPriceEditProduct(p)}
            onPrintSheet={() => setSheetLabelOpen(true)}
            onFusionarDuplicadas={fusionarCategoriasDuplicadas}
            onToggleProductCategory={toggleProductCategory}
            onSaveGroup={saveGroup}
            onDeleteGroup={deleteGroup}
            onSetCategoryGroup={setCategoryGroup}
            onPrintPriceList={() => setPriceListOpen(true)}
          />
        )}
        {tab === "resumen" && (
          <ResumenTab sales={sales} categories={categories} employees={employees} range={range} setRange={setRange} products={products} methodLabel={methodLabel} />
        )}
        {tab === "panel" && (
          <PanelTab sales={sales} categories={categories} products={products} methodLabel={methodLabel} onDescargarReporte={descargarReporte} onEditProduct={(p) => { setTab("articulos"); openEditProduct(p); }} />
        )}
        {tab === "cargarStock" && (
          <CargarStockTab products={products} compras={compras} onCargar={cargarStockConCosto} />
        )}
        {tab === "precios" && <PreciosTab products={products} categories={categories} onAplicar={aplicarPrecios} />}
        {tab === "presupuestos" && (
          <PresupuestosTab products={products} presupuestos={presupuestos} onGenerar={generarPresupuesto} onVer={setPresupuestoGenerado} onEliminar={eliminarPresupuesto} />
        )}
        {tab === "historial" && <HistorialTab sales={sales} onView={setViewingSale} onDelete={deleteSale} methodLabel={methodLabel} onMarcarPagado={marcarComoPagado} onConfirmar={marcarComoConfirmado} />}
        {tab === "mayoristas" && (
          <MayoristasTab
            productosMayoristas={productosMayoristas} products={products} sales={sales} methodLabel={methodLabel} methodIcon={methodIcon}
            onGuardarProducto={guardarProductoMayorista} onEliminarProducto={eliminarProductoMayorista}
            onVender={venderMayorista} onDeleteVenta={deleteSale} onMarcarPagado={marcarComoPagado}
          />
        )}
        {tab === "catalogoAdmin" && (
          <CatalogoAdminTab products={products} categories={categories} groups={groups} openEditProduct={openEditProduct} onSetOferta={setProductOferta} />
        )}
        {tab === "equipo" && (
          <EquipoTab employees={employees} openNew={() => setEmployeeForm({ name: "", pin: "" })} openEdit={(e) => setEmployeeForm(e)} onDelete={deleteEmployee} />
        )}
        {tab === "caja" && (
          <CajaTab cajaActual={cajaActual} cajaHistorial={cajaHistorial} sales={sales} onAbrir={abrirCaja} onCerrar={cerrarCaja} onExport={exportarCajaExcel} />
        )}
        {tab === "avisos" && (
          <AvisosTab observaciones={observaciones} currentUser={account} onAdd={addObservacion} onDelete={deleteObservacion} />
        )}
        {tab === "accesos" && (
          <AccesosTab
            accountUsers={accountUsers} currentUser={account}
            openNew={() => setAccountForm({ username: "", password: "" })}
            openEdit={(u) => setAccountForm(u)}
            onDelete={deleteAccountUser}
          />
        )}
          </div>
        </div>
      </div>

      {productForm && <ProductFormModal form={productForm} setForm={setProductForm} categories={categories} onSave={saveProduct} onClose={() => setProductForm(null)} onCreateCategory={quickCreateCategory} onUploadImage={(file) => uploadProductImage(file, productForm.id || uid())} />}
      {categoryForm && <CategoryFormModal form={categoryForm} setForm={setCategoryForm} groups={groups} onSave={saveCategory} onClose={() => setCategoryForm(null)} />}
      {employeeForm && <EmployeeFormModal form={employeeForm} setForm={setEmployeeForm} onSave={saveEmployee} onClose={() => setEmployeeForm(null)} />}
      {accountForm && <AccountFormModal form={accountForm} setForm={setAccountForm} onSave={saveAccountUser} onClose={() => setAccountForm(null)} />}
      {modifierPicker && (
        <ModifierPickerModal
          product={modifierPicker}
          onClose={() => setModifierPicker(null)}
          onConfirm={(mods) => { addToCart(modifierPicker, mods); setModifierPicker(null); }}
        />
      )}
      {receipt && <ReceiptModal sale={receipt} methodLabel={methodLabel} onClose={() => setReceipt(null)} />}
      {viewingSale && <ReceiptModal sale={viewingSale} methodLabel={methodLabel} onClose={() => setViewingSale(null)} />}
      {labelProduct && <LabelModal product={labelProduct} onClose={() => setLabelProduct(null)} />}
      {sheetLabelOpen && <SheetLabelModal products={products} onClose={() => setSheetLabelOpen(false)} />}
      {priceListOpen && <PriceListModal products={products} categories={categories} groups={groups} onClose={() => setPriceListOpen(false)} />}
      {presupuestoGenerado && <PresupuestoModal presupuesto={presupuestoGenerado} onClose={() => setPresupuestoGenerado(null)} />}
      {stockAdjustProduct && (
        <StockAdjustModal
          product={stockAdjustProduct}
          onConfirm={(amount) => { sumarStock(stockAdjustProduct, amount); setStockAdjustProduct(null); }}
          onClose={() => setStockAdjustProduct(null)}
        />
      )}
      {priceEditProduct && (
        <PriceEditModal
          product={priceEditProduct}
          onConfirm={(price) => { editarPrecioRapido(priceEditProduct, price); setPriceEditProduct(null); }}
          onClose={() => setPriceEditProduct(null)}
        />
      )}
    </div>
  );
}

// ---------------- Login de cuenta (acceso a toda la app) ----------------

function AccountLoginScreen({ loginUser, setLoginUser, loginPass, setLoginPass, onLogin, error }) {
  return (
    <div style={{ minHeight: "100vh", background: "#1B4F9C", fontFamily: sans, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ width: 96, height: 96, background: "#fff", borderRadius: 20, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 20px rgba(0,0,0,0.15)" }}>
            <img src="/logo.jpg" alt="Agua y Jabón" style={{ width: 80, height: 80, objectFit: "contain", borderRadius: 12 }} />
          </div>
          <div style={{ fontSize: 21, fontWeight: 700, color: "#fff" }}>Agua y Jabón</div>
          <div style={{ fontSize: 13, color: "#BBD6F5", marginTop: 4 }}>Iniciá sesión para continuar</div>
        </div>
        <div style={{ background: "#fff", borderRadius: 16, padding: 20 }}>
          <Field label="Usuario">
            <input autoFocus value={loginUser} onChange={(e) => setLoginUser(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onLogin()} style={inputStyle} />
          </Field>
          <Field label="Contraseña">
            <input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onLogin()} style={inputStyle} />
          </Field>
          {error && <div style={{ color: "#B0242A", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
          <button onClick={onLogin} style={{ ...btn("primario", "lg"), width: "100%", marginTop: 4 }}>
            Ingresar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Login ----------------

function LoginScreen({ employees, onPick, pickId, pinInput, setPinInput, onConfirmPin, onCancelPin, error }) {
  const emp = employees.find((e) => e.id === pickId);
  return (
    <div style={{ minHeight: "100vh", background: "#1B4F9C", fontFamily: sans, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ width: 72, height: 72, background: "#fff", borderRadius: 16, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 20px rgba(0,0,0,0.15)" }}>
            <img src="/logo.jpg" alt="Agua y Jabón" style={{ width: 58, height: 58, objectFit: "contain", borderRadius: 8 }} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>¿Quién está atendiendo?</div>
        </div>
        {!emp ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {employees.map((e) => (
              <button key={e.id} onClick={() => onPick(e)} style={{
                background: "#fff", border: "none", borderRadius: 14, padding: "18px 10px", display: "flex",
                flexDirection: "column", alignItems: "center", gap: 8,
              }}>
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#E4ECFB", color: "#1B4F9C", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16 }}>
                  {e.name.slice(0, 1).toUpperCase()}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, textAlign: "center" }}>{e.name}</div>
                {e.pin && <Lock size={11} style={{ color: "#8AA2BC" }} />}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 16, padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 12 }}>PIN de {emp.name}</div>
            <input
              autoFocus type="password" inputMode="numeric" maxLength={4} value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && onConfirmPin()}
              style={{ ...inputStyle, textAlign: "center", fontSize: 22, letterSpacing: 8, marginBottom: 10 }}
            />
            {error && <div style={{ color: "#B0242A", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
            <button onClick={onConfirmPin} style={{ ...btn("primario", "lg"), width: "100%", marginBottom: 8 }}>Ingresar</button>
            <button onClick={onCancelPin} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #DBE6F2", background: "#fff", color: "#5B7791", fontWeight: 600 }}>Volver</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- Vender ----------------

// ---------------- Inicio ----------------

function AvisosSistema({ avisos, onVistos }) {
  const nuevos = (avisos || []).filter((a) => !a.visto);
  if (nuevos.length === 0) return null;
  return (
    <div style={{ background: "#FDECEC", border: "1.5px solid #E8A09B", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#B3261E", display: "flex", alignItems: "center", gap: 6 }}>
          <CircleAlert size={16} /> {nuevos.length} aviso{nuevos.length !== 1 ? "s" : ""} del sistema
        </div>
        <button onClick={onVistos} style={btn("secundario", "sm")}>Marcar como visto</button>
      </div>
      <div style={{ maxHeight: 220, overflowY: "auto" }}>
        {nuevos.slice(0, 30).map((a) => (
          <div key={a.id} style={{ fontSize: 12.5, color: "#7A1F1A", padding: "5px 0", borderTop: "1px solid #F4CFCB" }}>
            <b>{a.tipo === "ventaBajoCosto" ? "Venta con pérdida" : "Precio raro"}</b> · {a.texto}
            <span style={{ color: "#B07873" }}> · {new Date(a.fecha).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}{a.quien ? ` · ${a.quien}` : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function saludoSegunHora() {
  const h = new Date().getHours();
  if (h < 12) return "Buen día";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}

function InicioView({ employeeName, cajaActual, soldToday, productsCount, pendingCount, pedidosWebCount, setTab, onCargarProducto, products, categories, onEditProduct, avisos, onAvisosVistos }) {
  const fecha = new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const fechaCap = fecha.charAt(0).toUpperCase() + fecha.slice(1);

  const tareas = [
    { title: "Cobrar una venta", desc: "Escaneá o buscá el producto por nombre", icon: ScanBarcode, onClick: () => setTab("vender") },
    { title: "Cargar un producto nuevo", desc: "Nombre, precio y cuánto tenés", icon: Plus, onClick: onCargarProducto },
    { title: "Sumar stock que llegó", desc: "Buscá el producto y poné cuántos entraron", icon: Package, onClick: () => setTab("articulos") },
    { title: "Cerrar la caja", desc: "Contá la plata y comparalo con el sistema", icon: Banknote, onClick: () => setTab("caja") },
  ];

  return (
    <div>
      <AvisosSistema avisos={avisos} onVistos={onAvisosVistos} />
      {pedidosWebCount > 0 && (
        <button onClick={() => setTab("historial")} style={{
          width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10, background: "#FDECEC",
          border: "1px solid #F0C9C9", borderRadius: 12, padding: "12px 14px", marginBottom: 16,
        }}>
          <ClipboardList size={18} style={{ color: C.rojo, flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: C.rojo }}>
            {pedidosWebCount} pedido{pedidosWebCount !== 1 ? "s" : ""} nuevo{pedidosWebCount !== 1 ? "s" : ""} del catálogo sin confirmar
          </div>
          <ChevronRight size={16} style={{ color: C.rojo }} />
        </button>
      )}

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 25, fontWeight: 900, color: C.texto }}>{saludoSegunHora()}{employeeName ? `, ${employeeName}` : ""}</div>
          <div style={{ fontSize: 14, color: C.textoSuave, marginTop: 3 }}>
            {fechaCap}{cajaActual ? ` · La caja está abierta desde las ${new Date(cajaActual.openedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : " · La caja está cerrada"}
          </div>
        </div>
        <button onClick={() => setTab("vender")} style={btn("primario", "lg")}>
          <ShoppingCart size={18} /> Cobrar la venta
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        <div style={card()}>
          <div style={{ fontSize: 13, color: C.textoSuave, fontWeight: 600, marginBottom: 6 }}>Vendido hoy</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: C.texto }}>${fmt(soldToday)}</div>
          <div style={{ fontSize: 12, color: C.textoTenue, marginTop: 4 }}>{soldToday === 0 ? "Todavía no cobraste ninguna venta" : "Actualizado ahora"}</div>
        </div>
        <div style={card()}>
          <div style={{ fontSize: 13, color: C.textoSuave, fontWeight: 600, marginBottom: 6 }}>Productos cargados</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: C.texto }}>{productsCount}</div>
          <div style={{ fontSize: 12, color: C.textoTenue, marginTop: 4 }}>Ordenados por nombre</div>
        </div>
        <div onClick={() => { const el = document.getElementById("alertas-inicio"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }} style={{ ...card(), cursor: "pointer", background: pendingCount > 0 ? C.ambarSuave : "#fff", border: pendingCount > 0 ? `1.5px solid ${C.ambarBorde}` : card().border }}>
          <div style={{ fontSize: 13, color: pendingCount > 0 ? C.ambar : C.textoSuave, fontWeight: 600, marginBottom: 6 }}>Necesitan atención</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: pendingCount > 0 ? C.ambar : C.texto }}>{pendingCount}</div>
          <div style={{ fontSize: 12, color: pendingCount > 0 ? "#8A5A0A" : C.textoTenue, marginTop: 4 }}>Sin precio o sin costo · tocá para ver</div>
        </div>
      </div>

      <div id="alertas-inicio">
        <AlertasProductos products={products || []} categories={categories || []} onEdit={onEditProduct} titulo="ALERTAS DE PRODUCTOS" />
      </div>

      <div style={{ fontSize: 13, fontWeight: 800, color: C.textoSuave, letterSpacing: 0.4, marginBottom: 10 }}>¿QUÉ QUERÉS HACER?</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        {tareas.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.title} onClick={t.onClick} style={{ ...card(), display: "flex", alignItems: "center", gap: 14, textAlign: "left", cursor: "pointer" }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: C.azulSuave, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={20} style={{ color: C.azul }} />
              </div>
              <div>
                <div style={{ fontSize: 15.5, fontWeight: 800, color: C.texto }}>{t.title}</div>
                <div style={{ fontSize: 12.5, color: C.textoSuave, marginTop: 2 }}>{t.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VenderTab({
  products, categories, search, setSearch, catFilter, setCatFilter, cart, cartTotals,
  onProductTap, changeQty, removeLine, payMethod, setPayMethod, methodLabel, methodIcon,
  discount, setDiscount, showDiscount, setShowDiscount, cobrar, onScan, scanMsg, allProducts,
}) {
  const qtyInCart = (productId) =>
    cart.filter((l) => l.productId === productId && (!l.modifiers || l.modifiers.length === 0))
      .reduce((a, l) => a + l.qty, 0);
  const lineForProduct = (productId) =>
    cart.find((l) => l.productId === productId && (!l.modifiers || l.modifiers.length === 0));

  return (
    <div className="vender-layout">
      <div className="vender-products">
        <div style={{ position: "relative", marginBottom: 8 }}>
          <Search size={20} style={{ position: "absolute", left: 16, top: 16, color: C.azul }} />
          <input
            autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onScan(search); } }}
            placeholder="Buscar por nombre o escanear código de barras..."
            style={{ ...inputStyle, padding: "16px 44px", fontSize: 16, borderRadius: 14, border: `2.5px solid ${C.azul}`, background: "#FBFDFF", boxShadow: "0 1px 4px rgba(27,79,156,0.12)" }}
          />
          <ScanBarcode size={20} style={{ position: "absolute", right: 16, top: 16, color: C.azul }} />
        </div>
        {scanMsg && <div style={{ fontSize: 12, color: "#A85C06", marginBottom: 8 }}>{scanMsg}</div>}

        {categories.length > 0 && (
          <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 12, paddingBottom: 2 }}>
            <Chip active={catFilter === "all"} onClick={() => setCatFilter("all")}>Todas</Chip>
            {categories.map((c) => (
              <Chip key={c.id} active={catFilter === c.id} onClick={() => setCatFilter(c.id)}>{c.name}</Chip>
            ))}
          </div>
        )}

        {products.length === 0 && <EmptyState text="No hay productos que coincidan. Cargá productos desde Artículos." />}

        <div className="vender-grid">
          {products.map((p) => {
            const outOfStock = p.stock <= 0;
            const hasMods = p.modifiers && p.modifiers.length > 0;
            const qty = hasMods ? 0 : qtyInCart(p.id);
            const line = hasMods ? null : lineForProduct(p.id);
            return (
              <div key={p.id} style={{
                background: "#fff", border: qty > 0 ? "1.5px solid #1B4F9C" : "1px solid #E1EAF4", borderRadius: 14, padding: 14,
                opacity: outOfStock ? 0.45 : 1, position: "relative", display: "flex", flexDirection: "column", gap: 8,
                boxShadow: qty > 0 ? "0 2px 10px rgba(27,79,156,0.10)" : "none",
              }}>
                {hasMods && <Sliders size={13} style={{ position: "absolute", top: 12, right: 12, color: "#8AA2BC" }} />}
                {p.enOferta && (
                  <div style={{ position: "absolute", top: 12, left: 12, background: "#B0242A", color: "#fff", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.05em", padding: "3px 7px", borderRadius: 6 }}>
                    OFERTA
                  </div>
                )}
                <button
                  onClick={() => !outOfStock && onProductTap(p)} disabled={outOfStock}
                  style={{ textAlign: "left", background: "none", border: "none", padding: 0, cursor: outOfStock ? "default" : "pointer" }}
                >
                  <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 5, lineHeight: 1.25, color: "#10243D" }}>{p.name}</div>
                  {p.enOferta ? (
                    <div style={{ marginBottom: 5 }}>
                      <span style={{ fontSize: 13, color: "#8AA2BC", textDecoration: "line-through", marginRight: 6 }}>${fmt(p.price)}</span>
                      <span style={{ fontSize: 21, fontWeight: 800, color: "#B0242A" }}>${fmt(p.precioOferta)}</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 21, fontWeight: 800, color: "#1B4F9C", marginBottom: 5 }}>${fmt(p.price)}</div>
                  )}
                </button>
                <div>
                  <span style={badgeStock(p.stock, LOW_STOCK).estilo}>{badgeStock(p.stock, LOW_STOCK).texto}</span>
                </div>
                {!hasMods && (
                  qty > 0 ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: C.azulSuave, borderRadius: 11, padding: "4px 6px", marginTop: "auto" }}>
                      <button onClick={() => changeQty(line.lineId, -1)} style={{ ...iconBtn("secundario"), width: 34, height: 34, background: "#fff" }}><Minus size={15} /></button>
                      <span style={{ fontSize: 16, fontWeight: 800, minWidth: 20, textAlign: "center", color: C.azul }}>{qty}</span>
                      <button onClick={() => onProductTap(p)} disabled={outOfStock} style={{ ...iconBtn("primario"), boxShadow: "none", width: 34, height: 34 }}><Plus size={15} /></button>
                    </div>
                  ) : (
                    <button onClick={() => !outOfStock && onProductTap(p)} disabled={outOfStock} style={{ ...btn(outOfStock ? "secundario" : "primario", "sm"), boxShadow: "none", width: "100%", opacity: outOfStock ? 0.5 : 1, marginTop: "auto" }}>
                      <Plus size={15} /> Agregar
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="vender-cart">
        <div style={{ background: "#fff", border: "1px solid #E1EAF4", borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10, color: "#5B7791", letterSpacing: 0.3, flexShrink: 0 }}>CARRITO</div>
          {cart.length === 0 && (
            <div style={{ textAlign: "center", padding: "22px 8px", color: "#8AA2BC", fontSize: 13 }}>
              <ShoppingCart size={26} style={{ marginBottom: 8, opacity: 0.5 }} />
              <div>Todavía no agregaste productos</div>
            </div>
          )}
          <div className="vender-cart-items" style={{ overflowY: "auto", flexShrink: 1, minHeight: 0 }}>
            {cart.map((l) => {
              const extras = (l.modifiers || []).reduce((a, m) => a + m.price, 0);
              return (
                <div key={l.lineId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #EDF2F8" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</div>
                    {l.modifiers && l.modifiers.length > 0 && (
                      <div style={{ fontSize: 11, color: "#8AA2BC" }}>{l.modifiers.map((m) => m.name).join(", ")}</div>
                    )}
                    <div style={{ fontSize: 12, color: "#8AA2BC" }}>${fmt(l.price + extras)} c/u</div>
                    {(() => { const pr = (allProducts || products).find((p) => p.id === l.productId); return pr && pr.cost > 0 && l.price < pr.cost ? (
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: "#B3261E" }}>⚠️ Bajo el costo (costo ${fmt(pr.cost)})</div>
                    ) : null; })()}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <IconBtn onClick={() => changeQty(l.lineId, -1)}><Minus size={13} /></IconBtn>
                    <span style={{ fontSize: 13.5, minWidth: 18, textAlign: "center", fontWeight: 700 }}>{l.qty}</span>
                    <IconBtn onClick={() => changeQty(l.lineId, 1)}><Plus size={13} /></IconBtn>
                    <IconBtn onClick={() => removeLine(l.lineId)} danger><Trash2 size={13} /></IconBtn>
                  </div>
                </div>
              );
            })}
          </div>

          {cart.length > 0 && (
            <div style={{ flexShrink: 0 }}>
              <button onClick={() => setShowDiscount((v) => !v)} style={{
                display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#1B4F9C",
                fontSize: 12.5, fontWeight: 700, padding: "10px 0 2px",
              }}>
                <Percent size={13} /> {discount.value > 0 ? "Editar descuento" : "Agregar descuento"}
              </button>
              {showDiscount && (
                <div style={{ display: "flex", gap: 6, margin: "6px 0 4px" }}>
                  <select value={discount.type} onChange={(e) => setDiscount({ ...discount, type: e.target.value })} style={{ ...inputStyle, width: 90 }}>
                    <option value="pct">%</option>
                    <option value="fixed">$</option>
                  </select>
                  <input type="number" min="0" step={discount.type === "pct" ? "1" : "0.01"} value={discount.value || ""} onChange={(e) => setDiscount({ ...discount, value: parseFloat(e.target.value) || 0 })} placeholder="0" style={inputStyle} />
                </div>
              )}

              <div style={{ margin: "12px 0", padding: "12px", background: "#F6F9FE", borderRadius: 12 }}>
                {cartTotals.discountAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#8AA2BC", marginBottom: 3 }}>
                    <span>Subtotal</span><span>${fmt(cartTotals.subtotal)}</span>
                  </div>
                )}
                {cartTotals.discountAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#A85C06", marginBottom: 3 }}>
                    <span>Descuento</span><span>-${fmt(cartTotals.discountAmount)}</span>
                  </div>
                )}
                {cartTotals.surchargeAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#1B4F9C", marginBottom: 3 }}>
                    <span>Recargo {methodLabel[payMethod]} ({Math.round(cartTotals.surchargeRate * 100)}%)</span><span>+${fmt(cartTotals.surchargeAmount)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 14, color: "#5B7791", fontWeight: 600 }}>TOTAL</span>
                  <span style={{ fontSize: 28, fontWeight: 800, color: "#1B4F9C" }}>${fmt(cartTotals.total)}</span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
                {Object.keys(methodLabel).map((m) => {
                  const Icon = methodIcon[m];
                  const active = payMethod === m;
                  return (
                    <button key={m} onClick={() => setPayMethod(m)} style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 6px",
                      borderRadius: 10, fontSize: 12.5, border: active ? "1.5px solid #1B4F9C" : "1px solid #DBE6F2",
                      background: active ? "#E4ECFB" : "#fff", color: active ? "#1B4F9C" : "#5B7791", fontWeight: active ? 700 : 500,
                    }}>
                      <Icon size={13} /> {methodLabel[m]}
                    </button>
                  );
                })}
              </div>

              <button onClick={() => cobrar(false)} disabled={!payMethod} style={{ ...btn("primario", "lg"), width: "100%", opacity: payMethod ? 1 : 0.5 }}>
                {payMethod ? `Cobrar ${methodLabel[payMethod]} $${fmt(cartTotals.total)}` : "Elegí una forma de pago"}
              </button>
              <button onClick={() => cobrar(true)} style={{ ...btn("terciario"), width: "100%", marginTop: 8 }}>
                <ClipboardList size={15} /> Dejar pendiente de pago (a entregar)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return <button onClick={onClick} style={{ ...chipStyle(active), flexShrink: 0, whiteSpace: "nowrap" }}>{children}</button>;
}

function IconBtn({ onClick, children, danger }) {
  return <button onClick={onClick} style={iconBtn(danger ? "peligro" : "secundario")}>{children}</button>;
}

// ---------------- Artículos ----------------

function CatalogoAdminTab({ products, categories, groups, openEditProduct, onSetOferta }) {
  const [search, setSearch] = useState("");
  const [editingOferta, setEditingOferta] = useState(null);
  const [ofertaPrecio, setOfertaPrecio] = useState("");

  const catName = (id) => categories.find((c) => c.id === id)?.name || "Sin categoría";
  const catGroupId = (categoryId) => categories.find((c) => c.id === categoryId)?.groupId || "";
  const groupName = (id) => groups.find((g) => g.id === id)?.name || "Otros";

  const disponibles = products
    .filter((p) => p.price > 0 && p.stock > 0)
    .filter((p) => coincide(search, p.name));
  const noDisponibles = products.filter((p) => !(p.price > 0 && p.stock > 0)).length;

  const porGrupo = {};
  disponibles.forEach((p) => {
    const gid = catGroupId(p.categoryId) || "sin-grupo";
    const gname = gid === "sin-grupo" ? "Otros artículos" : groupName(gid);
    const cname = catName(p.categoryId);
    if (!porGrupo[gname]) porGrupo[gname] = {};
    if (!porGrupo[gname][cname]) porGrupo[gname][cname] = [];
    porGrupo[gname][cname].push(p);
  });
  const gruposOrdenados = Object.keys(porGrupo).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

  const empezarOferta = (p) => {
    setEditingOferta(p.id);
    setOfertaPrecio(p.precioOferta ? String(p.precioOferta) : "");
  };
  const confirmarOferta = (p) => {
    const precio = parseFloat(ofertaPrecio);
    if (isNaN(precio) || precio <= 0) return;
    onSetOferta(p.id, true, precio);
    setEditingOferta(null);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>Catálogo</div>
        <a href="/catalogo" target="_blank" rel="noopener noreferrer" style={{ ...btn("secundario", "sm"), textDecoration: "none" }}>
          Ver catálogo público ↗
        </a>
      </div>
      <div style={{ fontSize: 13.5, color: C.textoSuave, marginBottom: 4 }}>Así se ve tu catálogo público. Solo aparecen productos con stock y precio cargado.</div>
      {noDisponibles > 0 && (
        <div style={{ fontSize: 12.5, color: C.textoTenue, marginBottom: 16 }}>{noDisponibles} producto{noDisponibles !== 1 ? "s" : ""} no aparece{noDisponibles !== 1 ? "n" : ""} en el catálogo por falta de stock o precio.</div>
      )}

      <div style={{ position: "relative", marginBottom: 18 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: C.textoTenue }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto..." style={{ ...inputStyle, padding: "10px 12px 10px 34px" }} />
      </div>

      {gruposOrdenados.length === 0 && <EmptyState text="No hay productos disponibles en el catálogo por ahora." />}

      {gruposOrdenados.map((gname) => (
        <div key={gname} style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: C.azul, marginBottom: 8 }}>{gname}</div>
          {Object.keys(porGrupo[gname]).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })).map((cname) => (
            <div key={cname} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textoSuave, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>{cname}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {porGrupo[gname][cname].map((p) => (
                  <div key={p.id} style={{ background: "#fff", border: p.enOferta ? "1px solid #F0C9C9" : "1px solid #E1EAF4", borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 8 }} />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: "#F2F6FB", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <ImageIcon size={16} style={{ color: C.textoTenue }} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{p.name}</div>
                      {p.enOferta ? (
                        <div style={{ fontSize: 12.5 }}>
                          <span style={{ color: C.textoTenue, textDecoration: "line-through", marginRight: 6 }}>${fmt(p.price)}</span>
                          <span style={{ color: C.rojo, fontWeight: 700 }}>${fmt(p.precioOferta)}</span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12.5, color: C.textoSuave }}>${fmt(p.price)}</div>
                      )}
                    </div>
                    {editingOferta === p.id ? (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="number" min="0" step="0.01" value={ofertaPrecio} onChange={(e) => setOfertaPrecio(e.target.value)} placeholder="Precio oferta" style={{ ...inputStyle, width: 110, padding: "7px 8px" }} />
                        <button onClick={() => confirmarOferta(p)} style={btn("primario", "sm")}>Guardar</button>
                        <button onClick={() => setEditingOferta(null)} style={btn("terciario", "sm")}>Cancelar</button>
                      </div>
                    ) : p.enOferta ? (
                      <button onClick={() => onSetOferta(p.id, false, p.precioOferta)} style={btn("terciario", "sm")}>Quitar oferta</button>
                    ) : (
                      <button onClick={() => empezarOferta(p)} style={btn("secundario", "sm")}>Poner en oferta</button>
                    )}
                    <IconBtn onClick={() => openEditProduct(p)}><Pencil size={13} /></IconBtn>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ArticulosTab({ products, categories, groups, openNewProduct, openEditProduct, deleteProduct, openNewCategory, openEditCategory, deleteCategory, fileInputRef, onImportExcel, onDownloadPlantilla, onPrintLabel, onGenerarCodigos, onDuplicate, onSumarStock, onEditarPrecio, onPrintSheet, onFusionarDuplicadas, onToggleProductCategory, onSaveGroup, onDeleteGroup, onSetCategoryGroup, onPrintPriceList }) {
  const [section, setSection] = useState("productos");
  const [search, setSearch] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const [catPicker, setCatPicker] = useState(null);
  const [groupPicker, setGroupPicker] = useState(null);
  const [groupForm, setGroupForm] = useState(null);
  const lowStock = products.filter((p) => p.stock <= LOW_STOCK).length;
  const isPending = (p) => !p.price || p.price === 0 || !p.cost || p.cost === 0;
  const pendingCount = products.filter(isPending).length;
  const catName = (id) => categories.find((c) => c.id === id)?.name;
  const groupName = (id) => groups.find((g) => g.id === id)?.name;
  const margin = (p) => (p.cost && p.cost > 0 ? ((p.price - p.cost) / p.cost) * 100 : null);

  const filteredProducts = products
    .filter((p) => {
      if (!coincide(search, p.name + " " + (catName(p.categoryId) || "") + " " + codigosDe(p).join(" "))) return false;
      if (onlyPending && !isPending(p)) return false;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));

  const categoriasOrdenadas = categories.slice().sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  const gruposOrdenados = groups.slice().sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));

  const handleFusionar = () => {
    const n = onFusionarDuplicadas();
    alert(n > 0 ? `Se fusionaron ${n} categoría${n > 1 ? "s" : ""} duplicada${n > 1 ? "s" : ""}.` : "No se encontraron categorías duplicadas.");
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button onClick={() => setSection("productos")} style={{ flex: 1, padding: "8px", borderRadius: 9, border: section === "productos" ? "1.5px solid #1B4F9C" : "1px solid #DBE6F2", background: section === "productos" ? "#E4ECFB" : "#fff", color: section === "productos" ? "#1B4F9C" : "#5B7791", fontWeight: 700, fontSize: 13 }}>Productos</button>
        <button onClick={() => setSection("categorias")} style={{ flex: 1, padding: "8px", borderRadius: 9, border: section === "categorias" ? "1.5px solid #1B4F9C" : "1px solid #DBE6F2", background: section === "categorias" ? "#E4ECFB" : "#fff", color: section === "categorias" ? "#1B4F9C" : "#5B7791", fontWeight: 700, fontSize: 13 }}>Categorías</button>
        <button onClick={() => setSection("grupos")} style={{ flex: 1, padding: "8px", borderRadius: 9, border: section === "grupos" ? "1.5px solid #1B4F9C" : "1px solid #DBE6F2", background: section === "grupos" ? "#E4ECFB" : "#fff", color: section === "grupos" ? "#1B4F9C" : "#5B7791", fontWeight: 700, fontSize: 13 }}>Grupos</button>
      </div>

      {section === "productos" && (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <MetricCard label="Productos" value={products.length} />
          </div>
          <AlertasProductos products={products} categories={categories} onEdit={openEditProduct} titulo="ALERTAS (tocá una para ver cuáles son)" />
          <button onClick={openNewProduct} style={{ ...btn("primario", "lg"), width: "100%", marginBottom: 8 }}>
            <Plus size={18} /> Agregar producto
          </button>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button onClick={() => fileInputRef.current && fileInputRef.current.click()} style={{ ...btn("secundario"), flex: 1 }}>
              <Upload size={15} /> Importar Excel
            </button>
            <button onClick={onDownloadPlantilla} style={{ ...btn("secundario"), flex: 1 }}>
              <FileSpreadsheet size={15} /> Descargar Excel
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={onImportExcel} style={{ display: "none" }} />
          </div>
          <button onClick={onGenerarCodigos} style={{ ...btn("secundario", "sm"), width: "100%", marginBottom: 8 }}>
            <Wand2 size={14} /> Generar códigos de barras faltantes
          </button>
          <button onClick={onPrintSheet} style={{ ...btn("secundario", "sm"), width: "100%", marginBottom: 8 }}>
            <Tag size={14} /> Imprimir etiquetas en hoja A4
          </button>
          <button onClick={onPrintPriceList} style={{ ...btn("secundario", "sm"), width: "100%", marginBottom: 14 }}>
            <ClipboardList size={14} /> Imprimir lista de precios para el público
          </button>

          <div style={{ position: "relative", marginBottom: 14 }}>
            <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: "#8AA2BC" }} />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, categoría o código de barras..."
              style={{ ...inputStyle, padding: "10px 12px 10px 34px" }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: 7, border: "none", background: "none", color: "#8AA2BC", padding: 4 }}>
                <X size={16} />
              </button>
            )}
          </div>

          {onlyPending && (
            <button onClick={() => setOnlyPending(false)} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", color: "#1B4F9C", fontSize: 12, fontWeight: 600, padding: "0 0 10px" }}>
              <X size={13} /> Quitar filtro de pendientes
            </button>
          )}

          {products.length === 0 && <EmptyState text="Todavía no cargaste productos. Agregá el primero o importá un Excel." />}
          {products.length > 0 && filteredProducts.length === 0 && <EmptyState text="No hay productos que coincidan." />}
          <div style={{ fontSize: 11.5, color: "#8AA2BC", marginBottom: 6 }}>
            {filteredProducts.length} producto{filteredProducts.length !== 1 ? "s" : ""} · orden alfabético
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filteredProducts.map((p) => {
              const m = margin(p);
              const pending = isPending(p);
              return (
                <div key={p.id} style={{
                  background: "#fff", border: pending ? "1px solid #FBE3B8" : "1px solid #E1EAF4", borderRadius: 12, padding: "12px 14px",
                  display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
                }}>
                  <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</div>
                    {pending ? (
                      <div style={{ fontSize: 12, color: C.rojo, fontWeight: 600, marginTop: 2 }}>
                        Falta {!p.price ? "precio" : ""}{!p.price && !p.cost ? " y " : ""}{!p.cost ? "costo" : ""}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: "#8AA2BC", marginTop: 2 }}>
                        {catName(p.categoryId) ? catName(p.categoryId) + " · " : ""}
                        {p.modifiers && p.modifiers.length > 0 ? `${p.modifiers.length} modificador${p.modifiers.length > 1 ? "es" : ""}` : ""}
                      </div>
                    )}
                    {m !== null && (
                      <div style={{ fontSize: 11, color: "#1B4F9C", display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
                        <TrendingUp size={11} /> Margen {m.toFixed(0)}% (costo ${fmt(p.cost)}
                        {p.descuentoPct > 0 ? ` · lista $${fmt(p.costoLista)} -${p.descuentoPct}%` : ""})
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 19, fontWeight: 900, color: p.price ? "#1B4F9C" : "#B7C3D4", minWidth: 90 }}>${fmt(p.price)}</div>
                  <span style={badgeStock(p.stock, LOW_STOCK).estilo}>{badgeStock(p.stock, LOW_STOCK).texto}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <button onClick={() => onEditarPrecio(p)} style={{ ...btn(pending ? "primario" : "secundario", "sm"), boxShadow: "none" }}>
                      <DollarSign size={13} /> {pending ? "Poner precio" : "Editar precio"}
                    </button>
                    <button onClick={() => onSumarStock(p)} style={btn("secundario", "sm")}>
                      <PackagePlus size={13} /> Sumar stock
                    </button>
                    <IconBtn onClick={() => onDuplicate(p)}><Copy size={13} /></IconBtn>
                    <IconBtn onClick={() => onPrintLabel(p)}><Tag size={13} /></IconBtn>
                    <IconBtn onClick={() => openEditProduct(p)}><Pencil size={13} /></IconBtn>
                    <IconBtn danger onClick={() => { if (confirm(`¿Eliminar "${p.name}"?`)) deleteProduct(p.id); }}><Trash2 size={13} /></IconBtn>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {section === "categorias" && (
        <>
          <button onClick={openNewCategory} style={{ ...btn("primario", "lg"), width: "100%", marginBottom: 8 }}>
            <Plus size={16} /> Agregar categoría
          </button>
          <button onClick={handleFusionar} style={{ ...btn("secundario", "sm"), width: "100%", marginBottom: 14 }}>
            <Wand2 size={13} /> Fusionar categorías duplicadas
          </button>
          {categories.length === 0 && <EmptyState text="Todavía no creaste categorías." />}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {categoriasOrdenadas.map((c) => (
              <div key={c.id} style={{ background: "#fff", border: "1px solid #E1EAF4", borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Tag size={15} style={{ color: "#1B4F9C" }} />
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                  {c.groupId && groupName(c.groupId) && (
                    <div style={{ fontSize: 11, color: "#8AA2BC" }}>Grupo: {groupName(c.groupId)}</div>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "#8AA2BC" }}>{products.filter((p) => p.categoryId === c.id).length} productos</div>
                <button onClick={() => setCatPicker(c)} style={btn("secundario", "sm")}>Ver artículos</button>
                <IconBtn onClick={() => openEditCategory(c)}><Pencil size={13} /></IconBtn>
                <IconBtn danger onClick={() => { if (confirm(`¿Eliminar "${c.name}"?`)) deleteCategory(c.id); }}><Trash2 size={13} /></IconBtn>
              </div>
            ))}
          </div>
        </>
      )}

      {section === "grupos" && (
        <>
          <div style={{ fontSize: 12.5, color: "#8AA2BC", marginBottom: 12 }}>
            Los grupos son categorías más grandes (ej: Cocina, Baño, Plásticos, Pisos) para organizar las categorías chicas adentro.
          </div>
          <button onClick={() => setGroupForm({ name: "" })} style={{ ...btn("primario", "lg"), width: "100%", marginBottom: 14 }}>
            <Plus size={16} /> Agregar grupo
          </button>
          {groups.length === 0 && <EmptyState text="Todavía no creaste grupos." />}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {gruposOrdenados.map((g) => (
              <div key={g.id} style={{ background: "#fff", border: "1px solid #E1EAF4", borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <ClipboardList size={15} style={{ color: "#1B4F9C" }} />
                <div style={{ flex: 1, fontSize: 14, fontWeight: 600, minWidth: 120 }}>{g.name}</div>
                <div style={{ fontSize: 12, color: "#8AA2BC" }}>{categories.filter((c) => c.groupId === g.id).length} categorías</div>
                <button onClick={() => setGroupPicker(g)} style={btn("secundario", "sm")}>Ver categorías</button>
                <IconBtn onClick={() => setGroupForm(g)}><Pencil size={13} /></IconBtn>
                <IconBtn danger onClick={() => { if (confirm(`¿Eliminar el grupo "${g.name}"?`)) onDeleteGroup(g.id); }}><Trash2 size={13} /></IconBtn>
              </div>
            ))}
          </div>
        </>
      )}

      {catPicker && (
        <CategoryProductsModal
          category={catPicker} products={products}
          onToggle={(productId) => onToggleProductCategory(productId, catPicker.id)}
          onClose={() => setCatPicker(null)}
        />
      )}
      {groupPicker && (
        <GroupCategoriesModal
          group={groupPicker} categories={categories}
          onToggle={(categoryId) => {
            const cat = categories.find((c) => c.id === categoryId);
            onSetCategoryGroup(categoryId, cat && cat.groupId === groupPicker.id ? "" : groupPicker.id);
          }}
          onClose={() => setGroupPicker(null)}
        />
      )}
      {groupForm && (
        <GroupFormModal
          form={groupForm} setForm={setGroupForm}
          onSave={() => { onSaveGroup(groupForm); setGroupForm(null); }}
          onClose={() => setGroupForm(null)}
        />
      )}
    </div>
  );
}

function CategoryProductsModal({ category, products, onToggle, onClose }) {
  const [search, setSearch] = useState("");
  const filtered = products
    .filter((p) => coincide(search, p.name))
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Artículos en "{category.name}"</div>
        <button onClick={onClose} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={20} /></button>
      </div>
      <div style={{ position: "relative", marginBottom: 10 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: "#8AA2BC" }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto..." style={{ ...inputStyle, padding: "10px 12px 10px 34px" }} />
      </div>
      <div style={{ maxHeight: 380, overflowY: "auto" }}>
        {filtered.map((p) => {
          const checked = p.categoryId === category.id;
          return (
            <button
              key={p.id} onClick={() => onToggle(p.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 8px",
                borderRadius: 9, border: "none", background: checked ? C.azulSuave : "transparent", textAlign: "left", marginBottom: 2,
              }}
            >
              <div style={{
                width: 20, height: 20, borderRadius: 5, border: checked ? "none" : "2px solid #DBE6F2", background: checked ? "#1B4F9C" : "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                {checked && <Check size={13} color="#fff" />}
              </div>
              <span style={{ fontSize: 13.5, fontWeight: checked ? 700 : 500 }}>{p.name}</span>
            </button>
          );
        })}
      </div>
      <button onClick={onClose} style={{ ...btn("primario", "lg"), width: "100%", marginTop: 14 }}>Listo</button>
    </Overlay>
  );
}

function GroupCategoriesModal({ group, categories, onToggle, onClose }) {
  const sorted = categories.slice().sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Categorías en "{group.name}"</div>
        <button onClick={onClose} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={20} /></button>
      </div>
      {sorted.length === 0 && <EmptyState text="Todavía no hay categorías creadas." />}
      <div style={{ maxHeight: 380, overflowY: "auto" }}>
        {sorted.map((c) => {
          const checked = c.groupId === group.id;
          return (
            <button
              key={c.id} onClick={() => onToggle(c.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 8px",
                borderRadius: 9, border: "none", background: checked ? C.azulSuave : "transparent", textAlign: "left", marginBottom: 2,
              }}
            >
              <div style={{
                width: 20, height: 20, borderRadius: 5, border: checked ? "none" : "2px solid #DBE6F2", background: checked ? "#1B4F9C" : "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                {checked && <Check size={13} color="#fff" />}
              </div>
              <span style={{ fontSize: 13.5, fontWeight: checked ? 700 : 500 }}>{c.name}</span>
            </button>
          );
        })}
      </div>
      <button onClick={onClose} style={{ ...btn("primario", "lg"), width: "100%", marginTop: 14 }}>Listo</button>
    </Overlay>
  );
}

function GroupFormModal({ form, setForm, onSave, onClose }) {
  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{form.id ? "Editar grupo" : "Nuevo grupo"}</div>
        <button onClick={onClose} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={20} /></button>
      </div>
      <Field label="Nombre"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Cocina, Baño, Plásticos, Pisos" style={inputStyle} /></Field>
      <button onClick={onSave} style={{ ...btn("primario", "lg"), width: "100%" }}>Guardar</button>
    </Overlay>
  );
}

// ---------------- Precios (ver márgenes y subir precios en masa) ----------------
function PreciosTab({ products, categories, onAplicar }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [sel, setSel] = useState({});
  const [manual, setManual] = useState({}); // id -> precio escrito a mano
  const [modo, setModo] = useState("pct"); // pct | margen | monto
  const [valor, setValor] = useState("");
  const [redondeo, setRedondeo] = useState("10");
  const [soloSubir, setSoloSubir] = useState(true);
  const [msg, setMsg] = useState("");

  const margenDe = (cost, price) => (cost > 0 && price > 0 ? ((price - cost) / cost) * 100 : null);
  const redondear = (n) => {
    const r = Number(redondeo);
    return r > 0 ? Math.ceil(n / r) * r : Math.round(n * 100) / 100;
  };
  const nuevoMasivo = (p) => {
    const v = parseFloat(valor);
    if (isNaN(v)) return null;
    let n = null;
    if (modo === "pct") n = p.price * (1 + v / 100);
    else if (modo === "monto") n = p.price + v;
    else if (modo === "margen") n = p.cost > 0 ? p.cost * (1 + v / 100) : null;
    if (n === null || n <= 0) return null;
    n = redondear(n);
    if (soloSubir && n <= p.price) return null;
    return n;
  };
  const catName = (id) => categories.find((c) => c.id === id)?.name || "";

  const lista = useMemo(() => {
    let l = products.filter((p) => {
      if (cat && p.categoryId !== cat) return false;
      const m = margenDe(p.cost, p.price);
      if (filtro === "bajoCosto") return p.cost > 0 && p.price < p.cost;
      if (filtro === "margenBajo") return m !== null && m < MARGEN_MINIMO;
      if (filtro === "sinCosto") return !(p.cost > 0);
      if (filtro === "costoSubio") return p.ultimoCosto > 0 && p.cost > 0 && p.ultimoCosto > p.cost && margenDe(p.ultimoCosto, p.price) < MARGEN_MINIMO;
      return true;
    });
    l = buscar(l, q, (p) => p.name + " " + catName(p.categoryId));
    if (!q) l = [...l].sort((a, b) => (margenDe(a.cost, a.price) ?? 9999) - (margenDe(b.cost, b.price) ?? 9999));
    return l;
  }, [products, q, cat, filtro, categories]);

  const seleccionados = lista.filter((p) => sel[p.id]);
  const todosSel = lista.length > 0 && lista.every((p) => sel[p.id]);
  const toggleTodos = () => {
    const n = { ...sel };
    lista.forEach((p) => { n[p.id] = !todosSel; });
    setSel(n);
  };

  // Cambios pendientes: lo escrito a mano manda; si no, el cálculo masivo para los tildados.
  const cambios = [];
  lista.forEach((p) => {
    const mv = manual[p.id];
    if (mv !== undefined && mv !== "") {
      const n = parseFloat(mv);
      if (!isNaN(n) && n >= 0 && n !== p.price) cambios.push({ id: p.id, p, price: n });
    } else if (sel[p.id]) {
      const n = nuevoMasivo(p);
      if (n !== null && n !== p.price) cambios.push({ id: p.id, p, price: n });
    }
  });
  const cambioDe = (id) => cambios.find((c) => c.id === id);

  const aplicar = async () => {
    if (cambios.length === 0) return;
    const bajo = cambios.filter((c) => c.p.cost > 0 && c.price < c.p.cost);
    let t = `Vas a cambiar el precio de ${cambios.length} producto${cambios.length !== 1 ? "s" : ""}.`;
    if (bajo.length) t += `\n\n⚠️ ${bajo.length} quedarían POR DEBAJO DEL COSTO:\n` + bajo.slice(0, 8).map((c) => `• ${c.p.name}: $${fmt(c.price)} (costo $${fmt(c.p.cost)})`).join("\n");
    if (!window.confirm(t + "\n\n¿Aplicar?")) return;
    await onAplicar(cambios.map((c) => ({ id: c.id, price: c.price, anterior: c.p.price, name: c.p.name })));
    setSel({}); setManual({}); setValor("");
    setMsg(`Listo: se actualizaron ${cambios.length} precios.`);
    setTimeout(() => setMsg(""), 5000);
  };

  const descargarEtiquetas = () => {
    const base = seleccionados.length > 0 ? seleccionados : lista;
    const items = base
      .filter((p) => precioVenta(p) > 0)
      .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
      .map((p) => ({ nombre: p.name, precio: precioVenta(p) }));
    if (items.length === 0) return;
    descargarEtiquetasPDF(items);
  };

  const filtros = [
    ["todos", "Todos"], ["bajoCosto", "Bajo el costo"], ["margenBajo", `Margen < ${MARGEN_MINIMO}%`],
    ["costoSubio", "Costo subió (repuesto más caro)"], ["sinCosto", "Sin costo"],
  ];

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>Precios y márgenes</div>
      <div style={{ fontSize: 13, color: "#5B7791", marginBottom: 14 }}>
        Margen = ganancia sobre el costo. Tildá productos, elegí cuánto subir y mirá cómo quedan antes de aplicar. También podés escribir un precio nuevo a mano en cualquier fila.
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto..." style={{ ...inputStyle, flex: "1 1 200px" }} />
        <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ ...inputStyle, flex: "0 1 200px" }}>
          <option value="">Todas las categorías</option>
          {categories.slice().sort((a, b) => a.name.localeCompare(b.name, "es")).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {filtros.map(([id, lab]) => (
          <button key={id} onClick={() => setFiltro(id)} style={{
            padding: "6px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
            border: filtro === id ? "1.5px solid #1B4F9C" : "1px solid #DBE6F2", background: filtro === id ? "#E8F0FB" : "#fff", color: filtro === id ? "#1B4F9C" : "#5B7791",
          }}>{lab}</button>
        ))}
      </div>

      <div style={{ background: "#fff", border: "1px solid #E1EAF4", borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Subir precios a los tildados ({seleccionados.length})</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={modo} onChange={(e) => setModo(e.target.value)} style={{ ...inputStyle, flex: "0 1 240px" }}>
            <option value="pct">Subir un % al precio actual</option>
            <option value="margen">Llevar al margen de (% sobre costo)</option>
            <option value="monto">Sumar un monto fijo ($)</option>
          </select>
          <input type="number" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={modo === "monto" ? "$" : "%"} style={{ ...inputStyle, flex: "0 1 100px" }} />
          <select value={redondeo} onChange={(e) => setRedondeo(e.target.value)} style={{ ...inputStyle, flex: "0 1 190px" }}>
            <option value="0">Sin redondeo</option>
            <option value="10">Redondear a $10</option>
            <option value="50">Redondear a $50</option>
            <option value="100">Redondear a $100</option>
          </select>
          <label style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={soloSubir} onChange={(e) => setSoloSubir(e.target.checked)} /> Solo subir (nunca bajar)
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
          <button onClick={aplicar} disabled={cambios.length === 0} style={{ ...btn("primario", "md"), opacity: cambios.length === 0 ? 0.5 : 1 }}>
            Aplicar {cambios.length} cambio{cambios.length !== 1 ? "s" : ""}
          </button>
          <button onClick={descargarEtiquetas} disabled={lista.length === 0} style={btn("secundario", "md")}>
            <Download size={15} /> Etiquetas PDF ({seleccionados.length > 0 ? `${seleccionados.length} tildados` : `${lista.length} de la lista`})
          </button>
          {Object.keys(manual).length > 0 && <button onClick={() => setManual({})} style={btn("secundario", "sm")}>Borrar precios escritos</button>}
          {msg && <span style={{ fontSize: 13, color: "#1B7A3E", fontWeight: 700 }}>{msg}</span>}
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #E1EAF4", borderRadius: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 620 }}>
          <thead>
            <tr style={{ background: "#F2F6FB", textAlign: "left", color: "#5B7791" }}>
              <th style={{ padding: 8, width: 30 }}><input type="checkbox" checked={todosSel} onChange={toggleTodos} /></th>
              <th style={{ padding: 8 }}>Producto</th>
              <th style={{ padding: 8, textAlign: "right" }}>Costo</th>
              <th style={{ padding: 8, textAlign: "right" }}>Precio</th>
              <th style={{ padding: 8, textAlign: "right" }}>Margen</th>
              <th style={{ padding: 8, textAlign: "right" }}>Precio nuevo</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={6} style={{ padding: 16, color: "#8AA2BC" }}>No hay productos con ese filtro.</td></tr>}
            {lista.map((p) => {
              const m = margenDe(p.cost, p.price);
              const ch = cambioDe(p.id);
              const nm = ch ? margenDe(p.cost, ch.price) : null;
              const bajo = p.cost > 0 && p.price < p.cost;
              const nBajo = ch && p.cost > 0 && ch.price < p.cost;
              return (
                <tr key={p.id} style={{ borderTop: "1px solid #EDF2F8", background: bajo ? "#FFF4F3" : "transparent" }}>
                  <td style={{ padding: 8 }}><input type="checkbox" checked={!!sel[p.id]} onChange={() => setSel({ ...sel, [p.id]: !sel[p.id] })} /></td>
                  <td style={{ padding: 8 }}>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#8AA2BC" }}>
                      {catName(p.categoryId)}{p.ultimoCosto > 0 && p.cost > 0 && p.ultimoCosto !== p.cost ? ` · última compra $${fmt(p.ultimoCosto)}` : ""}
                    </div>
                  </td>
                  <td style={{ padding: 8, textAlign: "right" }}>{p.cost > 0 ? `$${fmt(p.cost)}` : "—"}</td>
                  <td style={{ padding: 8, textAlign: "right", fontWeight: 700 }}>${fmt(p.price)}</td>
                  <td style={{ padding: 8, textAlign: "right", fontWeight: 700, color: bajo ? "#B3261E" : m !== null && m < MARGEN_MINIMO ? "#A85C06" : "#1B7A3E" }}>
                    {m === null ? "—" : `${m.toFixed(0)}%`}{bajo ? " ⚠️" : ""}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>
                    <input
                      type="number" min="0" value={manual[p.id] ?? ""}
                      onChange={(e) => setManual({ ...manual, [p.id]: e.target.value })}
                      placeholder={ch && manual[p.id] === undefined ? String(ch.price) : "escribir"}
                      style={{ ...inputStyle, width: 96, padding: "6px 8px", textAlign: "right", borderColor: ch ? (nBajo ? "#E8A09B" : "#9CC3F0") : undefined }}
                    />
                    {ch && <div style={{ fontSize: 11, fontWeight: 700, color: nBajo ? "#B3261E" : "#1B4F9C" }}>{nm === null ? "" : `margen ${nm.toFixed(0)}%`}{nBajo ? " ⚠️ bajo costo" : ""}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- Alertas de productos (botones que despliegan la lista) ----------------
const MARGEN_MINIMO = 30; // % sobre el costo (misma cuenta que el "Margen" que se ve en cada producto)

function calcularAlertas(products) {
  const margen = (p) => (p.cost > 0 && p.price > 0 ? ((p.price - p.cost) / p.cost) * 100 : null);
  const porNombre = (a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" });
  return [
    {
      id: "bajoCosto", label: "Vendiendo bajo el costo", critica: true,
      items: products.filter((p) => p.cost > 0 && precioVenta(p) > 0 && precioVenta(p) < p.cost).sort((a, b) => (precioVenta(a) - a.cost) - (precioVenta(b) - b.cost)),
      detalle: (p) => `Precio $${fmt(precioVenta(p))} < costo $${fmt(p.cost)} · perdés $${fmt(p.cost - precioVenta(p))} por unidad`,
    },
    {
      id: "sinStock", label: "Sin stock",
      items: products.filter((p) => (p.stock || 0) <= 0).sort(porNombre),
      detalle: () => "Stock: 0",
    },
    {
      id: "stockBajo", label: `Stock bajo (1 a ${LOW_STOCK})`,
      items: products.filter((p) => p.stock > 0 && p.stock <= LOW_STOCK).sort((a, b) => a.stock - b.stock || porNombre(a, b)),
      detalle: (p) => `Quedan ${p.stock}`,
    },
    {
      id: "sinPrecio", label: "Sin precio",
      items: products.filter((p) => !p.price || p.price <= 0).sort(porNombre),
      detalle: (p) => (p.cost > 0 ? `Costo $${fmt(p.cost)}` : "Sin precio ni costo"),
    },
    {
      id: "sinCosto", label: "Sin costo",
      items: products.filter((p) => p.price > 0 && (!p.cost || p.cost <= 0)).sort(porNombre),
      detalle: (p) => `Precio $${fmt(p.price)} · no se puede calcular la ganancia`,
    },
    {
      id: "margenBajo", label: `Margen menor a ${MARGEN_MINIMO}%`,
      items: products.filter((p) => { const m = margen(p); return m !== null && m >= 0 && m < MARGEN_MINIMO; }).sort((a, b) => margen(a) - margen(b)),
      detalle: (p) => `Margen ${margen(p).toFixed(0)}% · costo $${fmt(p.cost)} · precio $${fmt(p.price)}`,
    },
  ];
}

function AlertasProductos({ products, categories, onEdit, titulo }) {
  const [abierta, setAbierta] = useState(null);
  const [busq, setBusq] = useState("");
  const alertas = useMemo(() => calcularAlertas(products), [products]);
  const activa = alertas.find((a) => a.id === abierta) || null;
  const total = alertas.reduce((acc, a) => acc + a.items.length, 0);
  const catName = (id) => (categories || []).find((c) => c.id === id)?.name;
  const lista = activa ? buscar(activa.items, busq, (p) => p.name + " " + (catName(p.categoryId) || "") + " " + codigosDe(p).join(" ")) : [];

  return (
    <div style={{ marginBottom: 16 }}>
      {titulo && <div style={{ fontSize: 13, fontWeight: 800, color: "#5B7791", letterSpacing: 0.4, marginBottom: 8 }}>{titulo}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {alertas.map((a) => {
          const hay = a.items.length > 0;
          const sel = abierta === a.id;
          return (
            <button
              key={a.id}
              disabled={!hay}
              onClick={() => { setAbierta(sel ? null : a.id); setBusq(""); }}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, fontSize: 12.5, fontWeight: 700,
                border: sel ? "1.5px solid #A85C06" : hay ? (a.critica ? "1.5px solid #E8A09B" : "1px solid #FBE3B8") : "1px solid #E1EAF4",
                background: sel ? "#FDF0DC" : hay ? (a.critica ? "#FDECEC" : "#FFFBF2") : "#F6F9FE",
                color: hay ? (a.critica ? "#B3261E" : "#A85C06") : "#8AA2BC", opacity: hay ? 1 : 0.7, cursor: hay ? "pointer" : "default",
              }}
            >
              {hay && <CircleAlert size={14} />}
              {a.label} · {a.items.length}
            </button>
          );
        })}
      </div>
      {total === 0 && <div style={{ fontSize: 12, color: "#8AA2BC", marginTop: 8 }}>Todo en orden: no hay productos con alertas.</div>}

      {activa && (
        <div style={{ marginTop: 10, background: "#fff", border: "1px solid #FBE3B8", borderRadius: 12, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#A85C06" }}>{activa.label}: {activa.items.length} producto{activa.items.length !== 1 ? "s" : ""}</div>
            <button onClick={() => setAbierta(null)} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={16} /></button>
          </div>
          {activa.items.length > 6 && (
            <input value={busq} onChange={(e) => setBusq(e.target.value)} placeholder="Buscar dentro de esta lista..." style={{ ...inputStyle, marginBottom: 8 }} />
          )}
          <div style={{ maxHeight: 340, overflowY: "auto" }}>
            {lista.length === 0 && <div style={{ fontSize: 12.5, color: "#8AA2BC", padding: 8 }}>Ninguno coincide con la búsqueda.</div>}
            {lista.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #F1F5FA" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 11.5, color: "#8AA2BC" }}>
                    {catName(p.categoryId) ? catName(p.categoryId) + " · " : ""}{activa.detalle(p)}
                  </div>
                </div>
                {onEdit && (
                  <button onClick={() => onEdit(p)} style={{ ...btn("secundario", "sm"), flexShrink: 0 }}>
                    <Pencil size={13} /> Editar
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, warn }) {
  return (
    <div style={{ flex: 1, background: warn ? "#FDF0DC" : "#fff", border: "1px solid #E1EAF4", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 12, color: "#8AA2BC", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: warn ? "#A85C06" : "#10243D" }}>{value}</div>
    </div>
  );
}

function EmptyState({ text }) {
  return <div style={{ textAlign: "center", padding: "30px 16px", color: "#8AA2BC", fontSize: 13.5 }}>{text}</div>;
}

// ---------------- Resumen ----------------

function inRange(dateStr, range, desde, hasta) {
  const d = new Date(dateStr);
  const now = new Date();
  if (range === "hoy") return d.toDateString() === now.toDateString();
  if (range === "semana") {
    const start = new Date(now); start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0);
    return d >= start;
  }
  if (range === "mes") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (range === "personalizado") {
    if (desde) {
      const desdeDate = new Date(desde + "T00:00:00");
      if (d < desdeDate) return false;
    }
    if (hasta) {
      const hastaDate = new Date(hasta + "T23:59:59");
      if (d > hastaDate) return false;
    }
    return true;
  }
  return true;
}

function PresupuestosTab({ products, presupuestos, onGenerar, onVer, onEliminar }) {
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState({});
  const [cliente, setCliente] = useState("");
  const [validez, setValidez] = useState("7");

  const filtered = products
    .filter((p) => coincide(search, p.name))
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));

  const setQtyFor = (id, val) => {
    const n = Math.max(0, parseInt(val, 10) || 0);
    setQty({ ...qty, [id]: n });
  };

  const items = products
    .map((p) => ({ product: p, cantidad: qty[p.id] || 0 }))
    .filter((i) => i.cantidad > 0)
    .map((i) => ({ name: i.product.name, cantidad: i.cantidad, precio: precioVenta(i.product), subtotal: precioVenta(i.product) * i.cantidad }));

  const total = items.reduce((a, i) => a + i.subtotal, 0);

  const generar = () => {
    if (items.length === 0) return;
    onGenerar({ cliente: cliente.trim(), validez: parseInt(validez, 10) || 7, items, total });
    setQty({});
    setCliente("");
  };

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>Presupuestos</div>
      <div style={{ fontSize: 13.5, color: C.textoSuave, marginBottom: 18 }}>Elegí los artículos y cantidades, y generá el PDF para el cliente.</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={card()}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Cliente (opcional)" style={{ flex: 1, minWidth: 180 }}>
              <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre del cliente" style={inputStyle} />
            </Field>
            <Field label="Válido por (días)" style={{ width: 130 }}>
              <input type="number" min="1" value={validez} onChange={(e) => setValidez(e.target.value)} style={inputStyle} />
            </Field>
          </div>
        </div>

        <div style={card()}>
          <div style={{ position: "relative", marginBottom: 12 }}>
            <Search size={16} style={{ position: "absolute", left: 12, top: 14, color: C.textoTenue }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto..." style={{ ...inputStyle, paddingLeft: 36 }} />
          </div>
          <div style={{ maxHeight: 340, overflowY: "auto" }}>
            {filtered.length === 0 && <div style={{ textAlign: "center", padding: 20, fontSize: 13, color: C.textoTenue }}>No hay productos que coincidan.</div>}
            {filtered.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 4px", borderBottom: "1px solid #EDF2F8" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div style={{ fontSize: 11.5, color: C.textoTenue }}>${fmt(precioVenta(p))}{p.enOferta && <span style={{ textDecoration: "line-through", marginLeft: 5 }}>${fmt(p.price)}</span>}</div>
                </div>
                <input
                  type="number" min="0" value={qty[p.id] || ""} onChange={(e) => setQtyFor(p.id, e.target.value)}
                  placeholder="0" style={{ ...inputStyle, width: 64, padding: "6px 8px", textAlign: "center" }}
                />
              </div>
            ))}
          </div>
        </div>

        {items.length > 0 && (
          <div style={{ ...card(), background: C.azulSuave }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.textoSuave, marginBottom: 8 }}>RESUMEN</div>
            {items.map((it, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span>{it.cantidad} x {it.name}</span><span style={{ fontWeight: 600 }}>${fmt(it.subtotal)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, color: C.azul, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.azulBorde}` }}>
              <span>Total</span><span>${fmt(total)}</span>
            </div>
          </div>
        )}

        <button onClick={generar} disabled={items.length === 0} style={{ ...btn("primario", "lg"), opacity: items.length === 0 ? 0.5 : 1 }}>
          <ClipboardList size={18} /> Generar presupuesto
        </button>

        {presupuestos.length > 0 && (
          <div style={card()}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.textoSuave, marginBottom: 10 }}>PRESUPUESTOS GUARDADOS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {presupuestos.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 4px", borderBottom: "1px solid #EDF2F8", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>N° {String(p.numero).padStart(4, "0")}{p.cliente ? ` · ${p.cliente}` : ""}</div>
                    <div style={{ fontSize: 11.5, color: C.textoTenue }}>{new Date(p.fecha).toLocaleDateString("es-AR")} · ${fmt(p.total)}</div>
                  </div>
                  <button onClick={() => onVer(p)} style={btn("secundario", "sm")}>Ver / Imprimir</button>
                  <IconBtn danger onClick={() => { if (confirm(`¿Eliminar el presupuesto N° ${String(p.numero).padStart(4, "0")}?`)) onEliminar(p.id); }}><Trash2 size={13} /></IconBtn>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PresupuestoModal({ presupuesto, onClose }) {
  return (
    <Overlay onClose={onClose}>
      <style>{`@media print { @page { size: A4; margin: 15mm; } }`}</style>
      <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => window.print()} style={{ ...btn("primario", "lg"), flex: 1 }}>
          <Printer size={18} /> Imprimir / Guardar PDF
        </button>
        <button onClick={onClose} style={btn("secundario", "lg")}>Cerrar</button>
      </div>

      <div className="quote-print" style={{ maxWidth: 700, margin: "0 auto", background: "#fff", border: "1px solid #E1EAF4", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "20px 24px", borderBottom: `3px solid ${C.azul}` }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.azul }}>Agua y Jabón</div>
            <div style={{ fontSize: 12, color: C.textoSuave, marginTop: 2 }}>Artículos de limpieza</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>PRESUPUESTO</div>
            <div style={{ fontSize: 11.5, color: C.textoSuave, marginTop: 2 }}>
              N° {String(presupuesto.numero).padStart(4, "0")} · {new Date(presupuesto.fecha).toLocaleDateString("es-AR")}
            </div>
          </div>
        </div>

        {presupuesto.cliente && (
          <div style={{ padding: "12px 24px 0", fontSize: 13, color: C.textoSuave }}>
            Para: <b style={{ color: C.texto }}>{presupuesto.cliente}</b>
          </div>
        )}

        <div style={{ padding: "16px 24px" }}>
          <div style={{ display: "flex", fontSize: 12.5, fontWeight: 700, color: "#fff", background: C.azul, padding: "8px 10px", borderRadius: "6px 6px 0 0" }}>
            <div style={{ flex: 3 }}>Artículo</div>
            <div style={{ flex: 1, textAlign: "center" }}>Cant.</div>
            <div style={{ flex: 1, textAlign: "right" }}>P. unit.</div>
            <div style={{ flex: 1, textAlign: "right" }}>Subtotal</div>
          </div>
          {presupuesto.items.map((it, i) => (
            <div key={i} style={{ display: "flex", fontSize: 13, padding: "8px 10px", borderBottom: "1px solid #EDF2F8" }}>
              <div style={{ flex: 3 }}>{it.name}</div>
              <div style={{ flex: 1, textAlign: "center" }}>{it.cantidad}</div>
              <div style={{ flex: 1, textAlign: "right" }}>${fmt(it.precio)}</div>
              <div style={{ flex: 1, textAlign: "right", fontWeight: 600 }}>${fmt(it.subtotal)}</div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "baseline", gap: 12, padding: "14px 10px 4px" }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>TOTAL</div>
            <div style={{ fontSize: 19, fontWeight: 900, color: C.azul }}>${fmt(presupuesto.total)}</div>
          </div>
        </div>

        <div style={{ padding: "12px 24px 20px", borderTop: "1px solid #EDF2F8", fontSize: 11, color: C.textoTenue }}>
          Válido por {presupuesto.validez} día{presupuesto.validez !== 1 ? "s" : ""} desde la fecha de emisión. Precios sujetos a stock disponible.
        </div>
      </div>
    </Overlay>
  );
}

function ResumenTab({ sales, categories, employees, range, setRange, products, methodLabel }) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const pendingCount = sales.filter((s) => s.pending).length;
  const filtered = sales.filter((s) => inRange(s.date, range, desde, hasta) && !s.pending);
  const total = filtered.reduce((a, s) => a + s.total, 0);
  const count = filtered.length;

  // El costo de cada línea se toma del que quedó grabado en la venta (el que
  // realmente tenía ese stock cuando se vendió). Las ventas viejas, de antes
  // de que se empezara a guardar ese dato, usan el costo actual del producto
  // como aproximación — es lo único disponible para esas.
  const ganancia = filtered.reduce((acc, s) => {
    const gananciaBruta = s.items.reduce((a, i) => {
      let cost = i.cost;
      if (cost == null) {
        const prod = products.find((p) => p.id === i.productId);
        cost = prod && prod.cost ? prod.cost : 0;
      }
      return a + (i.price - cost) * i.qty;
    }, 0);
    return acc + gananciaBruta - (s.discountAmount || 0);
  }, 0);
  const hayCostos = products.some((p) => p.cost > 0) || sales.some((s) => s.items.some((i) => i.cost > 0));

  const byMethod = {};
  filtered.forEach((s) => { byMethod[s.method] = (byMethod[s.method] || 0) + s.total; });

  const byEmployee = {};
  filtered.forEach((s) => {
    const key = s.employeeName || "Sin asignar";
    byEmployee[key] = (byEmployee[key] || 0) + s.total;
  });

  const productAgg = {};
  filtered.forEach((s) => s.items.forEach((i) => {
    if (!productAgg[i.name]) productAgg[i.name] = { qty: 0, revenue: 0 };
    productAgg[i.name].qty += i.qty;
    productAgg[i.name].revenue += i.price * i.qty;
  }));
  const topProducts = Object.entries(productAgg).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);
  const maxRevenue = topProducts.length ? topProducts[0][1].revenue : 0;

  const catAgg = {};
  filtered.forEach((s) => s.items.forEach((i) => {
    const name = categories.find((c) => c.id === i.categoryId)?.name || "Sin categoría";
    catAgg[name] = (catAgg[name] || 0) + i.price * i.qty;
  }));
  const catEntries = Object.entries(catAgg).sort((a, b) => b[1] - a[1]);
  const maxCat = catEntries.length ? catEntries[0][1] : 0;

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto" }}>
        {[["hoy", "Hoy"], ["semana", "7 días"], ["mes", "Este mes"], ["todo", "Todo"], ["personalizado", "Elegir fechas"]].map(([id, label]) => (
          <Chip key={id} active={range === id} onClick={() => setRange(id)}>{label}</Chip>
        ))}
      </div>

      {range === "personalizado" && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <Field label="Desde" style={{ flex: 1, minWidth: 150 }}>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Hasta" style={{ flex: 1, minWidth: 150 }}>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={inputStyle} />
          </Field>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <MetricCard label="Ventas" value={count} />
        <MetricCard label="Total vendido" value={"$" + fmt(total)} />
      </div>
      {pendingCount > 0 && (
        <div style={{ marginBottom: 16 }}>
          <MetricCard label="Pedidos pendientes de cobro" value={pendingCount} warn />
        </div>
      )}
      {hayCostos && (
        <div style={{ marginBottom: 16 }}>
          <MetricCard label="Ganancia estimada" value={"$" + fmt(ganancia)} />
        </div>
      )}

      {count === 0 ? (
        <EmptyState text="No hay ventas registradas en este período." />
      ) : (
        <>
          {employees.length > 0 && (
            <Section title="Ventas por empleado">
              {Object.entries(byEmployee).sort((a, b) => b[1] - a[1]).map(([name, val]) => (
                <BarRow key={name} label={name} value={val} max={Math.max(...Object.values(byEmployee))} />
              ))}
            </Section>
          )}

          <Section title="Por forma de pago">
            {Object.entries(byMethod).sort((a, b) => b[1] - a[1]).map(([m, val]) => (
              <BarRow key={m} label={methodLabel[m] || m} value={val} max={Math.max(...Object.values(byMethod))} />
            ))}
          </Section>

          {catEntries.length > 0 && (
            <Section title="Por categoría">
              {catEntries.map(([name, val]) => (
                <BarRow key={name} label={name} value={val} max={maxCat} />
              ))}
            </Section>
          )}

          <Section title="Productos más vendidos">
            {topProducts.map(([name, data]) => (
              <div key={name} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                  <span style={{ fontWeight: 500 }}>{name} <span style={{ color: "#8AA2BC", fontWeight: 400 }}>x{data.qty}</span></span>
                  <span style={{ fontWeight: 700 }}>${fmt(data.revenue)}</span>
                </div>
                <div style={{ height: 6, background: "#EDF2F8", borderRadius: 4 }}>
                  <div style={{ height: 6, width: `${maxRevenue ? (data.revenue / maxRevenue) * 100 : 0}%`, background: "#1B4F9C", borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

// ---------------- Panel de control ----------------

function diasDesde(fecha) {
  const d = new Date(fecha);
  const now = new Date();
  return Math.max(0, Math.floor((now - d) / (1000 * 60 * 60 * 24)));
}

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIAS_LETRA = ["D", "L", "M", "X", "J", "V", "S"];
const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0]; // lunes a domingo
const mesKey = (d) => d.getFullYear() + "-" + d.getMonth();
const nombreMes = (y, m) => {
  const t = new Date(y, m, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const abrev = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(".0", "") + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(Math.round(n)));
const variacion = (a, b) => (b > 0 ? ((a - b) / b) * 100 : null);

function PanelTab({ sales, categories, products, onEditProduct, methodLabel, onDescargarReporte }) {
  const hoy = new Date();
  const [ventana, setVentana] = useState(30); // días para calcular rotación
  const [origenF, setOrigenF] = useState("todos");
  const [pagoF, setPagoF] = useState("todos");
  const [catF, setCatF] = useState("todas");
  const [diasGrafico, setDiasGrafico] = useState(30);
  const [semanasProm, setSemanasProm] = useState(8); // 0 = todo el historial
  const [mesA, setMesA] = useState(mesKey(hoy));
  const [mesB, setMesB] = useState(mesKey(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)));
  const [modoComparar, setModoComparar] = useState("acumulado"); // "acumulado" | "diario"
  const [ordenProd, setOrdenProd] = useState("unidades"); // "unidades" | "ingresos" | "ganancia"
  const [busqProd, setBusqProd] = useState("");
  const [verTodosDias, setVerTodosDias] = useState(false);

  // Ventas "reales": todo lo que ya salió de stock y no corre riesgo de cancelarse
  // (los pedidos del catálogo todavía sin confirmar por el negocio se excluyen).
  const ventasValidas = useMemo(
    () => sales.filter((s) => !(s.origen === "catalogo" && !s.confirmado) && !s.pending),
    [sales]
  );

  const productoDe = useMemo(() => {
    const m = {};
    products.forEach((p) => { m[p.id] = p; });
    return m;
  }, [products]);

  const costoItem = (i) => {
    if (i.cost != null) return i.cost;
    const p = productoDe[i.productId];
    return p && p.cost ? p.cost : 0;
  };
  const categoriaItem = (i) => {
    if (i.categoryId != null) return i.categoryId;
    const p = productoDe[i.productId];
    return p ? p.categoryId : null;
  };

  // Una "línea" por venta que pasa los filtros (origen, forma de pago, categoría),
  // con el monto y la ganancia ya calculados para ese filtro.
  const lineas = useMemo(() => {
    const out = [];
    ventasValidas.forEach((s) => {
      if (origenF !== "todos" && (s.origen || "mostrador") !== origenF) return;
      if (pagoF !== "todos" && s.method !== pagoF) return;
      let items = s.items;
      let monto, ganancia;
      if (catF !== "todas") {
        items = s.items.filter((i) => categoriaItem(i) === catF);
        if (items.length === 0) return;
        monto = items.reduce((a, i) => a + i.price * i.qty, 0);
        ganancia = items.reduce((a, i) => a + (i.price - costoItem(i)) * i.qty, 0);
      } else {
        monto = s.total;
        ganancia = s.items.reduce((a, i) => a + (i.price - costoItem(i)) * i.qty, 0) - (s.discountAmount || 0);
      }
      out.push({ s, fecha: new Date(s.date), monto, ganancia, items });
    });
    return out;

  }, [ventasValidas, origenF, pagoF, catF, productoDe]);

  const hayCostos = products.some((p) => p.cost > 0) || sales.some((s) => s.items.some((i) => i.cost > 0));
  const hayFiltros = origenF !== "todos" || pagoF !== "todos" || catF !== "todas";
  const limpiarFiltros = () => { setOrigenF("todos"); setPagoF("todos"); setCatF("todas"); };

  // ---- estadística por día de la semana (promedio por cada lunes, martes, etc.) ----
  const statsSemana = useMemo(() => {
    const fin = new Date(); fin.setHours(0, 0, 0, 0);
    let ini = new Date(fin);
    if (semanasProm > 0) {
      ini.setDate(ini.getDate() - semanasProm * 7 + 1);
    } else {
      const min = lineas.reduce((m, l) => (!m || l.fecha < m ? l.fecha : m), null);
      ini = min ? new Date(min.getFullYear(), min.getMonth(), min.getDate()) : fin;
    }
    const ocurr = [0, 0, 0, 0, 0, 0, 0];
    for (let d = new Date(ini); d <= fin; d.setDate(d.getDate() + 1)) ocurr[d.getDay()]++;
    const tot = [0, 0, 0, 0, 0, 0, 0], cant = [0, 0, 0, 0, 0, 0, 0], gan = [0, 0, 0, 0, 0, 0, 0];
    lineas.forEach((l) => {
      if (l.fecha < ini) return;
      const dow = l.fecha.getDay();
      tot[dow] += l.monto; cant[dow]++; gan[dow] += l.ganancia;
    });
    const filas = ORDEN_SEMANA.map((dow) => ({
      dow, nombre: DIAS_SEMANA[dow], corto: DIAS_CORTO[dow], total: tot[dow], ventas: cant[dow], ganancia: gan[dow],
      ocurr: ocurr[dow], prom: ocurr[dow] > 0 ? tot[dow] / ocurr[dow] : 0,
    }));
    const totalAll = tot.reduce((a, b) => a + b, 0);
    const ventasAll = cant.reduce((a, b) => a + b, 0);
    const diasAll = ocurr.reduce((a, b) => a + b, 0);
    const ranking = filas.filter((f) => f.prom > 0).sort((a, b) => b.prom - a.prom);
    const fuertes = ranking.slice(0, 2).map((f) => f.dow);
    const flojo = ranking.length >= 4 ? ranking[ranking.length - 1].dow : null;
    return { filas, totalAll, ventasAll, promGeneral: diasAll > 0 ? totalAll / diasAll : 0, ranking, fuertes, flojo };
  }, [lineas, semanasProm]);

  // ---- ventas por día (últimos N días), con el día de la semana ----
  const dailySeries = useMemo(() => {
    const porDia = {};
    lineas.forEach((l) => {
      const k = l.fecha.toDateString();
      if (!porDia[k]) porDia[k] = { monto: 0, ganancia: 0, n: 0 };
      porDia[k].monto += l.monto;
      porDia[k].ganancia += l.ganancia;
      porDia[k].n++;
    });
    const days = [];
    for (let i = diasGrafico - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dow = d.getDay();
      const dato = porDia[d.toDateString()] || { monto: 0, ganancia: 0, n: 0 };
      days.push({
        label: String(d.getDate()),
        sub: diasGrafico > 16 ? DIAS_LETRA[dow] : DIAS_CORTO[dow],
        titulo: `${DIAS_SEMANA[dow]} ${d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}`,
        ventas: dato.n,
        ganancia: dato.ganancia,
        value: dato.monto,
        color: statsSemana.fuertes.includes(dow) ? "#1A9E5C" : "#1B4F9C",
      });
    }
    return days;
  }, [lineas, diasGrafico, statsSemana.fuertes]);
  const totalPeriodo = dailySeries.reduce((a, d) => a + d.value, 0);
  const promDiaPeriodo = dailySeries.length ? totalPeriodo / dailySeries.length : 0;
  const lineasPeriodo = useMemo(() => {
    const desde = new Date(); desde.setHours(0, 0, 0, 0); desde.setDate(desde.getDate() - diasGrafico + 1);
    return lineas.filter((l) => l.fecha >= desde);
  }, [lineas, diasGrafico]);
  const gananciaPeriodo = lineasPeriodo.reduce((a, l) => a + l.ganancia, 0);
  const ticketPeriodo = lineasPeriodo.length ? lineasPeriodo.reduce((a, l) => a + l.monto, 0) / lineasPeriodo.length : 0;

  // ---- comparar dos meses ----
  const opcionesMes = useMemo(() => {
    const out = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      out.push({ key: mesKey(d), label: nombreMes(d.getFullYear(), d.getMonth()) });
    }
    return out;

  }, []);
  const resumenMes = (key) => {
    const [y, m] = key.split("-").map(Number);
    const dias = new Date(y, m + 1, 0).getDate();
    const arr = new Array(dias).fill(0);
    let total = 0, n = 0, gan = 0;
    lineas.forEach((l) => {
      if (l.fecha.getFullYear() === y && l.fecha.getMonth() === m) {
        arr[l.fecha.getDate() - 1] += l.monto;
        total += l.monto; n++; gan += l.ganancia;
      }
    });
    return { y, m, dias, arr, total, n, gan, ticket: n ? total / n : 0, nombre: nombreMes(y, m) };
  };
  const A = useMemo(() => resumenMes(mesA), [lineas, mesA]);
  const B = useMemo(() => resumenMes(mesB), [lineas, mesB]);
  const aEsMesActual = mesA === mesKey(hoy);
  const diaHoy = hoy.getDate();
  const parcialB = B.arr.slice(0, diaHoy).reduce((a, b) => a + b, 0);

  const monthlySeries = useMemo(() => {
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const total = lineas
        .filter((l) => l.fecha.getMonth() === d.getMonth() && l.fecha.getFullYear() === d.getFullYear())
        .reduce((a, l) => a + l.monto, 0);
      months.push({ label: d.toLocaleDateString("es-AR", { month: "short" }).replace(".", ""), full: `${nombreMes(d.getFullYear(), d.getMonth())}: vendiste $${fmt(total)}`, value: total, color: "#1B4F9C" });
    }
    return months;

  }, [lineas]);

  // ---- rotación de productos ----
  const rotacion = useMemo(() => {
    const desde = new Date();
    desde.setDate(desde.getDate() - ventana);
    const map = {};
    lineas.forEach((l) => {
      if (l.fecha < desde) return;
      l.items.forEach((i) => {
        if (!map[i.productId]) map[i.productId] = { qty: 0, ingresos: 0, ganancia: 0 };
        map[i.productId].qty += i.qty;
        map[i.productId].ingresos += i.price * i.qty;
        map[i.productId].ganancia += (i.price - costoItem(i)) * i.qty;
      });
    });
    return map;

  }, [lineas, ventana]);

  // Para "sin movimiento" se miran todas las ventas (sin importar origen ni forma de pago).
  const ultimaVenta = useMemo(() => {
    const desde = new Date();
    desde.setDate(desde.getDate() - ventana);
    const map = {};
    ventasValidas.forEach((s) => {
      const fecha = new Date(s.date);
      s.items.forEach((i) => {
        if (!map[i.productId]) map[i.productId] = { enVentana: false, ultima: null };
        if (fecha >= desde) map[i.productId].enVentana = true;
        if (!map[i.productId].ultima || fecha > map[i.productId].ultima) map[i.productId].ultima = fecha;
      });
    });
    return map;
  }, [ventasValidas, ventana]);

  const stockInfo = useMemo(() => {
    let capitalCosto = 0;
    let capitalCostoParcial = false;
    let valorVenta = 0;
    let gananciaPotencial = 0;
    let unidades = 0;
    const porCategoria = {};
    products.forEach((p) => {
      if (!p.stock || p.stock <= 0) return;
      unidades += p.stock;
      const costoStock = costoStockProducto(p);
      if (costoStock > 0) {
        capitalCosto += costoStock;
        gananciaPotencial += precioVenta(p) * p.stock - costoStock;
      } else {
        capitalCostoParcial = true;
      }
      valorVenta += precioVenta(p) * p.stock;
      const catName = categories.find((c) => c.id === p.categoryId)?.name || "Sin categoría";
      const valorCat = costoStock > 0 ? costoStock : precioVenta(p) * p.stock;
      porCategoria[catName] = (porCategoria[catName] || 0) + valorCat;
    });
    return { capitalCosto, capitalCostoParcial, valorVenta, gananciaPotencial, unidades, porCategoria };
  }, [products, categories]);

  const productosEnFiltro = catF === "todas" ? products : products.filter((p) => p.categoryId === catF);

  const ranking = productosEnFiltro
    .map((p) => ({ p, r: rotacion[p.id] || { qty: 0, ingresos: 0, ganancia: 0 } }))
    .filter((x) => x.r.qty > 0)
    .filter((x) => coincide(busqProd, x.p.name));
  const claveOrden = ordenProd === "ingresos" ? "ingresos" : ordenProd === "ganancia" ? "ganancia" : "qty";
  ranking.sort((a, b) => b.r[claveOrden] - a.r[claveOrden]);
  const altaRotacion = ranking.slice(0, 15);
  const maxAlta = altaRotacion.length ? Math.max(1, altaRotacion[0].r[claveOrden]) : 1;

  const sinMovimientoAll = productosEnFiltro
    .filter((p) => p.stock > 0 && !(ultimaVenta[p.id] && ultimaVenta[p.id].enVentana))
    .map((p) => { const c = costoStockProducto(p); return { p, ultima: ultimaVenta[p.id] ? ultimaVenta[p.id].ultima : null, capital: c > 0 ? c : precioVenta(p) * p.stock }; })
    .filter((x) => coincide(busqProd, x.p.name))
    .sort((a, b) => b.capital - a.capital);
  const sinMovimiento = sinMovimientoAll.slice(0, 12);

  const maxCat = Math.max(1, ...Object.values(stockInfo.porCategoria));
  const categoriasOrd = categories.slice().sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));

  const Delta = ({ a, b, invertir }) => {
    const v = variacion(a, b);
    if (v === null) return <span style={{ fontSize: 11.5, color: "#8AA2BC" }}>{b === 0 && a > 0 ? "nuevo" : "—"}</span>;
    const sube = v >= 0;
    const bueno = invertir ? !sube : sube;
    return (
      <span style={{ fontSize: 12, fontWeight: 700, color: Math.abs(v) < 0.5 ? "#8AA2BC" : bueno ? "#1A7A44" : "#C0392B" }}>
        {sube ? "▲" : "▼"} {Math.abs(v).toFixed(0)}%
      </span>
    );
  };

  const filaComparar = (label, a, b, esPlata = true) => (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr auto", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F1F5FA", fontSize: 13 }}>
      <span style={{ color: "#5B7791" }}>{label}</span>
      <span style={{ fontWeight: 700, color: "#1B4F9C" }}>{esPlata ? "$" + fmt(a) : a}</span>
      <span style={{ fontWeight: 700, color: "#5B7791" }}>{esPlata ? "$" + fmt(b) : b}</span>
      <Delta a={a} b={b} />
    </div>
  );

  return (
    <div>
      {onDescargarReporte && (
        <div style={{ background: "#F6F9FE", border: "1px solid #DBE6F2", borderRadius: 12, padding: 12, marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 240px" }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "#10243D" }}>Reporte para analizar con Claude</div>
            <div style={{ fontSize: 12, color: "#5B7791", marginTop: 2 }}>
              Descarga un archivo liviano con el resumen de tu negocio (ventas, productos, stock, alertas). Subilo a un chat de Claude y te dice qué está pasando y cómo vender más.
            </div>
          </div>
          <button onClick={onDescargarReporte} style={btn("primario")}><Download size={15} /> Descargar reporte</button>
        </div>
      )}
      <AlertasProductos products={products} categories={categories} onEdit={onEditProduct} titulo="ALERTAS DE PRODUCTOS (tocá una para ver cuáles son)" />

      {/* ---- filtros globales ---- */}
      <div style={{ background: "#fff", border: "1px solid #E1EAF4", borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#5B7791", letterSpacing: 0.4 }}>FILTROS (afectan los gráficos de ventas)</span>
          {hayFiltros && <button onClick={limpiarFiltros} style={{ border: "none", background: "none", color: "#1B4F9C", fontSize: 12, fontWeight: 700 }}>Limpiar filtros</button>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "#8AA2BC", alignSelf: "center", minWidth: 62 }}>Origen</span>
          {[["todos", "Todos"], ["mostrador", "Mostrador"], ["catalogo", "Catálogo web"], ["mayorista", "Mayoristas"]].map(([k, l]) => (
            <Chip key={k} active={origenF === k} onClick={() => setOrigenF(k)}>{l}</Chip>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "#8AA2BC", alignSelf: "center", minWidth: 62 }}>Pago</span>
          <Chip active={pagoF === "todos"} onClick={() => setPagoF("todos")}>Todos</Chip>
          {Object.keys(methodLabel || {}).map((m) => (
            <Chip key={m} active={pagoF === m} onClick={() => setPagoF(m)}>{methodLabel[m]}</Chip>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#8AA2BC", minWidth: 62 }}>Categoría</span>
          <select value={catF} onChange={(e) => setCatF(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
            <option value="todas">Todas las categorías</option>
            {categoriasOrd.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* ---- ventas por día ---- */}
      <Section title="Ventas por día">
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {[14, 30, 60, 90].map((d) => <Chip key={d} active={diasGrafico === d} onClick={() => setDiasGrafico(d)}>Últimos {d} días</Chip>)}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <MetricCard label="Vendido en el período" value={"$" + fmt(totalPeriodo)} />
          <MetricCard label="Promedio por día" value={"$" + fmt(promDiaPeriodo)} />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <MetricCard label="Ventas realizadas" value={lineasPeriodo.length} />
          <MetricCard label="Ticket promedio" value={"$" + fmt(ticketPeriodo)} />
          {hayCostos && <MetricCard label="Ganancia del período" value={"$" + fmt(gananciaPeriodo)} />}
        </div>
        <MiniBarChart data={dailySeries} avg={promDiaPeriodo} mostrarGanancia={hayCostos} showEvery={diasGrafico <= 14 ? 1 : diasGrafico <= 30 ? 2 : diasGrafico <= 60 ? 5 : 10} />
        <div style={{ fontSize: 11.5, color: "#8AA2BC", marginTop: 6 }}>Pasá el mouse o tocá una barra para ver lo vendido ese día.</div>
        <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: "#8AA2BC", marginTop: 8, flexWrap: "wrap" }}>
          <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#1A9E5C", borderRadius: 2, marginRight: 4 }} />Días fuertes de la semana</span>
          <span><span style={{ display: "inline-block", width: 14, borderTop: "2px dashed #A85C06", marginRight: 4, verticalAlign: "middle" }} />Promedio diario</span>
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#5B7791", marginBottom: 6 }}>Detalle día por día</div>
          <div style={{ display: "grid", gridTemplateColumns: hayCostos ? "1.4fr 0.6fr 1fr 1fr" : "1.4fr 0.6fr 1fr", gap: 8, fontSize: 11.5, fontWeight: 700, color: "#8AA2BC", paddingBottom: 4 }}>
            <span>Día</span><span>Ventas</span><span style={{ textAlign: "right" }}>Vendido</span>{hayCostos && <span style={{ textAlign: "right" }}>Ganancia</span>}
          </div>
          {dailySeries.slice().reverse().slice(0, verTodosDias ? dailySeries.length : 10).map((d, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: hayCostos ? "1.4fr 0.6fr 1fr 1fr" : "1.4fr 0.6fr 1fr", gap: 8, padding: "7px 0", borderTop: "1px solid #F1F5FA", fontSize: 13, opacity: d.value > 0 ? 1 : 0.5 }}>
              <span style={{ fontWeight: 600 }}>{d.titulo}</span>
              <span>{d.ventas}</span>
              <span style={{ textAlign: "right", fontWeight: 700 }}>${fmt(d.value)}</span>
              {hayCostos && <span style={{ textAlign: "right", fontWeight: 700, color: d.ganancia >= 0 ? "#1A7A44" : "#C0392B" }}>${fmt(d.ganancia)}</span>}
            </div>
          ))}
          {dailySeries.length > 10 && (
            <button onClick={() => setVerTodosDias((v) => !v)} style={{ ...btn("secundario", "sm"), width: "100%", marginTop: 8 }}>
              {verTodosDias ? "Ver menos" : `Ver los ${dailySeries.length} días`}
            </button>
          )}
        </div>
      </Section>

      {/* ---- día de la semana ---- */}
      <Section title="¿Qué días de la semana se vende más?">
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {[[4, "4 semanas"], [8, "8 semanas"], [12, "12 semanas"], [0, "Todo el historial"]].map(([v, l]) => (
            <Chip key={v} active={semanasProm === v} onClick={() => setSemanasProm(v)}>{l}</Chip>
          ))}
        </div>
        {statsSemana.ventasAll === 0 ? (
          <EmptyState text="Todavía no hay ventas en este período con estos filtros." />
        ) : (
          <>
            {statsSemana.fuertes.length > 0 && (
              <div style={{ background: "#E9F7EF", border: "1px solid #BFE8CE", color: "#1A7A44", borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>
                Tus días más fuertes son <b>{statsSemana.fuertes.map((d) => DIAS_SEMANA[d]).join(" y ")}</b>
                {" "}(en promedio ${fmt(statsSemana.ranking[0].prom)} por {DIAS_SEMANA[statsSemana.ranking[0].dow].toLowerCase()}).
                {statsSemana.flojo !== null && <> El más flojo es <b>{DIAS_SEMANA[statsSemana.flojo]}</b>: buen día para promociones.</>}
              </div>
            )}
            {statsSemana.ventasAll < 20 && (
              <div style={{ fontSize: 12, color: "#A85C06", marginBottom: 10 }}>
                Hay pocas ventas en este período ({statsSemana.ventasAll}); los promedios se van a ir afinando a medida que cargues más.
              </div>
            )}
            <MiniBarChart
              data={statsSemana.filas.map((f) => ({
                label: f.corto, value: f.prom, full: `${f.nombre}: promedio $${fmt(f.prom)} (${f.ventas} ventas en ${f.ocurr} ${f.nombre.toLowerCase()}s)`,
                color: statsSemana.fuertes.includes(f.dow) ? "#1A9E5C" : "#1B4F9C",
              }))}
              avg={statsSemana.promGeneral} height={120} showValues
            />
            <div style={{ fontSize: 11.5, color: "#8AA2BC", margin: "6px 0 10px" }}>
              Cada barra es lo que vendés en promedio un día así (no el total). La línea punteada es el promedio general de todos los días.
            </div>
            {statsSemana.filas.slice().sort((a, b) => b.prom - a.prom).map((f) => (
              <div key={f.dow} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #F1F5FA", fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>
                  {f.nombre}
                  {statsSemana.fuertes.includes(f.dow) && <span style={{ marginLeft: 6, fontSize: 10.5, background: "#E9F7EF", color: "#1A7A44", borderRadius: 6, padding: "1px 6px", fontWeight: 700 }}>DÍA FUERTE</span>}
                  {statsSemana.flojo === f.dow && <span style={{ marginLeft: 6, fontSize: 10.5, background: "#FDF0DC", color: "#A85C06", borderRadius: 6, padding: "1px 6px", fontWeight: 700 }}>MÁS FLOJO</span>}
                </span>
                <span style={{ textAlign: "right" }}>
                  <b>${fmt(f.prom)}</b> <span style={{ color: "#8AA2BC", fontSize: 11.5 }}>prom. · {f.ventas} ventas{statsSemana.totalAll > 0 ? ` · ${((f.total / statsSemana.totalAll) * 100).toFixed(0)}% del total` : ""}</span>
                </span>
              </div>
            ))}
          </>
        )}
      </Section>

      {/* ---- comparar meses ---- */}
      <Section title="Comparar meses">
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <div style={{ fontSize: 11.5, color: "#1B4F9C", fontWeight: 700, marginBottom: 3 }}>● Mes A</div>
            <select value={mesA} onChange={(e) => setMesA(e.target.value)} style={inputStyle}>
              {opcionesMes.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <div style={{ fontSize: 11.5, color: "#8AA2BC", fontWeight: 700, marginBottom: 3 }}>● Mes B (contra el que comparás)</div>
            <select value={mesB} onChange={(e) => setMesB(e.target.value)} style={inputStyle}>
              {opcionesMes.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr auto", gap: 8, fontSize: 11.5, fontWeight: 700, color: "#8AA2BC", paddingBottom: 4 }}>
          <span></span><span style={{ color: "#1B4F9C" }}>{A.nombre}</span><span>{B.nombre}</span><span>Cambio</span>
        </div>
        {filaComparar("Vendido", A.total, B.total)}
        {filaComparar("Cantidad de ventas", A.n, B.n, false)}
        {filaComparar("Ticket promedio", A.ticket, B.ticket)}
        {hayCostos && filaComparar("Ganancia", A.gan, B.gan)}
        {aEsMesActual && mesA !== mesB && (
          <div style={{ fontSize: 12.5, color: "#5B7791", background: "#F6F9FE", borderRadius: 10, padding: "8px 12px", margin: "10px 0" }}>
            Mismo período (del 1 al {diaHoy}): {A.nombre} lleva <b>${fmt(A.total)}</b> contra <b>${fmt(parcialB)}</b> de {B.nombre} hasta el día {diaHoy} <Delta a={A.total} b={parcialB} />
          </div>
        )}

        <div style={{ display: "flex", gap: 6, margin: "12px 0 8px" }}>
          <Chip active={modoComparar === "acumulado"} onClick={() => setModoComparar("acumulado")}>Acumulado</Chip>
          <Chip active={modoComparar === "diario"} onClick={() => setModoComparar("diario")}>Día por día</Chip>
        </div>
        <CompareChart a={A} b={B} modo={modoComparar} hoyDia={aEsMesActual ? diaHoy : null} />
      </Section>

      <Section title="Ventas por mes (últimos 12 meses)">
        <MiniBarChart data={monthlySeries} showEvery={1} showValues height={110} />
      </Section>

      {/* ---- stock y capital ---- */}
      <Section title="Stock y capital">
        <div style={{ display: "flex", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
          <MetricCard label="Capital invertido en stock" value={"$" + fmt(stockInfo.capitalCosto)} />
          <MetricCard label="Valor de venta del stock" value={"$" + fmt(stockInfo.valorVenta)} />
        </div>
        {stockInfo.capitalCostoParcial && (
          <div style={{ fontSize: 11.5, color: "#8AA2BC", margin: "6px 0 10px" }}>
            * Hay productos sin costo cargado; para esos se usó el precio de venta en el cálculo.
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
          {hayCostos && <MetricCard label="Ganancia potencial (si vendés todo el stock)" value={"$" + fmt(stockInfo.gananciaPotencial)} />}
          <MetricCard label="Productos sin movimiento" value={sinMovimientoAll.length} warn={sinMovimientoAll.length > 0} />
        </div>
      </Section>

      {/* ---- productos ---- */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "18px 0 10px", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#5B7791" }}>Productos, ventana de:</span>
        {[30, 60, 90].map((d) => (
          <Chip key={d} active={ventana === d} onClick={() => setVentana(d)}>{d} días</Chip>
        ))}
      </div>
      <input value={busqProd} onChange={(e) => setBusqProd(e.target.value)} placeholder="Buscar un producto en estas listas..." style={{ ...inputStyle, marginBottom: 10 }} />

      <Section title="Alta rotación (lo que más sale)">
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#8AA2BC", alignSelf: "center" }}>Ordenar por</span>
          <Chip active={ordenProd === "unidades"} onClick={() => setOrdenProd("unidades")}>Unidades</Chip>
          <Chip active={ordenProd === "ingresos"} onClick={() => setOrdenProd("ingresos")}>Lo que facturó</Chip>
          {hayCostos && <Chip active={ordenProd === "ganancia"} onClick={() => setOrdenProd("ganancia")}>Ganancia</Chip>}
        </div>
        {altaRotacion.length === 0 ? (
          <EmptyState text="Todavía no hay ventas suficientes en esta ventana con estos filtros." />
        ) : (
          altaRotacion.map(({ p, r }) => (
            <div key={p.id} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3, gap: 8 }}>
                <span style={{ fontWeight: 500 }}>
                  {p.name}{p.stock <= 0 && <span style={{ marginLeft: 6, fontSize: 10.5, background: "#FDECEC", color: "#B3261E", borderRadius: 6, padding: "1px 6px", fontWeight: 700 }}>SIN STOCK</span>}
                </span>
                <span style={{ fontWeight: 700, textAlign: "right" }}>
                  {r.qty} un. · ${fmt(r.ingresos)}{hayCostos && <span style={{ color: r.ganancia >= 0 ? "#1A7A44" : "#C0392B" }}> · gan. ${fmt(r.ganancia)}</span>}
                </span>
              </div>
              <div style={{ height: 6, background: "#EDF2F8", borderRadius: 4 }}>
                <div style={{ height: 6, width: `${Math.max(2, (r[claveOrden] / maxAlta) * 100)}%`, background: "#1B4F9C", borderRadius: 4 }} />
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title="Sin movimiento (candidatos a oferta)">
        {sinMovimientoAll.length === 0 ? (
          <EmptyState text="No hay productos con stock que no se hayan vendido en esta ventana. ¡Buena rotación!" />
        ) : (
          <>
            <div style={{ fontSize: 12, color: "#8AA2BC", marginBottom: 10 }}>
              Tienen stock pero no se vendieron en los últimos {ventana} días. Ordenados por cuánto capital tenés inmovilizado en cada uno
              {sinMovimientoAll.length > sinMovimiento.length ? ` (se muestran los ${sinMovimiento.length} con más capital de ${sinMovimientoAll.length} en total)` : ""}.
            </div>
            {sinMovimiento.map(({ p, ultima, capital }) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F1F5FA", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 11.5, color: "#8AA2BC" }}>
                    Stock: {p.stock} · {ultima ? `Última venta hace ${diasDesde(ultima)} días` : "Nunca se vendió"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "#A85C06" }}>${fmt(capital)}</div>
                  {onEditProduct && <button onClick={() => onEditProduct(p)} style={btn("secundario", "sm")}><Pencil size={13} /></button>}
                </div>
              </div>
            ))}
          </>
        )}
      </Section>

      {Object.keys(stockInfo.porCategoria).length > 0 && (
        <Section title="Capital en stock por categoría">
          {Object.entries(stockInfo.porCategoria).sort((a, b) => b[1] - a[1]).map(([name, val]) => (
            <BarRow key={name} label={name} value={val} max={maxCat} />
          ))}
        </Section>
      )}
    </div>
  );
}

// Gráfico de barras simple. Cada dato: { label, sub?, value, color?, full? }.
// `avg` dibuja una línea punteada con el promedio; `showValues` escribe el
// monto arriba de cada barra.
function MiniBarChart({ data, color = "#1B4F9C", showEvery = 1, avg = null, height = 90, showValues = false, mostrarGanancia = false }) {
  const max = Math.max(1, ...data.map((d) => d.value), avg || 0);
  const [sel, setSel] = useState(null);
  const idx = sel !== null && sel < data.length ? sel : data.length - 1; // por defecto, la última barra (hoy)
  const dSel = data[idx];
  const textoDe = (d) => {
    if (d.titulo) {
      return `${d.titulo}: vendiste $${fmt(d.value)}` + (d.ventas !== undefined ? ` en ${d.ventas} venta${d.ventas !== 1 ? "s" : ""}` : "") + (mostrarGanancia && d.ganancia !== undefined ? ` · ganancia $${fmt(d.ganancia)}` : "");
    }
    return d.full || `${d.label}: $${fmt(d.value)}`;
  };
  return (
    <div>
      {dSel && (
        <div style={{ background: "#F6F9FE", border: "1px solid #E1EAF4", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 600, color: "#10243D", marginBottom: 10, minHeight: 20 }}>
          {textoDe(dSel)}
        </div>
      )}
      <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 3, height }}>
        {data.map((d, i) => (
          <div key={i} title={textoDe(d)} onMouseEnter={() => setSel(i)} onClick={() => setSel(i)} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", minWidth: 0, cursor: "pointer", opacity: i === idx ? 1 : 0.8 }}>
            {showValues && d.value > 0 && <div style={{ fontSize: 9, color: "#5B7791", marginBottom: 2, whiteSpace: "nowrap" }}>{abrev(d.value)}</div>}
            <div style={{
              width: "100%", minHeight: d.value > 0 ? 3 : 0, height: `${(d.value / max) * (showValues ? 85 : 100)}%`,
              background: d.color || color, borderRadius: "3px 3px 0 0",
            }} />
          </div>
        ))}
        {avg > 0 && (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: `${(avg / max) * (showValues ? 85 : 100)}%`, borderTop: "2px dashed #A85C06", pointerEvents: "none", opacity: 0.8 }} />
        )}
      </div>
      <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 9.5, color: "#8AA2BC", lineHeight: 1.25, minWidth: 0 }}>
            {d.sub && <div style={{ fontWeight: 700, color: d.color && d.color !== color ? d.color : "#5B7791" }}>{d.sub}</div>}
            <div>{i % showEvery === 0 || data.length <= 12 ? d.label : ""}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Compara dos meses: acumulado (línea que va sumando día a día) o día por día (barras dobles).
function CompareChart({ a, b, modo, hoyDia }) {
  const dias = Math.max(a.dias, b.dias);
  const acum = (arr, limite) => { let t = 0; return Array.from({ length: dias }, (_, i) => (i < arr.length && i < limite ? (t += arr[i]) : null)); };
  const limA = hoyDia ? hoyDia : a.dias;
  const accA = acum(a.arr, limA);
  const accB = acum(b.arr, b.dias);
  const maxV = Math.max(1, ...accA.filter((v) => v !== null), ...accB.filter((v) => v !== null), ...(modo === "diario" ? a.arr.concat(b.arr) : []));
  const W = 100, H = 56;
  const x = (i) => (dias <= 1 ? 0 : (i / (dias - 1)) * W);
  const y = (v) => H - (v / maxV) * H;
  const poly = (serie) => serie.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(" ");
  return (
    <div>
      {modo === "acumulado" ? (
        <svg viewBox={`0 0 ${W} ${H + 2}`} preserveAspectRatio="none" style={{ width: "100%", height: 130, overflow: "visible" }}>
          <polyline points={poly(accB)} fill="none" stroke="#9FB3C8" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          <polyline points={poly(accA)} fill="none" stroke="#1B4F9C" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
        </svg>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 1.5, height: 110 }}>
          {Array.from({ length: dias }, (_, i) => (
            <div key={i} title={`Día ${i + 1}: ${a.nombre} $${fmt(a.arr[i] || 0)} · ${b.nombre} $${fmt(b.arr[i] || 0)}`} style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", gap: 1 }}>
              <div style={{ flex: 1, height: `${((a.arr[i] || 0) / maxV) * 100}%`, minHeight: a.arr[i] > 0 ? 2 : 0, background: "#1B4F9C", borderRadius: "2px 2px 0 0" }} />
              <div style={{ flex: 1, height: `${((b.arr[i] || 0) / maxV) * 100}%`, minHeight: b.arr[i] > 0 ? 2 : 0, background: "#9FB3C8", borderRadius: "2px 2px 0 0" }} />
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "#8AA2BC", marginTop: 4 }}>
        <span>día 1</span><span>día {Math.ceil(dias / 2)}</span><span>día {dias}</span>
      </div>
      <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: "#5B7791", marginTop: 6, flexWrap: "wrap" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#1B4F9C", borderRadius: 2, marginRight: 4 }} />{a.nombre}</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#9FB3C8", borderRadius: 2, marginRight: 4 }} />{b.nombre}</span>
      </div>
    </div>
  );
}

// ---------------- Cargar stock (compras) ----------------

function CargarStockTab({ products, compras, onCargar }) {
  const [search, setSearch] = useState("");
  const [seleccionado, setSeleccionado] = useState(null);
  const [qty, setQty] = useState("");
  const [costo, setCosto] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const norm = (s) => (s || "").toLowerCase();
  const resultados = search.trim()
    ? buscar(products, search, (p) => p.name + " " + codigosDe(p).join(" "), { ordenar: true }).slice(0, 8)
    : [];

  const elegirProducto = (p) => {
    setSeleccionado(p);
    setSearch("");
    setQty("");
    setCosto(p.ultimoCosto || p.cost ? String(p.ultimoCosto || p.cost) : "");
  };

  const registrar = () => {
    const qtyNum = parseInt(qty, 10);
    const costoNum = parseFloat(costo);
    if (!seleccionado || !qtyNum || qtyNum <= 0 || isNaN(costoNum) || costoNum < 0) return;
    onCargar(seleccionado.id, qtyNum, costoNum);
    const enCola = lotesEfectivos(seleccionado).filter((l) => l.qty > 0);
    const hayAnteriores = enCola.length > 0 && enCola[0].costoUnitario !== costoNum;
    setOkMsg(`Se cargaron ${qtyNum} un. de "${seleccionado.name}" a $${fmt(costoNum)} c/u.` + (hayAnteriores ? ` Primero se venden las ${enCola.reduce((a, l) => a + l.qty, 0)} que ya tenías (desde $${fmt(enCola[0].costoUnitario)}); el costo del producto cambia solo cuando se agoten.` : ""));
    setTimeout(() => setOkMsg(""), 3500);
    setSeleccionado(null);
    setQty("");
    setCosto("");
  };

  const totalInvertidoHistorial = compras.reduce((a, c) => a + (c.total || 0), 0);

  return (
    <div>
      <div style={{ fontSize: 12.5, color: "#8AA2BC", marginBottom: 14 }}>
        Registrá acá cada vez que compres o repongas mercadería, con el costo real al que la compraste. Así, si el mismo
        artículo lo comprás después más caro o más barato, las ventas que ya hiciste con el costo viejo no cambian:
        primero se descuenta lo más viejo, y el precio nuevo se aplica recién cuando eso se termine.
      </div>

      {!seleccionado ? (
        <div style={{ marginBottom: 16 }}>
          <Field label="Buscar producto">
            <input
              autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre o código de barras..." style={inputStyle}
            />
          </Field>
          {resultados.length > 0 && (
            <div style={{ marginTop: 8, border: "1px solid #E1EAF4", borderRadius: 12, overflow: "hidden" }}>
              {resultados.map((p) => (
                <button key={p.id} onClick={() => elegirProducto(p)} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%",
                  padding: "10px 12px", background: "#fff", border: "none", borderBottom: "1px solid #F1F5FA", textAlign: "left",
                }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{p.name}</span>
                  <span style={{ fontSize: 12, color: "#8AA2BC" }}>Stock: {p.stock} {p.cost > 0 ? `· Costo: $${fmt(p.cost)}` : ""}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #E1EAF4", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{seleccionado.name}</div>
              <div style={{ fontSize: 12, color: "#8AA2BC" }}>Stock actual: {seleccionado.stock}</div>
            </div>
            <button onClick={() => setSeleccionado(null)} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={18} /></button>
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <Field label="Cantidad que entró" style={{ flex: 1 }}>
              <input autoFocus type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" style={inputStyle} />
            </Field>
            <Field label="Costo unitario" style={{ flex: 1 }}>
              <input type="number" min="0" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="0.00" style={inputStyle} />
            </Field>
          </div>
          {qty && costo && !isNaN(parseFloat(costo)) && (
            <div style={{ fontSize: 12.5, color: "#5B7791", marginBottom: 10 }}>
              Total de esta carga: <strong>${fmt((parseInt(qty, 10) || 0) * parseFloat(costo))}</strong>
            </div>
          )}
          <button onClick={registrar} style={{ ...btn("primario", "lg"), width: "100%" }}>
            <PackagePlus size={16} /> Registrar carga
          </button>
        </div>
      )}

      {okMsg && (
        <div style={{ background: "#E9F7EF", color: "#1A7A44", border: "1px solid #BFE8CE", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>
          {okMsg}
        </div>
      )}

      <Section title={`Historial de cargas${compras.length > 0 ? ` · $${fmt(totalInvertidoHistorial)} invertidos en total` : ""}`}>
        {compras.length === 0 ? (
          <EmptyState text="Todavía no registraste ninguna carga de stock." />
        ) : (
          compras.slice(0, 50).map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F1F5FA" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.productName}</div>
                <div style={{ fontSize: 11.5, color: "#8AA2BC" }}>
                  {new Date(c.date).toLocaleString("es-AR")} · {c.qty} un. a ${fmt(c.costoUnitario)}
                </div>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>${fmt(c.total)}</div>
            </div>
          ))
        )}
      </Section>
    </div>
  );
}

// ---------------- Mayoristas ----------------
// Panel aparte para vender a mayoristas: tiene sus propios artículos y su
// propio stock, que NO tocan el stock de la tienda ni aparecen en el
// catálogo público. Las ventas que se generan acá sí quedan registradas
// junto con el resto (misma lista de "sales"), así que suman en "Cómo
// vamos" y en el Panel de control como cualquier otra venta.

function MayoristasTab({ productosMayoristas, products, sales, methodLabel, methodIcon, onGuardarProducto, onEliminarProducto, onVender, onDeleteVenta, onMarcarPagado }) {
  const [vista, setVista] = useState("vender"); // "vender" | "articulos"
  const [form, setForm] = useState(null); // artículo en edición/alta

  const ventasMayoristas = sales.filter((s) => s.origen === "mayorista");
  const totalVendidoHistorico = ventasMayoristas.filter((s) => !s.pending).reduce((a, s) => a + s.total, 0);
  const totalPendiente = ventasMayoristas.filter((s) => s.pending).reduce((a, s) => a + s.total, 0);
  const [payingId, setPayingId] = useState(null);
  const [payChoice, setPayChoice] = useState("efectivo");

  return (
    <div>
      <div style={{ fontSize: 12.5, color: "#8AA2BC", marginBottom: 14 }}>
        Podés vender un artículo propio de mayoristas (no se mezcla con "Productos" ni aparece en el catálogo online),
        o algo que ya tengas en stock de la tienda, a otro precio. Lo que vendas acá siempre suma en "Cómo vamos" y en
        el Panel de control, como cualquier otra venta.
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        <Chip active={vista === "vender"} onClick={() => setVista("vender")}>Vender</Chip>
        <Chip active={vista === "articulos"} onClick={() => setVista("articulos")}>Artículos mayoristas</Chip>
      </div>

      {vista === "articulos" && (
        <ArticulosMayoristasPanel
          productos={productosMayoristas}
          form={form} setForm={setForm}
          onGuardar={onGuardarProducto} onEliminar={onEliminarProducto}
        />
      )}

      {vista === "vender" && (
        <>
          <VentaMayoristaPanel
            productosMayoristas={productosMayoristas} products={products}
            methodLabel={methodLabel} methodIcon={methodIcon}
            onVender={onVender}
          />

          <div style={{ marginTop: 20 }}>
            <Section title={`Ventas a mayoristas${ventasMayoristas.length > 0 ? ` · $${fmt(totalVendidoHistorico)} cobrado` : ""}${totalPendiente > 0 ? ` · $${fmt(totalPendiente)} por cobrar` : ""}`}>
              {ventasMayoristas.length === 0 ? (
                <EmptyState text="Todavía no registraste ventas a mayoristas." />
              ) : (
                ventasMayoristas.slice(0, 30).map((s) => (
                  <div key={s.id} style={{ padding: "8px 0", borderBottom: "1px solid #F1F5FA", background: s.pending ? "#FFFBF2" : "transparent" }}>
                   <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {s.items.map((i) => `${i.qty}x ${i.name}`).join(", ")}
                        {s.cliente ? ` · ${s.cliente}` : ""}
                      </div>
                      <div style={{ fontSize: 11.5, color: "#8AA2BC" }}>
                        {new Date(s.date).toLocaleString("es-AR")} · {s.pending ? <b style={{ color: "#A85C06" }}>PENDIENTE DE PAGO</b> : (methodLabel[s.method] || s.method)}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: s.pending ? "#A85C06" : "inherit" }}>${fmt(s.total)}</div>
                      <IconBtn danger onClick={() => { if (confirm("¿Eliminar esta venta a mayorista? Esto devuelve el stock del artículo.")) onDeleteVenta(s.id); }}>
                        <Trash2 size={13} />
                      </IconBtn>
                    </div>
                   </div>
                   {s.pending && (payingId === s.id ? (
                     <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                       <select value={payChoice} onChange={(e) => setPayChoice(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 120 }}>
                         {Object.keys(methodLabel).map((m) => <option key={m} value={m}>{methodLabel[m]}</option>)}
                       </select>
                       <button onClick={() => { onMarcarPagado(s.id, payChoice); setPayingId(null); }} style={btn("primario", "sm")}>Confirmar cobro</button>
                       <button onClick={() => setPayingId(null)} style={btn("terciario", "sm")}>Cancelar</button>
                     </div>
                   ) : (
                     <button onClick={() => { setPayingId(s.id); setPayChoice("efectivo"); }} style={{ ...btn("secundario", "sm"), marginTop: 8 }}>
                       <Check size={13} /> Marcar como cobrado
                     </button>
                   ))}
                  </div>
                ))
              )}
            </Section>
          </div>
        </>
      )}
    </div>
  );
}

function ArticulosMayoristasPanel({ productos, form, setForm, onGuardar, onEliminar }) {
  return (
    <div>
      {!form ? (
        <button onClick={() => setForm({ name: "", price: "", cost: "", stock: "" })} style={{ ...btn("primario"), marginBottom: 14 }}>
          <Plus size={15} /> Agregar artículo mayorista
        </button>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #E1EAF4", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{form.id ? "Editar artículo" : "Nuevo artículo mayorista"}</div>
            <button onClick={() => setForm(null)} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={18} /></button>
          </div>
          <Field label="Nombre" style={{ marginBottom: 10 }}>
            <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre del artículo" style={inputStyle} />
          </Field>
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <Field label="Costo" style={{ flex: 1 }}>
              <input type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="0.00" style={inputStyle} />
            </Field>
            <Field label="Precio mayorista" style={{ flex: 1 }}>
              <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" style={inputStyle} />
            </Field>
          </div>
          <Field label="Stock" style={{ marginBottom: 14 }}>
            <input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="0" style={inputStyle} />
          </Field>
          <button onClick={() => { onGuardar(form); setForm(null); }} style={{ ...btn("primario", "lg"), width: "100%" }}>
            Guardar
          </button>
        </div>
      )}

      {productos.length === 0 ? (
        <EmptyState text="Todavía no cargaste ningún artículo mayorista." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {productos.map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: "1px solid #E1EAF4", borderRadius: 12, padding: "10px 14px" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: "#8AA2BC" }}>
                  Stock: {p.stock} · Costo: ${fmt(p.cost)} · Precio: ${fmt(p.price)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <IconBtn onClick={() => setForm({ id: p.id, name: p.name, price: String(p.price), cost: String(p.cost || ""), stock: String(p.stock || 0) })}><Pencil size={13} /></IconBtn>
                <IconBtn danger onClick={() => { if (confirm(`¿Eliminar "${p.name}"? Esto no borra las ventas ya hechas.`)) onEliminar(p.id); }}><Trash2 size={13} /></IconBtn>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VentaMayoristaPanel({ productosMayoristas, products, methodLabel, methodIcon, onVender }) {
  const [source, setSource] = useState("mayorista"); // "mayorista" | "stock"
  const [productId, setProductId] = useState("");
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [cart, setCart] = useState([]); // líneas ya agregadas a esta venta
  const [method, setMethod] = useState(null);
  const [cliente, setCliente] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const lista = source === "mayorista" ? productosMayoristas : products;
  const producto = lista.find((p) => p.id === productId) || null;

  const norm = (s) => (s || "").toLowerCase();
  const resultadosStock = source === "stock" && search.trim()
    ? buscar(products, search, (p) => p.name + " " + codigosDe(p).join(" "), { ordenar: true }).slice(0, 8)
    : [];

  const limpiarLinea = () => {
    setProductId(""); setSearch(""); setQty(""); setPrice(""); setCost("");
  };

  const cambiarFuente = (nueva) => {
    setSource(nueva);
    limpiarLinea();
  };

  const elegirProducto = (p) => {
    setProductId(p.id);
    setSearch("");
    setPrice(String(p.price || ""));
    setCost(p.cost ? String(p.cost) : "");
  };

  const qtyNum = parseInt(qty, 10) || 0;
  const priceNum = parseFloat(price) || 0;
  const lineaTotal = qtyNum * priceNum;

  // Cuánto de este mismo artículo ya está puesto en el carrito, para avisar
  // bien si entre todas las líneas se pasa del stock disponible.
  const qtyEnCarrito = producto
    ? cart.filter((l) => l.source === source && l.productId === producto.id).reduce((a, l) => a + l.qty, 0)
    : 0;
  const alcanzaStock = producto && qtyNum > 0 && (qtyEnCarrito + qtyNum) <= (producto.stock || 0);

  // Costo que se va a usar para calcular la ganancia de esta línea.
  // En "stock" sale siempre del FIFO real del producto (no se puede tocar a
  // mano, para no desincronizar con el resto del sistema de costeo) —
  // simulando primero lo que ya se consumió en otras líneas de este mismo
  // carrito; en "mayorista" es el que se carga/edita acá mismo.
  const costNum = parseFloat(cost) || 0;
  const costoPreviewStock = source === "stock" && producto && qtyNum > 0
    ? consumirFIFO(
        qtyEnCarrito > 0 ? { ...producto, lotes: consumirFIFO(producto, qtyEnCarrito).lotes } : producto,
        qtyNum
      ).costoUnitarioPromedio
    : 0;
  const costoEfectivo = source === "stock" ? costoPreviewStock : costNum;
  const gananciaLinea = producto && qtyNum > 0 ? (priceNum - costoEfectivo) * qtyNum : 0;

  const agregarAlCarrito = () => {
    if (!producto || !qtyNum || qtyNum <= 0 || isNaN(priceNum) || priceNum < 0) return;
    setCart([...cart, {
      key: uid(),
      source,
      productId: producto.id,
      name: producto.name,
      qty: qtyNum,
      price: priceNum,
      cost: source === "mayorista" ? costNum : costoPreviewStock,
      stockDisponible: producto.stock || 0,
    }]);
    limpiarLinea();
  };

  const quitarDelCarrito = (key) => setCart(cart.filter((l) => l.key !== key));

  const totalCarrito = cart.reduce((a, l) => a + l.price * l.qty, 0);
  const gananciaCarrito = cart.reduce((a, l) => a + (l.price - (l.cost || 0)) * l.qty, 0);

  const confirmar = async (pendiente = false) => {
    if (cart.length === 0 || (!pendiente && !method)) return;
    if (pendiente && !cliente.trim()) return;
    const resumen = cart.map((l) => `${l.qty}x ${l.name}`).join(", ");
    await onVender({ cart: cart.map((l) => ({ source: l.source, productId: l.productId, qty: l.qty, price: l.price, cost: l.cost })), method, cliente, pending: pendiente });
    setOkMsg(pendiente
      ? `Pedido de ${cliente.trim()} guardado como PENDIENTE DE PAGO: ${resumen} · $${fmt(totalCarrito)}`
      : `Venta registrada: ${resumen} · $${fmt(totalCarrito)}`);
    setTimeout(() => setOkMsg(""), 4000);
    setCart([]); setMethod(null); setCliente(""); limpiarLinea();
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #E1EAF4", borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#1B4F9C", marginBottom: 10 }}>Agregar artículo a la venta</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <Chip active={source === "mayorista"} onClick={() => cambiarFuente("mayorista")}>Artículo mayorista</Chip>
        <Chip active={source === "stock"} onClick={() => cambiarFuente("stock")}>Del stock de la tienda</Chip>
      </div>

      {source === "mayorista" ? (
        productosMayoristas.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "#8AA2BC", marginBottom: 14 }}>
            Todavía no cargaste artículos mayoristas. Andá a "Artículos mayoristas" para agregar el primero, o vendé desde el stock de la tienda.
          </div>
        ) : (
          <Field label="Artículo" style={{ marginBottom: 10 }}>
            <select value={productId} onChange={(e) => elegirProducto(productosMayoristas.find((p) => p.id === e.target.value))} style={inputStyle}>
              <option value="">Elegí un artículo...</option>
              {productosMayoristas.map((p) => <option key={p.id} value={p.id}>{p.name} (stock: {p.stock})</option>)}
            </select>
          </Field>
        )
      ) : (
        <div style={{ marginBottom: 10 }}>
          {producto ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#F6F9FE", borderRadius: 10, padding: "10px 12px" }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{producto.name}</div>
                <div style={{ fontSize: 12, color: "#8AA2BC" }}>Stock en la tienda: {producto.stock} · Precio normal: ${fmt(producto.price)}</div>
              </div>
              <button onClick={() => { setProductId(""); setPrice(""); }} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={18} /></button>
            </div>
          ) : (
            <>
              <Field label="Buscar producto de la tienda">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre o código de barras..." style={inputStyle} />
              </Field>
              {resultadosStock.length > 0 && (
                <div style={{ marginTop: 8, border: "1px solid #E1EAF4", borderRadius: 12, overflow: "hidden" }}>
                  {resultadosStock.map((p) => (
                    <button key={p.id} onClick={() => elegirProducto(p)} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%",
                      padding: "10px 12px", background: "#fff", border: "none", borderBottom: "1px solid #F1F5FA", textAlign: "left",
                    }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{p.name}</span>
                      <span style={{ fontSize: 12, color: "#8AA2BC" }}>Stock: {p.stock} · ${fmt(p.price)}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <Field label="Cantidad" style={{ flex: 1 }}>
          <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" style={inputStyle} />
        </Field>
        <Field label={source === "stock" ? "Precio al que lo vendés" : "Precio por unidad"} style={{ flex: 1 }}>
          <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" style={inputStyle} />
        </Field>
      </div>

      {producto && source === "mayorista" && (
        <Field label="Costo de esta compra (lo que te costó a vos)" style={{ marginBottom: 10 }}>
          <input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" style={inputStyle} />
        </Field>
      )}
      {producto && source === "stock" && qtyNum > 0 && (
        <div style={{ fontSize: 12, color: "#8AA2BC", marginBottom: 10 }}>
          Costo real de ese stock (FIFO): ${fmt(costoPreviewStock)} por unidad — se calcula solo, no se puede editar.
        </div>
      )}

      {producto && qtyNum > 0 && !alcanzaStock && (
        <div style={{ fontSize: 12, color: "#A85C06", marginBottom: 10 }}>
          Ojo: entre esto y lo que ya tenés en el carrito son {qtyEnCarrito + qtyNum} y {source === "stock" ? "el producto tiene" : "el artículo tiene"} {producto.stock} en stock.
        </div>
      )}

      {producto && qtyNum > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "0 0 10px" }}>
          <span style={{ fontSize: 12, color: "#8AA2BC" }}>Ganancia estimada de este artículo</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: gananciaLinea >= 0 ? "#1A7A44" : "#C0392B" }}>${fmt(gananciaLinea)}</span>
        </div>
      )}

      <button onClick={agregarAlCarrito} disabled={!producto || !qtyNum} style={{ ...btn("secundario", "lg"), width: "100%", opacity: producto && qtyNum ? 1 : 0.5, marginBottom: 4 }}>
        <Plus size={15} /> Agregar a la venta
      </button>

      {cart.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #E1EAF4" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1B4F9C", marginBottom: 8 }}>Esta venta ({cart.length} artículo{cart.length > 1 ? "s" : ""})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {cart.map((l) => (
              <div key={l.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#F6F9FE", borderRadius: 10, padding: "8px 12px" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{l.qty}x {l.name}</div>
                  <div style={{ fontSize: 11.5, color: "#8AA2BC" }}>
                    {l.source === "stock" ? "Del stock" : "Mayorista"} · ${fmt(l.price)} c/u
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>${fmt(l.price * l.qty)}</div>
                  <button onClick={() => quitarDelCarrito(l.key)} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={16} /></button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "10px 0" }}>
            <span style={{ fontSize: 14, color: "#5B7791", fontWeight: 600 }}>TOTAL</span>
            <span style={{ fontSize: 24, fontWeight: 800, color: "#1B4F9C" }}>${fmt(totalCarrito)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "-4px 0 10px" }}>
            <span style={{ fontSize: 12, color: "#8AA2BC" }}>Ganancia estimada de toda la venta</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: gananciaCarrito >= 0 ? "#1A7A44" : "#C0392B" }}>${fmt(gananciaCarrito)}</span>
          </div>

          <Field label="Cliente (opcional)" style={{ marginBottom: 10 }}>
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre del mayorista..." style={inputStyle} />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
            {Object.keys(methodLabel).map((m) => {
              const Icon = methodIcon[m];
              const active = method === m;
              return (
                <button key={m} onClick={() => setMethod(m)} style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 6px",
                  borderRadius: 10, fontSize: 12.5, border: active ? "1.5px solid #1B4F9C" : "1px solid #DBE6F2",
                  background: active ? "#E4ECFB" : "#fff", color: active ? "#1B4F9C" : "#5B7791", fontWeight: active ? 700 : 500,
                }}>
                  <Icon size={13} /> {methodLabel[m]}
                </button>
              );
            })}
          </div>

          <button onClick={() => confirmar(false)} disabled={!method} style={{ ...btn("primario", "lg"), width: "100%", opacity: method ? 1 : 0.5 }}>
            {!method ? "Elegí una forma de pago" : `Registrar venta cobrada · $${fmt(totalCarrito)}`}
          </button>
          <div style={{ textAlign: "center", fontSize: 12, color: "#8AA2BC", margin: "8px 0" }}>— o, si todavía no paga —</div>
          <button onClick={() => confirmar(true)} disabled={!cliente.trim()} style={{ ...btn("secundario", "lg"), width: "100%", opacity: cliente.trim() ? 1 : 0.5 }}>
            <Banknote size={16} /> {cliente.trim() ? "Dejar pendiente de pago" : "Poné el nombre del cliente para dejarlo pendiente"}
          </button>
          <div style={{ fontSize: 11.5, color: "#8AA2BC", marginTop: 6 }}>
            Pendiente: el stock se descuenta ya, pero no suma a lo vendido ni a la caja hasta que lo marques como cobrado.
          </div>
        </div>
      )}

      {okMsg && (
        <div style={{ background: "#E9F7EF", color: "#1A7A44", border: "1px solid #BFE8CE", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginTop: 10 }}>
          {okMsg}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E1EAF4", borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#5B7791", marginBottom: 10 }}>{title.toUpperCase()}</div>
      {children}
    </div>
  );
}
function BarRow({ label, value, max }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
        <span>{label}</span><span style={{ fontWeight: 700 }}>${fmt(value)}</span>
      </div>
      <div style={{ height: 6, background: "#EDF2F8", borderRadius: 4 }}>
        <div style={{ height: 6, width: `${max ? (value / max) * 100 : 0}%`, background: "#1B4F9C", borderRadius: 4 }} />
      </div>
    </div>
  );
}

// ---------------- Historial ----------------

function HistorialTab({ sales, onView, onDelete, methodLabel, onMarcarPagado, onConfirmar }) {
  const [payingId, setPayingId] = useState(null);
  const [payMethodChoice, setPayMethodChoice] = useState("efectivo");
  const totalHoy = sales.filter((s) => new Date(s.date).toDateString() === new Date().toDateString() && !s.pending).reduce((a, s) => a + s.total, 0);
  const sinConfirmar = sales.filter((s) => s.origen === "catalogo" && !s.confirmado);
  const pendientes = sales.filter((s) => s.pending && !(s.origen === "catalogo" && !s.confirmado));
  const cobradas = sales.filter((s) => !s.pending);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <MetricCard label="Ventas totales" value={cobradas.length} />
        <MetricCard label="Vendido hoy" value={"$" + fmt(totalHoy)} />
      </div>

      {sinConfirmar.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.rojo, marginBottom: 8 }}>PEDIDOS NUEVOS DEL CATÁLOGO (SIN CONFIRMAR)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sinConfirmar.map((s) => (
              <div key={s.id} style={{ background: "#FDECEC", border: "1px solid #F0C9C9", borderRadius: 12, padding: "10px 12px" }}>
                <button onClick={() => onView(s)} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>Pedido #{s.number}{s.cliente ? ` · ${s.cliente}` : ""}</div>
                    <div style={{ fontSize: 12, color: "#8AA2BC" }}>
                      {new Date(s.date).toLocaleString("es-AR")}
                      {s.metodoPrevisto ? ` · Eligió: ${methodLabel[s.metodoPrevisto] || s.metodoPrevisto}` : ""}
                    </div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.rojo }}>${fmt(s.total)}</div>
                </button>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => onConfirmar(s.id)} style={{ ...btn("primario", "sm"), flex: 1 }}>
                    <Check size={13} /> Confirmar pedido
                  </button>
                  <IconBtn danger onClick={() => { if (confirm(`¿Eliminar el pedido #${s.number}? Esto devuelve el stock.`)) onDelete(s.id); }}><Trash2 size={13} /></IconBtn>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pendientes.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#A85C06", marginBottom: 8 }}>PEDIDOS PENDIENTES DE COBRO</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pendientes.map((s) => (
              <div key={s.id} style={{ background: "#FFFBF2", border: "1px solid #FBE3B8", borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={() => onView(s)} style={{ flex: 1, textAlign: "left", background: "none", border: "none", padding: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>Pedido #{s.number}{s.origen === "mayorista" ? " (mayorista)" : ""}{s.cliente ? ` · ${s.cliente}` : ""}</div>
                      <div style={{ fontSize: 12, color: "#8AA2BC" }}>{new Date(s.date).toLocaleString("es-AR")}{s.employeeName ? ` · ${s.employeeName}` : ""}</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#A85C06", marginRight: 8 }}>${fmt(s.total)}</div>
                  </button>
                  <IconBtn danger onClick={() => { if (confirm(`¿Eliminar el pedido #${s.number}? Esto devuelve el stock.`)) onDelete(s.id); }}><Trash2 size={13} /></IconBtn>
                </div>
                {payingId === s.id ? (
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <select value={payMethodChoice} onChange={(e) => setPayMethodChoice(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 120 }}>
                      {Object.keys(methodLabel).map((m) => <option key={m} value={m}>{methodLabel[m]}</option>)}
                    </select>
                    <button onClick={() => { onMarcarPagado(s.id, payMethodChoice); setPayingId(null); }} style={btn("primario", "sm")}>Confirmar cobro</button>
                    <button onClick={() => setPayingId(null)} style={btn("terciario", "sm")}>Cancelar</button>
                  </div>
                ) : (
                  <button onClick={() => { setPayingId(s.id); setPayMethodChoice(s.metodoPrevisto || "efectivo"); }} style={{ ...btn("secundario", "sm"), width: "100%", marginTop: 8 }}>
                    <DollarSign size={13} /> Marcar como pagado
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {cobradas.length === 0 && pendientes.length === 0 && sinConfirmar.length === 0 && <EmptyState text="Todavía no registraste ninguna venta." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {cobradas.map((s) => (
          <div key={s.id} style={{ background: "#fff", border: "1px solid #E1EAF4", borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => onView(s)} style={{ flex: 1, textAlign: "left", background: "none", border: "none", padding: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  Comprobante #{s.number}
                  {s.origen === "mayorista" && (
                    <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: "#1B4F9C", background: "#E4ECFB", borderRadius: 999, padding: "2px 7px" }}>
                      MAYORISTA{s.cliente ? ` · ${s.cliente}` : ""}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "#8AA2BC" }}>
                  {new Date(s.date).toLocaleString("es-AR")} · {methodLabel[s.method]}{s.employeeName ? ` · ${s.employeeName}` : ""}
                  {s.paidAt ? " · pedido pagado al entregar" : ""}
                </div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1B4F9C", marginRight: 8 }}>${fmt(s.total)}</div>
            </button>
            <IconBtn
              danger
              onClick={() => {
                const msg = s.origen === "mayorista"
                  ? `¿Eliminar el comprobante #${s.number}? Esto devuelve el stock al artículo mayorista.`
                  : `¿Eliminar el comprobante #${s.number}? Esto devuelve el stock vendido a los productos.`;
                if (confirm(msg)) onDelete(s.id);
              }}
            >
              <Trash2 size={13} />
            </IconBtn>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Equipo ----------------

function EquipoTab({ employees, openNew, openEdit, onDelete }) {
  return (
    <div>
      <button onClick={openNew} style={{ ...btn("primario", "lg"), width: "100%", marginBottom: 14 }}>
        <Plus size={16} /> Agregar empleado
      </button>
      {employees.length === 0 && <EmptyState text="Sin empleados cargados. Mientras no haya ninguno, la app se usa sin selección de usuario." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {employees.map((e) => (
          <div key={e.id} style={{ background: "#fff", border: "1px solid #E1EAF4", borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#E4ECFB", color: "#1B4F9C", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>
              {e.name.slice(0, 1).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{e.name}</div>
              <div style={{ fontSize: 12, color: "#8AA2BC" }}>{e.pin ? "Con PIN" : "Sin PIN"}</div>
            </div>
            <IconBtn onClick={() => openEdit(e)}><Pencil size={13} /></IconBtn>
            <IconBtn danger onClick={() => { if (confirm(`¿Eliminar a "${e.name}"?`)) onDelete(e.id); }}><Trash2 size={13} /></IconBtn>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Caja ----------------

function CajaTab({ cajaActual, cajaHistorial, sales, onAbrir, onCerrar, onExport }) {
  const [openAmount, setOpenAmount] = useState("");
  const [countedAmount, setCountedAmount] = useState("");

  const ventasEfectivoActual = cajaActual
    ? sales.filter((s) => s.method === "efectivo" && new Date(s.date) >= new Date(cajaActual.openedAt)).reduce((a, s) => a + s.total, 0)
    : 0;
  const esperadoActual = cajaActual ? cajaActual.openingAmount + ventasEfectivoActual : 0;

  return (
    <div>
      <button onClick={onExport} style={{ ...btn("secundario"), width: "100%", marginBottom: 16 }}>
        <FileSpreadsheet size={15} /> Exportar movimientos a Excel
      </button>

      {!cajaActual ? (
        <div style={card()}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Abrir caja</div>
          <Field label="Efectivo con el que arrancás el turno">
            <input type="number" min="0" step="0.01" value={openAmount} onChange={(e) => setOpenAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
          </Field>
          <button
            onClick={() => { const amt = parseFloat(openAmount) || 0; onAbrir(amt); setOpenAmount(""); }}
            style={{ ...btn("primario", "lg"), width: "100%" }}
          >
            Abrir caja
          </button>
        </div>
      ) : (
        <div style={{ ...card(), marginBottom: 16 }}>
          <div style={{ fontSize: 12.5, color: "#1B4F9C", fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <Banknote size={14} /> Caja abierta desde {new Date(cajaActual.openedAt).toLocaleString("es-AR")}
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <MetricCard label="Apertura" value={"$" + fmt(cajaActual.openingAmount)} />
            <MetricCard label="Ventas efectivo" value={"$" + fmt(ventasEfectivoActual)} />
          </div>
          <div style={{ fontSize: 13, color: "#5B7791", marginBottom: 10 }}>Efectivo esperado en caja: <b>${fmt(esperadoActual)}</b></div>
          <Field label="Efectivo contado al cerrar">
            <input type="number" min="0" step="0.01" value={countedAmount} onChange={(e) => setCountedAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
          </Field>
          <button
            onClick={() => {
              const amt = parseFloat(countedAmount) || 0;
              onCerrar(amt);
              setCountedAmount("");
            }}
            style={{ ...btn("primario", "lg"), width: "100%" }}
          >
            Cerrar caja
          </button>
        </div>
      )}

      {cajaHistorial.length > 0 && (
        <Section title="Historial de cajas">
          {cajaHistorial.map((c) => (
            <div key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid #EDF2F8" }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{new Date(c.openedAt).toLocaleDateString("es-AR")}{c.employeeName ? ` · ${c.employeeName}` : ""}</div>
              <div style={{ fontSize: 12, color: "#8AA2BC" }}>
                Apertura ${fmt(c.openingAmount)} · Esperado ${fmt(c.esperado)} · Contado ${fmt(c.counted)}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: c.diferencia === 0 ? "#1B4F9C" : c.diferencia > 0 ? "#1B4F9C" : "#B0242A" }}>
                Diferencia: {c.diferencia >= 0 ? "+" : ""}${fmt(c.diferencia)}
              </div>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

// ---------------- Avisos ----------------

function AvisosTab({ observaciones, currentUser, onAdd, onDelete }) {
  const [text, setText] = useState("");
  return (
    <div>
      <div style={{ background: "#fff", border: "1px solid #E1EAF4", borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <textarea
          value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Ej: esta semana el detergente 500ml tiene 15% de descuento..."
          style={{ ...inputStyle, minHeight: 70, resize: "vertical", marginBottom: 10 }}
        />
        <button
          onClick={() => { onAdd(text); setText(""); }}
          style={{ ...btn("primario", "lg"), width: "100%" }}
        >
          Publicar aviso
        </button>
      </div>

      {observaciones.length === 0 && <EmptyState text="Todavía no hay avisos publicados." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {observaciones.map((o) => (
          <div key={o.id} style={{ background: "#fff", border: "1px solid #E1EAF4", borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 13.5, marginBottom: 8, whiteSpace: "pre-wrap" }}>{o.text}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 11.5, color: "#8AA2BC" }}>{o.author} · {new Date(o.date).toLocaleString("es-AR")}</div>
              <IconBtn danger onClick={() => { if (confirm("¿Eliminar este aviso?")) onDelete(o.id); }}><Trash2 size={13} /></IconBtn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Accesos (usuarios que pueden entrar a la app) ----------------

function AccesosTab({ accountUsers, currentUser, openNew, openEdit, onDelete }) {
  return (
    <div>
      <div style={{ fontSize: 12.5, color: "#8AA2BC", marginBottom: 12 }}>
        Estos son los usuarios que pueden entrar a esta app (distinto de los empleados que atienden en Vender).
      </div>
      <button onClick={openNew} style={{ ...btn("primario", "lg"), width: "100%", marginBottom: 14 }}>
        <Plus size={16} /> Agregar usuario
      </button>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {accountUsers.map((u) => (
          <div key={u.id} style={{ background: "#fff", border: "1px solid #E1EAF4", borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
            <Lock size={15} style={{ color: "#1B4F9C" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{u.username}{u.username === currentUser ? " (vos)" : ""}</div>
            </div>
            <IconBtn onClick={() => openEdit(u)}><Pencil size={13} /></IconBtn>
            <IconBtn
              danger
              onClick={() => {
                if (accountUsers.length <= 1) { alert("Tiene que quedar al menos un usuario."); return; }
                if (confirm(`¿Eliminar el usuario "${u.username}"?`)) onDelete(u.id);
              }}
            >
              <Trash2 size={13} />
            </IconBtn>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountFormModal({ form, setForm, onSave, onClose }) {
  const isEdit = !!form.id;
  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{isEdit ? "Editar usuario" : "Nuevo usuario"}</div>
        <button onClick={onClose} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={20} /></button>
      </div>
      <Field label="Usuario"><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} style={inputStyle} /></Field>
      <Field label="Contraseña"><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={inputStyle} /></Field>
      <button onClick={onSave} style={btn("primario", "lg")}>Guardar</button>
    </Overlay>
  );
}

// ---------------- Modales ----------------

function ProductPhotoField({ form, setForm, onUploadImage }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSubiendo(true);
    setError("");
    const result = await onUploadImage(file);
    setSubiendo(false);
    if (result.ok) {
      setForm({ ...form, imageUrl: result.url });
    } else {
      setError(result.message || "No se pudo subir la foto.");
    }
    e.target.value = "";
  };

  return (
    <Field label="Foto (opcional, se ve en el catálogo público)">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {form.imageUrl ? (
          <img src={form.imageUrl} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10, border: "1px solid #DBE6F2" }} />
        ) : (
          <div style={{ width: 56, height: 56, borderRadius: 10, border: "1.5px dashed #DBE6F2", display: "flex", alignItems: "center", justifyContent: "center", color: "#8AA2BC" }}>
            <ImageIcon size={20} />
          </div>
        )}
        <div style={{ flex: 1 }}>
          <button onClick={() => inputRef.current && inputRef.current.click()} disabled={subiendo} style={btn("secundario", "sm")}>
            {subiendo ? "Subiendo..." : form.imageUrl ? "Cambiar foto" : "Subir foto"}
          </button>
          {form.imageUrl && (
            <button onClick={() => setForm({ ...form, imageUrl: "" })} style={{ ...btn("terciario", "sm"), marginLeft: 6 }}>Quitar</button>
          )}
          <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
        </div>
      </div>
      {error && <div style={{ fontSize: 12, color: "#B0242A", marginTop: 6 }}>{error}</div>}
    </Field>
  );
}

function ProductFormModal({ form, setForm, categories, onSave, onClose, onCreateCategory, onUploadImage }) {
  const isEdit = !!form.id;
  const [catSearch, setCatSearch] = useState(() => categories.find((c) => c.id === form.categoryId)?.name || "");
  const [catOpen, setCatOpen] = useState(false);
  const [margenDeseado, setMargenDeseado] = useState("40");
  const [conDescuento, setConDescuento] = useState(!!(form.costoLista && Number(form.costoLista) > 0));
  const nombresMods = [...new Set((form.modifiers || []).map((m) => (m.name || "").trim()).filter(Boolean))];
  const addModifier = () => setForm({ ...form, modifiers: [...(form.modifiers || []), { name: "", price: "" }] });
  const updateModifier = (idx, key, val) => {
    const mods = [...form.modifiers];
    mods[idx] = { ...mods[idx], [key]: val };
    setForm({ ...form, modifiers: mods });
  };
  const removeModifier = (idx) => setForm({ ...form, modifiers: form.modifiers.filter((_, i) => i !== idx) });

  const costoLista = parseFloat(form.costoLista);
  const descuentoPct = parseFloat(form.descuentoPct);
  const costoConDescuento = !isNaN(costoLista) && costoLista > 0 && !isNaN(descuentoPct) && descuentoPct > 0
    ? costoLista * (1 - descuentoPct / 100)
    : null;
  const cost = conDescuento && costoConDescuento !== null ? costoConDescuento : parseFloat(form.cost);
  const margen = parseFloat(margenDeseado);
  const precioSugerido = !isNaN(cost) && cost > 0 && !isNaN(margen) ? cost * (1 + margen / 100) : null;

  const handleSave = (keepOpen) => {
    const cleanMods = (form.modifiers || [])
      .map((m) => ({ name: (m.name || "").trim(), price: parseFloat(m.price) || 0 }))
      .filter((m) => m.name);
    const finalForm = conDescuento
      ? { ...form, modifiers: cleanMods, cost: costoConDescuento !== null ? String(costoConDescuento) : form.cost }
      : { ...form, modifiers: cleanMods, costoLista: "", descuentoPct: "" };
    const pr = parseFloat(finalForm.price), co = parseFloat(finalForm.cost);
    if (pr > 0 && co > 0 && pr < co && !window.confirm(`⚠️ El precio ($${pr}) es MENOR al costo ($${co}). Si lo guardás así, cada venta pierde plata.\n\n¿Guardar igual? (Cancelar para corregirlo)`)) return;
    onSave(finalForm, keepOpen);
  };

  const confirmNewCategory = (name) => {
    const id = onCreateCategory(name);
    if (id) {
      setForm({ ...form, categoryId: id });
      setCatSearch(name.trim());
    }
    setCatOpen(false);
  };
  const categoriasOrdenadas = categories.slice().sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  const categoriasFiltradas = categoriasOrdenadas.filter((c) => coincide(catSearch, c.name));
  const coincidenciaExacta = categoriasOrdenadas.some((c) => c.name.toLowerCase() === catSearch.trim().toLowerCase());

  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{isEdit ? "Editar producto" : "Nuevo producto"}</div>
        <button onClick={onClose} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={20} /></button>
      </div>

      <Field label="Nombre"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Detergente 1L" style={inputStyle} /></Field>
      <ProductPhotoField form={form} setForm={setForm} onUploadImage={onUploadImage} />
      <Field label="Descripción (opcional, ej: fragancias disponibles)">
        <textarea
          value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Ej: Disponible en Lavanda, Limón y Floral" style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
        />
      </Field>
      <div style={{ background: form.enOferta ? "#FDECEC" : "#F2F6FB", border: `1px solid ${form.enOferta ? "#F0C9C9" : "#E1EAF4"}`, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: form.enOferta ? C.rojo : C.texto, cursor: "pointer" }}>
          <input type="checkbox" checked={!!form.enOferta} onChange={(e) => setForm({ ...form, enOferta: e.target.checked })} />
          Está en oferta
        </label>
        {form.enOferta && (
          <div style={{ marginTop: 8 }}>
            <Field label="Precio de oferta">
              <input type="number" min="0" step="0.01" value={form.precioOferta || ""} onChange={(e) => setForm({ ...form, precioOferta: e.target.value })} placeholder="0.00" style={inputStyle} />
            </Field>
          </div>
        )}
      </div>
      <Field label="Código de barras (opcional)">
        <div style={{ display: "flex", gap: 6 }}>
          <input value={form.barcode || ""} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="Escaneá el producto con la pistola acá" style={{ ...inputStyle, flex: 2 }} />
          {nombresMods.length > 0 && (
            <select value={form.barcodeMod || ""} onChange={(e) => setForm({ ...form, barcodeMod: e.target.value })} style={{ ...inputStyle, flex: 1 }}>
              <option value="">Sin modificador</option>
              {nombresMods.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
        </div>
      </Field>
      <Field label="Otros códigos de barras (otras fragancias, tamaños, etc.)">
        {(form.barcodesExtra || []).map((e, idx) => (
          <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input
              value={extraCode(e)}
              onChange={(ev) => setForm({ ...form, barcodesExtra: form.barcodesExtra.map((x, i) => (i === idx ? { code: ev.target.value, modifier: extraMod(x) } : x)) })}
              onKeyDown={(ev) => { if (ev.key === "Enter") ev.preventDefault(); }}
              placeholder="Escaneá el otro código acá" style={{ ...inputStyle, flex: 2 }}
            />
            {nombresMods.length > 0 && (
              <select value={extraMod(e)} onChange={(ev) => setForm({ ...form, barcodesExtra: form.barcodesExtra.map((x, i) => (i === idx ? { code: extraCode(x), modifier: ev.target.value } : x)) })} style={{ ...inputStyle, flex: 1 }}>
                <option value="">Sin modificador</option>
                {nombresMods.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            )}
            <button type="button" onClick={() => setForm({ ...form, barcodesExtra: form.barcodesExtra.filter((_, i) => i !== idx) })} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={16} /></button>
          </div>
        ))}
        <button type="button" onClick={() => setForm({ ...form, barcodesExtra: [...(form.barcodesExtra || []), { code: "", modifier: "" }] })} style={{ ...btn("secundario", "sm") }}>
          <Plus size={13} /> Agregar otro código
        </button>
        {nombresMods.length === 0 && (
          <div style={{ fontSize: 11.5, color: "#8AA2BC", marginTop: 6 }}>
            Para asociar cada código a una fragancia, primero cargá las fragancias como "Modificadores" más abajo.
          </div>
        )}
      </Field>
      <Field label="Categoría">
        <div style={{ position: "relative" }}>
          <input
            value={catSearch}
            onFocus={() => setCatOpen(true)}
            onChange={(e) => { setCatSearch(e.target.value); setCatOpen(true); if (!e.target.value) setForm({ ...form, categoryId: "" }); }}
            placeholder="Buscar o escribir una categoría..."
            style={inputStyle}
          />
          {catOpen && (
            <>
              <div onClick={() => setCatOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: "1px solid #DBE6F2",
                borderRadius: 10, maxHeight: 220, overflowY: "auto", zIndex: 61, boxShadow: "0 6px 20px rgba(16,36,61,0.12)",
              }}>
                <button
                  onClick={() => { setForm({ ...form, categoryId: "" }); setCatSearch(""); setCatOpen(false); }}
                  style={{ width: "100%", textAlign: "left", padding: "10px 12px", border: "none", background: "none", fontSize: 13.5, color: "#5B7791" }}
                >
                  Sin categoría
                </button>
                {categoriasFiltradas.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setForm({ ...form, categoryId: c.id }); setCatSearch(c.name); setCatOpen(false); }}
                    style={{
                      width: "100%", textAlign: "left", padding: "10px 12px", border: "none",
                      background: form.categoryId === c.id ? C.azulSuave : "none", fontSize: 13.5,
                      fontWeight: form.categoryId === c.id ? 700 : 500, color: "#10243D",
                    }}
                  >
                    {c.name}
                  </button>
                ))}
                {catSearch.trim() && !coincidenciaExacta && (
                  <button
                    onClick={() => confirmNewCategory(catSearch)}
                    style={{ width: "100%", textAlign: "left", padding: "10px 12px", border: "none", borderTop: "1px solid #EDF2F8", background: "none", fontSize: 13.5, fontWeight: 700, color: "#1B4F9C" }}
                  >
                    + Crear "{catSearch.trim()}" como categoría nueva
                  </button>
                )}
                {categoriasFiltradas.length === 0 && !catSearch.trim() && (
                  <div style={{ padding: "10px 12px", fontSize: 12.5, color: "#8AA2BC" }}>Todavía no hay categorías creadas.</div>
                )}
              </div>
            </>
          )}
        </div>
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Precio de venta" style={{ flex: 1 }}><input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" style={inputStyle} /></Field>
        {!conDescuento && (
          <Field label="Precio de compra (costo, opcional)" style={{ flex: 1 }}><input type="number" min="0" step="0.01" value={form.cost || ""} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="0.00" style={inputStyle} /></Field>
        )}
      </div>

      <button
        onClick={() => setConDescuento((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 7, background: "none", border: "none", color: "#1B4F9C", fontSize: 12.5, fontWeight: 600, padding: "0 0 10px", marginTop: -6 }}
      >
        <Percent size={13} /> {conDescuento ? "Cargar el costo directo (sin descuento)" : "¿El proveedor te hace un descuento?"}
      </button>

      {conDescuento && (
        <div style={{ background: C.azulSuave, border: `1px solid ${C.azulBorde}`, borderRadius: 10, padding: "10px 10px 2px", marginBottom: 12, marginTop: -4 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <Field label="Precio de lista (sin descuento)" style={{ flex: 1 }}>
              <input type="number" min="0" step="0.01" value={form.costoLista || ""} onChange={(e) => setForm({ ...form, costoLista: e.target.value })} placeholder="0.00" style={inputStyle} />
            </Field>
            <Field label="Descuento %" style={{ flex: 1 }}>
              <input type="number" min="0" max="100" step="0.1" value={form.descuentoPct || ""} onChange={(e) => setForm({ ...form, descuentoPct: e.target.value })} placeholder="0" style={inputStyle} />
            </Field>
          </div>
          {costoConDescuento !== null && (
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1B4F9C", marginBottom: 10 }}>
              Costo final: ${fmt(costoConDescuento)}
            </div>
          )}
        </div>
      )}
      {cost > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.azulSuave, border: `1px solid ${C.azulBorde}`, borderRadius: 10, padding: "8px 10px", marginBottom: 12, marginTop: -4 }}>
          <DollarSign size={14} style={{ color: "#1B4F9C", flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: "#5B7791" }}>Margen deseado</span>
          <input type="number" min="0" value={margenDeseado} onChange={(e) => setMargenDeseado(e.target.value)} style={{ ...inputStyle, width: 56, padding: "5px 6px", fontSize: 12.5 }} />
          <span style={{ fontSize: 12, color: "#5B7791" }}>%</span>
          {precioSugerido !== null && (
            <button
              onClick={() => setForm({ ...form, price: precioSugerido.toFixed(2) })}
              style={{ ...btn("secundario", "sm"), marginLeft: "auto", whiteSpace: "nowrap" }}
            >
              Usar ${fmt(precioSugerido)}
            </button>
          )}
        </div>
      )}
      <Field label="Stock"><input type="number" min="0" step="1" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="0" style={inputStyle} /></Field>
      {form.id && (form.lotes || []).filter((l) => l.qty > 0).length > 1 && (
        <div style={{ fontSize: 12, color: "#5B7791", background: "#F6F9FE", borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}>
          <b>Cola de costos</b> (se vende de izquierda a derecha): {(form.lotes || []).filter((l) => l.qty > 0).map((l) => `${l.qty} un. a $${fmt(l.costoUnitario)}`).join(" → ")}.
          El costo que ves arriba es el del primer grupo; cuando se agote pasa solo al siguiente.
        </div>
      )}

      <Field label="Modificadores (opcionales — ej: tamaño, sabor)">
        {(form.modifiers || []).map((m, idx) => (
          <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input value={m.name} onChange={(e) => updateModifier(idx, "name", e.target.value)} placeholder="Nombre" style={{ ...inputStyle, flex: 2 }} />
            <input type="number" step="0.01" value={m.price} onChange={(e) => updateModifier(idx, "price", e.target.value)} placeholder="+$" style={{ ...inputStyle, flex: 1 }} />
            <IconBtn danger onClick={() => removeModifier(idx)}><Trash2 size={13} /></IconBtn>
          </div>
        ))}
        <button onClick={addModifier} style={btn("terciario", "sm")}>
          <Plus size={13} /> Agregar modificador
        </button>
      </Field>

      <button onClick={() => handleSave(false)} style={{ ...btn("primario", "lg"), width: "100%", marginTop: 8 }}>
        {isEdit ? "Guardar cambios" : "Agregar producto"}
      </button>
      {!isEdit && (
        <button onClick={() => handleSave(true)} style={{ ...btn("secundario"), width: "100%", marginTop: 8 }}>
          <PackagePlus size={15} /> Guardar y cargar otro
        </button>
      )}
    </Overlay>
  );
}

function CategoryFormModal({ form, setForm, groups, onSave, onClose }) {
  const sorted = groups.slice().sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{form.id ? "Editar categoría" : "Nueva categoría"}</div>
        <button onClick={onClose} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={20} /></button>
      </div>
      <Field label="Nombre"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Limpieza de cocina" style={inputStyle} /></Field>
      <Field label="Grupo (opcional)">
        <select value={form.groupId || ""} onChange={(e) => setForm({ ...form, groupId: e.target.value })} style={inputStyle}>
          <option value="">Sin grupo</option>
          {sorted.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </Field>
      <button onClick={onSave} style={btn("primario", "lg")}>Guardar</button>
    </Overlay>
  );
}

function EmployeeFormModal({ form, setForm, onSave, onClose }) {
  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{form.id ? "Editar empleado" : "Nuevo empleado"}</div>
        <button onClick={onClose} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={20} /></button>
      </div>
      <Field label="Nombre"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Juan" style={inputStyle} /></Field>
      <Field label="PIN de 4 dígitos (opcional)">
        <input value={form.pin || ""} inputMode="numeric" maxLength={4} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="Sin PIN" style={inputStyle} />
      </Field>
      <button onClick={onSave} style={btn("primario", "lg")}>Guardar</button>
    </Overlay>
  );
}

function ModifierPickerModal({ product, onClose, onConfirm }) {
  const [selected, setSelected] = useState([]);
  const toggle = (mod) => {
    setSelected((prev) => prev.some((m) => m.name === mod.name) ? prev.filter((m) => m.name !== mod.name) : [...prev, mod]);
  };
  const extra = selected.reduce((a, m) => a + m.price, 0);
  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{product.name}</div>
        <button onClick={onClose} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={20} /></button>
      </div>
      <div style={{ fontSize: 12.5, color: "#5B7791", marginBottom: 10, fontWeight: 600 }}>ELEGIR OPCIONES</div>
      {product.modifiers.map((m, idx) => {
        const active = selected.some((s) => s.name === m.name);
        return (
          <button key={idx} onClick={() => toggle(m)} style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 12px",
            borderRadius: 10, border: active ? "1.5px solid #1B4F9C" : "1px solid #DBE6F2", background: active ? "#E4ECFB" : "#fff", marginBottom: 8,
          }}>
            <span style={{ fontSize: 13.5, fontWeight: 500, color: active ? "#1B4F9C" : "#10243D" }}>{m.name}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: active ? "#1B4F9C" : "#5B7791" }}>+${fmt(m.price)}</span>
          </button>
        );
      })}
      <button onClick={() => onConfirm(selected)} style={{ ...btn("primario", "lg"), width: "100%", marginTop: 8 }}>
        Agregar · ${fmt(precioVenta(product) + extra)}
      </button>
    </Overlay>
  );
}

function ReceiptModal({ sale, methodLabel, onClose }) {
  return (
    <Overlay onClose={onClose}>
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
        <button onClick={onClose} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={20} /></button>
      </div>
      <div className="receipt-print" style={{ background: "#fff", borderRadius: 4, padding: "22px 20px", fontFamily: mono, border: "1px solid #E1EAF4" }}>
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>AGUA Y JABÓN</div>
          {sale.pending ? (
            <div style={{ fontSize: 11, color: "#A85C06", fontWeight: 700, marginTop: 2 }}>PEDIDO · PENDIENTE DE PAGO</div>
          ) : (
            <div style={{ fontSize: 10.5, color: "#8AA2BC", marginTop: 2 }}>Comprobante interno · no válido como factura fiscal</div>
          )}
        </div>
        <Dashed />
        <div style={{ fontSize: 12, display: "flex", justifyContent: "space-between", margin: "8px 0 4px" }}>
          <span>N° {String(sale.number).padStart(4, "0")}</span>
          <span>{new Date(sale.date).toLocaleString("es-AR")}</span>
        </div>
        {sale.employeeName && <div style={{ fontSize: 11.5, color: "#8AA2BC" }}>Atendió: {sale.employeeName}</div>}
        <Dashed />
        <div style={{ margin: "8px 0" }}>
          {sale.items.map((i, idx) => {
            const extras = (i.modifiers || []).reduce((a, m) => a + m.price, 0);
            return (
              <div key={idx} style={{ fontSize: 12, marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{i.name}</span>
                  <span>${fmt((i.price + extras) * i.qty)}</span>
                </div>
                {i.modifiers && i.modifiers.length > 0 && (
                  <div style={{ fontSize: 10.5, color: "#8AA2BC" }}>{i.modifiers.map((m) => m.name).join(", ")}</div>
                )}
                <div style={{ fontSize: 10.5, color: "#8AA2BC" }}>{i.qty} x ${fmt(i.price + extras)}</div>
              </div>
            );
          })}
        </div>
        <Dashed />
        {(sale.discountAmount > 0 || sale.surchargeAmount > 0) && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#5B7791" }}><span>Subtotal</span><span>${fmt(sale.subtotal)}</span></div>
        )}
        {sale.discountAmount > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#A85C06" }}><span>Descuento</span><span>-${fmt(sale.discountAmount)}</span></div>
        )}
        {sale.surchargeAmount > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#1B4F9C" }}><span>Recargo ({Math.round((sale.surchargeRate || 0) * 100)}%)</span><span>+${fmt(sale.surchargeAmount)}</span></div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, margin: "8px 0" }}>
          <span>TOTAL</span><span>${fmt(sale.total)}</span>
        </div>
        <div style={{ fontSize: 11.5, color: "#5B7791" }}>{sale.pending ? "A cobrar al entregar" : `Pago: ${methodLabel[sale.method]}`}</div>
        <Dashed />
        <div style={{ textAlign: "center", fontSize: 10.5, color: "#8AA2BC", marginTop: 6 }}>¡Gracias por su compra!</div>
      </div>

      <button onClick={() => window.print()} className="no-print" style={{ ...btn("secundario"), width: "100%", marginTop: 12 }}>
        <Printer size={15} /> Imprimir
      </button>
      <button onClick={onClose} className="no-print" style={{ ...btn("terciario"), width: "100%", marginTop: 8 }}>Listo</button>
    </Overlay>
  );
}

function Dashed() { return <div style={{ borderTop: "1.5px dashed #DBE6F2", margin: "4px 0" }} />; }

// ---------------- Etiquetas (impresora térmica 80mm) ----------------

function BarcodeSVG({ value, height = 40 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && value) {
      try {
        JsBarcode(ref.current, value, {
          format: "CODE128", width: 1.6, height, displayValue: false, margin: 0,
        });
      } catch (e) {}
    }
  }, [value, height]);
  return <svg ref={ref} />;
}

function StockAdjustModal({ product, onConfirm, onClose }) {
  const [amount, setAmount] = useState("");
  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Sumar stock · {product.name}</div>
        <button onClick={onClose} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={20} /></button>
      </div>
      <div style={{ fontSize: 12.5, color: "#8AA2BC", marginBottom: 10 }}>Stock actual: {product.stock}</div>
      <Field label="Cantidad a sumar">
        <input
          autoFocus type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onConfirm(parseInt(amount, 10))}
          placeholder="0" style={inputStyle}
        />
      </Field>
      <button
        onClick={() => onConfirm(parseInt(amount, 10))}
        style={{ ...btn("primario", "lg"), width: "100%", marginTop: 8 }}
      >
        Sumar al stock
      </button>
    </Overlay>
  );
}

function PriceEditModal({ product, onConfirm, onClose }) {
  const [price, setPrice] = useState(String(product.price || ""));
  const [aviso, setAviso] = useState(null);
  const guardar = () => {
    const v = parseFloat(price);
    const av = avisoPrecio(product, v);
    if (av && av !== aviso) { setAviso(av); return; }
    onConfirm(v);
  };
  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Editar precio · {product.name}</div>
        <button onClick={onClose} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={20} /></button>
      </div>
      <Field label="Precio de venta">
        <input
          autoFocus type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && guardar()}
          placeholder="0.00" style={inputStyle}
        />
      </Field>
      {aviso && <div style={{ background: "#FDF0DC", color: "#A85C06", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, fontWeight: 600 }}>⚠️ Ojo: {aviso}. Tocá de nuevo para guardar igual.</div>}
      <button
        onClick={guardar}
        style={{ ...btn("primario", "lg"), width: "100%", marginTop: 8 }}
      >
        Guardar precio
      </button>
    </Overlay>
  );
}

function PriceListModal({ products, categories, groups, onClose }) {
  const catName = (id) => categories.find((c) => c.id === id)?.name || "Sin categoría";
  const catGroupName = (categoryId) => {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat || !cat.groupId) return null;
    return groups.find((g) => g.id === cat.groupId)?.name || null;
  };

  // Agrupa: Grupo > Categoría > Productos (alfabético en cada nivel)
  const porGrupo = {};
  products.forEach((p) => {
    if (!p.price || p.price <= 0) return;
    const grupo = catGroupName(p.categoryId) || "Otros artículos";
    const categoria = catName(p.categoryId);
    if (!porGrupo[grupo]) porGrupo[grupo] = {};
    if (!porGrupo[grupo][categoria]) porGrupo[grupo][categoria] = [];
    porGrupo[grupo][categoria].push(p);
  });
  const gruposOrdenados = Object.keys(porGrupo).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

  return (
    <Overlay onClose={onClose}>
      <style>{`@media print { @page { size: A4; margin: 15mm; } }`}</style>

      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Lista de precios para el público</div>
        <button onClick={onClose} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={20} /></button>
      </div>
      <div className="no-print" style={{ fontSize: 12.5, color: "#5B7791", marginBottom: 14 }}>
        Solo incluye artículos con precio cargado. No muestra costo, stock ni código de barras.
      </div>
      <button onClick={() => window.print()} className="no-print" style={{ ...btn("primario", "lg"), width: "100%", marginBottom: 16 }}>
        <Printer size={18} /> Imprimir / Guardar PDF
      </button>

      <div className="quote-print" style={{ maxWidth: 700, margin: "0 auto", background: "#fff", border: "1px solid #E1EAF4", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ textAlign: "center", padding: "22px 24px 16px", borderBottom: `3px solid ${C.azul}` }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: C.azul }}>Agua y Jabón</div>
          <div style={{ fontSize: 13, color: C.textoSuave, marginTop: 3 }}>Lista de precios · {new Date().toLocaleDateString("es-AR")}</div>
        </div>

        <div style={{ padding: "8px 24px 20px" }}>
          {gruposOrdenados.length === 0 && (
            <div style={{ textAlign: "center", padding: 24, fontSize: 13, color: C.textoTenue }}>Todavía no hay productos con precio cargado.</div>
          )}
          {gruposOrdenados.map((grupo) => {
            const categoriasDelGrupo = Object.keys(porGrupo[grupo]).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
            return (
              <div key={grupo} style={{ marginTop: 18 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: C.azul, marginBottom: 6 }}>{grupo}</div>
                {categoriasDelGrupo.map((categoria) => {
                  const items = porGrupo[grupo][categoria].slice().sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
                  return (
                    <div key={categoria} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.textoSuave, textTransform: "uppercase", letterSpacing: 0.4, margin: "6px 0 4px" }}>{categoria}</div>
                      {items.map((p) => (
                        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "3px 0", borderBottom: "1px dotted #E1EAF4" }}>
                          <span>{p.name}</span>
                          <span style={{ fontWeight: 700, whiteSpace: "nowrap", marginLeft: 10 }}>
                            {p.enOferta && <span style={{ color: C.textoTenue, textDecoration: "line-through", fontWeight: 500, marginRight: 5 }}>${fmt(p.price)}</span>}
                            <span style={{ color: p.enOferta ? C.rojo : C.azul }}>${fmt(precioVenta(p))}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </Overlay>
  );
}

function SheetLabelModal({ products, onClose }) {
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState({});

  const filtered = products
    .filter((p) => coincide(search, p.name))
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));

  const setQtyFor = (id, val) => {
    const n = Math.max(0, parseInt(val, 10) || 0);
    setQty({ ...qty, [id]: n });
  };

  const instances = [];
  products.forEach((p) => {
    const n = qty[p.id] || 0;
    for (let i = 0; i < n; i++) instances.push(p);
  });
  const totalLabels = instances.length;
  const sheets = Math.max(1, Math.ceil(totalLabels / 24));

  return (
    <Overlay onClose={onClose}>
      <style>{`@media print { @page { size: A4; margin: 10mm; } }`}</style>

      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Imprimir etiquetas en hoja A4</div>
        <button onClick={onClose} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={20} /></button>
      </div>

      <div className="no-print" style={{ position: "relative", marginBottom: 10 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: "#8AA2BC" }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto..." style={{ ...inputStyle, padding: "10px 12px 10px 34px" }} />
      </div>

      <div className="no-print" style={{ maxHeight: 320, overflowY: "auto", border: "1px solid #E1EAF4", borderRadius: 10, marginBottom: 12 }}>
        {filtered.length === 0 && <div style={{ padding: 14, fontSize: 13, color: "#8AA2BC", textAlign: "center" }}>No hay productos que coincidan.</div>}
        {filtered.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: "1px solid #EDF2F8" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
              <div style={{ fontSize: 11.5, color: "#8AA2BC" }}>${fmt(precioVenta(p))}{p.enOferta && " · oferta"}</div>
            </div>
            <input
              type="number" min="0" value={qty[p.id] || ""} onChange={(e) => setQtyFor(p.id, e.target.value)}
              placeholder="0" style={{ ...inputStyle, width: 60, padding: "6px 8px", textAlign: "center" }}
            />
          </div>
        ))}
      </div>

      <div className="no-print" style={{ fontSize: 13, color: "#5B7791", marginBottom: 12, textAlign: "center" }}>
        {totalLabels} etiqueta{totalLabels !== 1 ? "s" : ""} · {sheets} hoja{sheets !== 1 ? "s" : ""} A4
      </div>

      <button onClick={() => window.print()} disabled={totalLabels === 0} className="no-print" style={{ ...btn("primario", "lg"), width: "100%", opacity: totalLabels === 0 ? 0.5 : 1 }}>
        <Printer size={18} /> Imprimir {totalLabels > 0 ? `(${totalLabels})` : ""}
      </button>
      <button onClick={onClose} className="no-print" style={{ ...btn("terciario"), width: "100%", marginTop: 8 }}>Cerrar</button>

      {totalLabels > 0 && (
        <div className="sheet-print" style={{
          display: "grid", gridTemplateColumns: "repeat(3, 62mm)", gridAutoRows: "30mm", gap: "2mm",
          justifyContent: "center", padding: "10mm",
        }}>
          {instances.map((p, i) => (
            <div key={i} style={{ width: "62mm", height: "30mm", border: "0.3mm dashed #C7D3E2", borderRadius: "1.5mm", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ background: "#185FA5", padding: "1.5mm 2mm" }}>
                <div style={{ color: "#fff", fontSize: "9pt", fontWeight: 700, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
              </div>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "2mm", padding: "1.5mm 2mm" }}>
                <div style={{ color: p.enOferta ? "#B0242A" : "#185FA5", fontSize: "15pt", fontWeight: 800, flexShrink: 0 }}>${fmt(precioVenta(p))}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <BarcodeSVG value={p.barcode} height={22} />
                  <div style={{ fontSize: "6.5pt", letterSpacing: 0.5, color: "#5B7791", textAlign: "center" }}>{p.barcode}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Overlay>
  );
}

function LabelModal({ product, onClose }) {
  const [copies, setCopies] = useState(1);
  const n = Math.max(1, Math.min(50, parseInt(copies, 10) || 1));

  return (
    <Overlay onClose={onClose}>
      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Etiqueta · {product.name}</div>
        <button onClick={onClose} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={20} /></button>
      </div>

      <div className="no-print" style={{ marginBottom: 14 }}>
        <Field label="Cantidad de etiquetas a imprimir">
          <input type="number" min="1" max="50" value={copies} onChange={(e) => setCopies(e.target.value)} style={inputStyle} />
        </Field>
      </div>

      <div className="label-print" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} style={{
            width: "76mm", padding: "3mm", border: "1px dashed #DBE6F2", borderRadius: 4,
            textAlign: "center", background: "#fff", fontFamily: sans,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2, marginBottom: 2 }}>{product.name}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1B4F9C", marginBottom: 3 }}>${fmt(product.price)}</div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <BarcodeSVG value={product.barcode} />
            </div>
            <div style={{ fontSize: 9, letterSpacing: 1, color: "#5B7791", marginTop: 1 }}>{product.barcode}</div>
          </div>
        ))}
      </div>

      <button onClick={() => window.print()} className="no-print" style={{ ...btn("primario", "lg"), width: "100%", marginTop: 14 }}>
        <Printer size={15} /> Imprimir {n > 1 ? `(${n} etiquetas)` : ""}
      </button>
      <button onClick={onClose} className="no-print" style={{ ...btn("terciario"), width: "100%", marginTop: 8 }}>
        Listo
      </button>
    </Overlay>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom: 12, ...style }}>
      <div style={{ fontSize: 12.5, color: "#5B7791", marginBottom: 5, fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  );
}
const inputStyle = inputBase;

function Overlay({ children, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,30,28,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ background: "#F2F6FB", borderRadius: "18px 18px 0 0", padding: 20, width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto" }}>
        {children}
      </div>
    </div>
  );
}
