/* InertiaPanel — disabled.
 * The persistent J widget was removed at user request. Methods are kept as
 * no-ops so existing scene code (which calls pushJ, setCurrent, reset, etc.)
 * continues to work without per-scene edits. */

window.InertiaPanel = (function () {
  function noop() {}
  return {
    mount:      noop,
    show:       noop,
    hide:       noop,
    pushJ:      noop,
    setCurrent: noop,
    reset:      noop,
    getHistory: function () { return []; },
  };
})();
