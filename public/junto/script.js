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
