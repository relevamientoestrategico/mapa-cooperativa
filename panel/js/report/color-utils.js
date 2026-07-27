/**
 * Utilidades de color — permiten derivar variantes (más oscuro, más claro)
 * a partir de un único color base, para no duplicar paletas en el sistema.
 *
 * Se usa para generar el informe HTML a partir del color del barrio
 * (barrio.json → color / colorClaro), sin que informe.json necesite
 * guardar una paleta propia.
 */

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex({ r, g, b }) {
  const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s; const l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb({ h, s, l }) {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) { const v = l * 255; return { r: v, g: v, b: v }; }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, h + 1 / 3) * 255,
    g: hue2rgb(p, q, h) * 255,
    b: hue2rgb(p, q, h - 1 / 3) * 255
  };
}

/** Oscurece un color hex un porcentaje de luminosidad (0-100). */
export function darken(hex, amount) {
  const hsl = rgbToHsl(hexToRgb(hex));
  hsl.l = Math.max(0, hsl.l - amount);
  return rgbToHex(hslToRgb(hsl));
}

/** Aclara un color hex un porcentaje de luminosidad (0-100). */
export function lighten(hex, amount) {
  const hsl = rgbToHsl(hexToRgb(hex));
  hsl.l = Math.min(100, hsl.l + amount);
  return rgbToHex(hslToRgb(hsl));
}

/** Devuelve una versión más saturada y ligeramente más clara (para "accent"). */
export function vivid(hex, satBoost = 18, lightBoost = 6) {
  const hsl = rgbToHsl(hexToRgb(hex));
  hsl.s = Math.min(100, hsl.s + satBoost);
  hsl.l = Math.min(100, hsl.l + lightBoost);
  return rgbToHex(hslToRgb(hsl));
}

/**
 * Deriva la paleta completa del informe a partir del color del barrio.
 * @param {string} color        color base del barrio (barrio.json → color)
 * @param {string} colorClaro   versión clara ya existente (barrio.json → colorClaro)
 */
export function paletaDesdeColor(color, colorClaro) {
  return {
    primary: color,
    primaryDark: darken(color, 12),
    primaryLight: colorClaro || lighten(color, 42),
    accent: vivid(color)
  };
}
