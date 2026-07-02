/**
 * Shell del panel: sidebar + topbar + área de contenido.
 * Se renderiza una vez al iniciar; el contenido interno lo cambian las vistas.
 */

import { el, $ } from '../dom.js';
import { icons } from '../icons.js';
import { session, onSessionChange, disconnect, canEdit } from '../auth.js';
import { CONFIG } from '../config.js';
import { openConnectWizard } from './connect-wizard.js';
import { openSessionPanel } from './session-panel.js';
import { onRouteChange, go } from '../router.js';

/**
 * Definición de secciones de navegación.
 * `active` false => visible pero deshabilitada, con etiqueta "Próximamente".
 * Este array es el único lugar a tocar para incorporar nuevas secciones.
 */
const NAV = [
  { group: 'PRINCIPAL', items: [
    { id: 'barrios',    label: 'Barrios',        icon: icons.home,  active: true }
  ]},
  { group: 'PRÓXIMAMENTE', items: [
    { id: 'estadisticas',   label: 'Estadísticas',   icon: icons.chart,    active: false },
    { id: 'exportaciones',  label: 'Exportaciones',  icon: icons.download, active: false },
    { id: 'administradores',label: 'Administradores',icon: icons.users,    active: false },
    { id: 'ajustes',        label: 'Ajustes',        icon: icons.gear,     active: false },
    { id: 'ayuda',          label: 'Ayuda',          icon: icons.help,     active: false }
  ]}
];

let contentContainer = null;
let sidebarEl = null;
let bannerContainer = null;

export function mountShell() {
  const app = $('#app');

  // Backdrop para el sidebar en mobile
  const backdrop = el('div.backdrop', {
    onClick: () => sidebarEl.classList.remove('open') || backdrop.classList.remove('show')
  });

  const shell = el('div.app-shell', {}, [
    buildSidebar(),
    el('div.main', {}, [
      buildTopbar(),
      buildBannerSlot(),
      el('div.content', {}, [
        el('div.wrap', { id: 'view-container' })
      ])
    ])
  ]);

  app.replaceChildren(shell, backdrop);

  sidebarEl = shell.querySelector('.sidebar');
  contentContainer = shell.querySelector('#view-container');
  bannerContainer = shell.querySelector('#banner-slot');

  restoreCollapsed(shell);

  // Reacciona a cambios de sesión: actualiza chip, banner y estado de tiles
  onSessionChange(() => {
    updateConnChip();
    updateBanner();
  });

  // Marca activo en la sidebar al cambiar de ruta
  onRouteChange(({ active }) => {
    shell.querySelectorAll('.sb-item[data-id]').forEach(i => {
      i.classList.toggle('active', i.dataset.id === active);
    });
  });
}

export function getContentContainer() { return contentContainer; }

/* ─── Sidebar ────────────────────────────────────────────── */
function buildSidebar() {
  const brand = el('div.sb-brand', {}, [
    el('div.mark', { html: `<svg viewBox="0 0 24 24"><path d="M9 3v15m6-12v15M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z" fill="none" stroke="#fff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>` }),
    el('div.txt', {}, [
      el('b', { text: 'Relevamientos' }),
      el('small', { text: 'Cooperativa Eléctrica' })
    ])
  ]);

  const nav = el('nav.sb-nav', { 'aria-label': 'Secciones' });
  for (const g of NAV) {
    nav.appendChild(el('div.sb-section-label', { text: g.group }));
    for (const it of g.items) {
      const item = el(
        'button.sb-item' + (it.active ? '' : '.disabled'),
        {
          data: { id: it.id },
          onClick: () => {
            if (!it.active) return;
            go(it.id);
            // cerrar sidebar en mobile
            if (window.innerWidth <= 860) {
              sidebarEl.classList.remove('open');
              document.querySelector('.backdrop')?.classList.remove('show');
            }
          },
          title: it.active ? it.label : 'Próximamente'
        },
        [
          el('span', { html: it.icon() }).firstChild,
          el('span.label', { text: it.label }),
          !it.active ? el('span.badge-soon', { text: 'Pronto' }) : null
        ]
      );
      nav.appendChild(item);
    }
  }

  const foot = el('div.sb-foot', {}, [
    el('button.sb-collapse', { onClick: toggleCollapsed, 'aria-label': 'Colapsar barra lateral' }, [
      el('span', { html: icons.chevronLeft() }).firstChild,
      el('span.label', { text: 'Colapsar' })
    ])
  ]);

  return el('aside.sidebar', { 'aria-label': 'Navegación principal' }, [brand, nav, foot]);
}

