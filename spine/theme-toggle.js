(function () {
  var root = document.documentElement;
  var KEY = 'theme';

  function isDark() { return root.classList.contains('theme-dark'); }

  function syncPressed(btn) {
    btn.setAttribute('aria-pressed', isDark() ? 'true' : 'false');
  }

  function init() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    syncPressed(btn);
    btn.addEventListener('click', function () {
      root.classList.toggle('theme-dark');
      try { localStorage.setItem(KEY, isDark() ? 'dark' : 'light'); } catch (e) {}
      syncPressed(btn);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
