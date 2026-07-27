/**
 * Utilidades DOM mínimas — evitan repetir código sin sumar dependencias.
 */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Contador para generar IDs únicos de campos (para asociar label/input).
let _campoSeq = 0;

/**
 * Vincula un <label> con su control de formulario (input/textarea/select)
 * mediante for/id, para que los lectores de pantalla los asocien.
 * No reestructura el DOM: recibe ambos elementos ya creados, les asigna
 * un id único al control si no lo tiene, y setea el `for` del label.
 *
 *   const lbl = el('label', { text: 'Nombre' });
 *   const inp = el('input.inp', { ... });
 *   asociarLabel(lbl, inp);   // ahora el lector de pantalla los vincula
 *
 * Devuelve el control, para poder encadenar.
 */
export function asociarLabel(label, control) {
  if (!control.id) control.id = `campo-${++_campoSeq}`;
  label.setAttribute('for', control.id);
  return control;
}


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
  // Duración proporcional al largo del mensaje: mensajes cortos como
  // "Guardado" no necesitan quedarse mucho, pero los mensajes de error
  // largos ("Otra persona editó... Tus cambios siguen acá.") necesitan
  // más tiempo para leerse completos. Piso 2400ms, techo 6000ms.
  const duracion = Math.min(6000, Math.max(2400, msg.length * 45));
  toastTimer = setTimeout(() => t.classList.remove('show'), duracion);
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
/**
 * Manejo centralizado de errores en operaciones de guardado.
 *
 * Traduce los códigos de error de github.js a mensajes claros para el
 * usuario. Se usa en todos los editores del panel para garantizar
 * consistencia en el manejo de errores.
 *
 * @param {Error} e  El error capturado.
 * @param {object} [opts]
 *   - onConflict?: () => void  Si se provee, se llama en lugar del toast.
 *   - onUnauthorized?: () => void  Si se provee, se llama además del toast.
 */
export function manejarErrorGuardado(e, { onConflict, onUnauthorized } = {}) {
  console.error('[guardado]', e);

  if (e.code === 'conflict') {
    if (onConflict) {
      onConflict();
    } else {
      toast('Otra persona editó este archivo mientras vos estabas editando. Refrescá la página antes de volver a guardar. Tus cambios siguen acá.', 'err');
    }
    return;
  }

  if (e.code === 'unauthorized') {
    toast('Tu clave de acceso ya no es válida. Reconectate para seguir editando. Tus cambios siguen acá.', 'err');
    if (onUnauthorized) onUnauthorized();
    return;
  }

  // Error de red (TypeError: Failed to fetch, o similares sin .code)
  const esRed = !e.code && (
    e instanceof TypeError ||
    (e.message && (
      e.message.includes('fetch') ||
      e.message.includes('network') ||
      e.message.includes('NetworkError') ||
      e.message.includes('Failed to fetch') ||
      e.message.includes('Load failed')
    ))
  );

  if (esRed) {
    toast('No se pudo conectar. Verificá tu conexión a internet y volvé a intentar. Tus cambios siguen acá.', 'err');
    return;
  }

  // Error HTTP con mensaje del servidor
  toast(e.message || 'No se pudo guardar. Probá de nuevo.', 'err');
}

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
