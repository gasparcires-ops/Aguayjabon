// ---------------------------------------------------------------------------
// Búsqueda tolerante para toda la app.
//
// - Ignora mayúsculas y tildes ("jabon" encuentra "Jabón").
// - Cada palabra buscada tiene que aparecer (en cualquier orden y en cualquier
//   parte del texto), así "lavandina 1l" encuentra "Lavandina Ayudín 1 L".
// - Tolera errores de tipeo y palabras parecidas ("detergenta", "lavadina",
//   "desodorate") comparando por distancia de edición, y también prefijos
//   ("desod" encuentra "desodorante").
// - Los números (códigos de barras, medidas) se buscan tal cual, sin
//   tolerancia, para no confundir un código con otro.
// ---------------------------------------------------------------------------

export const normTexto = (s) =>
  String(s == null ? "" : s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function distancia(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + costo);
    }
    prev = cur;
  }
  return prev[n];
}

// Mejor puntaje (menor = mejor) de una palabra buscada contra las palabras
// de un texto. Infinity si no hay parecido.
function puntajePalabra(pq, palabrasT) {
  const soloNumeros = /^\d+$/.test(pq);
  let mejor = Infinity;
  for (const pt of palabrasT) {
    if (pt === pq) return 0;
    if (pt.startsWith(pq)) { mejor = Math.min(mejor, 0.5); continue; }
    if (pt.includes(pq)) { mejor = Math.min(mejor, 1); continue; }
    if (soloNumeros) continue;
    if (pq.length < 3) continue;
    const tol = pq.length <= 4 ? 1 : pq.length <= 8 ? 2 : 3;
    // compara contra la palabra entera y contra su inicio (por si se escribió
    // a medias y con un error)
    const d = Math.min(distancia(pq, pt), pt.length > pq.length ? distancia(pq, pt.slice(0, pq.length)) + 0.5 : Infinity);
    if (d <= tol) mejor = Math.min(mejor, 2 + d);
  }
  return mejor;
}

// Puntaje de una búsqueda contra un texto. 0 = coincidencia perfecta,
// Infinity = no coincide.
export function puntajeBusqueda(query, texto) {
  const q = normTexto(query);
  if (!q) return 0;
  const t = normTexto(texto);
  if (!t) return Infinity;
  if (t.includes(q)) return 0;
  const palabrasT = t.split(" ");
  let total = 0;
  for (const pq of q.split(" ")) {
    let p = puntajePalabra(pq, palabrasT);
    // "1l" debe encontrar "1 L": se mira también el texto sin espacios
    if (p === Infinity && pq.length >= 2 && t.replace(/ /g, "").includes(pq)) p = 1.5;
    if (p === Infinity) return Infinity;
    total += p;
  }
  return total;
}

export const coincide = (query, texto) => puntajeBusqueda(query, texto) !== Infinity;

// Filtra una lista con la búsqueda. Si `ordenar` es true, los más parecidos
// van primero (útil para sugerencias); si no, se mantiene el orden original.
export function buscar(items, query, getTexto, { ordenar = false } = {}) {
  if (!normTexto(query)) return items;
  const conPuntaje = [];
  items.forEach((it, idx) => {
    const p = puntajeBusqueda(query, getTexto(it));
    if (p !== Infinity) conPuntaje.push({ it, p, idx });
  });
  if (ordenar) conPuntaje.sort((a, b) => a.p - b.p || a.idx - b.idx);
  return conPuntaje.map((x) => x.it);
}
