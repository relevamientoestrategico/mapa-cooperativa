/**
 * Gestor de "cambios sin guardar" (dirty state).
 *
 * Cualquier editor que quiera advertir al usuario antes de salir con
 * cambios sin guardar debería usar este helper. Es global (una sesión
 * de edición a la vez) porque el usuario solo puede estar editando
 * un formulario a la vez.
 *
 * Uso típico dentro de un editor:
 *   dirty.enable(() => estaSucio());   // habilita seguimiento
 *   ...
 *   dirty.disable();                    // al guardar o descartar
 */

let checker = null;   // función que devuelve true si hay cambios sin guardar

function beforeUnload(e) {
  if (checker && checker()) {
    // Mensaje custom deprecado en navegadores modernos, pero
    // preventDefault() y returnValue activan el diálogo estándar.
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
}

export const dirty = {
  /**
   * Habilita el seguimiento. Recibe una función que devuelve true si
   * el editor está "sucio" (hay cambios sin guardar).
   */
  enable(fn) {
    checker = fn;
    window.addEventListener('beforeunload', beforeUnload);
  },

  /** Desactiva el seguimiento. */
  disable() {
    checker = null;
    window.removeEventListener('beforeunload', beforeUnload);
  },

  /**
   * Chequeo síncrono para navegación interna (cambiar de vista, hacer
   * click en "Barrios", etc.). Devuelve true si el usuario decidió
   * seguir; false si canceló.
   *
   * Uso:
   *   if (!dirty.confirmNavigate()) return;  // el usuario canceló
   */
  confirmNavigate() {
    if (!checker || !checker()) return true;
    return confirm('Tenés cambios sin guardar. ¿Querés salir igualmente?');
  },

  /** ¿El estado actual es "sucio"? */
  isDirty() {
    return !!(checker && checker());
  }
};
