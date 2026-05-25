/* iris — page-local interactions for the design-system reference catalog.
   Two effects: the eye shrinks + becomes sticky once scrolled past, then
   fades when the footer twin enters view. Both eyes' pupils track the
   cursor. Nothing else on the site moves — this is the one exception
   documented in iris's own "static — except for the eye" character note. */

(function () {
  var wrap = document.querySelector('.iris-icon');
  var pupil = wrap && wrap.querySelector('.icon-eye path:last-child');
  if (!pupil) return;

  pupil.style.transition = 'transform 0.18s ease-out';

  /* Sticky shrink — add class once page has scrolled past the icon's natural position */
  var stickyThreshold = wrap.offsetTop;
  window.addEventListener('scroll', function () {
    if (window.scrollY > stickyThreshold) {
      wrap.classList.add('is-sticky');
    } else {
      wrap.classList.remove('is-sticky');
    }
  }, { passive: true });

  /* Fade out sticky eye when the footer eye comes into view */
  var footerEye = document.querySelector('.footer-iris');
  if (footerEye && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      wrap.classList.toggle('is-faded', entries[0].isIntersecting);
    }, { threshold: 0.1 }).observe(footerEye);
  }

  /* Cursor tracking — shared handler for both eyes */
  var footerPupil = document.querySelector('.footer-iris .icon-eye path:last-child');
  if (footerPupil) footerPupil.style.transition = 'transform 0.18s ease-out';

  function trackEye(eyeEl, pupilEl, e) {
    var r = eyeEl.getBoundingClientRect();
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    var dx = e.clientX - cx;
    var dy = e.clientY - cy;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var max = 3;
    var ease = Math.min(dist / 160, 1);
    pupilEl.style.transform = 'translate(' + (dx / dist) * max * ease + 'px,' + (dy / dist) * max * ease + 'px)';
  }

  document.addEventListener('mousemove', function (e) {
    trackEye(wrap, pupil, e);
    if (footerPupil) trackEye(document.querySelector('.footer-iris'), footerPupil, e);
  });
}());
