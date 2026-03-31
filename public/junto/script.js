document.addEventListener('DOMContentLoaded', function () {
  // --- Smooth scroll for CTA ---
  var cta = document.querySelector('.hero__cta');
  if (cta) {
    cta.addEventListener('click', function (e) {
      e.preventDefault();
      var target = document.querySelector(cta.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // --- Info-tip popover ---
  document.querySelectorAll('.info-tip').forEach(function (tip) {
    function open() {
      tip.classList.add('is-open');
      tip.setAttribute('aria-expanded', 'true');
    }
    function close() {
      tip.classList.remove('is-open');
      tip.setAttribute('aria-expanded', 'false');
    }
    function toggle(e) {
      e.stopPropagation();
      tip.classList.contains('is-open') ? close() : open();
    }
    tip.addEventListener('click', toggle);
    tip.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); }
      if (e.key === 'Escape') close();
    });
    tip.querySelector('.info-tip__popover').addEventListener('click', function (e) {
      e.stopPropagation();
    });
  });
  document.addEventListener('click', function () {
    document.querySelectorAll('.info-tip.is-open').forEach(function (tip) {
      tip.classList.remove('is-open');
      tip.setAttribute('aria-expanded', 'false');
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.info-tip.is-open').forEach(function (tip) {
        tip.classList.remove('is-open');
        tip.setAttribute('aria-expanded', 'false');
      });
    }
  });

  // --- Past gatherings accordion ---
  document.querySelectorAll('.gathering__header').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var body = btn.nextElementSibling;
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
      body.hidden = open;
    });
  });

  // --- RSVP form AJAX submission ---
  var form = document.getElementById('rsvp-form');
  var confirmed = document.getElementById('rsvp-confirmed');
  if (form && confirmed) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var originalText = btn.textContent;
      btn.textContent = 'Sending...';
      btn.disabled = true;

      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { 'Accept': 'application/json' }
      })
      .then(function (res) {
        if (res.ok) {
          form.style.display = 'none';
          confirmed.style.display = 'block';
          confirmed.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          throw new Error('Form submission failed');
        }
      })
      .catch(function () {
        btn.textContent = originalText;
        btn.disabled = false;
        alert('Something went wrong. Please try again or email directly.');
      });
    });
  }
});
