/**
 * Panel de sesión (se abre al hacer clic en el chip "Conectado").
 * Muestra usuario, proyecto vinculado y última verificación.
 * Permite desconectar.
 */

import { el, openModal, toast } from '../dom.js';
import { icons } from '../icons.js';
import { CONFIG } from '../config.js';
import { session, disconnect, checkSession } from '../auth.js';
import { fechaLarga, haceCuanto } from '../dom.js';

export function openSessionPanel() {
  const body = el('div.session-panel', {}, [
    el('div.row', {}, [
      el('span.k', { text: 'Usuario' }),
      el('span.v', { text: session.user?.name || session.user?.login || '—' })
    ]),
    el('div.row', {}, [
      el('span.k', { text: 'Nombre de usuario' }),
      el('span.v.mono', { text: session.user?.login || '—' })
    ]),
    el('div.row', {}, [
      el('span.k', { text: 'Proyecto vinculado' }),
      el('span.v.mono', { text: `${CONFIG.repo.owner}/${CONFIG.repo.name}` })
    ]),
    el('div.row', {}, [
      el('span.k', { text: 'Última verificación' }),
      el('span.v', { text: haceCuanto(session.checkedAt) || '—' })
    ])
  ]);

  const footer = [
    el('button.btn.ghost', { onClick: async () => {
      const btn = event.currentTarget;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Verificando…';
      await checkSession();
      close.close('refreshed');
      toast('Conexión verificada.', 'ok');
    }}, [
      el('span', { html: icons.refresh() }).firstChild,
      'Verificar de nuevo'
    ]),
    el('button.btn.danger', { onClick: () => {
      disconnect();
      close.close('disconnected');
      toast('Desconectado. Ahora estás en modo lectura.', 'ok');
    }}, [
      el('span', { html: icons.logout() }).firstChild,
      'Desconectar'
    ])
  ];

  const close = openModal({
    title: 'Sesión activa',
    body,
    footer
  });
}
