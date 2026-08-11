import React, { useState, useEffect, useMemo } from "react";
import {
  ShoppingCart, Package, Receipt, Plus, Minus, Trash2, X, Search,
  Wallet, CreditCard, ArrowLeftRight, AlertTriangle, Printer, Pencil,
  Users, BarChart3, Tag, Percent, LogOut, Lock, ChevronRight, Sliders,
  Download, ScanBarcode,
} from "lucide-react";
import { getData, setData } from "./lib/storage";

const LOW_STOCK = 5;
const sans = "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
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

  const [activeEmployeeId, setActiveEmployeeId] = useState(null);
  const [loginPickId, setLoginPickId] = useState(null);
  const [pinInput, setPinInput] = useState("");
  const [loginError, setLoginError] = useState("");

  const [tab, setTab] = useState("vender");
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
  const openNewProduct = () => setProductForm({ name: "", price: "", stock: "", categoryId: "", modifiers: [], barcode: "" });
  const openEditProduct = (p) => setProductForm({ ...p, price: String(p.price), stock: String(p.stock), modifiers: p.modifiers || [], barcode: p.barcode || "" });
  const saveProduct = () => {
    const name = productForm.name.trim();
    const price = parseFloat(productForm.price);
    const stock = parseInt(productForm.stock, 10);
    if (!name || isNaN(price) || price < 0 || isNaN(stock) || stock < 0) return;
    const data = { name, price, stock, categoryId: productForm.categoryId || "", modifiers: productForm.modifiers || [], barcode: (productForm.barcode || "").trim() };
    if (productForm.id) {
      saveProducts(products.map((p) => (p.id === productForm.id ? { ...p, ...data } : p)));
    } else {
      saveProducts([...products, { id: uid(), ...data }]);
    }
    setProductForm(null);
  };
  const deleteProduct = (id) => saveProducts(products.filter((p) => p.id !== id));

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

  const methodLabel = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia" };
  const methodIcon = { efectivo: Wallet, tarjeta: CreditCard, transferencia: ArrowLeftRight };

  if (!loaded) {
    return <div style={{ padding: 40, textAlign: "center", color: "#5C7A78", fontFamily: sans }}>Cargando...</div>;
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

  return (
    <div style={{ minHeight: "100%", background: "#F6F9F8", fontFamily: sans, color: "#1B2A2E" }}>
      <style>{`
        * { box-sizing: border-box; } button { font-family: inherit; cursor: pointer; } input, select { font-family: inherit; }
        @media print {
          body * { visibility: hidden; }
          .receipt-print, .receipt-print * { visibility: visible; }
          .receipt-print { position: fixed; top: 0; left: 0; width: 100%; max-width: 320px; margin: 0 auto; border: none !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div style={{ background: "#0F6E66", padding: "18px 16px 0", color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 760, margin: "0 auto" }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.3 }}>Mi comercio</div>
            <div style={{ fontSize: 12.5, color: "#BFE3DD", marginTop: 2 }}>
              {activeEmployee ? `Atiende: ${activeEmployee.name}` : "Stock, ventas y comprobantes"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={exportBackup} title="Exportar copia de seguridad" style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, padding: "7px 10px", color: "#fff", display: "flex", alignItems: "center", gap: 5, fontSize: 12.5 }}>
              <Download size={13} /> Exportar
            </button>
            {employees.length > 0 && (
              <button onClick={() => setActiveEmployeeId(null)} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, padding: "7px 10px", color: "#fff", display: "flex", alignItems: "center", gap: 5, fontSize: 12.5 }}>
                <LogOut size={13} /> Cambiar
              </button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 2, maxWidth: 760, margin: "16px auto 0", overflowX: "auto" }}>
          {[
            { id: "vender", label: "Vender", icon: ShoppingCart },
            { id: "articulos", label: "Artículos", icon: Package },
            { id: "resumen", label: "Resumen", icon: BarChart3 },
            { id: "historial", label: "Historial", icon: Receipt },
            { id: "equipo", label: "Equipo", icon: Users },
          ].map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                flex: "1 0 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                padding: "10px 8px", border: "none", borderBottom: active ? "2.5px solid #fff" : "2.5px solid transparent",
                background: "transparent", color: active ? "#fff" : "#BFE3DD", fontWeight: active ? 700 : 500, fontSize: 12.5, whiteSpace: "nowrap",
              }}>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
        {saveError && <div style={{ background: "#FDECEC", color: "#B3261E", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{saveError}</div>}

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
          />
        )}
        {tab === "resumen" && (
          <ResumenTab sales={sales} categories={categories} employees={employees} range={range} setRange={setRange} />
        )}
        {tab === "historial" && <HistorialTab sales={sales} onView={setViewingSale} methodLabel={methodLabel} />}
        {tab === "equipo" && (
          <EquipoTab employees={employees} openNew={() => setEmployeeForm({ name: "", pin: "" })} openEdit={(e) => setEmployeeForm(e)} onDelete={deleteEmployee} />
        )}
      </div>

      {productForm && <ProductFormModal form={productForm} setForm={setProductForm} categories={categories} onSave={saveProduct} onClose={() => setProductForm(null)} />}
      {categoryForm && <CategoryFormModal form={categoryForm} setForm={setCategoryForm} onSave={saveCategory} onClose={() => setCategoryForm(null)} />}
      {employeeForm && <EmployeeFormModal form={employeeForm} setForm={setEmployeeForm} onSave={saveEmployee} onClose={() => setEmployeeForm(null)} />}
      {modifierPicker && (
        <ModifierPickerModal
          product={modifierPicker}
          onClose={() => setModifierPicker(null)}
          onConfirm={(mods) => { addToCart(modifierPicker, mods); setModifierPicker(null); }}
        />
      )}
      {receipt && <ReceiptModal sale={receipt} methodLabel={methodLabel} onClose={() => setReceipt(null)} />}
      {viewingSale && <ReceiptModal sale={viewingSale} methodLabel={methodLabel} onClose={() => setViewingSale(null)} />}
    </div>
  );
}

// ---------------- Login ----------------

function LoginScreen({ employees, onPick, pickId, pinInput, setPinInput, onConfirmPin, onCancelPin, error }) {
  const emp = employees.find((e) => e.id === pickId);
  return (
    <div style={{ minHeight: "100vh", background: "#0F6E66", fontFamily: sans, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", color: "#fff", marginBottom: 22 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>¿Quién está atendiendo?</div>
        </div>
        {!emp ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {employees.map((e) => (
              <button key={e.id} onClick={() => onPick(e)} style={{
                background: "#fff", border: "none", borderRadius: 14, padding: "18px 10px", display: "flex",
                flexDirection: "column", alignItems: "center", gap: 8,
              }}>
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#E3F3F0", color: "#0F6E66", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16 }}>
                  {e.name.slice(0, 1).toUpperCase()}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, textAlign: "center" }}>{e.name}</div>
                {e.pin && <Lock size={11} style={{ color: "#8FA6A4" }} />}
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
            {error && <div style={{ color: "#D14343", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
            <button onClick={onConfirmPin} style={{ width: "100%", padding: 12, borderRadius: 10, border: "none", background: "#0F6E66", color: "#fff", fontWeight: 700, marginBottom: 8 }}>Ingresar</button>
            <button onClick={onCancelPin} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #DCE7E5", background: "#fff", color: "#5C7A78", fontWeight: 600 }}>Volver</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- Vender ----------------

function VenderTab({
  products, categories, search, setSearch, catFilter, setCatFilter, cart, cartTotals,
  onProductTap, changeQty, removeLine, payMethod, setPayMethod, methodLabel, methodIcon,
  discount, setDiscount, showDiscount, setShowDiscount, cobrar, onScan, scanMsg,
}) {
  return (
    <div>
      <div style={{ position: "relative", marginBottom: 6 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: "#8FA6A4" }} />
        <input
          autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onScan(search); } }}
          placeholder="Buscar o escanear código de barras..." style={{ ...inputStyle, padding: "10px 34px 10px 34px" }}
        />
        <ScanBarcode size={16} style={{ position: "absolute", right: 12, top: 12, color: "#8FA6A4" }} />
      </div>
      {scanMsg && <div style={{ fontSize: 12, color: "#D97706", marginBottom: 8 }}>{scanMsg}</div>}

      {categories.length > 0 && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 12, paddingBottom: 2 }}>
          <Chip active={catFilter === "all"} onClick={() => setCatFilter("all")}>Todas</Chip>
          {categories.map((c) => (
            <Chip key={c.id} active={catFilter === c.id} onClick={() => setCatFilter(c.id)}>{c.name}</Chip>
          ))}
        </div>
      )}

      {products.length === 0 && <EmptyState text="No hay productos que coincidan. Cargá productos desde Artículos." />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
        {products.map((p) => {
          const outOfStock = p.stock <= 0;
          return (
            <button key={p.id} onClick={() => onProductTap(p)} disabled={outOfStock} style={{
              textAlign: "left", background: "#fff", border: "1px solid #E3ECEA", borderRadius: 12, padding: 12, opacity: outOfStock ? 0.45 : 1, position: "relative",
            }}>
              {p.modifiers && p.modifiers.length > 0 && <Sliders size={12} style={{ position: "absolute", top: 10, right: 10, color: "#8FA6A4" }} />}
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, lineHeight: 1.25 }}>{p.name}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0F6E66" }}>${fmt(p.price)}</div>
              <div style={{ fontSize: 11.5, color: outOfStock ? "#D97706" : "#8FA6A4", marginTop: 4 }}>{outOfStock ? "Sin stock" : `${p.stock} en stock`}</div>
            </button>
          );
        })}
      </div>

      {cart.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #E3ECEA", borderRadius: 14, padding: 14, position: "sticky", bottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#5C7A78" }}>CARRITO</div>
          {cart.map((l) => {
            const extras = (l.modifiers || []).reduce((a, m) => a + m.price, 0);
            return (
              <div key={l.lineId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F0F4F3" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</div>
                  {l.modifiers && l.modifiers.length > 0 && (
                    <div style={{ fontSize: 11, color: "#8FA6A4" }}>{l.modifiers.map((m) => m.name).join(", ")}</div>
                  )}
                  <div style={{ fontSize: 12, color: "#8FA6A4" }}>${fmt(l.price + extras)} c/u</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <IconBtn onClick={() => changeQty(l.lineId, -1)}><Minus size={13} /></IconBtn>
                  <span style={{ fontSize: 13.5, minWidth: 18, textAlign: "center", fontWeight: 600 }}>{l.qty}</span>
                  <IconBtn onClick={() => changeQty(l.lineId, 1)}><Plus size={13} /></IconBtn>
                  <IconBtn onClick={() => removeLine(l.lineId)} danger><Trash2 size={13} /></IconBtn>
                </div>
              </div>
            );
          })}

          <button onClick={() => setShowDiscount((v) => !v)} style={{
            display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#0F6E66",
            fontSize: 12.5, fontWeight: 600, padding: "10px 0 2px",
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

          <div style={{ margin: "10px 0" }}>
            {cartTotals.discountAmount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#8FA6A4", marginBottom: 3 }}>
                <span>Subtotal</span><span>${fmt(cartTotals.subtotal)}</span>
              </div>
            )}
            {cartTotals.discountAmount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#D97706", marginBottom: 3 }}>
                <span>Descuento</span><span>-${fmt(cartTotals.discountAmount)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 13.5, color: "#5C7A78" }}>Total</span>
              <span style={{ fontSize: 22, fontWeight: 700 }}>${fmt(cartTotals.total)}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {Object.keys(methodLabel).map((m) => {
              const Icon = methodIcon[m];
              const active = payMethod === m;
              return (
                <button key={m} onClick={() => setPayMethod(m)} style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 6px",
                  borderRadius: 9, fontSize: 12.5, border: active ? "1.5px solid #0F6E66" : "1px solid #DCE7E5",
                  background: active ? "#E3F3F0" : "#fff", color: active ? "#0F6E66" : "#5C7A78", fontWeight: active ? 700 : 500,
                }}>
                  <Icon size={13} /> {methodLabel[m]}
                </button>
              );
            })}
          </div>

          <button onClick={cobrar} style={{ width: "100%", padding: 13, borderRadius: 10, border: "none", background: "#0F6E66", color: "#fff", fontSize: 15, fontWeight: 700 }}>
            Cobrar ${fmt(cartTotals.total)}
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      flexShrink: 0, padding: "6px 13px", borderRadius: 20, fontSize: 12.5, whiteSpace: "nowrap",
      border: active ? "1.5px solid #0F6E66" : "1px solid #DCE7E5", background: active ? "#E3F3F0" : "#fff",
      color: active ? "#0F6E66" : "#5C7A78", fontWeight: active ? 700 : 500,
    }}>{children}</button>
  );
}

function IconBtn({ onClick, children, danger }) {
  return (
    <button onClick={onClick} style={{
      width: 26, height: 26, borderRadius: 7, border: "1px solid #DCE7E5", display: "flex", alignItems: "center",
      justifyContent: "center", background: "#fff", color: danger ? "#D14343" : "#1B2A2E",
    }}>{children}</button>
  );
}

// ---------------- Artículos ----------------

function ArticulosTab({ products, categories, openNewProduct, openEditProduct, deleteProduct, openNewCategory, openEditCategory, deleteCategory }) {
  const [section, setSection] = useState("productos");
  const lowStock = products.filter((p) => p.stock <= LOW_STOCK).length;
  const catName = (id) => categories.find((c) => c.id === id)?.name;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button onClick={() => setSection("productos")} style={{ flex: 1, padding: "8px", borderRadius: 9, border: section === "productos" ? "1.5px solid #0F6E66" : "1px solid #DCE7E5", background: section === "productos" ? "#E3F3F0" : "#fff", color: section === "productos" ? "#0F6E66" : "#5C7A78", fontWeight: 700, fontSize: 13 }}>Productos</button>
        <button onClick={() => setSection("categorias")} style={{ flex: 1, padding: "8px", borderRadius: 9, border: section === "categorias" ? "1.5px solid #0F6E66" : "1px solid #DCE7E5", background: section === "categorias" ? "#E3F3F0" : "#fff", color: section === "categorias" ? "#0F6E66" : "#5C7A78", fontWeight: 700, fontSize: 13 }}>Categorías</button>
      </div>

      {section === "productos" ? (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <MetricCard label="Productos" value={products.length} />
            <MetricCard label="Stock bajo" value={lowStock} warn={lowStock > 0} />
          </div>
          <button onClick={openNewProduct} style={{ width: "100%", padding: 12, borderRadius: 10, border: "1.5px dashed #0F6E66", background: "#fff", color: "#0F6E66", fontWeight: 700, fontSize: 14, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Plus size={16} /> Agregar producto
          </button>
          {products.length === 0 && <EmptyState text="Todavía no cargaste productos. Agregá el primero." />}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {products.map((p) => {
              const low = p.stock <= LOW_STOCK;
              return (
                <div key={p.id} style={{ background: "#fff", border: "1px solid #E3ECEA", borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "#8FA6A4" }}>
                      {catName(p.categoryId) ? catName(p.categoryId) + " · " : ""}${fmt(p.price)}
                      {p.modifiers && p.modifiers.length > 0 ? ` · ${p.modifiers.length} modificador${p.modifiers.length > 1 ? "es" : ""}` : ""}
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, padding: "4px 9px", borderRadius: 20, background: low ? "#FDF0DC" : "#E3F3F0", color: low ? "#D97706" : "#0F6E66", display: "flex", alignItems: "center", gap: 4 }}>
                    {low && <AlertTriangle size={12} />} {p.stock}
                  </div>
                  <IconBtn onClick={() => openEditProduct(p)}><Pencil size={13} /></IconBtn>
                  <IconBtn danger onClick={() => { if (confirm(`¿Eliminar "${p.name}"?`)) deleteProduct(p.id); }}><Trash2 size={13} /></IconBtn>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <button onClick={openNewCategory} style={{ width: "100%", padding: 12, borderRadius: 10, border: "1.5px dashed #0F6E66", background: "#fff", color: "#0F6E66", fontWeight: 700, fontSize: 14, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Plus size={16} /> Agregar categoría
          </button>
          {categories.length === 0 && <EmptyState text="Todavía no creaste categorías." />}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {categories.map((c) => (
              <div key={c.id} style={{ background: "#fff", border: "1px solid #E3ECEA", borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                <Tag size={15} style={{ color: "#0F6E66" }} />
                <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "#8FA6A4" }}>{products.filter((p) => p.categoryId === c.id).length} productos</div>
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
    <div style={{ flex: 1, background: warn ? "#FDF0DC" : "#fff", border: "1px solid #E3ECEA", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 12, color: "#8FA6A4", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: warn ? "#D97706" : "#1B2A2E" }}>{value}</div>
    </div>
  );
}

function EmptyState({ text }) {
  return <div style={{ textAlign: "center", padding: "30px 16px", color: "#8FA6A4", fontSize: 13.5 }}>{text}</div>;
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

function ResumenTab({ sales, categories, employees, range, setRange }) {
  const filtered = sales.filter((s) => inRange(s.date, range));
  const total = filtered.reduce((a, s) => a + s.total, 0);
  const count = filtered.length;

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
                  <span style={{ fontWeight: 500 }}>{name} <span style={{ color: "#8FA6A4", fontWeight: 400 }}>x{data.qty}</span></span>
                  <span style={{ fontWeight: 700 }}>${fmt(data.revenue)}</span>
                </div>
                <div style={{ height: 6, background: "#EFF4F3", borderRadius: 4 }}>
                  <div style={{ height: 6, width: `${maxRevenue ? (data.revenue / maxRevenue) * 100 : 0}%`, background: "#0F6E66", borderRadius: 4 }} />
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
    <div style={{ background: "#fff", border: "1px solid #E3ECEA", borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#5C7A78", marginBottom: 10 }}>{title.toUpperCase()}</div>
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
      <div style={{ height: 6, background: "#EFF4F3", borderRadius: 4 }}>
        <div style={{ height: 6, width: `${max ? (value / max) * 100 : 0}%`, background: "#0F6E66", borderRadius: 4 }} />
      </div>
    </div>
  );
}

// ---------------- Historial ----------------

function HistorialTab({ sales, onView, methodLabel }) {
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
          <button key={s.id} onClick={() => onView(s)} style={{ textAlign: "left", background: "#fff", border: "1px solid #E3ECEA", borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Comprobante #{s.number}</div>
              <div style={{ fontSize: 12, color: "#8FA6A4" }}>
                {new Date(s.date).toLocaleString("es-AR")} · {methodLabel[s.method]}{s.employeeName ? ` · ${s.employeeName}` : ""}
              </div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0F6E66" }}>${fmt(s.total)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------- Equipo ----------------

function EquipoTab({ employees, openNew, openEdit, onDelete }) {
  return (
    <div>
      <button onClick={openNew} style={{ width: "100%", padding: 12, borderRadius: 10, border: "1.5px dashed #0F6E66", background: "#fff", color: "#0F6E66", fontWeight: 700, fontSize: 14, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Plus size={16} /> Agregar empleado
      </button>
      {employees.length === 0 && <EmptyState text="Sin empleados cargados. Mientras no haya ninguno, la app se usa sin selección de usuario." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {employees.map((e) => (
          <div key={e.id} style={{ background: "#fff", border: "1px solid #E3ECEA", borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#E3F3F0", color: "#0F6E66", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>
              {e.name.slice(0, 1).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{e.name}</div>
              <div style={{ fontSize: 12, color: "#8FA6A4" }}>{e.pin ? "Con PIN" : "Sin PIN"}</div>
            </div>
            <IconBtn onClick={() => openEdit(e)}><Pencil size={13} /></IconBtn>
            <IconBtn danger onClick={() => { if (confirm(`¿Eliminar a "${e.name}"?`)) onDelete(e.id); }}><Trash2 size={13} /></IconBtn>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Modales ----------------

function ProductFormModal({ form, setForm, categories, onSave, onClose }) {
  const isEdit = !!form.id;
  const addModifier = () => setForm({ ...form, modifiers: [...(form.modifiers || []), { name: "", price: "" }] });
  const updateModifier = (idx, key, val) => {
    const mods = [...form.modifiers];
    mods[idx] = { ...mods[idx], [key]: val };
    setForm({ ...form, modifiers: mods });
  };
  const removeModifier = (idx) => setForm({ ...form, modifiers: form.modifiers.filter((_, i) => i !== idx) });

  const handleSave = () => {
    const cleanMods = (form.modifiers || [])
      .map((m) => ({ name: (m.name || "").trim(), price: parseFloat(m.price) || 0 }))
      .filter((m) => m.name);
    onSave({ ...form, modifiers: cleanMods });
  };

  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{isEdit ? "Editar producto" : "Nuevo producto"}</div>
        <button onClick={onClose} style={{ border: "none", background: "none", color: "#8FA6A4" }}><X size={20} /></button>
      </div>

      <Field label="Nombre"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Detergente 1L" style={inputStyle} /></Field>
      <Field label="Código de barras (opcional)">
        <input value={form.barcode || ""} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="Escaneá el producto con la pistola acá" style={inputStyle} />
      </Field>
      <Field label="Categoría">
        <select value={form.categoryId || ""} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} style={inputStyle}>
          <option value="">Sin categoría</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Precio" style={{ flex: 1 }}><input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" style={inputStyle} /></Field>
        <Field label="Stock" style={{ flex: 1 }}><input type="number" min="0" step="1" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="0" style={inputStyle} /></Field>
      </div>

      <Field label="Modificadores (opcionales — ej: tamaño, sabor)">
        {(form.modifiers || []).map((m, idx) => (
          <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input value={m.name} onChange={(e) => updateModifier(idx, "name", e.target.value)} placeholder="Nombre" style={{ ...inputStyle, flex: 2 }} />
            <input type="number" step="0.01" value={m.price} onChange={(e) => updateModifier(idx, "price", e.target.value)} placeholder="+$" style={{ ...inputStyle, flex: 1 }} />
            <IconBtn danger onClick={() => removeModifier(idx)}><Trash2 size={13} /></IconBtn>
          </div>
        ))}
        <button onClick={addModifier} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", color: "#0F6E66", fontSize: 12.5, fontWeight: 600, padding: "4px 0" }}>
          <Plus size={13} /> Agregar modificador
        </button>
      </Field>

      <button onClick={handleSave} style={{ width: "100%", marginTop: 8, padding: 13, borderRadius: 10, border: "none", background: "#0F6E66", color: "#fff", fontWeight: 700, fontSize: 14.5 }}>
        {isEdit ? "Guardar cambios" : "Agregar producto"}
      </button>
    </Overlay>
  );
}

function CategoryFormModal({ form, setForm, onSave, onClose }) {
  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{form.id ? "Editar categoría" : "Nueva categoría"}</div>
        <button onClick={onClose} style={{ border: "none", background: "none", color: "#8FA6A4" }}><X size={20} /></button>
      </div>
      <Field label="Nombre"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Limpieza de cocina" style={inputStyle} /></Field>
      <button onClick={onSave} style={{ width: "100%", marginTop: 8, padding: 13, borderRadius: 10, border: "none", background: "#0F6E66", color: "#fff", fontWeight: 700, fontSize: 14.5 }}>Guardar</button>
    </Overlay>
  );
}

function EmployeeFormModal({ form, setForm, onSave, onClose }) {
  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{form.id ? "Editar empleado" : "Nuevo empleado"}</div>
        <button onClick={onClose} style={{ border: "none", background: "none", color: "#8FA6A4" }}><X size={20} /></button>
      </div>
      <Field label="Nombre"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Juan" style={inputStyle} /></Field>
      <Field label="PIN de 4 dígitos (opcional)">
        <input value={form.pin || ""} inputMode="numeric" maxLength={4} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="Sin PIN" style={inputStyle} />
      </Field>
      <button onClick={onSave} style={{ width: "100%", marginTop: 8, padding: 13, borderRadius: 10, border: "none", background: "#0F6E66", color: "#fff", fontWeight: 700, fontSize: 14.5 }}>Guardar</button>
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
        <button onClick={onClose} style={{ border: "none", background: "none", color: "#8FA6A4" }}><X size={20} /></button>
      </div>
      <div style={{ fontSize: 12.5, color: "#5C7A78", marginBottom: 10, fontWeight: 600 }}>ELEGIR OPCIONES</div>
      {product.modifiers.map((m, idx) => {
        const active = selected.some((s) => s.name === m.name);
        return (
          <button key={idx} onClick={() => toggle(m)} style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 12px",
            borderRadius: 10, border: active ? "1.5px solid #0F6E66" : "1px solid #DCE7E5", background: active ? "#E3F3F0" : "#fff", marginBottom: 8,
          }}>
            <span style={{ fontSize: 13.5, fontWeight: 500, color: active ? "#0F6E66" : "#1B2A2E" }}>{m.name}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: active ? "#0F6E66" : "#5C7A78" }}>+${fmt(m.price)}</span>
          </button>
        );
      })}
      <button onClick={() => onConfirm(selected)} style={{ width: "100%", marginTop: 8, padding: 13, borderRadius: 10, border: "none", background: "#0F6E66", color: "#fff", fontWeight: 700, fontSize: 14.5 }}>
        Agregar · ${fmt(product.price + extra)}
      </button>
    </Overlay>
  );
}

function ReceiptModal({ sale, methodLabel, onClose }) {
  return (
    <Overlay onClose={onClose}>
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
        <button onClick={onClose} style={{ border: "none", background: "none", color: "#8FA6A4" }}><X size={20} /></button>
      </div>
      <div className="receipt-print" style={{ background: "#fff", borderRadius: 4, padding: "22px 20px", fontFamily: mono, border: "1px solid #E3ECEA" }}>
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>MI COMERCIO</div>
          <div style={{ fontSize: 10.5, color: "#8FA6A4", marginTop: 2 }}>Comprobante interno · no válido como factura fiscal</div>
        </div>
        <Dashed />
        <div style={{ fontSize: 12, display: "flex", justifyContent: "space-between", margin: "8px 0 4px" }}>
          <span>N° {String(sale.number).padStart(4, "0")}</span>
          <span>{new Date(sale.date).toLocaleString("es-AR")}</span>
        </div>
        {sale.employeeName && <div style={{ fontSize: 11.5, color: "#8FA6A4" }}>Atendió: {sale.employeeName}</div>}
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
                  <div style={{ fontSize: 10.5, color: "#8FA6A4" }}>{i.modifiers.map((m) => m.name).join(", ")}</div>
                )}
                <div style={{ fontSize: 10.5, color: "#8FA6A4" }}>{i.qty} x ${fmt(i.price + extras)}</div>
              </div>
            );
          })}
        </div>
        <Dashed />
        {sale.discountAmount > 0 && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#5C7A78" }}><span>Subtotal</span><span>${fmt(sale.subtotal)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#D97706" }}><span>Descuento</span><span>-${fmt(sale.discountAmount)}</span></div>
          </>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, margin: "8px 0" }}>
          <span>TOTAL</span><span>${fmt(sale.total)}</span>
        </div>
        <div style={{ fontSize: 11.5, color: "#5C7A78" }}>Pago: {methodLabel[sale.method]}</div>
        <Dashed />
        <div style={{ textAlign: "center", fontSize: 10.5, color: "#8FA6A4", marginTop: 6 }}>¡Gracias por su compra!</div>
      </div>

      <button onClick={() => window.print()} className="no-print" style={{ width: "100%", marginTop: 12, padding: 12, borderRadius: 10, border: "1px solid #DCE7E5", background: "#fff", color: "#1B2A2E", fontWeight: 600, fontSize: 13.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Printer size={15} /> Imprimir
      </button>
      <button onClick={onClose} className="no-print" style={{ width: "100%", marginTop: 8, padding: 12, borderRadius: 10, border: "none", background: "#0F6E66", color: "#fff", fontWeight: 700, fontSize: 14 }}>Listo</button>
    </Overlay>
  );
}

function Dashed() { return <div style={{ borderTop: "1.5px dashed #DCE7E5", margin: "4px 0" }} />; }

function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom: 12, ...style }}>
      <div style={{ fontSize: 12.5, color: "#5C7A78", marginBottom: 5, fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  );
}
const inputStyle = { width: "100%", padding: "9px 11px", borderRadius: 9, border: "1px solid #DCE7E5", fontSize: 14 };

function Overlay({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,30,28,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#F6F9F8", borderRadius: "18px 18px 0 0", padding: 20, width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto" }}>
        {children}
      </div>
    </div>
  );
}
