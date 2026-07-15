/* Spotlight effects — separate from script.js, which is preserved as-is. */
document.addEventListener('DOMContentLoaded', function () {

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Before/after compare slider ---
  var compare = document.getElementById('compareSlider');
  var before = document.getElementById('compareBefore');
  var handle = document.getElementById('compareHandle');

  if (compare && before && handle) {
    var pct = 50;

    function setPct(p) {
      pct = Math.max(2, Math.min(98, p));
      before.style.width = pct + '%';
      handle.style.left = pct + '%';
      handle.setAttribute('aria-valuenow', Math.round(pct));
    }

    // Keep the 1927 image sized to the full container so it doesn't squish
    function sizeBeforeImg() {
      var img = before.querySelector('.compare__img');
      if (img) img.style.width = compare.offsetWidth + 'px';
    }
    sizeBeforeImg();
    window.addEventListener('resize', sizeBeforeImg);

    function pointerPct(e) {
      var rect = compare.getBoundingClientRect();
      var x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      return (x / rect.width) * 100;
    }

    var dragging = false;
    compare.addEventListener('pointerdown', function (e) {
      dragging = true;
      compare.setPointerCapture(e.pointerId);
      setPct(pointerPct(e));
    });
    compare.addEventListener('pointermove', function (e) {
      if (dragging) setPct(pointerPct(e));
    });
    compare.addEventListener('pointerup', function () { dragging = false; });
    compare.addEventListener('pointercancel', function () { dragging = false; });

    handle.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { setPct(pct - 4); e.preventDefault(); }
      if (e.key === 'ArrowRight') { setPct(pct + 4); e.preventDefault(); }
    });

    setPct(50);
  }

  // --- Hero parallax (subtle) ---
  var heroBg = document.querySelector('.hero__bg');
  if (heroBg && !reducedMotion) {
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY;
        if (y < window.innerHeight * 1.2) {
          heroBg.style.transform = 'translateY(' + y * 0.22 + 'px)';
        }
        ticking = false;
      });
    }, { passive: true });
  }

  // --- Stat counters ---
  var counters = document.querySelectorAll('.stat__number[data-count]');
  if (counters.length && 'IntersectionObserver' in window && !reducedMotion) {
    var counterObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        counterObserver.unobserve(el);
        var target = parseInt(el.getAttribute('data-count'), 10);
        var start = null;
        var dur = 1600;
        function step(ts) {
          if (!start) start = ts;
          var t = Math.min((ts - start) / dur, 1);
          var eased = 1 - Math.pow(1 - t, 3);
          el.textContent = Math.round(target * eased).toLocaleString('en-US');
          if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { counterObserver.observe(el); });
  } else {
    counters.forEach(function (el) {
      el.textContent = parseInt(el.getAttribute('data-count'), 10).toLocaleString('en-US');
    });
  }

});
