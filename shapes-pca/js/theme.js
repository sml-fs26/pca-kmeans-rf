/* Theme toggle: light (default, lecture-friendly) / dark.
 * Persists in localStorage; respects prefers-color-scheme on first load.
 * Keyboard shortcut: 't'. */

window.Theme = (function () {
  const root = document.documentElement;
  const KEY = 'shapes-pca-theme';

  function get() { return root.getAttribute('data-theme') || 'light'; }

  function set(t) {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem(KEY, t); } catch (e) {}
    window.dispatchEvent(new CustomEvent('theme-change', { detail: { theme: t } }));
  }

  function toggle() { set(get() === 'dark' ? 'light' : 'dark'); }

  function init() {
    // URL hash override (for headless screenshots): #...&theme=dark or &theme=light
    let saved;
    const m = (window.location.hash || '').match(/[#&]theme=(light|dark)/);
    if (m) {
      saved = m[1];
    } else {
      try { saved = localStorage.getItem(KEY); } catch (e) {}
      if (!saved) {
        saved = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark' : 'light';
      }
    }
    set(saved);

    window.addEventListener('keydown', e => {
      if (e.target && /input|textarea|select/i.test(e.target.tagName || '')) return;
      if (e.key === 't' || e.key === 'T') toggle();
    });
  }

  function readVar(name) {
    return getComputedStyle(root).getPropertyValue(name).trim();
  }

  return { get, set, toggle, init, readVar };
})();
