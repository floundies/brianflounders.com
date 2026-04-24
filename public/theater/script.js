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
  var SPONSORS_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTckSBfwDYNA7iL8XNXta1oXJjvAOiN4v2l9fG2SAkiL2oIXX7AAbjPaXd5T7zdA3n1Aniqa3PMMDXM/pub?gid=499326123&single=true&output=csv';
  var seatMapEl = document.getElementById('seatMap');
  var sponsorMap = {};

  if (seatMapEl) {
    // Fetch both sheets in parallel
    Promise.all([
      fetch(SHEET_CSV).then(function (r) { return r.text(); }),
      fetch(SPONSORS_CSV).then(function (r) { return r.text(); }).catch(function () { return ''; })
    ])
    .then(function (results) {
      // Parse sponsors into a lookup: seatId -> inscription
      if (results[1]) {
        var sponsorLines = parseSponsorCSV(results[1]);
        sponsorLines.forEach(function (row) {
          if (row[0] && row[1]) {
            sponsorMap[row[0].trim().toUpperCase()] = row[1].trim();
          }
        });
      }
      renderSeatMap(results[0]);
    })
    .catch(function () {
      seatMapEl.innerHTML = '<p style="text-align:center;color:#a09590;padding:24px 0;">Could not load seat map. Please try again later.</p>';
    });
  }

  function parseSponsorCSV(text) {
    var rows = [];
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var cells = [];
      var cell = '';
      var inQuotes = false;
      for (var j = 0; j < line.length; j++) {
        var ch = line[j];
        if (ch === '"') { inQuotes = !inQuotes; }
        else if (ch === ',' && !inQuotes) { cells.push(cell); cell = ''; }
        else { cell += ch; }
      }
      cells.push(cell);
      // Handle multi-line quoted fields — if we're still in quotes, merge with next line
      if (inQuotes && i + 1 < lines.length) {
        lines[i + 1] = line + '\n' + lines[i + 1];
        continue;
      }
      if (cells.length >= 2 && cells[0].trim()) rows.push(cells);
    }
    return rows.slice(1); // skip header
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

  // Seat tier lookup — mapped from the actual Google Sheet cell colors
  var SEAT_TIERS = {"A13":"P","A11":"P","A9":"P","A7":"P","A5":"P","A3":"P","A1":"P","A115":"P","A114":"P","A113":"P","A112":"P","A111":"P","A110":"P","A109":"P","A108":"P","A107":"P","A106":"P","A105":"P","A104":"P","A103":"P","A102":"P","A101":"P","A2":"P","A4":"P","A6":"P","A8":"P","A10":"P","A12":"P","A14":"P","B17":"P","B15":"P","B13":"G","B11":"G","B9":"G","B7":"G","B5":"G","B3":"P","B1":"P","B115":"P","B114":"P","B113":"G","B112":"G","B111":"G","B110":"G","B109":"B","B108":"B","B107":"G","B106":"G","B105":"G","B104":"G","B103":"G","B102":"P","B101":"P","B2":"P","B4":"P","B6":"G","B8":"G","B10":"G","B12":"G","B14":"G","B16":"P","B18":"P","C21":"P","C19":"P","C17":"B","C15":"B","C13":"B","C11":"B","C9":"B","C7":"B","C5":"B","C3":"P","C1":"P","C115":"P","C114":"P","C113":"B","C112":"B","C111":"B","C110":"B","C109":"B","C108":"B","C107":"B","C106":"B","C105":"B","C104":"B","C103":"B","C102":"P","C101":"P","C2":"P","C4":"P","C6":"B","C8":"B","C10":"B","C12":"B","C14":"B","C16":"B","C18":"B","C20":"P","C22":"P","D23":"P","D21":"P","D19":"B","D17":"B","D15":"B","D13":"B","D11":"B","D9":"B","D7":"B","D5":"B","D3":"P","D1":"P","D115":"P","D114":"P","D113":"B","D112":"B","D111":"B","D110":"B","D109":"B","D108":"B","D107":"B","D106":"B","D105":"B","D104":"B","D103":"B","D102":"P","D101":"P","D2":"P","D4":"P","D6":"B","D8":"B","D10":"B","D12":"B","D14":"B","D16":"B","D18":"B","D20":"B","D22":"P","D24":"P","E25":"P","E23":"P","E21":"B","E19":"B","E17":"B","E15":"B","E13":"B","E11":"B","E9":"B","E7":"B","E5":"B","E3":"P","E1":"B","E115":"P","E114":"P","E113":"B","E112":"B","E111":"B","E110":"B","E109":"B","E108":"B","E107":"B","E106":"B","E105":"B","E104":"B","E103":"B","E102":"P","E101":"P","E2":"P","E4":"P","E6":"B","E8":"B","E10":"B","E12":"B","E14":"B","E16":"B","E18":"B","E20":"B","E22":"B","E24":"P","E26":"P","F29":"P","F27":"P","F25":"B","F23":"B","F21":"B","F19":"B","F17":"B","F15":"B","F13":"B","F11":"B","F9":"B","F7":"B","F5":"B","F3":"P","F1":"P","F115":"P","F114":"P","F113":"B","F112":"B","F111":"B","F110":"B","F109":"B","F108":"B","F107":"B","F106":"B","F105":"B","F104":"B","F103":"B","F102":"P","F101":"P","F2":"P","F4":"P","F6":"B","F8":"B","F10":"B","F12":"B","F14":"B","F16":"B","F18":"B","F20":"B","F22":"B","F24":"B","F26":"B","F28":"P","F30":"P","G27":"P","G25":"P","G23":"B","G21":"B","G19":"B","G17":"B","G15":"B","G13":"B","G11":"B","G9":"B","G7":"B","G5":"B","G3":"P","G1":"P","G115":"P","G114":"P","G113":"B","G112":"B","G111":"B","G110":"B","G109":"B","G108":"B","G107":"B","G106":"B","G105":"B","G104":"B","G103":"B","G102":"P","G101":"P","G2":"P","G4":"P","G6":"B","G8":"B","G10":"B","G12":"B","G14":"B","G16":"B","G18":"B","G20":"B","G22":"B","G24":"B","G26":"P","G28":"P","H27":"P","H25":"P","H23":"B","H21":"B","H19":"B","H17":"B","H15":"B","H13":"B","H11":"B","H9":"B","H7":"B","H5":"B","H3":"P","H1":"P","H115":"P","H114":"P","H113":"B","H112":"B","H111":"B","H110":"B","H109":"B","H108":"B","H107":"B","H106":"B","H105":"B","H104":"B","H103":"B","H102":"P","H101":"P","H2":"B","H4":"B","H6":"B","H8":"B","H10":"B","H12":"B","H14":"B","H16":"B","H18":"B","H20":"B","H22":"B","H24":"B","H26":"P","H28":"P","J27":"P","J25":"P","J23":"B","J21":"B","J19":"B","J17":"B","J15":"B","J13":"B","J11":"B","J9":"B","J7":"B","J5":"B","J3":"P","J1":"P","J115":"P","J114":"P","J113":"B","J112":"B","J111":"B","J110":"B","J109":"B","J108":"B","J107":"B","J106":"B","J105":"B","J104":"B","J103":"B","J102":"P","J101":"P","J2":"P","J4":"P","J6":"B","J8":"B","J10":"B","J12":"B","J14":"B","J16":"B","J18":"B","J20":"B","J22":"B","J24":"B","J26":"P","J28":"P","K27":"P","K25":"P","K23":"B","K21":"B","K19":"B","K17":"B","K15":"B","K13":"B","K11":"B","K9":"B","K7":"B","K5":"B","K3":"P","K1":"P","K115":"P","K114":"P","K113":"B","K112":"B","K111":"B","K110":"B","K109":"B","K108":"B","K107":"B","K106":"B","K105":"B","K104":"B","K103":"B","K102":"P","K101":"P","K2":"P","K4":"P","K6":"B","K8":"B","K10":"B","K12":"B","K14":"B","K16":"B","K18":"B","K20":"B","K22":"B","K24":"B","K26":"P","K28":"P","L27":"P","L25":"P","L23":"B","L21":"B","L19":"B","L17":"B","L15":"B","L13":"B","L11":"B","L9":"B","L7":"B","L5":"B","L3":"P","L1":"P","L115":"P","L114":"P","L113":"B","L112":"B","L111":"B","L110":"B","L109":"B","L108":"B","L107":"B","L106":"B","L105":"B","L104":"B","L103":"B","L102":"P","L101":"P","L2":"P","L4":"P","L6":"B","L8":"B","L10":"B","L12":"B","L14":"B","L16":"B","L18":"B","L20":"B","L22":"B","L24":"B","L26":"P","L28":"P","M27":"P","M25":"P","M23":"B","M21":"B","M19":"B","M17":"B","M15":"B","M13":"B","M11":"B","M9":"B","M7":"B","M5":"B","M3":"P","M1":"P","M115":"P","M114":"P","M113":"B","M112":"B","M111":"B","M110":"B","M109":"B","M108":"B","M107":"B","M106":"B","M105":"B","M104":"B","M103":"B","M102":"P","M101":"P","M2":"P","M4":"P","M6":"B","M8":"B","M10":"B","M12":"B","M14":"B","M16":"B","M18":"B","M20":"B","M22":"B","M24":"B","M26":"P","M28":"P","N27":"P","N25":"P","N23":"B","N21":"B","N19":"B","N17":"B","N15":"B","N13":"B","N11":"B","N9":"B","N7":"B","N5":"B","N3":"P","N1":"P","N115":"P","N114":"P","N113":"B","N112":"B","N111":"B","N110":"B","N109":"B","N108":"B","N107":"B","N106":"B","N105":"B","N104":"B","N103":"B","N102":"P","N101":"P","N2":"P","N4":"P","N6":"B","N8":"B","N10":"B","N12":"B","N14":"B","N16":"B","N18":"B","N20":"B","N22":"B","N24":"B","N26":"P","N28":"P","P27":"P","P25":"P","P23":"B","P21":"B","P19":"B","P17":"B","P15":"B","P13":"B","P11":"B","P9":"B","P7":"B","P5":"B","P3":"P","P1":"P","P115":"P","P114":"P","P113":"B","P112":"B","P111":"B","P110":"B","P109":"B","P108":"B","P107":"B","P106":"B","P105":"B","P104":"B","P103":"B","P102":"P","P101":"P","P2":"P","P4":"P","P6":"B","P8":"B","P10":"B","P12":"B","P14":"B","P16":"B","P18":"B","P20":"B","P22":"B","P24":"B","P26":"P","P28":"P","Q25":"P","Q23":"P","Q21":"G","Q19":"G","Q17":"G","Q15":"G","Q13":"G","Q11":"G","Q9":"G","Q7":"G","Q5":"G","Q3":"P","Q1":"P","Q115":"P","Q114":"P","Q113":"B","Q112":"B","Q111":"B","Q110":"B","Q109":"B","Q108":"B","Q107":"B","Q106":"B","Q105":"B","Q104":"B","Q103":"B","Q102":"P","Q101":"P","Q2":"P","Q4":"P","Q6":"G","Q8":"G","Q10":"G","Q12":"G","Q14":"G","Q16":"G","Q18":"G","Q20":"G","Q22":"G","Q24":"P","Q26":"P","R19":"P","R17":"P","R15":"P","R115":"P","R114":"P","R113":"G","R112":"P","R111":"G","R110":"G","R109":"G","R108":"G","R107":"G","R106":"G","R105":"G","R104":"G","R103":"P","R102":"P","R101":"P","R16":"P","R18":"P","R20":"P","S19":"P","S17":"P","S15":"P","S13":"P","S9":"P","S3":"P","S1":"P","S115":"P","S114":"P","S113":"P","S112":"P","S111":"P","S110":"P","S109":"P","S108":"P","S107":"P","S106":"P","S105":"P","S104":"P","S103":"P","S102":"P","S101":"P","S2":"P","S4":"P","S10":"P","S14":"P","S16":"P","S18":"P","S20":"P","T25":"P","T23":"P","T21":"P","T19":"P","T17":"P","T15":"P","T13":"P","T11":"P","T9":"P","T7":"P","T5":"P","T3":"P","T1":"P","T115":"P","T114":"P","T113":"P","T112":"P","T111":"P","T110":"P","T109":"P","T108":"P","T107":"P","T106":"P","T105":"P","T104":"P","T103":"P","T102":"P","T101":"P","T2":"P","T4":"P","T6":"P","T8":"P","T10":"P","T12":"P","T14":"P","T16":"P","T18":"P","T20":"P","T22":"P","T24":"P","T26":"P","U25":"P","U23":"P","U21":"G","U19":"G","U17":"G","U15":"G","U13":"G","U11":"G","U9":"G","U7":"G","U5":"G","U3":"P","U1":"P","U115":"P","U114":"P","U113":"G","U112":"G","U111":"G","U110":"G","U109":"G","U108":"G","U107":"G","U106":"G","U105":"G","U104":"G","U103":"G","U102":"P","U101":"P","U2":"P","U4":"P","U6":"G","U8":"G","U10":"G","U12":"G","U14":"G","U16":"G","U18":"G","U20":"G","U22":"G","U24":"P","U26":"P","V25":"P","V23":"P","V21":"B","V19":"B","V17":"B","V15":"B","V13":"B","V11":"B","V9":"B","V7":"B","V5":"B","V3":"P","V1":"P","V115":"P","V114":"P","V113":"B","V112":"B","V111":"B","V110":"B","V109":"B","V108":"B","V107":"B","V106":"B","V105":"B","V104":"B","V103":"B","V102":"P","V101":"P","V2":"P","V4":"P","V6":"B","V8":"B","V10":"B","V12":"B","V14":"B","V16":"B","V18":"B","V20":"B","V22":"B","V24":"P","V26":"P","W25":"P","W23":"P","W21":"B","W19":"B","W17":"B","W15":"B","W13":"B","W11":"B","W9":"B","W7":"B","W5":"B","W3":"P","W1":"P","W115":"P","W114":"P","W113":"B","W112":"B","W111":"B","W110":"B","W109":"B","W108":"P","W107":"B","W106":"B","W105":"B","W104":"B","W103":"B","W102":"P","W101":"P","W2":"P","W4":"P","W6":"B","W8":"B","W10":"B","W12":"B","W14":"B","W16":"B","W18":"B","W20":"B","W22":"B","W24":"P","W26":"P","X25":"P","X23":"P","X21":"B","X19":"B","X17":"B","X15":"B","X13":"B","X11":"B","X9":"B","X7":"B","X5":"B","X3":"P","X1":"P","X115":"P","X114":"P","X113":"B","X112":"B","X111":"B","X110":"B","X109":"B","X108":"B","X107":"B","X106":"B","X105":"B","X104":"B","X103":"B","X102":"P","X101":"P","X2":"P","X4":"P","X6":"B","X8":"B","X10":"B","X12":"B","X14":"B","X16":"B","X18":"B","X20":"B","X22":"B","X24":"P","X26":"P","Y25":"P","Y23":"P","Y21":"B","Y19":"B","Y17":"B","Y15":"B","Y13":"B","Y11":"B","Y9":"B","Y7":"B","Y5":"B","Y3":"P","Y1":"P","Y115":"P","Y114":"P","Y113":"B","Y112":"B","Y111":"B","Y110":"B","Y109":"B","Y108":"B","Y107":"B","Y106":"B","Y105":"B","Y104":"B","Y103":"B","Y102":"P","Y101":"P","Y2":"P","Y4":"P","Y6":"B","Y8":"B","Y10":"B","Y12":"B","Y14":"B","Y16":"B","Y18":"B","Y20":"B","Y22":"B","Y24":"P","Y26":"P","Z25":"P","Z23":"P","Z21":"B","Z19":"B","Z17":"B","Z15":"B","Z13":"B","Z11":"B","Z9":"B","Z7":"B","Z5":"B","Z3":"P","Z1":"P","Z115":"P","Z114":"P","Z113":"B","Z112":"B","Z111":"B","Z110":"B","Z109":"B","Z108":"B","Z107":"B","Z106":"B","Z105":"B","Z104":"B","Z103":"P","Z102":"P","Z101":"P","Z2":"P","Z4":"P","Z6":"B","Z8":"B","Z10":"B","Z12":"B","Z14":"B","Z16":"B","Z18":"B","Z20":"B","Z22":"B","Z24":"P","Z26":"P","AA25":"P","AA23":"P","AA21":"B","AA19":"B","AA17":"B","AA15":"B","AA13":"B","AA11":"B","AA9":"B","AA7":"B","AA5":"B","AA3":"P","AA1":"P","AA115":"P","AA114":"P","AA113":"B","AA112":"B","AA111":"B","AA110":"B","AA109":"B","AA108":"B","AA107":"B","AA106":"B","AA105":"B","AA104":"B","AA103":"B","AA102":"P","AA101":"P","AA2":"P","AA4":"P","AA6":"P","AA8":"P","AA10":"B","AA12":"B","AA14":"B","AA16":"B","AA18":"B","AA20":"B","AA22":"P","AA24":"P","AA26":"P","BB25":"P","BB23":"P","BB21":"B","BB19":"B","BB17":"B","BB15":"B","BB13":"B","BB11":"B","BB9":"B","BB7":"B","BB5":"B","BB3":"P","BB1":"P","BB115":"P","BB114":"P","BB113":"B","BB112":"B","BB111":"B","BB110":"B","BB109":"B","BB108":"B","BB107":"B","BB106":"B","BB105":"B","BB104":"B","BB103":"B","BB102":"P","BB101":"P","BB2":"P","BB4":"P","BB6":"P","BB8":"P","BB10":"B","BB12":"B","BB14":"B","BB16":"B","BB18":"B","BB20":"B","BB22":"B","BB24":"P","BB26":"P","CC25":"P","CC23":"P","CC21":"B","CC19":"B","CC17":"B","CC15":"B","CC13":"B","CC11":"B","CC9":"B","CC7":"B","CC5":"B","CC3":"P","CC1":"P","CC115":"P","CC114":"P","CC113":"B","CC112":"B","CC111":"B","CC110":"B","CC109":"B","CC108":"B","CC107":"B","CC106":"B","CC105":"B","CC104":"B","CC103":"B","CC102":"P","CC101":"P","CC2":"P","CC4":"P","CC6":"P","CC8":"B","CC10":"B","CC12":"B","CC14":"B","CC16":"B","CC18":"B","CC20":"B","CC22":"B","CC24":"P","CC26":"P","DD25":"P","DD23":"P","DD21":"B","DD19":"B","DD17":"B","DD15":"B","DD13":"B","DD11":"B","DD9":"B","DD7":"B","DD5":"B","DD3":"P","DD1":"P","DD115":"P","DD114":"P","DD113":"B","DD112":"B","DD111":"B","DD110":"B","DD109":"B","DD108":"B","DD107":"B","DD106":"B","DD105":"B","DD104":"B","DD103":"B","DD102":"P","DD101":"P","DD2":"P","DD4":"P","DD6":"B","DD8":"B","DD10":"B","DD12":"B","DD14":"B","DD16":"B","DD18":"B","DD20":"B","DD22":"B","DD24":"P","DD26":"P","EE25":"P","EE23":"P","EE21":"B","EE19":"B","EE17":"B","EE15":"B","EE13":"B","EE11":"B","EE9":"B","EE7":"B","EE5":"B","EE3":"P","EE1":"P","EE115":"P","EE114":"P","EE113":"B","EE112":"B","EE111":"B","EE110":"B","EE109":"B","EE108":"B","EE107":"B","EE106":"B","EE105":"B","EE104":"B","EE103":"P","EE102":"P","EE101":"P","EE2":"P","EE4":"P","EE6":"B","EE8":"B","EE10":"B","EE12":"B","EE14":"B","EE16":"B","EE18":"B","EE20":"B","EE22":"B","EE24":"P","EE26":"P","FF25":"P","FF23":"P","FF21":"B","FF19":"B","FF17":"B","FF15":"B","FF13":"B","FF11":"B","FF9":"B","FF7":"B","FF5":"B","FF3":"P","FF1":"P","FF115":"P","FF114":"P","FF102":"P","FF101":"P","FF2":"P","FF4":"P","FF6":"B","FF8":"B","FF10":"B","FF12":"B","FF14":"B","FF16":"B","FF18":"B","FF20":"B","FF22":"B","FF24":"P","FF26":"P","GG25":"P","GG23":"P","GG21":"G","GG19":"G","GG17":"G","GG15":"G","GG13":"G","GG11":"G","GG9":"G","GG7":"G","GG5":"G","GG3":"P","GG1":"P","GG115":"P","GG114":"P","GG102":"P","GG101":"P","GG2":"P","GG4":"P","GG6":"G","GG8":"G","GG10":"G","GG12":"G","GG14":"G","GG16":"G","GG18":"G","GG20":"G","GG22":"G","GG24":"P","GG26":"P","HH25":"P","HH23":"P","HH21":"P","HH19":"P","HH17":"P","HH15":"P","HH13":"P","HH11":"P","HH9":"P","HH7":"P","HH5":"P","HH3":"P","HH1":"P","HH115":"P","HH114":"P","HH102":"P","HH101":"P","HH2":"P","HH4":"P","HH6":"P","HH8":"P","HH10":"P","HH12":"P","HH14":"P","HH16":"P","HH18":"P","HH20":"P","HH22":"P","HH24":"P","HH26":"P","JJ17":"P","JJ15":"P","JJ13":"P","JJ9":"P","JJ3":"P","JJ1":"P","JJ115":"P","JJ114":"P","JJ102":"P","JJ101":"P","JJ2":"P","JJ4":"P","JJ10":"P","JJ14":"P","JJ16":"P","JJ18":"P"}
