/**
 * Paso 1 del asistente: Identidad.
 *
 * Pide nombre visible, zona y color. Genera el slug automáticamente a
 * partir del nombre y valida en vivo que no colisione con un barrio ya
 * existente (detección temprana, sin necesidad de ir hasta el paso 4).
 */

import { el, toast, asociarLabel } from '../../dom.js';
import { PALETA_COLORES, ZONAS_SUGERIDAS } from '../asistente-nuevo-barrio.js';

export function renderPasoIdentidad(cuerpo, pie, ctrl) {
  const { estado } = ctrl;

  cuerpo.appendChild(el('div.asist-paso-titulo', {}, [
    el('h3', { text: 'Empecemos por lo básico' }),
    el('p', { text: 'Esta información se puede editar después desde el hub del barrio.' })
  ]));

  // ─── Campo: Nombre visible ─────────────────────────────────
  const errorNombre = el('span.asist-error', { id: 'err-nombre' });

  const inputNombre = el('input.inp', {
    value: estado.nombreVisible,
    placeholder: 'Ej: Barrio San Miguel',
    autoFocus: true,
    onInput: (e) => {
      estado.nombreVisible = e.target.value;
      const slug = generarSlug(e.target.value);
      estado.slug = slug;
      // Mostrar slug generado + validación de duplicado
      pintarPreviewSlug();
      validarNombre();
      actualizarBotonSiguiente();
    }
  });

  const previewSlug = el('div.asist-slug-preview', { id: 'preview-slug' });

  const labelNombre = el('label', { text: 'Nombre del barrio' });
  asociarLabel(labelNombre, inputNombre);
  cuerpo.appendChild(el('div.asist-field', {}, [
    labelNombre,
    inputNombre,
    previewSlug,
    errorNombre
  ]));

  // ─── Campo: Zona ─────────────────────────────────────────────
  const inputZona = el('input.inp', {
    value: estado.zona,
    placeholder: 'Elegí una zona o escribí una nueva',
    list: 'zonas-sugeridas',
    onInput: (e) => {
      estado.zona = e.target.value;
      actualizarBotonSiguiente();
    }
  });

  const datalist = el('datalist', { id: 'zonas-sugeridas' });
  ZONAS_SUGERIDAS.forEach(z => datalist.appendChild(el('option', { value: z })));

  const labelZona = el('label', { text: 'Zona de la ciudad' });
  asociarLabel(labelZona, inputZona);
  cuerpo.appendChild(el('div.asist-field', {}, [
    labelZona,
    el('div.asist-zona-shortcuts', {}, ZONAS_SUGERIDAS.map(z => (
      el('button.asist-zona-chip', {
        type: 'button',
        onClick: () => { inputZona.value = z; estado.zona = z; actualizarBotonSiguiente(); refrescarChipsZona(); }
      }, [z])
    ))),
    inputZona,
    datalist
  ]));

  // ─── Campo: Color ────────────────────────────────────────────
  const swatches = el('div.asist-swatches', { role: 'group', 'aria-label': 'Color del barrio en el mapa' });
  PALETA_COLORES.forEach((c) => {
    const seleccionado = estado.color === c.color;
    const b = el('button.asist-swatch' + (seleccionado ? '.seleccionado' : ''), {
      type: 'button',
      style: { background: c.color },
      title: c.color,
      'aria-label': `Color ${c.color}`,
      'aria-pressed': String(seleccionado),
      onClick: () => {
        estado.color = c.color;
        estado.colorClaro = c.colorClaro;
        cuerpo.querySelectorAll('.asist-swatch').forEach(s => {
          s.classList.remove('seleccionado');
          s.setAttribute('aria-pressed', 'false');
        });
        b.classList.add('seleccionado');
        b.setAttribute('aria-pressed', 'true');
      }
    });
    swatches.appendChild(b);
  });

  cuerpo.appendChild(el('div.asist-field', {}, [
    el('label', { text: 'Color del barrio en el mapa' }),
    el('p.asist-help', { text: 'Este color se usa para marcarlo en el mapa público.' }),
    swatches
  ]));

  // ─── Pie con botones ─────────────────────────────────────────
  const btnSiguiente = el('button.btn.primary', {
    disabled: 'disabled',
    onClick: () => ctrl.siguiente()
  }, ['Siguiente: Ubicación →']);

  pie.appendChild(el('button.btn.ghost', { onClick: () => ctrl.cancelar() }, ['Cancelar']));
  pie.appendChild(el('div.spacer'));
  pie.appendChild(btnSiguiente);

  // Estado inicial
  pintarPreviewSlug();
  validarNombre();
  refrescarChipsZona();
  actualizarBotonSiguiente();

  /* ─── Helpers locales ─── */

  function pintarPreviewSlug() {
    previewSlug.innerHTML = '';
    if (!estado.slug) return;
    previewSlug.appendChild(el('span.asist-slug-etiqueta', { text: 'Identificador interno:' }));
    previewSlug.appendChild(el('code.asist-slug-code', { text: estado.slug }));
  }

  function validarNombre() {
    errorNombre.textContent = '';
    errorNombre.classList.remove('mostrar');
    if (!estado.slug) return;
    if (estado.slugsExistentes.includes(estado.slug)) {
      errorNombre.textContent = 'Ya existe un barrio con ese nombre. Elegí otro.';
      errorNombre.classList.add('mostrar');
    }
  }

  function nombreEsValido() {
    return estado.nombreVisible.trim().length >= 3 &&
           estado.slug &&
           !estado.slugsExistentes.includes(estado.slug);
  }

  function zonaEsValida() {
    return estado.zona.trim().length > 0;
  }

  function actualizarBotonSiguiente() {
    const ok = nombreEsValido() && zonaEsValida();
    btnSiguiente.disabled = !ok;
    btnSiguiente.setAttribute('aria-disabled', String(!ok));
  }

  function refrescarChipsZona() {
    cuerpo.querySelectorAll('.asist-zona-chip').forEach(chip => {
      chip.classList.toggle('activo', chip.textContent === estado.zona);
    });
  }
}

/**
 * Convierte "Barrio San Miguel" en "barrio-san-miguel".
 * Reglas:
 *  - Todo en minúsculas.
 *  - Quita acentos (canela → canela, jóvenes → jovenes).
 *  - Reemplaza espacios y caracteres no alfanuméricos por guiones.
 *  - Colapsa guiones consecutivos y quita los del principio/final.
 */
export function generarSlug(nombre) {
  if (!nombre) return '';
  return String(nombre)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quita acentos
    .replace(/[^a-z0-9]+/g, '-')                        // no-alfanuméricos → guión
    .replace(/^-+|-+$/g, '')                            // guiones al principio/final
    .replace(/-{2,}/g, '-');                            // colapsa dobles
}
