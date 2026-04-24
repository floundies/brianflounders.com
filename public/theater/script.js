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

  // --- Seat Map: fetch from Google Sheets CSV ---
  var SHEET_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTckSBfwDYNA7iL8XNXta1oXJjvAOiN4v2l9fG2SAkiL2oIXX7AAbjPaXd5T7zdA3n1Aniqa3PMMDXM/pub?gid=0&single=true&output=csv';
  var seatMapEl = document.getElementById('seatMap');

  if (seatMapEl) {
    fetch(SHEET_CSV)
      .then(function (res) { return res.text(); })
      .then(function (csv) { renderSeatMap(csv); })
      .catch(function () {
        seatMapEl.innerHTML = '<p style="text-align:center;color:#a09590;padding:24px 0;">Could not load seat map. Please try again later.</p>';
      });
  }

  function parseCSV(text) {
    var rows = [];
    var current = '';
    var inQuotes = false;
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var cells = [];
      var cell = '';
      var line = lines[i];
      for (var j = 0; j < line.length; j++) {
        var ch = line[j];
        if (ch === '"') { inQuotes = !inQuotes; }
        else if (ch === ',' && !inQuotes) { cells.push(cell.trim()); cell = ''; }
        else { cell += ch; }
      }
      cells.push(cell.trim());
      rows.push(cells);
    }
    return rows;
  }

  // Seat tier zones based on the actual theater seating chart
  // Prime (orange/tan) = closest to stage + center aisles (concentric oval)
  // Gold (green) = middle ring
  // Blue = outermost wings
  var ROW_ORDER = ['A','B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','V','W','X','Y','Z','AA','BB','CC','DD','EE','FF','GG','HH','JJ'];

  function getSeatTier(seatId, rowLabel) {
    if (!seatId || seatId === 'SOLD' || seatId === 'SOUND BOOTH') return null;
    var num = parseInt(seatId.replace(/[A-Z]+/gi, ''));
    if (isNaN(num)) return 'gold';

    var rowIdx = ROW_ORDER.indexOf(rowLabel);
    var isFront = rowIdx >= 0 && rowIdx <= 9;    // A-K
    var isMid = rowIdx >= 10 && rowIdx <= 16;     // L-S
    var isDeepRear = rowIdx >= 25;                // FF-JJ

    // CENTER section (100-series)
    if (num >= 101 && num <= 115) {
      if (isDeepRear) return 'gold';
      // Prime band: seats 105-110 in front/mid/rear
      if (num >= 105 && num <= 110) return 'prime';
      return 'gold';
    }

    // LEFT section (odd numbers — 1 closest to center aisle)
    if (num % 2 === 1 && num < 100) {
      if (isFront) {
        if (num <= 9) return 'prime';
        if (num <= 21) return 'gold';
        return 'blue';
      }
      if (isMid) {
        if (num <= 3) return 'prime';
        if (num <= 23) return 'gold';
        return 'blue';
      }
      // rear rows T+
      if (num <= 21) return 'gold';
      return 'blue';
    }

    // RIGHT section (even numbers — 2 closest to center aisle)
    if (num % 2 === 0 && num < 100) {
      if (isFront) {
        if (num <= 10) return 'prime';
        if (num <= 22) return 'gold';
        return 'blue';
      }
      if (isMid) {
        if (num <= 4) return 'prime';
        if (num <= 22) return 'gold';
        return 'blue';
      }
      // rear rows T+
      if (num <= 22) return 'gold';
      return 'blue';
    }

    return 'gold';
  }

  function renderSeatMap(csv) {
    var rows = parseCSV(csv);
    if (rows.length < 4) { seatMapEl.innerHTML = '<p style="text-align:center;color:#a09590;">No seat data found.</p>'; return; }

    var grid = document.createElement('div');
    grid.className = 'seat-map__grid';

    // Skip header rows (row 0 = seat numbers header, row 1 = STAGE, row 2 = blank)
    // Data rows start at index 3
    for (var r = 3; r < rows.length; r++) {
      var cells = rows[r];
      var rowLabel = (cells[0] || '').trim();

      // Skip empty rows, legend rows
      if (!rowLabel || rowLabel === 'Legend' || rowLabel === 'Available PRIME seat' || rowLabel === 'SOLD PRIME seat' || rowLabel === 'Available GOLD seat' || rowLabel === 'SOLD GOLD seat' || rowLabel === 'Available BLUE seat' || rowLabel === 'SOLD BLUE seat' || rowLabel === 'TOTAL SEATS') continue;
      // Skip non-row-label entries
      if (rowLabel.length > 3 && !/^[A-Z]{1,2}$/i.test(rowLabel)) continue;

      // Add walkway gap between S and T rows
      if (rowLabel === 'T') {
        var walkway = document.createElement('div');
        walkway.className = 'seat-map__walkway';
        grid.appendChild(walkway);
      }

      var rowEl = document.createElement('div');
      rowEl.className = 'seat-map__row';

      // Row label (left)
      var labelL = document.createElement('span');
      labelL.className = 'seat-map__row-label';
      labelL.textContent = rowLabel;
      rowEl.appendChild(labelL);

      // The data has: col0=rowLabel, col1=seatCount, then seat columns
      // Left section: cols 2-16 (odd seats, high to low)
      // Aisle: col 17 (the "15" marker)
      // Center section: cols 18-32 (100-series seats)
      // Aisle: col 33 (seat count again)
      // Right section: cols 34-48 (even seats, low to high)

      // Left section
      for (var c = 2; c <= 16; c++) {
        var val = (cells[c] || '').trim();
        addSeatCell(rowEl, val, c, rowLabel);
      }

      // Left aisle
      var aisleL = document.createElement('span');
      aisleL.className = 'seat-map__aisle';
      rowEl.appendChild(aisleL);

      // Center section
      for (var c = 18; c <= 32; c++) {
        var val = (cells[c] || '').trim();
        addSeatCell(rowEl, val, c, rowLabel);
      }

      // Right aisle
      var aisleR = document.createElement('span');
      aisleR.className = 'seat-map__aisle';
      rowEl.appendChild(aisleR);

      // Right section
      for (var c = 34; c <= 48; c++) {
        var val = (cells[c] || '').trim();
        addSeatCell(rowEl, val, c, rowLabel);
      }

      // Row label (right)
      var labelR = document.createElement('span');
      labelR.className = 'seat-map__row-label';
      labelR.textContent = rowLabel;
      rowEl.appendChild(labelR);

      grid.appendChild(rowEl);
    }

    seatMapEl.innerHTML = '';
    seatMapEl.appendChild(grid);
  }

  function addSeatCell(rowEl, val, colIndex, rowLabel) {
    var cell = document.createElement('button');
    cell.className = 'seat-map__cell';

    if (!val) {
      cell.className += ' seat-map__cell--empty';
    } else if (val === 'SOLD') {
      cell.className += ' seat-map__cell--sold';
      cell.title = 'Sold';
      cell.disabled = true;
    } else if (val === 'SOUND BOOTH') {
      cell.className += ' seat-map__cell--soundbooth';
      cell.title = 'Sound Booth';
      cell.disabled = true;
    } else {
      var tier = getSeatTier(val, rowLabel);
      cell.className += ' seat-map__cell--' + tier;
      var tierLabel = tier === 'prime' ? 'Prime ($1,000)' : tier === 'gold' ? 'Gold ($750)' : 'Blue ($600)';
      cell.title = val + ' — ' + tierLabel;
      cell.setAttribute('aria-label', val + ', ' + tierLabel + ', available');
      cell.addEventListener('click', function (seatId, tl) {
        return function () {
          if (confirm('Sponsor seat ' + seatId + '?\n' + tl + '\n\nYou will be redirected to our donation page.')) {
            window.open('https://givebutter.com/HLTC', '_blank');
          }
        };
      }(val, tierLabel));
    }

    rowEl.appendChild(cell);
  }

});
