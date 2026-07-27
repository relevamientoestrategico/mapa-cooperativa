/**
 * Paso 3 del asistente: Datos base.
 *
 * Recolecta los 4 indicadores base que van al mapa público, más los 3
 * datos semánticos (electricidad %, educación sí/no, salud sí/no). Los
 * mismos que edita el editor de indicadores del Módulo 4, pero como
 * carga inicial.
 *
 * Todo este paso es OPCIONAL: se puede saltear y completar después
 * desde el hub del barrio. Por eso "Siguiente" siempre está habilitado.
 */

import { el, asociarLabel } from '../../dom.js';

export function renderPasoDatos(cuerpo, pie, ctrl) {
  const { estado } = ctrl;

  cuerpo.appendChild(el('div.asist-paso-titulo', {}, [
    el('h3', { text: 'Datos base del barrio' }),
    el('p', { text: 'Todos los campos son opcionales. Podés completarlos ahora o dejarlos vacíos y editarlos desde el hub del barrio.' })
  ]));

  // ─── Grupo 1: datos del mapa ──────────────────────────────
  cuerpo.appendChild(el('h4.asist-subtitulo', { text: 'Datos que aparecen en el mapa público' }));

  // Electricidad: número 0-100
  const inpElec = el('input.inp', {
    type: 'number', min: 0, max: 100, step: 1,
    value: estado.datosMapa.electricidad || '',
    placeholder: '0',
    onInput: (e) => {
      const v = parseInt(e.target.value, 10);
      estado.datosMapa.electricidad = isNaN(v) ? 0 : Math.max(0, Math.min(100, v));
    }
  });
  const labelElec = el('label', { text: 'Cobertura eléctrica (0 a 100 %)' });
  asociarLabel(labelElec, inpElec);
  cuerpo.appendChild(el('div.asist-field', {}, [
    labelElec,
    el('p.asist-help', { text: 'Porcentaje del barrio con servicio eléctrico regular.' }),
    inpElec
  ]));

  // Educación: sí/no
  cuerpo.appendChild(el('div.asist-field', {}, [
    construirGrupoSiNo('¿El barrio tiene establecimiento educativo?', estado.datosMapa.educacion, (v) => { estado.datosMapa.educacion = v; })
  ]));

  // Salud: sí/no
  cuerpo.appendChild(el('div.asist-field', {}, [
    construirGrupoSiNo('¿El barrio tiene centro de salud?', estado.datosMapa.salud, (v) => { estado.datosMapa.salud = v; })
  ]));

  // ─── Grupo 2: indicadores de ficha ────────────────────────
  cuerpo.appendChild(el('h4.asist-subtitulo', { text: 'Ficha del barrio' }));
  cuerpo.appendChild(el('p.asist-help', { text: 'Se muestran cuando alguien toca el barrio en el mapa.' }));

  estado.indicadores.forEach((ind, i) => {
    const inp = el('input.inp', {
      value: ind.valor,
      placeholder: 'Sin dato',
      onInput: (e) => { estado.indicadores[i].valor = e.target.value; }
    });
    const labelInd = el('label', { text: ind.etiqueta });
    asociarLabel(labelInd, inp);
    cuerpo.appendChild(el('div.asist-field.asist-field-inline', {}, [
      labelInd,
      inp
    ]));
  });

  // ─── Pie con botones ──────────────────────────────────────
  pie.appendChild(el('button.btn.ghost', { onClick: () => ctrl.anterior() }, ['← Atrás']));
  pie.appendChild(el('div.spacer'));
  pie.appendChild(el('button.btn.primary', {
    onClick: () => ctrl.siguiente()
  }, ['Siguiente: Confirmación →']));
}

/**
 * Grupo Sí/No accesible: incluye la pregunta como texto visible y como
 * aria-label del grupo, y marca aria-pressed en los botones. Mantiene el
 * estado visual y llama al callback cuando cambia.
 */
function construirGrupoSiNo(pregunta, valorInicial, onCambio) {
  const wrap = el('div.asist-sino-wrap');
  wrap.appendChild(el('label.asist-sino-pregunta', { text: pregunta }));

  const cont = el('div.asist-toggle', { role: 'group', 'aria-label': pregunta });
  let valor = !!valorInicial;

  const btnSi = el('button.asist-toggle-btn' + (valor ? '.activo' : ''), {
    type: 'button',
    'aria-pressed': String(valor),
    onClick: () => { valor = true; render(); onCambio(true); }
  }, ['Sí']);

  const btnNo = el('button.asist-toggle-btn' + (!valor ? '.activo' : ''), {
    type: 'button',
    'aria-pressed': String(!valor),
    onClick: () => { valor = false; render(); onCambio(false); }
  }, ['No']);

  cont.appendChild(btnSi);
  cont.appendChild(btnNo);
  wrap.appendChild(cont);

  function render() {
    btnSi.classList.toggle('activo', valor);
    btnNo.classList.toggle('activo', !valor);
    btnSi.setAttribute('aria-pressed', String(valor));
    btnNo.setAttribute('aria-pressed', String(!valor));
  }

  return wrap;
}
