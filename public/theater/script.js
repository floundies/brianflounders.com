document.addEventListener('DOMContentLoaded', function () {

  // --- Sticky nav: show after scrolling past hero ---
  var nav = document.getElementById('siteNav');
  var hero = document.querySelector('.hero');
  if (nav && hero) {
    var heroObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          nav.classList.remove('is-visible');
        } else {
          nav.classList.add('is-visible');
        }
      });
    }, { threshold: 0.05 });
    heroObserver.observe(hero);
  }

  // --- Active nav link highlighting ---
  var navLinks = document.querySelectorAll('.site-nav__links a');
  var sections = [];
  navLinks.forEach(function (link) {
    var href = link.getAttribute('href');
    if (href && href.startsWith('#')) {
      var section = document.querySelector(href);
      if (section) sections.push({ el: section, link: link });
    }
  });

  if (sections.length) {
    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var match = sections.find(function (s) { return s.el === entry.target; });
        if (match) {
          if (entry.isIntersecting) {
            navLinks.forEach(function (l) { l.classList.remove('is-active'); });
            match.link.classList.add('is-active');
          }
        }
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    sections.forEach(function (s) { sectionObserver.observe(s.el); });
  }

  // --- Smooth scrolling for anchor links ---
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Close mobile menu if open
        var navLinksEl = document.getElementById('navLinks');
        if (navLinksEl) navLinksEl.classList.remove('is-open');
      }
    });
  });

  // --- Mobile menu toggle ---
  var toggle = document.getElementById('navToggle');
  var navLinksEl = document.getElementById('navLinks');
  if (toggle && navLinksEl) {
    toggle.addEventListener('click', function () {
      navLinksEl.classList.toggle('is-open');
    });
  }

  // --- Scroll reveal animations ---
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    reveals.forEach(function (el) { revealObserver.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  }

  // --- Newsletter form submission ---
  var form = document.getElementById('newsletter-form');
  var confirmed = document.getElementById('newsletter-confirmed');
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
        } else {
          throw new Error('Submission failed');
        }
      })
      .catch(function () {
        btn.textContent = originalText;
        btn.disabled = false;
        alert('Something went wrong. Please try again or email info@lansdownetheater.org directly.');
      });
    });
  }

});