function toggleCollapsed() {
  const shell = document.querySelector('.app-shell');
  shell.classList.toggle('collapsed');
  try {
    const prefs = JSON.parse(localStorage.getItem(CONFIG.storage.prefs) || '{}');
    prefs.collapsed = shell.classList.contains('collapsed');
    localStorage.setItem(CONFIG.storage.prefs, JSON.stringify(prefs));
  } catch {}
}
function restoreCollapsed(shell) {
  try {
    const prefs = JSON.parse(localStorage.getItem(CONFIG.storage.prefs) || '{}');
    if (prefs.collapsed) shell.classList.add('collapsed');
  } catch {}
}

/* ─── Topbar ─────────────────────────────────────────────── */
function buildTopbar() {
  return el('header.topbar', {}, [
    el('button.mobile-menu', {
      'aria-label': 'Abrir menú',
      onClick: () => {
        sidebarEl.classList.add('open');
        document.querySelector('.backdrop').classList.add('show');
      }
    }, [el('span', { html: icons.menu() }).firstChild]),

    el('div.spacer'),

    buildConnChip()
  ]);
}

function buildConnChip() {
  const chip = el('button.conn-chip', {
    id: 'conn-chip',
    onClick: () => {
      if (session.status === 'connected') openSessionPanel();
      else openConnectWizard();
    }
  });
  paintConnChip(chip);
  return chip;
}

function updateConnChip() {
  const chip = $('#conn-chip');
  if (chip) paintConnChip(chip);
}

function paintConnChip(chip) {
  chip.classList.remove('connected', 'expired');
  chip.innerHTML = '';

  if (session.status === 'connected') {
    chip.classList.add('connected');
    chip.append(
      el('span.dot'),
      el('b', { text: session.user.login }),
      el('span.user-suffix', { text: '· Conectado' })
    );
  } else if (session.status === 'expired') {
    chip.classList.add('expired');
    chip.append(
      el('span.dot'),
      el('b', { text: 'Reconectar' }),
      el('span.user-suffix', { text: '· clave vencida' })
    );
  } else if (session.status === 'checking') {
    chip.append(
      el('span.dot'),
      el('span.user-suffix', { text: 'Verificando…' })
    );
  } else {
    chip.append(
      el('span.dot'),
      el('b', { text: 'Conectar' }),
      el('span.user-suffix', { text: '· modo lectura' })
    );
  }
}

/* ─── Banner de modo lectura / clave vencida ─────────────── */
function buildBannerSlot() {
  return el('div', { id: 'banner-slot' });
}

function updateBanner() {
  if (!bannerContainer) return;
  bannerContainer.innerHTML = '';

  if (session.status === 'readonly') {
    bannerContainer.appendChild(el('div.readonly-banner', {}, [
      el('span', { html: icons.eye() }).firstChild,
      el('span', { html: '<b>Estás en modo lectura.</b> Podés ver toda la información publicada. Para modificar barrios o publicar cambios, conectá tu clave de acceso.' }),
      el('button.btn-connect', { onClick: openConnectWizard }, [
        el('span', { html: icons.key() }).firstChild,
        'Conectar'
      ])
    ]));
  } else if (session.status === 'expired') {
    bannerContainer.appendChild(el('div.readonly-banner.expired-banner', {}, [
      el('span', { html: icons.alert() }).firstChild,
      el('span', { html: '<b>Tu clave ya no es válida.</b> Puede haber vencido o haber sido revocada. Podés seguir consultando en modo lectura o reconectarte.' }),
      el('button.btn-connect', { onClick: openConnectWizard }, [
        el('span', { html: icons.key() }).firstChild,
        'Reconectar'
      ])
    ]));
  }
}
