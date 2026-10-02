// Lectura de PDF (pdfjs). Pesa mucho, así que se carga solo al importar un PDF (ver base.jsx).

import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// ---------------------------------------------------------------------------
// Lee un PDF y devuelve un arreglo de líneas de texto (una por punto de checklist)
// ---------------------------------------------------------------------------
export async function extractChecklistItemsFromPdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const lines = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const rowsMap = new Map();
    textContent.items.forEach((item) => {
      const y = Math.round(item.transform[5]);
      if (!rowsMap.has(y)) rowsMap.set(y, []);
      rowsMap.get(y).push(item.str);
    });
    const sortedYs = Array.from(rowsMap.keys()).sort((a, b) => b - a);
    sortedYs.forEach((y) => lines.push(rowsMap.get(y).join(" ").trim()));
  }
  const cleanLines = lines.map((l) => l.trim()).filter(Boolean);

  // Una línea con casilla ("[ ]", "☐", etc.) es un punto a revisar; cualquier otra línea
  // se toma como el nombre del tema (sección) que agrupa los puntos que le siguen.
  const checkboxPattern = /^(\[\s*[xX]?\s*\]|☐|☑|✓|□|▢)\s*/;
  const result = [];
  let currentSection = "";
  cleanLines.forEach((line) => {
    if (checkboxPattern.test(line)) {
      const text = line.replace(checkboxPattern, "").trim();
      if (text) result.push({ text, section: currentSection });
    } else {
      currentSection = line;
    }
  });
  // Si el PDF no tenía ninguna casilla, trátalo como antes: cada línea es un punto suelto sin tema
  if (result.length === 0) {
    return cleanLines.map((text) => ({ text, section: "" }));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Lee un PDF de factura de proveedor e intenta detectar No. de factura, fecha y total
// ---------------------------------------------------------------------------
export async function extractInvoiceDataFromPdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let fullText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    fullText += textContent.items.map((it) => it.str).join(" ") + "\n";
  }

  const invoiceNumberMatch = fullText.match(/(?:n[uú]mero de factura|factura\s*(?:no\.?|n[uú]m\.?|#)?|ncf)[:\s#]*([A-Z]?\d[A-Z0-9\-]{3,20})/i);
  const invoiceNumber = invoiceNumberMatch ? invoiceNumberMatch[1].trim() : "";

  const dateMatch = fullText.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  let isoDate = "";
  if (dateMatch) {
    let [, d, m, y] = dateMatch;
    if (y.length === 2) y = "20" + y;
    if (Number(d) > 12 && Number(m) <= 12) { /* d/m/y ya asumido */ }
    isoDate = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const totalMatches = [...fullText.matchAll(/total[^\d]{0,15}(?:rd\$|us\$|\$)?\s*([\d.,]+\d)/gi)];
  let total = null;
  if (totalMatches.length > 0) {
    const raw = totalMatches[totalMatches.length - 1][1].replace(/,/g, "");
    const n = Number(raw);
    if (!Number.isNaN(n)) total = n;
  }

  return { fullText: fullText.trim(), invoiceNumber, isoDate, total };
}
