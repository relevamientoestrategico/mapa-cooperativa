/**
 * Pipeline de imágenes: resize + hash + preparación para subir a GitHub.
 *
 * Todo pasa 100% en el navegador. La imagen nunca sale del dispositivo
 * antes de ser procesada.
 *
 * Reglas fijas del Módulo 5:
 *  - Máximo 1600 px de lado largo
 *  - JPEG calidad 82%
 *  - Nombre de archivo: hash-corto del contenido procesado + .jpg
 *  - Nombre estable de por vida: si mañana se reordena la galería,
 *    los archivos NO se renombran; solo cambia el orden en el JSON.
 */

const MAX_LADO = 1600;
const CALIDAD_JPEG = 0.82;

/**
 * Punto de entrada. Recibe un File del input y devuelve todo lo necesario
 * para insertarlo en el JSON y subirlo al repo.
 *
 * @param {File} file  Archivo del <input type="file">
 * @returns {Promise<{
 *   id: string,           // hash corto, sirve como identidad estable
 *   nombreArchivo: string, // p.ej. "k3xm9p2vqa.jpg"
 *   base64: string,       // contenido codificado para la API de GitHub
 *   pesoOriginal: number, // bytes originales
 *   pesoFinal: number,    // bytes procesados
 *   dimensionesOriginales: {w:number, h:number},
 *   dimensionesFinales: {w:number, h:number}
 * }>}
 */
export async function procesarImagen(file) {
  if (!/^image\//.test(file.type)) {
    throw new Error('El archivo no es una imagen.');
  }

  const pesoOriginal = file.size;
  const bitmap = await cargarBitmap(file);
  const dimensionesOriginales = { w: bitmap.width, h: bitmap.height };

  const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * escala);
  const h = Math.round(bitmap.height * escala);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // Fondo blanco para imágenes con transparencia (PNGs con canal alpha)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);

  // Liberar el bitmap (importante en fotos grandes)
  if (bitmap.close) bitmap.close();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      b => b ? resolve(b) : reject(new Error('No se pudo procesar la imagen.')),
      'image/jpeg',
      CALIDAD_JPEG
    );
  });

  const buffer = await blob.arrayBuffer();
  const id = await hashCorto(buffer);
  const base64 = arrayBufferToBase64(buffer);

  return {
    id,
    nombreArchivo: `${id}.jpg`,
    base64,
    pesoOriginal,
    pesoFinal: blob.size,
    dimensionesOriginales,
    dimensionesFinales: { w, h }
  };
}

/**
 * Formatea un peso en bytes de forma humana.
 * 385234 -> "376 KB", 4380000 -> "4.2 MB"
 */
export function formatearPeso(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

/**
 * Formatea el ahorro de peso como frase legible.
 * Ejemplos:
 *   "de 4.2 MB → 380 KB (91% menos)"
 *   "de 4 KB → 8 KB (queda apenas más pesada)"
 */
export function formatearAhorro(bytesOriginal, bytesFinal) {
  if (bytesFinal >= bytesOriginal) {
    return `de ${formatearPeso(bytesOriginal)} → ${formatearPeso(bytesFinal)} (queda apenas más pesada)`;
  }
  const pct = Math.round((1 - bytesFinal / bytesOriginal) * 100);
  return `de ${formatearPeso(bytesOriginal)} → ${formatearPeso(bytesFinal)} (${pct}% menos)`;
}

/* ─── Internos ─────────────────────────────────────────────────── */

async function cargarBitmap(file) {
  // createImageBitmap es más rápido y respeta EXIF orientation en navegadores modernos
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // fallback si el navegador no soporta la opción
      try { return await createImageBitmap(file); } catch { /* pasa al fallback */ }
    }
  }
  // Fallback con <img>
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Hash SHA-1 del contenido procesado, truncado a 10 caracteres.
 * SHA-1 es más que suficiente para nuestro caso (no criptográfico),
 * y crypto.subtle lo tiene nativo en todos los navegadores modernos.
 * 10 caracteres hex = 40 bits = colisión virtualmente imposible en el
 * volumen que manejamos (~decenas de imágenes por barrio).
 */
async function hashCorto(buffer) {
  const digest = await crypto.subtle.digest('SHA-1', buffer);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < 5; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Convierte un ArrayBuffer a base64 sin volar la memoria.
 * Usar btoa(String.fromCharCode(...bytes)) rompe con imágenes grandes
 * porque el spread operator tiene límite de argumentos.
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000; // 32 KB por vuelta
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
