(function () {
  var root = document.documentElement;
  var KEY = 'theme';

  function isDark() { return root.classList.contains('theme-dark'); }

  function render(btn) {
    btn.textContent = isDark() ? 'on' : 'off';
    btn.setAttribute('aria-pressed', isDark() ? 'true' : 'false');
  }

  function init() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    render(btn);
    btn.addEventListener('click', function () {
      root.classList.toggle('theme-dark');
      try { localStorage.setItem(KEY, isDark() ? 'dark' : 'light'); } catch (e) {}
      render(btn);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
