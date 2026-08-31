import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ShoppingCart, Package, Receipt, Plus, Minus, Trash2, X, Search,
  Wallet, CreditCard, ArrowLeftRight, AlertTriangle, Printer, Pencil,
  Users, BarChart3, Tag, Percent, LogOut, Lock, ChevronRight, Sliders,
  Download, ScanBarcode, Upload, FileSpreadsheet, Banknote, MessageSquare,
  TrendingUp, Wand2, Smartphone, Landmark, MoreHorizontal, Copy, PackagePlus,
  DollarSign, CircleAlert, Check, ClipboardList,
} from "lucide-react";
import { getData, setData } from "./lib/storage";
import * as XLSX from "xlsx";
import JsBarcode from "jsbarcode";
import { C, F, btn, iconBtn, card, chip as chipStyle, input as inputBase, badgeStock } from "./ui";

const LOW_STOCK = 5;
const sans = "Nunito, system-ui, -apple-system, sans-serif";
const mono = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

const fmt = (n) =>
  Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export default function PuntoDeVenta() {
  const [loaded, setLoaded] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
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
  const [cart, setCart] = useState([]); // {lineId, productId, name, price, modifiers:[{name,price}], qty}
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [payMethod, setPayMethod] = useState("efectivo");
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
  const [labelProduct, setLabelProduct] = useState(null);
  const [sheetLabelOpen, setSheetLabelOpen] = useState(false);
  const [presupuestoNextNum, setPresupuestoNextNum] = useState(1);
  const [stockAdjustProduct, setStockAdjustProduct] = useState(null);
  const [priceEditProduct, setPriceEditProduct] = useState(null);
  const fileInputRef = useRef(null);

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
      setEmployees(await load("employees", []));
      setSales(await load("sales", []));
      let users = await load("app_users", []);
      if (!users || users.length === 0) {
        users = [{ id: uid(), username: "aguayjabon", password: "gaspar" }];
        try { await setData("app_users", users); } catch (e) {}
      }
      setAccountUsers(users);
      setCajaActual(await load("caja_actual", null));
      setCajaHistorial(await load("caja_historial", []));
      setObservaciones(await load("observaciones", []));
      setPresupuestoNextNum(await load("presupuesto_next_num", 1));
      setLoaded(true);
    })();
  }, []);

  const persist = async (key, value) => {
    try {
      const ok = await setData(key, value);
      if (!ok) setSaveError("No se pudo guardar. Probá de nuevo.");
      else setSaveError("");
    } catch (e) {
      setSaveError("No se pudo guardar. Probá de nuevo.");
    }
  };
  const saveProducts = (n) => { setProducts(n); persist("products", n); };
  const saveCategories = (n) => { setCategories(n); persist("categories", n); };
  const saveEmployees = (n) => { setEmployees(n); persist("employees", n); };
  const saveSales = (n) => { setSales(n); persist("sales", n); };
  const saveAccountUsers = (n) => { setAccountUsers(n); persist("app_users", n); };
  const saveObservaciones = (n) => { setObservaciones(n); persist("observaciones", n); };

  const abrirCaja = (amount) => {
    const nueva = { openingAmount: amount, openedAt: new Date().toISOString(), employeeName: activeEmployee ? activeEmployee.name : account };
    setCajaActual(nueva);
    persist("caja_actual", nueva);
  };
  const cerrarCaja = (counted) => {
    if (!cajaActual) return;
    const ventasEfectivo = sales
      .filter((s) => s.method === "efectivo" && new Date(s.date) >= new Date(cajaActual.openedAt))
      .reduce((a, s) => a + s.total, 0);
    const esperado = cajaActual.openingAmount + ventasEfectivo;
    const registro = { id: uid(), ...cajaActual, closedAt: new Date().toISOString(), ventasEfectivo, esperado, counted, diferencia: counted - esperado };
    const nextHist = [registro, ...cajaHistorial];
    setCajaHistorial(nextHist);
    persist("caja_historial", nextHist);
    setCajaActual(null);
    persist("caja_actual", null);
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

  const addObservacion = (text) => {
    const clean = text.trim();
    if (!clean) return;
    const next = [{ id: uid(), text: clean, author: account, date: new Date().toISOString() }, ...observaciones];
    saveObservaciones(next);
  };
  const deleteObservacion = (id) => saveObservaciones(observaciones.filter((o) => o.id !== id));

  const deleteSale = (id) => {
    const sale = sales.find((s) => s.id === id);
    if (!sale) return;
    const nextProducts = products.map((p) => {
      const item = sale.items.find((i) => i.productId === p.id);
      return item ? { ...p, stock: p.stock + item.qty } : p;
    });
    saveProducts(nextProducts);
    saveSales(sales.filter((s) => s.id !== id));
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
    return { subtotal, discountAmount, total: subtotal - discountAmount };
  }, [cart, discount]);

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
      return [...prev, { lineId: uid(), productId: product.id, name: product.name, price: product.price, modifiers, qty: 1 }];
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

  const cobrar = () => {
    if (cart.length === 0) return;
    const nextNumber = sales.length + 1;
    const sale = {
      id: uid(),
      number: nextNumber,
      date: new Date().toISOString(),
      employeeId: activeEmployee ? activeEmployee.id : null,
      employeeName: activeEmployee ? activeEmployee.name : null,
      items: cart.map((l) => {
        const product = products.find((p) => p.id === l.productId);
        return {
          productId: l.productId, name: l.name, price: l.price, qty: l.qty,
          modifiers: l.modifiers || [], categoryId: product ? product.categoryId : null,
        };
      }),
      subtotal: cartTotals.subtotal,
      discountType: discount.value > 0 ? discount.type : null,
      discountValue: discount.value > 0 ? discount.value : 0,
      discountAmount: cartTotals.discountAmount,
      total: cartTotals.total,
      method: payMethod,
    };
    const nextSales = [sale, ...sales];
    const nextProducts = products.map((p) => {
      const soldQty = cart.filter((l) => l.productId === p.id).reduce((a, l) => a + l.qty, 0);
      return soldQty > 0 ? { ...p, stock: p.stock - soldQty } : p;
    });
    saveSales(nextSales);
    saveProducts(nextProducts);
    setCart([]);
    setDiscount({ type: "pct", value: 0 });
    setShowDiscount(false);
    setReceipt(sale);
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
  const openNewProduct = () => setProductForm({ name: "", price: "", stock: "", categoryId: "", modifiers: [], barcode: "", cost: "", costoLista: "", descuentoPct: "" });
  const openEditProduct = (p) => setProductForm({
    ...p, price: String(p.price), stock: String(p.stock), modifiers: p.modifiers || [], barcode: p.barcode || "",
    cost: p.cost ? String(p.cost) : "", costoLista: p.costoLista ? String(p.costoLista) : "", descuentoPct: p.descuentoPct ? String(p.descuentoPct) : "",
  });
  const duplicateProduct = (p) => setProductForm({
    name: p.name + " (copia)", price: String(p.price), stock: "0",
    categoryId: p.categoryId || "", modifiers: p.modifiers || [], barcode: "", cost: p.cost ? String(p.cost) : "",
    costoLista: p.costoLista ? String(p.costoLista) : "", descuentoPct: p.descuentoPct ? String(p.descuentoPct) : "",
  });
  const saveProduct = (formData, keepOpen) => {
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
    const data = {
      name, price, stock, categoryId: formData.categoryId || "", modifiers: formData.modifiers || [], barcode,
      cost, costoLista: costoListaFinal, descuentoPct: descuentoPctFinal,
    };
    if (formData.id) {
      saveProducts(products.map((p) => (p.id === formData.id ? { ...p, ...data } : p)));
    } else {
      saveProducts([...products, { id: uid(), ...data }]);
    }
    if (keepOpen) {
      setProductForm({ name: "", price: "", stock: "", categoryId: formData.categoryId || "", modifiers: [], barcode: "", cost: "", costoLista: "", descuentoPct: "" });
    } else {
      setProductForm(null);
    }
  };
  const deleteProduct = (id) => saveProducts(products.filter((p) => p.id !== id));
  const sumarStock = (product, amount) => {
    if (!amount || amount <= 0) return;
    saveProducts(products.map((p) => (p.id === product.id ? { ...p, stock: p.stock + amount } : p)));
  };
  const editarPrecioRapido = (product, price) => {
    if (isNaN(price) || price < 0) return;
    saveProducts(products.map((p) => (p.id === product.id ? { ...p, price } : p)));
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

      let newCategories = [...categories];
      const ensureCategory = (name) => {
        const trimmed = String(name || "").trim();
        if (!trimmed) return "";
        const existing = newCategories.find((c) => normKey(c.name) === normKey(trimmed));
        if (existing) return existing.id;
        const cat = { id: uid(), name: trimmed };
        newCategories = [...newCategories, cat];
        return cat.id;
      };

      let updated = [...products];
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
          (barcode && p.barcode === barcode) || (!barcode && normKey(p.name) === normKey(name))
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
    if (categoryForm.id) {
      saveCategories(categories.map((c) => (c.id === categoryForm.id ? { ...c, name } : c)));
    } else {
      saveCategories([...categories, { id: uid(), name }]);
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
    const cat = { id: uid(), name: trimmed };
    saveCategories([...categories, cat]);
    return cat.id;
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
    const matchesSearch = (p.name + " " + (p.category || "")).toLowerCase().includes(search.toLowerCase());
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
    const found = products.find((p) => p.barcode && p.barcode === clean);
    if (found) {
      handleProductTap(found);
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
    .filter((s) => new Date(s.date).toDateString() === new Date().toDateString())
    .reduce((a, s) => a + s.total, 0);
  const pendingProductsCount = products.filter((p) => !p.price || p.price === 0 || !p.cost || p.cost === 0).length;

  return (
    <div style={{ minHeight: "100%", background: "#F2F6FB", fontFamily: sans, color: "#10243D" }}>
      <style>{`
        * { box-sizing: border-box; } button { font-family: inherit; cursor: pointer; } input, select { font-family: inherit; }
        button:active { transform: scale(0.98); }
        input::placeholder { color: #5B7791; opacity: 1; }
        .vender-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-bottom: 20px; }
        .vender-layout { display: block; }
        .vender-cart { margin-top: 4px; }
        .app-shell { display: flex; flex-direction: column; min-height: 100vh; }
        .sidebar { background: ${C.azulOscuro}; color: #fff; flex-shrink: 0; }
        .sidebar-nav-primary { display: flex; flex-direction: row; overflow-x: auto; gap: 4px; padding: 8px 10px; }
        .sidebar-nav-secondary { display: flex; flex-direction: row; overflow-x: auto; gap: 4px; padding: 0 10px 10px; }
        .app-main { flex: 1; min-width: 0; }
        @media (min-width: 900px) {
          .vender-layout { display: flex; align-items: flex-start; gap: 20px; }
          .vender-products { flex: 1; min-width: 0; }
          .vender-cart { width: 360px; flex-shrink: 0; position: sticky; top: 16px; margin-top: 0; }
          .vender-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
          .app-shell { flex-direction: row; }
          .sidebar { width: 268px; min-height: 100vh; position: sticky; top: 0; align-self: flex-start; display: flex; flex-direction: column; }
          .sidebar-nav-primary { flex-direction: column; overflow-x: visible; padding: 10px 14px; gap: 3px; }
          .sidebar-nav-secondary { flex-direction: column; overflow-x: visible; padding: 4px 14px 14px; gap: 2px; margin-top: auto; }
        }
        @media print {
          body * { visibility: hidden; }
          .receipt-print, .receipt-print * { visibility: visible; }
          .receipt-print { position: fixed; top: 0; left: 0; width: 100%; max-width: 320px; margin: 0 auto; border: none !important; }
          .label-print, .label-print * { visibility: visible; }
          .label-print { position: fixed; top: 0; left: 0; width: 100%; }
          .sheet-print, .sheet-print * { visibility: visible; }
          .sheet-print { position: fixed; top: 0; left: 0; width: 100%; }
          .quote-print, .quote-print * { visibility: visible; }
          .quote-print { position: fixed; top: 0; left: 0; width: 100%; border: none !important; }
          .no-print { display: none !important; }
          @page { size: 80mm auto; margin: 2mm; }
        }
      `}</style>

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
              { id: "caja", label: "Caja del día", icon: Banknote },
              { id: "resumen", label: "Cómo vamos", icon: BarChart3 },
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
                setTab={setTab}
                onCargarProducto={() => { setTab("articulos"); openNewProduct(); }}
              />
            )}
            {tab === "vender" && (
              <VenderTab
                products={filteredProducts} categories={categories} search={search} setSearch={setSearch}
                catFilter={catFilter} setCatFilter={setCatFilter} cart={cart} cartTotals={cartTotals}
                onProductTap={handleProductTap} changeQty={changeQty} removeLine={removeLine}
                payMethod={payMethod} setPayMethod={setPayMethod} methodLabel={methodLabel} methodIcon={methodIcon}
                discount={discount} setDiscount={setDiscount} showDiscount={showDiscount} setShowDiscount={setShowDiscount}
                cobrar={cobrar} onScan={handleScan} scanMsg={scanMsg}
              />
            )}
        {tab === "articulos" && (
          <ArticulosTab
            products={products} categories={categories}
            openNewProduct={openNewProduct} openEditProduct={openEditProduct} deleteProduct={deleteProduct}
            openNewCategory={() => setCategoryForm({ name: "" })} openEditCategory={(c) => setCategoryForm(c)} deleteCategory={deleteCategory}
            fileInputRef={fileInputRef} onImportExcel={handleImportExcel} onDownloadPlantilla={downloadPlantilla}
            onPrintLabel={(p) => setLabelProduct(p)}
            onGenerarCodigos={generarCodigosFaltantes}
            onDuplicate={duplicateProduct}
            onSumarStock={(p) => setStockAdjustProduct(p)}
            onEditarPrecio={(p) => setPriceEditProduct(p)}
            onPrintSheet={() => setSheetLabelOpen(true)}
          />
        )}
        {tab === "resumen" && (
          <ResumenTab sales={sales} categories={categories} employees={employees} range={range} setRange={setRange} products={products} />
        )}
        {tab === "presupuestos" && (
          <PresupuestosTab products={products} onGenerarNumero={consumirNumeroPresupuesto} />
        )}
        {tab === "historial" && <HistorialTab sales={sales} onView={setViewingSale} onDelete={deleteSale} methodLabel={methodLabel} />}
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

      {productForm && <ProductFormModal form={productForm} setForm={setProductForm} categories={categories} onSave={saveProduct} onClose={() => setProductForm(null)} onCreateCategory={quickCreateCategory} />}
      {categoryForm && <CategoryFormModal form={categoryForm} setForm={setCategoryForm} onSave={saveCategory} onClose={() => setCategoryForm(null)} />}
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

function saludoSegunHora() {
  const h = new Date().getHours();
  if (h < 12) return "Buen día";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}

function InicioView({ employeeName, cajaActual, soldToday, productsCount, pendingCount, setTab, onCargarProducto }) {
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
        <div style={{ ...card(), background: pendingCount > 0 ? C.ambarSuave : "#fff", border: pendingCount > 0 ? `1.5px solid ${C.ambarBorde}` : card().border }}>
          <div style={{ fontSize: 13, color: pendingCount > 0 ? C.ambar : C.textoSuave, fontWeight: 600, marginBottom: 6 }}>Necesitan atención</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: pendingCount > 0 ? C.ambar : C.texto }}>{pendingCount}</div>
          <div style={{ fontSize: 12, color: pendingCount > 0 ? "#8A5A0A" : C.textoTenue, marginTop: 4 }}>Poco stock o sin precio</div>
        </div>
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
  discount, setDiscount, showDiscount, setShowDiscount, cobrar, onScan, scanMsg,
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
                <button
                  onClick={() => !outOfStock && onProductTap(p)} disabled={outOfStock}
                  style={{ textAlign: "left", background: "none", border: "none", padding: 0, cursor: outOfStock ? "default" : "pointer" }}
                >
                  <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 5, lineHeight: 1.25, color: "#10243D" }}>{p.name}</div>
                  <div style={{ fontSize: 21, fontWeight: 800, color: "#1B4F9C", marginBottom: 5 }}>${fmt(p.price)}</div>
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
        <div style={{ background: "#fff", border: "1px solid #E1EAF4", borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10, color: "#5B7791", letterSpacing: 0.3 }}>CARRITO</div>
          {cart.length === 0 && (
            <div style={{ textAlign: "center", padding: "22px 8px", color: "#8AA2BC", fontSize: 13 }}>
              <ShoppingCart size={26} style={{ marginBottom: 8, opacity: 0.5 }} />
              <div>Todavía no agregaste productos</div>
            </div>
          )}
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

          {cart.length > 0 && (
            <>
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

              <button onClick={cobrar} style={{ ...btn("primario", "lg"), width: "100%" }}>
                Cobrar ${fmt(cartTotals.total)}
              </button>
            </>
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

function ArticulosTab({ products, categories, openNewProduct, openEditProduct, deleteProduct, openNewCategory, openEditCategory, deleteCategory, fileInputRef, onImportExcel, onDownloadPlantilla, onPrintLabel, onGenerarCodigos, onDuplicate, onSumarStock, onEditarPrecio, onPrintSheet }) {
  const [section, setSection] = useState("productos");
  const [search, setSearch] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const lowStock = products.filter((p) => p.stock <= LOW_STOCK).length;
  const isPending = (p) => !p.price || p.price === 0 || !p.cost || p.cost === 0;
  const pendingCount = products.filter(isPending).length;
  const catName = (id) => categories.find((c) => c.id === id)?.name;
  const margin = (p) => (p.cost && p.cost > 0 ? ((p.price - p.cost) / p.cost) * 100 : null);

  const filteredProducts = products
    .filter((p) => {
      const q = search.trim().toLowerCase();
      if (q && !(p.name + " " + (catName(p.categoryId) || "") + " " + (p.barcode || "")).toLowerCase().includes(q)) return false;
      if (onlyPending && !isPending(p)) return false;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button onClick={() => setSection("productos")} style={{ flex: 1, padding: "8px", borderRadius: 9, border: section === "productos" ? "1.5px solid #1B4F9C" : "1px solid #DBE6F2", background: section === "productos" ? "#E4ECFB" : "#fff", color: section === "productos" ? "#1B4F9C" : "#5B7791", fontWeight: 700, fontSize: 13 }}>Productos</button>
        <button onClick={() => setSection("categorias")} style={{ flex: 1, padding: "8px", borderRadius: 9, border: section === "categorias" ? "1.5px solid #1B4F9C" : "1px solid #DBE6F2", background: section === "categorias" ? "#E4ECFB" : "#fff", color: section === "categorias" ? "#1B4F9C" : "#5B7791", fontWeight: 700, fontSize: 13 }}>Categorías</button>
      </div>

      {section === "productos" ? (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <MetricCard label="Productos" value={products.length} />
            <MetricCard label="Stock bajo" value={lowStock} warn={lowStock > 0} />
          </div>
          {pendingCount > 0 && (
            <button
              onClick={() => setOnlyPending((v) => !v)}
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 10, marginBottom: 14, display: "flex", alignItems: "center", gap: 8,
                border: onlyPending ? "1.5px solid #A85C06" : "1px solid #FBE3B8", background: onlyPending ? "#FDF0DC" : "#FFFBF2",
              }}
            >
              <CircleAlert size={16} style={{ color: "#A85C06", flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, color: "#92600B", fontWeight: 600, textAlign: "left", flex: 1 }}>
                {pendingCount} producto{pendingCount !== 1 ? "s" : ""} sin precio o costo cargado
              </span>
              <span style={{ fontSize: 11.5, color: "#A85C06", fontWeight: 700 }}>{onlyPending ? "Ver todos" : "Cargar precios"}</span>
            </button>
          )}
          <button onClick={openNewProduct} style={{ ...btn("primario", "lg"), width: "100%", marginBottom: 8 }}>
            <Plus size={18} /> Agregar producto
          </button>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
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
          <button onClick={onPrintSheet} style={{ ...btn("secundario", "sm"), width: "100%", marginBottom: 14 }}>
            <Tag size={14} /> Imprimir etiquetas en hoja A4
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
              const low = p.stock <= LOW_STOCK;
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
      ) : (
        <>
          <button onClick={openNewCategory} style={{ ...btn("primario", "lg"), width: "100%", marginBottom: 14 }}>
            <Plus size={16} /> Agregar categoría
          </button>
          {categories.length === 0 && <EmptyState text="Todavía no creaste categorías." />}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {categories.map((c) => (
              <div key={c.id} style={{ background: "#fff", border: "1px solid #E1EAF4", borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                <Tag size={15} style={{ color: "#1B4F9C" }} />
                <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "#8AA2BC" }}>{products.filter((p) => p.categoryId === c.id).length} productos</div>
                <IconBtn onClick={() => openEditCategory(c)}><Pencil size={13} /></IconBtn>
                <IconBtn danger onClick={() => { if (confirm(`¿Eliminar "${c.name}"?`)) deleteCategory(c.id); }}><Trash2 size={13} /></IconBtn>
              </div>
            ))}
          </div>
        </>
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

function inRange(dateStr, range) {
  const d = new Date(dateStr);
  const now = new Date();
  if (range === "hoy") return d.toDateString() === now.toDateString();
  if (range === "semana") {
    const start = new Date(now); start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0);
    return d >= start;
  }
  if (range === "mes") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  return true;
}

function PresupuestosTab({ products, onGenerarNumero }) {
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState({});
  const [cliente, setCliente] = useState("");
  const [validez, setValidez] = useState("7");
  const [generado, setGenerado] = useState(null);

  const filtered = products
    .filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));

  const setQtyFor = (id, val) => {
    const n = Math.max(0, parseInt(val, 10) || 0);
    setQty({ ...qty, [id]: n });
  };

  const items = products
    .map((p) => ({ product: p, cantidad: qty[p.id] || 0 }))
    .filter((i) => i.cantidad > 0)
    .map((i) => ({ name: i.product.name, cantidad: i.cantidad, precio: i.product.price, subtotal: i.product.price * i.cantidad }));

  const total = items.reduce((a, i) => a + i.subtotal, 0);

  const generar = () => {
    if (items.length === 0) return;
    const numero = onGenerarNumero();
    setGenerado({ numero, fecha: new Date(), cliente: cliente.trim(), validez: parseInt(validez, 10) || 7, items, total });
  };

  const nuevoPresupuesto = () => {
    setGenerado(null);
    setQty({});
    setCliente("");
  };

  if (generado) {
    return (
      <div>
        <style>{`@media print { @page { size: A4; margin: 15mm; } }`}</style>
        <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <button onClick={() => window.print()} style={{ ...btn("primario", "lg"), flex: 1 }}>
            <Printer size={18} /> Imprimir / Guardar PDF
          </button>
          <button onClick={nuevoPresupuesto} style={btn("secundario", "lg")}>Nuevo presupuesto</button>
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
                N° {String(generado.numero).padStart(4, "0")} · {generado.fecha.toLocaleDateString("es-AR")}
              </div>
            </div>
          </div>

          {generado.cliente && (
            <div style={{ padding: "12px 24px 0", fontSize: 13, color: C.textoSuave }}>
              Para: <b style={{ color: C.texto }}>{generado.cliente}</b>
            </div>
          )}

          <div style={{ padding: "16px 24px" }}>
            <div style={{ display: "flex", fontSize: 12.5, fontWeight: 700, color: "#fff", background: C.azul, padding: "8px 10px", borderRadius: "6px 6px 0 0" }}>
              <div style={{ flex: 3 }}>Artículo</div>
              <div style={{ flex: 1, textAlign: "center" }}>Cant.</div>
              <div style={{ flex: 1, textAlign: "right" }}>P. unit.</div>
              <div style={{ flex: 1, textAlign: "right" }}>Subtotal</div>
            </div>
            {generado.items.map((it, i) => (
              <div key={i} style={{ display: "flex", fontSize: 13, padding: "8px 10px", borderBottom: "1px solid #EDF2F8" }}>
                <div style={{ flex: 3 }}>{it.name}</div>
                <div style={{ flex: 1, textAlign: "center" }}>{it.cantidad}</div>
                <div style={{ flex: 1, textAlign: "right" }}>${fmt(it.precio)}</div>
                <div style={{ flex: 1, textAlign: "right", fontWeight: 600 }}>${fmt(it.subtotal)}</div>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "baseline", gap: 12, padding: "14px 10px 4px" }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>TOTAL</div>
              <div style={{ fontSize: 19, fontWeight: 900, color: C.azul }}>${fmt(generado.total)}</div>
            </div>
          </div>

          <div style={{ padding: "12px 24px 20px", borderTop: "1px solid #EDF2F8", fontSize: 11, color: C.textoTenue }}>
            Válido por {generado.validez} día{generado.validez !== 1 ? "s" : ""} desde la fecha de emisión. Precios sujetos a stock disponible.
          </div>
        </div>
      </div>
    );
  }

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
                  <div style={{ fontSize: 11.5, color: C.textoTenue }}>${fmt(p.price)}</div>
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
      </div>
    </div>
  );
}

function ResumenTab({ sales, categories, employees, range, setRange, products }) {
  const filtered = sales.filter((s) => inRange(s.date, range));
  const total = filtered.reduce((a, s) => a + s.total, 0);
  const count = filtered.length;

  const ganancia = filtered.reduce((acc, s) => {
    const gananciaBruta = s.items.reduce((a, i) => {
      const prod = products.find((p) => p.id === i.productId);
      const cost = prod && prod.cost ? prod.cost : 0;
      return a + (i.price - cost) * i.qty;
    }, 0);
    return acc + gananciaBruta - (s.discountAmount || 0);
  }, 0);
  const hayCostos = products.some((p) => p.cost > 0);

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
        {[["hoy", "Hoy"], ["semana", "7 días"], ["mes", "Este mes"], ["todo", "Todo"]].map(([id, label]) => (
          <Chip key={id} active={range === id} onClick={() => setRange(id)}>{label}</Chip>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <MetricCard label="Ventas" value={count} />
        <MetricCard label="Total vendido" value={"$" + fmt(total)} />
      </div>
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
              <BarRow key={m} label={{ efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia" }[m] || m} value={val} max={Math.max(...Object.values(byMethod))} />
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

function HistorialTab({ sales, onView, onDelete, methodLabel }) {
  const totalHoy = sales.filter((s) => new Date(s.date).toDateString() === new Date().toDateString()).reduce((a, s) => a + s.total, 0);
  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <MetricCard label="Ventas totales" value={sales.length} />
        <MetricCard label="Vendido hoy" value={"$" + fmt(totalHoy)} />
      </div>
      {sales.length === 0 && <EmptyState text="Todavía no registraste ninguna venta." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sales.map((s) => (
          <div key={s.id} style={{ background: "#fff", border: "1px solid #E1EAF4", borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => onView(s)} style={{ flex: 1, textAlign: "left", background: "none", border: "none", padding: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Comprobante #{s.number}</div>
                <div style={{ fontSize: 12, color: "#8AA2BC" }}>
                  {new Date(s.date).toLocaleString("es-AR")} · {methodLabel[s.method]}{s.employeeName ? ` · ${s.employeeName}` : ""}
                </div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1B4F9C", marginRight: 8 }}>${fmt(s.total)}</div>
            </button>
            <IconBtn
              danger
              onClick={() => {
                if (confirm(`¿Eliminar el comprobante #${s.number}? Esto devuelve el stock vendido a los productos.`)) onDelete(s.id);
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

function ProductFormModal({ form, setForm, categories, onSave, onClose, onCreateCategory }) {
  const isEdit = !!form.id;
  const [newCatMode, setNewCatMode] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [margenDeseado, setMargenDeseado] = useState("40");
  const [conDescuento, setConDescuento] = useState(!!(form.costoLista && Number(form.costoLista) > 0));
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
    onSave(finalForm, keepOpen);
  };

  const confirmNewCategory = () => {
    const id = onCreateCategory(newCatName);
    if (id) setForm({ ...form, categoryId: id });
    setNewCatName("");
    setNewCatMode(false);
  };

  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{isEdit ? "Editar producto" : "Nuevo producto"}</div>
        <button onClick={onClose} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={20} /></button>
      </div>

      <Field label="Nombre"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Detergente 1L" style={inputStyle} /></Field>
      <Field label="Código de barras (opcional)">
        <input value={form.barcode || ""} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="Escaneá el producto con la pistola acá" style={inputStyle} />
      </Field>
      <Field label="Categoría">
        {!newCatMode ? (
          <select
            value={form.categoryId || ""}
            onChange={(e) => {
              if (e.target.value === "__new__") { setNewCatMode(true); return; }
              setForm({ ...form, categoryId: e.target.value });
            }}
            style={inputStyle}
          >
            <option value="">Sin categoría</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="__new__">+ Crear categoría nueva...</option>
          </select>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <input
              autoFocus value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmNewCategory()}
              placeholder="Nombre de la nueva categoría" style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={confirmNewCategory} style={btn("secundario", "sm")}>Crear</button>
            <IconBtn onClick={() => { setNewCatMode(false); setNewCatName(""); }}><X size={13} /></IconBtn>
          </div>
        )}
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

function CategoryFormModal({ form, setForm, onSave, onClose }) {
  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{form.id ? "Editar categoría" : "Nueva categoría"}</div>
        <button onClick={onClose} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={20} /></button>
      </div>
      <Field label="Nombre"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Limpieza de cocina" style={inputStyle} /></Field>
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
        Agregar · ${fmt(product.price + extra)}
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
          <div style={{ fontSize: 10.5, color: "#8AA2BC", marginTop: 2 }}>Comprobante interno · no válido como factura fiscal</div>
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
        {sale.discountAmount > 0 && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#5B7791" }}><span>Subtotal</span><span>${fmt(sale.subtotal)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#A85C06" }}><span>Descuento</span><span>-${fmt(sale.discountAmount)}</span></div>
          </>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, margin: "8px 0" }}>
          <span>TOTAL</span><span>${fmt(sale.total)}</span>
        </div>
        <div style={{ fontSize: 11.5, color: "#5B7791" }}>Pago: {methodLabel[sale.method]}</div>
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
  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Editar precio · {product.name}</div>
        <button onClick={onClose} style={{ border: "none", background: "none", color: "#8AA2BC" }}><X size={20} /></button>
      </div>
      <Field label="Precio de venta">
        <input
          autoFocus type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onConfirm(parseFloat(price))}
          placeholder="0.00" style={inputStyle}
        />
      </Field>
      <button
        onClick={() => onConfirm(parseFloat(price))}
        style={{ ...btn("primario", "lg"), width: "100%", marginTop: 8 }}
      >
        Guardar precio
      </button>
    </Overlay>
  );
}

function SheetLabelModal({ products, onClose }) {
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState({});

  const filtered = products
    .filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
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
              <div style={{ fontSize: 11.5, color: "#8AA2BC" }}>${fmt(p.price)}</div>
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
                <div style={{ color: "#185FA5", fontSize: "15pt", fontWeight: 800, flexShrink: 0 }}>${fmt(p.price)}</div>
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
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,30,28,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#F2F6FB", borderRadius: "18px 18px 0 0", padding: 20, width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto" }}>
        {children}
      </div>
    </div>
  );
}