;

  function getSeatTier(seatId, rowLabel) {
    if (!seatId || seatId === 'SOLD' || seatId === 'SOUND BOOTH') return null;
    var t = SEAT_TIERS[seatId];
    if (t === 'P') return 'prime';
    if (t === 'G') return 'gold';
    if (t === 'B') return 'blue';
    return 'gold';
  }

  // Custom tooltip
  var tooltip = document.createElement('div');
  tooltip.className = 'seat-tooltip';
  document.body.appendChild(tooltip);

  function showTooltip(e, html) {
    tooltip.innerHTML = html;
    tooltip.classList.add('is-visible');
    positionTooltip(e);
  }
  function hideTooltip() {
    tooltip.classList.remove('is-visible');
  }
  function positionTooltip(e) {
    var x = e.clientX + 12;
    var y = e.clientY - 10;
    // Keep on screen
    var w = tooltip.offsetWidth;
    var h = tooltip.offsetHeight;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 12;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - 10;
    if (y < 4) y = 4;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }

  function renderSeatMap(csv) {
    var rows = parseCSV(csv);
    if (rows.length < 4) { seatMapEl.innerHTML = '<p style="text-align:center;color:#a09590;">No seat data found.</p>'; return; }

    // Header row has seat numbers per column — use to reconstruct sold seat IDs
    var headerRow = rows[0];

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
        addSeatCell(rowEl, val, c, rowLabel, headerRow);
      }

      // Left aisle
      var aisleL = document.createElement('span');
      aisleL.className = 'seat-map__aisle';
      rowEl.appendChild(aisleL);

      // Center section
      for (var c = 18; c <= 32; c++) {
        var val = (cells[c] || '').trim();
        addSeatCell(rowEl, val, c, rowLabel, headerRow);
      }

      // Right aisle
      var aisleR = document.createElement('span');
      aisleR.className = 'seat-map__aisle';
      rowEl.appendChild(aisleR);

      // Right section
      for (var c = 34; c <= 48; c++) {
        var val = (cells[c] || '').trim();
        addSeatCell(rowEl, val, c, rowLabel, headerRow);
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

  function isSoundBoothZone(seatId, rowLabel) {
    if (rowLabel !== 'GG' && rowLabel !== 'HH' && rowLabel !== 'JJ') return false;
    var num = parseInt(seatId.replace(/[A-Z]+/gi, ''));
    return num >= 103 && num <= 113;
  }

  function isUnavailable(seatId, rowLabel) {
    if (rowLabel !== 'FF') return false;
    var num = parseInt(seatId.replace(/[A-Z]+/gi, ''));
    return num >= 103 && num <= 113;
  }

  function addSeatCell(rowEl, val, colIndex, rowLabel, headerRow) {
    var cell = document.createElement('button');
    cell.className = 'seat-map__cell';

    // Reconstruct seat ID from row label + header column number
    var colNum = (headerRow && headerRow[colIndex]) ? headerRow[colIndex].trim() : '';
    var reconstructedId = colNum ? (rowLabel + colNum).toUpperCase() : '';

    // Check sound booth zone first — cells may be empty in the spreadsheet
    var isCenterCol = colIndex >= 18 && colIndex <= 32;
    if (isCenterCol && (rowLabel === 'GG' || rowLabel === 'HH' || rowLabel === 'JJ') && !val) {
      cell.className += ' seat-map__cell--soundbooth';
      cell.title = 'Sound Booth';
      cell.disabled = true;
    } else if (isCenterCol && rowLabel === 'FF' && !val) {
      cell.className += ' seat-map__cell--unavailable';
      cell.title = 'Not available';
      cell.disabled = true;
    } else if (!val) {
      cell.className += ' seat-map__cell--empty';
    } else if (val === 'SOLD') {
      cell.className += ' seat-map__cell--sold';
      cell.disabled = true;
      var sponsor = reconstructedId ? sponsorMap[reconstructedId] : '';
      var tooltipHtml;
      if (sponsor) {
        tooltipHtml = '<span class="seat-tooltip__seat">' + reconstructedId + '</span>Sponsored<span class="seat-tooltip__sponsor">' + sponsor.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>';
      } else {
        tooltipHtml = '<span class="seat-tooltip__seat">' + (reconstructedId || '?') + '</span>Sold';
      }
      cell.addEventListener('mouseenter', function(h) { return function(e) { showTooltip(e, h); }; }(tooltipHtml));
      cell.addEventListener('mousemove', positionTooltip);
      cell.addEventListener('mouseleave', hideTooltip);
    } else if (val === 'SOUND BOOTH') {
      cell.className += ' seat-map__cell--soundbooth';
      cell.title = 'Sound Booth';
      cell.disabled = true;
    } else if (isSoundBoothZone(val, rowLabel)) {
      cell.className += ' seat-map__cell--soundbooth';
      cell.title = 'Sound Booth';
      cell.disabled = true;
    } else if (isUnavailable(val, rowLabel)) {
      cell.className += ' seat-map__cell--unavailable';
      cell.title = val + ' — Not available';
      cell.disabled = true;
    } else {
      var tier = getSeatTier(val, rowLabel);
      cell.className += ' seat-map__cell--' + tier;
      var tierLabel = tier === 'prime' ? 'Prime ($1,000)' : tier === 'gold' ? 'Gold ($750)' : 'Blue ($600)';
      var availHtml = '<span class="seat-tooltip__seat">' + val + '</span>' + tierLabel;
      cell.addEventListener('mouseenter', function(h) { return function(e) { showTooltip(e, h); }; }(availHtml));
      cell.addEventListener('mousemove', positionTooltip);
      cell.addEventListener('mouseleave', hideTooltip);
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
