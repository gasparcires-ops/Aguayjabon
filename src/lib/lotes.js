// ---------------------------------------------------------------------------
// Costeo por lotes (FIFO) para el stock de cada producto.
//
// Cada producto puede tener un mismo artículo comprado en distintos momentos
// a distintos costos (por ejemplo: compraste 3 a $5000 y después repusiste a
// $6000). Para que la ganancia registrada en cada venta sea la real, cada
// producto guarda un array `lotes`: cada lote es una "camada" de stock que
// entró junto, con su cantidad y su costo unitario.
//
// Al vender, se descuenta siempre del lote más viejo primero (FIFO), y el
// costo que queda grabado en esa venta es un promedio ponderado de lo que
// realmente se consumió. Ese costo NO se vuelve a tocar después, así que
// cambiar el costo de compra a futuro nunca altera la ganancia de ventas
// que ya pasaron.
//
// Un producto que todavía no tiene `lotes` cargados (viejo, de antes de este
// sistema) se trata como si tuviera un único lote igual a su stock actual,
// al costo que tenga cargado en `product.cost`.

export const uidLote = () => "lt" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const nuevoLote = (qty, costoUnitario, fecha) => ({
  id: uidLote(),
  qty,
  costoUnitario: costoUnitario > 0 ? costoUnitario : 0,
  fecha: fecha || new Date().toISOString(),
});

// Lotes efectivos de un producto: los propios si existen, o uno solo
// "heredado" del stock/costo actual si todavía no tiene lotes cargados.
export function lotesEfectivos(product) {
  if (product.lotes && product.lotes.length > 0) return product.lotes;
  if (product.stock > 0) return [{ id: "heredado", qty: product.stock, costoUnitario: product.cost || 0, fecha: null }];
  return [];
}

// Agrega stock nuevo como un lote al final de la cola (lo más reciente se
// vende después de lo viejo). Devuelve el producto actualizado.
export function agregarLoteStock(product, qty, costoUnitario) {
  if (!qty || qty <= 0) return product;
  const lotes = [...lotesEfectivos(product), nuevoLote(qty, costoUnitario)];
  return {
    ...product,
    stock: (product.stock || 0) + qty,
    lotes,
    cost: costoUnitario > 0 ? costoUnitario : product.cost,
  };
}

// Reconcilia los lotes cuando el stock se edita a mano (formulario de
// producto): si el nuevo stock es mayor, agrega la diferencia como lote
// nuevo al costo indicado; si es menor, descuenta de los lotes más nuevos
// primero (es una corrección manual, no una venta).
export function sincronizarLotesConStock(product, nuevoStock, costoNuevo) {
  const stockActual = product.stock || 0;
  const delta = nuevoStock - stockActual;
  let lotes = lotesEfectivos(product);
  if (delta > 0) {
    lotes = [...lotes, nuevoLote(delta, costoNuevo)];
  } else if (delta < 0) {
    let restante = -delta;
    const invertidos = [...lotes].reverse();
    const recortados = [];
    for (const lote of invertidos) {
      if (restante <= 0) { recortados.push(lote); continue; }
      const quitar = Math.min(lote.qty, restante);
      restante -= quitar;
      const quedan = lote.qty - quitar;
      if (quedan > 0) recortados.push({ ...lote, qty: quedan });
    }
    lotes = recortados.reverse();
  }
  return lotes;
}

// Consume `qty` unidades de un producto siguiendo FIFO (lo más viejo
// primero). Devuelve los lotes que quedan y el costo (total y promedio por
// unidad) de lo que se consumió, para grabarlo en la venta.
export function consumirFIFO(product, qty) {
  let restante = qty;
  let costoTotal = 0;
  const lotes = lotesEfectivos(product);
  const nuevosLotes = [];
  for (const lote of lotes) {
    if (restante <= 0) { nuevosLotes.push(lote); continue; }
    const tomar = Math.min(lote.qty, restante);
    costoTotal += tomar * (lote.costoUnitario || 0);
    restante -= tomar;
    const quedan = lote.qty - tomar;
    if (quedan > 0) nuevosLotes.push({ ...lote, qty: quedan });
  }
  // Si los lotes no alcanzan a cubrir toda la venta (datos inconsistentes,
  // venta con stock en negativo), lo que falta se valora al último costo
  // conocido del producto para no perder el registro.
  if (restante > 0) costoTotal += restante * (product.cost || 0);
  const costoUnitarioPromedio = qty > 0 ? costoTotal / qty : 0;
  return { lotes: nuevosLotes, costoTotal, costoUnitarioPromedio };
}

// Devuelve stock a un producto (por ejemplo al borrar una venta/pedido),
// como un lote al FRENTE de la cola con el costo que tenía cuando se vendió,
// para que sea lo primero en volver a salir.
export function restaurarLote(product, qty, costoUnitario, fecha) {
  if (!qty || qty <= 0) return product;
  const lotes = [{ id: uidLote(), qty, costoUnitario: costoUnitario || 0, fecha: fecha || null }, ...lotesEfectivos(product)];
  return { ...product, stock: (product.stock || 0) + qty, lotes };
}
