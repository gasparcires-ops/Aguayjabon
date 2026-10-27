import { jsPDF } from "jspdf";

// Etiquetas de góndola 64 x 40 mm (opción B: franja azul con el nombre + precio grande).
// Hoja A4 sin separación entre etiquetas: 3 columnas x 7 filas = 21 por hoja, centradas.
const W = 64, H = 40, COLS = 3, ROWS = 7, A4W = 210, A4H = 297;
const BAND = 16; // alto de la franja azul con el nombre

const plata = (n) => "$" + Math.round(n).toLocaleString("es-AR");

// Tipografía fija e igual en todas las etiquetas (mismo tamaño de nombre y de precio).
const F_NOMBRE = 12, F_PRECIO = 36, MAX_LINEAS = 3;

function dibujar(doc, x, y, nombre, precio) {
  doc.setFillColor(27, 79, 156);
  doc.rect(x, y, W, BAND, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(F_NOMBRE);
  let lineas = doc.splitTextToSize(nombre, W - 6);
  if (lineas.length > MAX_LINEAS) {
    lineas = lineas.slice(0, MAX_LINEAS);
    lineas[MAX_LINEAS - 1] = lineas[MAX_LINEAS - 1].replace(/.{0,2}$/, "…");
  }
  const alto = F_NOMBRE * 0.3528 * 1.15;
  let ty = y + (BAND - alto * lineas.length) / 2 + alto * 0.78;
  lineas.forEach((l) => { doc.text(l, x + W / 2, ty, { align: "center" }); ty += alto; });
  doc.setTextColor(16, 36, 61);
  doc.setFontSize(F_PRECIO);
  const cy = y + BAND + (H - BAND) / 2;
  doc.text(plata(precio), x + W / 2, cy + F_PRECIO * 0.3528 * 0.36, { align: "center" });
  doc.setDrawColor(170, 170, 170);
  doc.setLineWidth(0.1);
  doc.rect(x, y, W, H, "S");
}

export function descargarEtiquetasPDF(items, nombreArchivo = "etiquetas-precios.pdf") {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const x0 = (A4W - COLS * W) / 2;
  const y0 = (A4H - ROWS * H) / 2;
  const porHoja = COLS * ROWS;
  items.forEach((it, i) => {
    if (i > 0 && i % porHoja === 0) doc.addPage();
    const k = i % porHoja;
    dibujar(doc, x0 + (k % COLS) * W, y0 + Math.floor(k / COLS) * H, it.nombre, it.precio);
  });
  doc.save(nombreArchivo);
}
