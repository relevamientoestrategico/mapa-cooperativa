/**
 * Utilidades DOM mínimas — evitan repetir código sin sumar dependencias.
 */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/**
 * Crea un elemento con clases, atributos, hijos y eventos.
 *   el('button.btn.primary', { onClick: fn }, ['Guardar'])
 */
export function el(spec, props = {}, children = []) {
  const parts = spec.split(/([.#])/);
  const tag = parts[0] || 'div';
  const node = document.createElement(tag);
  for (let i = 1; i < parts.length; i += 2) {
    const sep = parts[i], val = parts[i + 1];
    if (sep === '.') node.classList.add(val);
    else if (sep === '#') node.id = val;
  }
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'data' && typeof v === 'object') for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

/** Reemplaza el contenido de un contenedor por uno o varios nodos. */
export function mount(container, ...nodes) {
  container.replaceChildren(...nodes);
}

/** Toast breve. */
let toastTimer = null;
export function toast(msg, kind = 'ok') {
  let t = $('#panel-toast');
  if (!t) {
    t = el('div.toast', { id: 'panel-toast' }, [
      el('svg', { class: 'ico', viewBox: '0 0 24 24', html: '<path d="M20 6 9 17l-5-5"/>' }),
      el('span.msg')
    ]);
    document.body.appendChild(t);
  }
  t.classList.remove('ok', 'err'); t.classList.add(kind);
  t.querySelector('.msg').textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/** Modal simple. Devuelve una promesa que resuelve con la razón de cierre. */
export function openModal({ title, body, footer, size, onClose } = {}) {
  const backdrop = el('div.modal-back', { role: 'dialog', 'aria-modal': 'true' });
  const modal = el('div.modal', { style: size === 'lg' ? { maxWidth: '640px' } : {} }, [
    el('div.modal-head', {}, [
      el('h2', { text: title || '' }),
      el('button.modal-close', { onClick: () => close('dismiss'), 'aria-label': 'Cerrar' },
         [el('svg', { class: 'ico', viewBox: '0 0 24 24', html: '<path d="M18 6 6 18M6 6l12 12"/>' })])
    ]),
    el('div.modal-body', {}, body || []),
    footer ? el('div.modal-foot', {}, footer) : null
  ]);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  let resolver;
  const close = (reason) => {
    if (onClose) onClose(reason);
    backdrop.remove();
    resolver?.(reason);
  };
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close('dismiss'); });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { document.removeEventListener('keydown', onEsc); close('dismiss'); }
  });
  return { close, promise: new Promise(r => (resolver = r)) };
}

/** Formatea una fecha ISO a "3 de mayo de 2026" — en español. */
export function fechaLarga(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  } catch { return iso; }
}

/** "hace 2 horas", "ayer", "hace 3 días" — para el chip de última actualización. */
export function haceCuanto(iso) {
  if (!iso) return null;
  const d = new Date(iso), now = new Date();
  const s = Math.round((now - d) / 1000);
  if (s < 60)     return 'hace instantes';
  if (s < 3600)   return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400)  return `hace ${Math.floor(s / 3600)} h`;
  if (s < 172800) return 'ayer';
  if (s < 2592000) return `hace ${Math.floor(s / 86400)} días`;
  return fechaLarga(iso);
}
