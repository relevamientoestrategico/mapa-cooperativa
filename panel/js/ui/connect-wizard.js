/**
 * Asistente de conexión.
 *
 * 4 pasos guiados. Lenguaje humano; nunca decimos "token" (aunque
 * técnicamente lo sea). El enlace directo a GitHub pre-selecciona el
 * scope correcto para reducir posibilidades de error.
 */

import { el, openModal, toast } from '../dom.js';
import { icons } from '../icons.js';
import { CONFIG } from '../config.js';
import { connectWithKey } from '../auth.js';

/**
 * URL que abre GitHub en la pantalla exacta para crear un fine-grained PAT
 * con los permisos y el repositorio ya sugeridos.
 * (GitHub prellenea a partir de los query params.)
 */
function githubKeyURL() {
  const params = new URLSearchParams({
    name: `Panel Relevamientos — ${CONFIG.repo.name}`,
    description: 'Clave de acceso para el panel de administración del mapa.',
    target_name: CONFIG.repo.owner,
    // Sugerimos 1 año de vigencia (el usuario puede cambiarlo)
    expires_in: 'oneyear'
  });
  return `https://github.com/settings/personal-access-tokens/new?${params}`;
}

export function openConnectWizard() {
  const bodyHost = el('div.wiz');

  bodyHost.append(
    el('div.callout.info', {}, [
      el('span', { html: icons.info() }).firstChild,
      el('span', { html: 'La clave de acceso es un permiso que <b>vos generás en GitHub</b> y este panel guarda de forma privada en tu navegador. Sirve para que el sistema sepa que sos vos cuando publicás cambios.' })
    ]),

    step(1, '<b>Abrí GitHub</b> en la pantalla para generar la clave. Vas a necesitar tener sesión iniciada allí.',
      el('a.link', {
        href: githubKeyURL(), target: '_blank', rel: 'noopener'
      }, [
        el('span', { html: icons.external() }).firstChild,
        'Abrir GitHub para crear la clave'
      ])
    ),

    step(2, 'En la pantalla de GitHub, <b>elegí el repositorio del mapa</b>:',
      el('div', { style: { marginTop: '6px', padding: '8px 12px', background: 'var(--canvas)', borderRadius: '8px', fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: '12.5px' },
        text: `${CONFIG.repo.owner} / ${CONFIG.repo.name}`
      })
    ),

    step(3, 'En <b>Permisos del repositorio</b>, activá dos permisos: <b>Contents</b> con acceso de <i>Read and write</i>, y <b>Metadata</b> con acceso de <i>Read-only</i>. Luego apretá <i>Generate token</i> abajo.',
      null
    ),

    step(4, '<b>Copiá la clave</b> que aparece (empieza con <code>github_pat_...</code>) y pegala acá abajo. GitHub solo te la muestra una vez, así que copiala antes de cerrar esa pestaña.',
      buildKeyInput()
    )
  );

  const footer = [
    el('button.btn.ghost', { onClick: () => close.close('dismiss') }, ['Cancelar']),
    el('button.btn.primary', { id: 'wiz-connect', onClick: doConnect }, [
      el('span', { html: icons.key() }).firstChild,
      'Conectar'
    ])
  ];

  const close = openModal({
    title: 'Conectar clave de acceso',
    body: bodyHost,
    footer,
    size: 'lg'
  });

  async function doConnect() {
    const input = document.getElementById('wiz-key');
    const btn = document.getElementById('wiz-connect');
    const errBox = document.getElementById('wiz-err');
    errBox.style.display = 'none';

    const val = input.value.trim();
    if (!val) { input.focus(); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="border-color:rgba(255,255,255,.35);border-top-color:#fff"></span> Verificando…';

    const res = await connectWithKey(val);
    if (res.ok) {
      close.close('connected');
      toast('Conectado. Ya podés editar y publicar cambios.', 'ok');
    } else {
      btn.disabled = false;
      btn.innerHTML = `<svg class="ico" viewBox="0 0 24 24"><circle cx="7.5" cy="15.5" r="4.5" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" fill="none" stroke="currentColor" stroke-width="1.75"/></svg> Conectar`;
      errBox.textContent = res.error;
      errBox.style.display = 'flex';
    }
  }
}

function step(num, htmlText, extra) {
  return el('div.wiz-step', {}, [
    el('div.num', { text: String(num) }),
    el('div.body', {}, [
      el('p', { html: htmlText }),
      extra
    ].filter(Boolean))
  ]);
}

function buildKeyInput() {
  const wrap = el('div.wiz-key', {}, [
    el('label', { text: 'Pegá acá tu clave', for: 'wiz-key' }),
    el('input.inp.mono', {
      id: 'wiz-key',
      type: 'password',
      autocomplete: 'off',
      placeholder: 'github_pat_...'
    }),
    el('div.hint', { text: 'La clave queda guardada solo en este navegador. Podés desconectarla cuando quieras.' }),
    el('div.callout.error', { id: 'wiz-err', style: { display: 'none', marginTop: '12px', marginBottom: '0' } }, [
      el('span', { html: icons.alert() }).firstChild,
      el('span', { class: 'msg' })
    ])
  ]);
  return wrap;
}
