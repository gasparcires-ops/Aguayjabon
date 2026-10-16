// ---------------------------------------------------------------------------
// Reporte compacto del negocio, pensado para que lo lea Claude (o cualquier
// asistente) y lo interprete: datos ya resumidos + ventas en crudo en formato
// compacto, con un encabezado que explica qué es cada cosa y qué se quiere
// saber. Devuelve un texto en Markdown.
//
// Convenciones: montos en pesos redondeados; márgenes calculados sobre el
// COSTO ((precio - costo) / costo), igual que en la app.
// ---------------------------------------------------------------------------
import { lotesEfectivos } from "./lotes";

const DIAS = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
const r0 = (n) => Math.round(Number(n) || 0);
const pct = (n) => (n === null || n === undefined || !isFinite(n) ? "-" : Math.round(n) + "%");
const limpiar = (s) => String(s == null ? "" : s).replace(/[|\n\r]/g, " ").trim();
const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const ym = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
const tabla = (cabecera, filas) => [cabecera.join("|"), ...filas.map((f) => f.join("|"))].join("\n");

export function generarReporte({ sales, products, categories, compras = [], cajaHistorial = [], metodos = {} }) {
  const ahora = new Date();
  const dias = (d) => Math.floor((ahora - d) / 86400000);
  const prodPorId = {};
  products.forEach((p) => { prodPorId[p.id] = p; });
  const catNombre = (id) => (categories.find((c) => c.id === id) || {}).name || "Sin categoría";
  const costoItem = (i) => (i.cost != null ? i.cost : (prodPorId[i.productId] && prodPorId[i.productId].cost) || 0);
  const catItem = (i) => (i.categoryId != null ? i.categoryId : prodPorId[i.productId] ? prodPorId[i.productId].categoryId : null);
  const margenSobreCosto = (precio, costo) => (costo > 0 && precio > 0 ? ((precio - costo) / costo) * 100 : null);

  // ---- ventas consideradas ----
  // Se excluyen los pedidos del catálogo sin confirmar y las ventas anotadas
  // sin cobrar (fiado/pendientes); esas se listan aparte.
  const noContables = sales.filter((s) => (s.origen === "catalogo" && !s.confirmado) || s.pending);
  const ventas = sales
    .filter((s) => !((s.origen === "catalogo" && !s.confirmado) || s.pending))
    .map((s) => {
      const fecha = new Date(s.date);
      const gananciaBruta = s.items.reduce((a, i) => a + (i.price - costoItem(i)) * i.qty, 0);
      return {
        s, fecha,
        total: s.total || 0,
        ganancia: gananciaBruta - (s.discountAmount || 0),
        unidades: s.items.reduce((a, i) => a + i.qty, 0),
        origen: s.origen || "mostrador",
      };
    })
    .sort((a, b) => a.fecha - b.fecha);

  const out = [];
  const H = (t) => out.push("\n## " + t);
  const P = (t) => out.push(t);

  // ---- encabezado / instrucciones ----
  P("# REPORTE DEL NEGOCIO — Agua y Jabón (local de artículos de limpieza)");
  P(`Generado: ${ahora.toLocaleString("es-AR")} · Datos de ventas: ${ventas.length ? ymd(ventas[0].fecha) + " a " + ymd(ventas[ventas.length - 1].fecha) : "sin ventas"} · Moneda: pesos argentinos`);
  P("");
  P("## PARA CLAUDE: qué hacer con este archivo");
  P("Soy el dueño de un local de artículos de limpieza (con venta al mostrador, catálogo web y ventas a mayoristas). Este archivo es un resumen de mis datos. Analizalos y respondeme en español, simple y concreto, sin tecnicismos:");
  P("1. **Diagnóstico**: cómo viene el negocio (tendencia mensual, ticket promedio, ganancia y margen) y qué es lo más importante que ves.");
  P("2. **En qué estoy fallando**: productos sin precio/costo, márgenes bajos, quiebres de stock en productos que se venden, capital inmovilizado en productos que no rotan, días/horarios flojos, descuentos excesivos, diferencias de caja.");
  P("3. **Cómo maximizar ventas y ganancia**: acciones concretas y priorizadas (ofertas/combos para el stock parado, a qué productos subir el precio, qué reponer primero y cuánto, promociones para los días flojos, mejor mezcla de formas de pago). Para cada acción decime por qué (con el dato) y el impacto estimado.");
  P("4. **Plan para la próxima semana**: máximo 5 acciones ordenadas por impacto.");
  P("Si falta algún dato para concluir algo con seguridad, decímelo en vez de inventar. Ojo con los períodos con pocas ventas: los promedios son poco confiables.");
  P("");
  P("### Cómo leer los datos");
  P("- Cada tabla usa `|` como separador. `gan` = ganancia (venta − costo; ya descontados los descuentos). `margen` = (precio − costo) / costo (sobre el COSTO, no sobre el precio de venta).");
  P("- El costo de cada venta está congelado al momento de vender (sistema FIFO por lotes): la ganancia histórica no cambia aunque cambie el costo de compra después.");
  P("- No incluye pedidos del catálogo web sin confirmar ni ventas anotadas sin cobrar (esas están en la sección 'Pendientes').");
  P("- Ventas con origen `mayorista` son ventas a otros comercios, con precio distinto al del público.");

  // ---- resumen ----
  const totalV = ventas.reduce((a, v) => a + v.total, 0);
  const totalG = ventas.reduce((a, v) => a + v.ganancia, 0);
  const descTot = ventas.reduce((a, v) => a + (v.s.discountAmount || 0), 0);
  const recTot = ventas.reduce((a, v) => a + (v.s.surchargeAmount || 0), 0);
  const unidTot = ventas.reduce((a, v) => a + v.unidades, 0);
  H("1. RESUMEN GENERAL");
  P(`- Ventas registradas: ${ventas.length} · Vendido: $${r0(totalV)} · Ganancia: $${r0(totalG)} (${pct(totalV > 0 ? (totalG / totalV) * 100 : null)} del vendido) · Ticket promedio: $${r0(ventas.length ? totalV / ventas.length : 0)} · Unidades: ${unidTot}`);
  P(`- Descuentos otorgados: $${r0(descTot)} (${pct(totalV + descTot > 0 ? (descTot / (totalV + descTot)) * 100 : null)} de lo que se hubiera vendido sin descuento) · Recargos cobrados (crédito/Mercado Pago): $${r0(recTot)}`);
  P(`- Productos cargados: ${products.length} · Categorías: ${categories.length} · Ventas sin costo cargado (ganancia no confiable): ${ventas.filter((v) => v.s.items.some((i) => costoItem(i) <= 0)).length}`);

  // ---- por mes ----
  H("2. POR MES");
  const meses = {};
  ventas.forEach((v) => {
    const k = ym(v.fecha);
    if (!meses[k]) meses[k] = { n: 0, total: 0, gan: 0, unid: 0 };
    meses[k].n++; meses[k].total += v.total; meses[k].gan += v.ganancia; meses[k].unid += v.unidades;
  });
  P(tabla(["mes", "ventas", "vendido", "gan", "gan%", "ticket", "unidades"],
    Object.keys(meses).sort().map((k) => { const m = meses[k]; return [k, m.n, r0(m.total), r0(m.gan), pct(m.total > 0 ? (m.gan / m.total) * 100 : null), r0(m.n ? m.total / m.n : 0), m.unid]; })));
  P("(El último mes puede estar incompleto.)");

  // ---- por día (últimos 60) ----
  H("3. ÚLTIMOS 60 DÍAS, DÍA POR DÍA (los días sin ventas figuran con 0)");
  const porDia = {};
  ventas.forEach((v) => {
    const k = ymd(v.fecha);
    if (!porDia[k]) porDia[k] = { n: 0, total: 0, gan: 0 };
    porDia[k].n++; porDia[k].total += v.total; porDia[k].gan += v.ganancia;
  });
  const filasDia = [];
  for (let i = 59; i >= 0; i--) {
    const d = new Date(ahora); d.setDate(d.getDate() - i);
    const x = porDia[ymd(d)] || { n: 0, total: 0, gan: 0 };
    filasDia.push([ymd(d), DIAS[d.getDay()], x.n, r0(x.total), r0(x.gan)]);
  }
  P(tabla(["fecha", "dia", "ventas", "vendido", "gan"], filasDia));

  // ---- día de la semana y hora ----
  H("4. PROMEDIO POR DÍA DE LA SEMANA (últimas 12 semanas)");
  const ini12 = new Date(ahora); ini12.setHours(0, 0, 0, 0); ini12.setDate(ini12.getDate() - 12 * 7 + 1);
  const ocurr = [0, 0, 0, 0, 0, 0, 0];
  for (let d = new Date(ini12); d <= ahora; d.setDate(d.getDate() + 1)) ocurr[d.getDay()]++;
  const sem = [0, 1, 2, 3, 4, 5, 6].map(() => ({ n: 0, total: 0, gan: 0 }));
  ventas.forEach((v) => { if (v.fecha >= ini12) { const x = sem[v.fecha.getDay()]; x.n++; x.total += v.total; x.gan += v.ganancia; } });
  P(tabla(["dia", "ventas", "vendido_total", "promedio_por_dia", "gan_promedio"],
    [1, 2, 3, 4, 5, 6, 0].map((dw) => [DIAS[dw], sem[dw].n, r0(sem[dw].total), r0(ocurr[dw] ? sem[dw].total / ocurr[dw] : 0), r0(ocurr[dw] ? sem[dw].gan / ocurr[dw] : 0)])));

  H("5. POR HORA DEL DÍA (todo el historial)");
  const hor = {};
  ventas.forEach((v) => { const h = v.fecha.getHours(); if (!hor[h]) hor[h] = { n: 0, total: 0 }; hor[h].n++; hor[h].total += v.total; });
  P(tabla(["hora", "ventas", "vendido"], Object.keys(hor).map(Number).sort((a, b) => a - b).map((h) => [h + "h", hor[h].n, r0(hor[h].total)])));

  // ---- por forma de pago / origen / empleado ----
  const agrupar = (clave) => {
    const g = {};
    ventas.forEach((v) => { const k = clave(v) || "(sin dato)"; if (!g[k]) g[k] = { n: 0, total: 0, gan: 0 }; g[k].n++; g[k].total += v.total; g[k].gan += v.ganancia; });
    return Object.entries(g).sort((a, b) => b[1].total - a[1].total).map(([k, x]) => [k, x.n, r0(x.total), r0(x.gan), pct(x.total > 0 ? (x.gan / x.total) * 100 : null), r0(x.n ? x.total / x.n : 0)]);
  };
  H("6. POR FORMA DE PAGO, ORIGEN Y EMPLEADO");
  P("Forma de pago:");
  P(tabla(["pago", "ventas", "vendido", "gan", "gan%", "ticket"], agrupar((v) => metodos[v.s.method] || v.s.method)));
  P("\nOrigen de la venta:");
  P(tabla(["origen", "ventas", "vendido", "gan", "gan%", "ticket"], agrupar((v) => v.origen)));
  P("\nEmpleado:");
  P(tabla(["empleado", "ventas", "vendido", "gan", "gan%", "ticket"], agrupar((v) => v.s.employeeName)));

  // ---- por producto ----
  const d30 = new Date(ahora); d30.setDate(d30.getDate() - 30);
  const d90 = new Date(ahora); d90.setDate(d90.getDate() - 90);
  const stats = {};
  const tomar = (id) => (stats[id] = stats[id] || { u30: 0, u90: 0, ing90: 0, gan90: 0, uTot: 0, ingTot: 0, ganTot: 0, ultima: null });
  ventas.forEach((v) => {
    v.s.items.forEach((i) => {
      const x = tomar(i.productId);
      const ing = i.price * i.qty, gan = (i.price - costoItem(i)) * i.qty;
      x.uTot += i.qty; x.ingTot += ing; x.ganTot += gan;
      if (v.fecha >= d90) { x.u90 += i.qty; x.ing90 += ing; x.gan90 += gan; }
      if (v.fecha >= d30) x.u30 += i.qty;
      if (!x.ultima || v.fecha > x.ultima) x.ultima = v.fecha;
    });
  });
  const costoStock = (p) => lotesEfectivos(p).reduce((a, l) => a + l.qty * (l.costoUnitario || 0), 0);
  const filasProd = products.map((p) => {
    const x = stats[p.id] || { u30: 0, u90: 0, ing90: 0, gan90: 0, uTot: 0, ingTot: 0, ganTot: 0, ultima: null };
    const cs = costoStock(p);
    const ventaDiaria = x.u30 / 30;
    return {
      p, x,
      capital: cs > 0 ? cs : 0,
      cobertura: ventaDiaria > 0 ? (p.stock || 0) / ventaDiaria : null,
      margen: margenSobreCosto(p.price, p.cost),
    };
  }).sort((a, b) => b.x.gan90 - a.x.gan90 || b.x.u90 - a.x.u90);
  H("7. PRODUCTOS (ordenados por ganancia de los últimos 90 días)");
  P("Columnas: precio y costo actuales · stock · u30/u90 = unidades vendidas en 30/90 días · ing90/gan90 = facturación/ganancia 90 días · cobertura = días que dura el stock al ritmo de los últimos 30 días · capital = costo del stock actual · ult = días desde la última venta");
  P(tabla(["producto", "categoria", "precio", "costo", "margen", "stock", "u30", "u90", "ing90", "gan90", "cobertura_dias", "capital", "ult"],
    filasProd.slice(0, 700).map(({ p, x, capital, cobertura, margen }) => [
      limpiar(p.name), limpiar(catNombre(p.categoryId)), r0(p.price), r0(p.cost), pct(margen), p.stock || 0,
      x.u30, x.u90, r0(x.ing90), r0(x.gan90), cobertura === null ? "-" : Math.round(cobertura), r0(capital), x.ultima ? dias(x.ultima) : "nunca",
    ])));
  if (filasProd.length > 700) P(`(Se muestran 700 de ${filasProd.length} productos.)`);

  // ---- categorías ----
  H("8. POR CATEGORÍA");
  const cats = {};
  ventas.forEach((v) => v.s.items.forEach((i) => {
    const k = catNombre(catItem(i));
    if (!cats[k]) cats[k] = { u: 0, ing: 0, gan: 0, ing90: 0, gan90: 0 };
    const ing = i.price * i.qty, gan = (i.price - costoItem(i)) * i.qty;
    cats[k].u += i.qty; cats[k].ing += ing; cats[k].gan += gan;
    if (v.fecha >= d90) { cats[k].ing90 += ing; cats[k].gan90 += gan; }
  }));
  const capCat = {};
  products.forEach((p) => { const k = catNombre(p.categoryId); capCat[k] = (capCat[k] || 0) + costoStock(p); });
  const nombresCat = Array.from(new Set([...Object.keys(cats), ...Object.keys(capCat)]));
  P(tabla(["categoria", "unidades_total", "facturado_total", "gan_total", "gan%", "facturado_90d", "gan_90d", "capital_en_stock"],
    nombresCat.map((k) => { const c = cats[k] || { u: 0, ing: 0, gan: 0, ing90: 0, gan90: 0 }; return [limpiar(k), c.u, r0(c.ing), r0(c.gan), pct(c.ing > 0 ? (c.gan / c.ing) * 100 : null), r0(c.ing90), r0(c.gan90), r0(capCat[k] || 0)]; })
      .sort((a, b) => b[2] - a[2])));

  // ---- alertas ----
  H("9. ALERTAS Y PROBLEMAS DETECTADOS");
  const lista = (titulo, arr, fmtFila) => {
    P(`\n**${titulo}** (${arr.length})`);
    if (arr.length === 0) P("- ninguno");
    arr.slice(0, 60).forEach((x) => P("- " + fmtFila(x)));
    if (arr.length > 60) P(`- ...y ${arr.length - 60} más`);
  };
  lista("Sin precio de venta", products.filter((p) => !p.price || p.price <= 0), (p) => limpiar(p.name));
  lista("Sin costo cargado (no se puede calcular la ganancia)", products.filter((p) => p.price > 0 && (!p.cost || p.cost <= 0)), (p) => `${limpiar(p.name)} (precio $${r0(p.price)})`);
  lista("Margen menor al 30% sobre el costo", products.filter((p) => { const m = margenSobreCosto(p.price, p.cost); return m !== null && m < 30; }).sort((a, b) => margenSobreCosto(a.price, a.cost) - margenSobreCosto(b.price, b.cost)),
    (p) => `${limpiar(p.name)}: margen ${pct(margenSobreCosto(p.price, p.cost))} (costo $${r0(p.cost)}, precio $${r0(p.price)}, vendió ${(stats[p.id] || { u90: 0 }).u90} u. en 90 días)`);
  lista("QUIEBRE: sin stock pero se vendió en los últimos 90 días (ventas perdidas)", filasProd.filter((f) => (f.p.stock || 0) <= 0 && f.x.u90 > 0).sort((a, b) => b.x.u90 - a.x.u90),
    (f) => `${limpiar(f.p.name)}: vendió ${f.x.u90} u. en 90 días, ganancia $${r0(f.x.gan90)}`);
  lista("Stock por agotarse (cobertura menor a 10 días al ritmo actual)", filasProd.filter((f) => f.cobertura !== null && f.p.stock > 0 && f.cobertura < 10).sort((a, b) => a.cobertura - b.cobertura),
    (f) => `${limpiar(f.p.name)}: quedan ${f.p.stock} (alcanza ~${Math.round(f.cobertura)} días), vende ${f.x.u30} u./mes`);
  lista("Sin movimiento: tienen stock y no se vendieron en 90 días (capital inmovilizado)", filasProd.filter((f) => f.p.stock > 0 && f.x.u90 === 0).sort((a, b) => b.capital - a.capital),
    (f) => `${limpiar(f.p.name)}: stock ${f.p.stock}, capital $${r0(f.capital)}, ${f.x.ultima ? "última venta hace " + dias(f.x.ultima) + " días" : "nunca se vendió"}`);
  lista("Sobrestock: el stock alcanza más de 120 días al ritmo actual", filasProd.filter((f) => f.cobertura !== null && f.cobertura > 120).sort((a, b) => b.capital - a.capital),
    (f) => `${limpiar(f.p.name)}: stock ${f.p.stock} (~${Math.round(f.cobertura)} días), capital $${r0(f.capital)}`);
  const capTotal = products.reduce((a, p) => a + costoStock(p), 0);
  const capParado = filasProd.filter((f) => f.p.stock > 0 && f.x.u90 === 0).reduce((a, f) => a + f.capital, 0);
  P(`\nCapital total en stock (a costo): $${r0(capTotal)} · de ese capital, parado hace 90+ días: $${r0(capParado)} (${pct(capTotal > 0 ? (capParado / capTotal) * 100 : null)})`);

  // ---- compras ----
  H("10. CARGAS DE STOCK (compras registradas, últimos 90 días)");
  const comp = compras.filter((c) => new Date(c.date) >= d90);
  if (comp.length === 0) P("- sin registros");
  else P(tabla(["fecha", "producto", "cantidad", "costo_unit", "total"], comp.map((c) => [ymd(new Date(c.date)), limpiar(c.productName), c.qty, r0(c.costoUnitario), r0(c.total)])));

  // ---- caja ----
  H("11. CIERRES DE CAJA (últimos 30)");
  if (cajaHistorial.length === 0) P("- sin cierres");
  else P(tabla(["fecha", "empleado", "apertura", "ventas_efectivo", "esperado", "contado", "diferencia"],
    cajaHistorial.slice(0, 30).map((c) => [ymd(new Date(c.openedAt)), limpiar(c.employeeName), r0(c.openingAmount), r0(c.ventasEfectivo), r0(c.esperado), r0(c.counted), r0(c.diferencia)])));

  // ---- pendientes ----
  H("12. PENDIENTES (no incluidos en los totales)");
  if (noContables.length === 0) P("- ninguno");
  else P(tabla(["fecha", "tipo", "total", "cliente"], noContables.slice(0, 50).map((s) => [ymd(new Date(s.date)), s.pending ? "sin cobrar" : "pedido web sin confirmar", r0(s.total), limpiar(s.cliente || "")])));

  // ---- ventas en crudo ----
  H("13. VENTAS EN CRUDO (últimos 90 días, hasta 2500 ventas)");
  P("Formato: fecha hora|pago|origen|total|descuento|items como `cantidad×producto@precio` separados por `;`");
  const crudas = ventas.filter((v) => v.fecha >= d90).slice(-2500);
  P(crudas.map((v) =>
    [ymd(v.fecha) + " " + String(v.fecha.getHours()).padStart(2, "0") + ":" + String(v.fecha.getMinutes()).padStart(2, "0"),
      metodos[v.s.method] || v.s.method, v.origen, r0(v.total), r0(v.s.discountAmount || 0),
      v.s.items.map((i) => `${i.qty}×${limpiar(i.name)}@${r0(i.price)}`).join(";")].join("|")
  ).join("\n"));

  return out.join("\n") + "\n";
}
