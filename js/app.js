(function () {
  'use strict';

  // ── Config ──
  var CONFIG = {
    ghlWebhookPolicy: '',   // paste your GHL webhook URL here
    ghlWebhookRating: '',   // paste your GHL webhook URL here
    kudosStorageKey: 'azvlc_kudos'
  };

  // ── State ──
  var policies = [];
  var politicians = [];
  var currentFilter = 'all';
  var currentPoliticianFilter = 'all';
  var currentPoliticianSort = 'name';
  var currentPoliticianSearch = '';

  // ── Init ──
  document.addEventListener('DOMContentLoaded', function () {
    loadData();
    bindNav();
    bindMobileMenu();
    bindForms();
  });

  // ── Data loading ──
  function loadData() {
    var policyReq = fetch('data/policies.json').then(function (r) { return r.json(); });
    var politicianReq = fetch('data/politicians.json').then(function (r) { return r.json(); });

    Promise.all([policyReq, politicianReq])
      .then(function (results) {
        policies = results[0].filter(function (p) { return p.approved; });
        politicians = results[1];
        applySavedKudos();
        renderDashboard();
        renderPolicies();
        renderPoliticians();
        populatePoliticianSelect();
      })
      .catch(function (err) {
        console.error('Failed to load data:', err);
      });
  }

  // ── Kudos persistence (localStorage) ──
  function getKudosStore() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.kudosStorageKey)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveKudo(type, id) {
    var store = getKudosStore();
    store[type + '_' + id] = true;
    localStorage.setItem(CONFIG.kudosStorageKey, JSON.stringify(store));
  }

  function hasVotedKudo(type, id) {
    return !!getKudosStore()[type + '_' + id];
  }

  function applySavedKudos() {
    // kudos counts come from JSON; localStorage just tracks whether this browser already voted
  }

  // ── Navigation ──
  function bindNav() {
    document.querySelectorAll('[data-nav]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        navigate(el.getAttribute('data-nav'));
      });
    });

    // handle direct URL hash
    var hash = window.location.hash.replace('#', '');
    if (hash) navigate(hash);
  }

  function navigate(section) {
    document.querySelectorAll('.page-section').forEach(function (s) {
      s.classList.remove('active');
    });
    var target = document.getElementById('section-' + section);
    if (target) target.classList.add('active');

    document.querySelectorAll('[data-nav]').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-nav') === section);
    });

    // close mobile menu
    var menu = document.querySelector('.navbar-links');
    if (menu) menu.classList.remove('open');

    window.scrollTo(0, 0);
    window.location.hash = section;
  }

  function bindMobileMenu() {
    var toggle = document.getElementById('menuToggle');
    if (!toggle) return;
    toggle.addEventListener('click', function () {
      document.querySelector('.navbar-links').classList.toggle('open');
    });
  }

  // ── Dashboard ──
  function renderDashboard() {
    setText('statPolicies', policies.length);
    setText('statPoliticians', politicians.length);

    var totalKudos = 0;
    policies.forEach(function (p) { totalKudos += p.kudos || 0; });
    politicians.forEach(function (p) { totalKudos += p.kudos || 0; });
    setText('statKudos', totalKudos);

    // top politicians
    var sorted = politicians.slice().sort(function (a, b) {
      return (b.kudos || 0) - (a.kudos || 0);
    }).slice(0, 3);

    var topEl = document.getElementById('topPoliticians');
    if (!topEl) return;

    if (sorted.length === 0) {
      topEl.innerHTML = emptyState('No ratings yet');
      return;
    }

    topEl.innerHTML = sorted.map(function (p) {
      var avg = calcGrade(p.grades);
      return '<div class="card">' +
        '<h3>' + esc(p.name) + (p.veteran ? ' <span class="vet-badge">VET</span>' : '') + '</h3>' +
        '<p>' + esc(p.position) + '</p>' +
        '<div class="grade grade-' + avg.toLowerCase() + '">' + avg + '</div>' +
        '</div>';
    }).join('');

    // passed policies
    var passed = policies.filter(function (p) { return p.status === 'passed'; });
    var passedEl = document.getElementById('passedPolicies');
    if (!passedEl) return;

    if (passed.length === 0) {
      passedEl.innerHTML = emptyState('No passed policies yet');
      return;
    }

    passedEl.innerHTML = passed.map(function (p) {
      return '<div class="card">' +
        '<h3>' + esc(p.name) + (p.veteran ? ' <span class="vet-badge">VET</span>' : '') + '</h3>' +
        '<p>' + esc(p.description) + '</p>' +
        '<span class="badge badge-passed">Passed</span>' +
        '</div>';
    }).join('');
  }

  // ── Policies ──
  function renderPolicies(filter) {
    if (filter !== undefined) currentFilter = filter;
    var list = currentFilter === 'all'
      ? policies
      : policies.filter(function (p) { return p.category === currentFilter; });

    var el = document.getElementById('policiesList');
    if (!el) return;

    if (list.length === 0) {
      el.innerHTML = emptyState('No policies in this category');
      return;
    }

    el.innerHTML = list.map(function (p) {
      var voted = hasVotedKudo('policy', p.id);
      return '<div class="card">' +
        '<h3>' + esc(p.name) + (p.veteran ? ' <span class="vet-badge">VET</span>' : '') + '</h3>' +
        '<div class="card-meta">' +
          '<span class="badge badge-category">' + capitalize(p.category) + '</span>' +
          '<span class="badge badge-' + p.status + '">' + formatStatus(p.status) + '</span>' +
          '<span style="font-size:0.85em;color:var(--text-muted)">Sponsor: ' + esc(p.sponsor) + '</span>' +
        '</div>' +
        '<p>' + esc(p.description) + '</p>' +
        (p.link ? '<p style="margin-top:8px"><a href="' + esc(p.link) + '" target="_blank" rel="noopener">View Bill &rarr;</a></p>' : '') +
        '<div class="kudos-bar">' +
          '<button class="kudos-btn' + (voted ? ' voted' : '') + '" onclick="AZVLC.giveKudos(' + p.id + ',\'policy\')" ' + (voted ? 'disabled' : '') + '>' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' +
            (voted ? 'Thanked' : 'Give Kudos') +
          '</button>' +
          '<span class="kudos-count" id="kudos-policy-' + p.id + '">' + (p.kudos || 0) + '</span>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  // ── Politicians ──
  function filterPoliticians(filter, btn) {
    currentPoliticianFilter = filter;
    if (btn) {
      document.querySelectorAll('#section-politicians .filter-btn').forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
    }
    renderPoliticians();
  }

  function sortPoliticians(sortBy) {
    currentPoliticianSort = sortBy;
    renderPoliticians();
  }

  function searchPoliticians(query) {
    currentPoliticianSearch = query.toLowerCase().trim();
    renderPoliticians();
  }

  function getFilteredPoliticians() {
    var list = politicians;

    if (currentPoliticianSearch) {
      list = list.filter(function (p) {
        return p.name.toLowerCase().indexOf(currentPoliticianSearch) !== -1;
      });
    }

    if (currentPoliticianFilter !== 'all') {
      list = list.filter(function (p) {
        switch (currentPoliticianFilter) {
          case 'house': return p.position.toLowerCase().indexOf('representative') !== -1;
          case 'senate': return p.position.toLowerCase().indexOf('senator') !== -1;
          case 'republican': return (p.party || '').toLowerCase() === 'republican';
          case 'democrat': return (p.party || '').toLowerCase() === 'democrat';
          case 'veteran': return !!p.veteran;
          default: return true;
        }
      });
    }

    list = list.slice().sort(function (a, b) {
      switch (currentPoliticianSort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'district':
          var da = parseInt((a.district || '').replace(/\D/g, '')) || 999;
          var db = parseInt((b.district || '').replace(/\D/g, '')) || 999;
          return da - db;
        case 'grade':
          return gradeValue(b.grades) - gradeValue(a.grades);
        case 'kudos':
          return (b.kudos || 0) - (a.kudos || 0);
        default:
          return 0;
      }
    });

    return list;
  }

  function gradeValue(grades) {
    if (!grades) return -1;
    var vals = { A: 4, B: 3, C: 2, D: 1, F: 0 };
    var total = 0, count = 0;
    for (var g in vals) { total += vals[g] * (grades[g] || 0); count += (grades[g] || 0); }
    return count === 0 ? -1 : total / count;
  }

  function renderPoliticians() {
    var el = document.getElementById('politiciansList');
    if (!el) return;

    var filtered = getFilteredPoliticians();

    if (filtered.length === 0) {
      el.innerHTML = emptyState('No politicians match this filter');
      return;
    }

    el.innerHTML = filtered.map(function (p) {
      var avg = calcGrade(p.grades);
      var total = gradeTotal(p.grades);
      var voted = hasVotedKudo('politician', p.id);

      return '<div class="card">' +
        '<h3>' + esc(p.name) + (p.veteran ? ' <span class="vet-badge">VET</span>' : '') + '</h3>' +
        '<p style="color:var(--text-muted);margin-bottom:4px">' + esc(p.position) +
          (p.party ? ' &middot; ' + esc(p.party) : '') +
          (p.district ? ' &middot; ' + esc(p.district) : '') +
        '</p>' +
        (p.website ? '<p style="margin-bottom:8px"><a href="' + esc(p.website) + '" target="_blank" rel="noopener">Legislative Profile &rarr;</a></p>' : '') +
        (total > 0
          ? '<div class="grade grade-' + avg.toLowerCase() + '">' + avg + '</div>' +
            '<p style="font-size:0.85em;color:var(--text-muted);margin-bottom:12px">' +
              'Based on ' + total + ' Veteran rating' + (total !== 1 ? 's' : '') +
            '</p>' +
            '<div class="grade-breakdown">' +
              gradeBox('A', p.grades.A) +
              gradeBox('B', p.grades.B) +
              gradeBox('C', p.grades.C) +
              gradeBox('D', p.grades.D) +
              gradeBox('F', p.grades.F) +
            '</div>'
          : '<p style="font-size:0.85em;color:var(--text-muted);margin-bottom:4px;font-style:italic">No Veteran ratings yet</p>'
        ) +
        '<div class="kudos-bar">' +
          '<button class="kudos-btn' + (voted ? ' voted' : '') + '" onclick="AZVLC.giveKudos(' + p.id + ',\'politician\')" ' + (voted ? 'disabled' : '') + '>' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' +
            (voted ? 'Thanked' : 'Give Kudos') +
          '</button>' +
          '<span class="kudos-count" id="kudos-politician-' + p.id + '">' + (p.kudos || 0) + '</span>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  function gradeBox(letter, count) {
    return '<div class="grade-box grade-box-' + letter.toLowerCase() + '">' +
      '<div class="letter grade-' + letter.toLowerCase() + '">' + letter + '</div>' +
      '<div class="count">' + (count || 0) + '</div>' +
      '</div>';
  }

  // ── Kudos ──
  function giveKudos(id, type) {
    if (hasVotedKudo(type, id)) return;

    saveKudo(type, id);

    var item;
    if (type === 'policy') {
      item = policies.find(function (p) { return p.id === id; });
    } else {
      item = politicians.find(function (p) { return p.id === id; });
    }
    if (item) item.kudos = (item.kudos || 0) + 1;

    var countEl = document.getElementById('kudos-' + type + '-' + id);
    if (countEl) countEl.textContent = item.kudos;

    // re-render to disable button
    if (type === 'policy') renderPolicies();
    else renderPoliticians();

    renderDashboard();
  }

  // ── Filter ──
  window.filterPolicies = function (category, btn) {
    document.querySelectorAll('.filter-btn').forEach(function (b) {
      b.classList.remove('active');
    });
    if (btn) btn.classList.add('active');
    renderPolicies(category);
  };

  // ── Politician select dropdown ──
  function populatePoliticianSelect() {
    var select = document.getElementById('politicianSelect');
    if (!select) return;

    var sorted = politicians.slice().sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });

    var options = '<option value="">-- Choose a leader --</option>';
    sorted.forEach(function (p) {
      options += '<option value="' + p.id + '">' + esc(p.name) + ' — ' + esc(p.position) +
        (p.district ? ' (' + esc(p.district) + ')' : '') + '</option>';
    });
    select.innerHTML = options;
  }

  function onRateSearch(query) {
    var dropdown = document.getElementById('rateDropdown');
    if (!query || query.length < 1) { dropdown.style.display = 'none'; return; }

    var q = query.toLowerCase();
    var matches = politicians.filter(function (p) {
      return p.name.toLowerCase().indexOf(q) !== -1;
    }).slice(0, 10);

    if (matches.length === 0) {
      dropdown.style.display = 'none';
      return;
    }

    dropdown.innerHTML = matches.map(function (p) {
      return '<div style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #f0f0f0;font-size:0.95em" ' +
        'onmousedown="AZVLC.selectRatePolitician(' + p.id + ')" ' +
        'onmouseover="this.style.background=\'#f0f7ff\'" onmouseout="this.style.background=\'#fff\'">' +
        '<strong>' + esc(p.name) + '</strong>' +
        (p.veteran ? ' <span style="background:#2e7d32;color:#fff;font-size:0.7em;padding:1px 5px;border-radius:3px">VET</span>' : '') +
        '<br><span style="color:var(--text-muted);font-size:0.85em">' + esc(p.position) +
        (p.district ? ' &middot; ' + esc(p.district) : '') +
        (p.party ? ' &middot; ' + esc(p.party) : '') + '</span></div>';
    }).join('');
    dropdown.style.display = 'block';
  }

  function selectRatePolitician(id) {
    var p = politicians.find(function (x) { return x.id === id; });
    if (!p) return;
    document.getElementById('politicianSearch2').value = p.name;
    document.getElementById('politicianName').value = p.name;
    document.getElementById('politicianPosition').value = p.position;
    document.getElementById('rateDropdown').style.display = 'none';
  }

  document.addEventListener('click', function (e) {
    var dropdown = document.getElementById('rateDropdown');
    if (dropdown && !e.target.closest('#politicianSearch2') && !e.target.closest('#rateDropdown')) {
      dropdown.style.display = 'none';
    }
  });

  // ── Forms ──
  function bindForms() {
    var policyForm = document.getElementById('policyForm');
    if (policyForm) policyForm.addEventListener('submit', submitPolicyForm);

    var ratingForm = document.getElementById('ratingForm');
    if (ratingForm) ratingForm.addEventListener('submit', submitRatingForm);
  }

  function submitPolicyForm(e) {
    e.preventDefault();
    var form = e.target;

    var data = {
      policyName: form.policyName.value,
      policySponsor: form.policySponsor.value,
      policyCategory: form.policyCategory.value,
      policyDescription: form.policyDescription.value,
      policyLink: form.policyLink.value,
      policyStatus: form.policyStatus.value,
      submitterEmail: form.submitterEmail.value,
      submitterName: form.submitterAnonymous.checked ? 'Anonymous' : form.submitterName.value,
      submissionType: 'Policy Suggestion',
      timestamp: new Date().toISOString()
    };

    sendToGHL(CONFIG.ghlWebhookPolicy, data, 'policySuccess', form);
  }

  function submitRatingForm(e) {
    e.preventDefault();
    var form = e.target;

    var data = {
      politicianName: form.politicianName.value,
      politicianPosition: form.politicianPosition.value,
      politicianGrade: form.politicianGrade.value,
      ratingReason: form.ratingReason.value,
      raterEmail: form.raterEmail.value,
      raterName: form.raterAnonymous.checked ? 'Anonymous' : form.raterName.value,
      submissionType: 'Politician Rating',
      timestamp: new Date().toISOString()
    };

    sendToGHL(CONFIG.ghlWebhookRating, data, 'ratingSuccess', form);
  }

  function sendToGHL(url, data, successId, form) {
    var successEl = document.getElementById(successId);

    if (!url) {
      // no webhook configured yet — just show success and log
      console.log('GHL webhook not configured. Data:', data);
      if (successEl) { successEl.classList.add('show'); }
      form.reset();
      setTimeout(function () { if (successEl) successEl.classList.remove('show'); }, 5000);
      return;
    }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      mode: 'no-cors',
      body: JSON.stringify(data)
    })
    .then(function () {
      if (successEl) successEl.classList.add('show');
      form.reset();
      setTimeout(function () { if (successEl) successEl.classList.remove('show'); }, 5000);
    })
    .catch(function (err) {
      console.error('GHL submission error:', err);
      alert('There was an issue submitting. Please try again.');
    });
  }

  // ── Helpers ──
  function calcGrade(grades) {
    if (!grades) return 'N/A';
    var vals = { A: 4, B: 3, C: 2, D: 1, F: 0 };
    var total = 0, count = 0;
    for (var g in vals) {
      total += vals[g] * (grades[g] || 0);
      count += (grades[g] || 0);
    }
    if (count === 0) return 'N/A';
    var avg = total / count;
    if (avg >= 3.5) return 'A';
    if (avg >= 2.5) return 'B';
    if (avg >= 1.5) return 'C';
    if (avg >= 0.5) return 'D';
    return 'F';
  }

  function gradeTotal(grades) {
    if (!grades) return 0;
    return (grades.A || 0) + (grades.B || 0) + (grades.C || 0) + (grades.D || 0) + (grades.F || 0);
  }

  function formatStatus(s) {
    if (s === 'in-progress') return 'In Progress';
    return capitalize(s);
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function setText(id, val) { var e = document.getElementById(id); if (e) e.textContent = val; }

  function emptyState(msg) {
    return '<div class="empty-state">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>' +
      '<p>' + msg + '</p></div>';
  }

  // expose for inline onclick handlers
  window.AZVLC = {
    giveKudos: giveKudos,
    filterPolicies: filterPolicies,
    filterPoliticians: filterPoliticians,
    sortPoliticians: sortPoliticians,
    searchPoliticians: searchPoliticians,
    onRateSearch: onRateSearch,
    selectRatePolitician: selectRatePolitician
  };
})();
