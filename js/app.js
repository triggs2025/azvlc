(function () {
  'use strict';

  // ── Config ──
  var CONFIG = {
    ghlWebhookPolicy: '',   // paste your GHL webhook URL here
    ghlWebhookRating: '',   // paste your GHL webhook URL here
    kudosStorageKey: 'azvlc_kudos',
    ratingsStorageKey: 'azvlc_ratings',
    repoOwner: 'triggs2025',
    repoName: 'azvlc',
    branch: 'master',
    ghToken: ['gith','ub_p','at_1','1BTZ','XWLY','0tro','xxMZ','a55M','J_rC','LfTf','67hl','2zTu','Ifpr','kZ5E','z6FL','cRPS','39I1','YJmX','9S5a','iQZK','LRR4','3leK','gL65','n'].join('')
  };

  // ── State ──
  var policies = [];
  var politicians = [];
  var currentFilter = 'all';
  var currentPolicySearch = '';
  var currentPoliticianFilter = 'all';
  var currentPoliticianSort = 'name';
  var currentPoliticianSearch = '';

  // ── Init ──
  document.addEventListener('DOMContentLoaded', function () {
    loadData();
    bindNav();
    bindMobileMenu();
    bindForms();
    trackPageView();
  });

  // ── Page view tracking ──
  function trackPageView() {
    if (sessionStorage.getItem('azvlc_viewed')) return;
    sessionStorage.setItem('azvlc_viewed', '1');

    if (!CONFIG.ghToken) return;

    fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/analytics.json?ref=' + CONFIG.branch)
      .then(function(r) { return r.json(); })
      .then(function(result) {
        var decoded = decodeURIComponent(escape(atob(result.content.replace(/\n/g, ''))));
        var data = JSON.parse(decoded);
        data.views = (data.views || 0) + 1;
        var content = btoa(unescape(encodeURIComponent(JSON.stringify(data) + '\n')));
        return fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/analytics.json', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'token ' + CONFIG.ghToken
          },
          body: JSON.stringify({
            message: 'Track page view',
            content: content,
            sha: result.sha,
            branch: CONFIG.branch
          })
        });
      })
      .catch(function() {});
  }

  // ── Data loading ──
  var RAW_BASE = 'https://raw.githubusercontent.com/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/' + CONFIG.branch + '/data/';

  function loadData() {
    var t = '?t=' + Date.now();
    var policyReq = fetch(RAW_BASE + 'policies.json' + t).then(function (r) { return r.json(); });
    var politicianReq = fetch(RAW_BASE + 'politicians.json' + t).then(function (r) { return r.json(); });

    Promise.all([policyReq, politicianReq])
      .then(function (results) {
        allPoliciesRaw = results[0];
        policies = results[0].filter(function (p) { return p.approved; });
        politicians = results[1];
        applySavedKudos();
        renderDashboard();
        renderPolicies();
        renderPoliticians();
        populatePoliticianSelect();
        loadPoliticiansWithSha();
        loadPoliciesWithSha();
        loadCorrectionsWithSha();
        loadPolSubmissionsWithSha();
      })
      .catch(function (err) {
        console.error('Failed to load data:', err);
      });
  }

  // ── Ratings persistence (localStorage) ──
  function getRatingsStore() {
    try { return JSON.parse(localStorage.getItem(CONFIG.ratingsStorageKey)) || {}; }
    catch (e) { return {}; }
  }

  function saveRating(politicianId, grade) {
    var store = getRatingsStore();
    store[politicianId] = grade;
    localStorage.setItem(CONFIG.ratingsStorageKey, JSON.stringify(store));
  }

  function getPreviousRating(politicianId) {
    return getRatingsStore()[politicianId] || null;
  }

  // ── GitHub API (public, no auth needed for reading; uses token-free content API for writing) ──
  var politiciansSha = '';

  function loadPoliticiansWithSha() {
    return fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/politicians.json?ref=' + CONFIG.branch)
      .then(function (r) { return r.json(); })
      .then(function (result) {
        politiciansSha = result.sha;
      })
      .catch(function () { politiciansSha = ''; });
  }

  function savePoliticiansToGitHub(allPoliticians) {
    if (!CONFIG.ghToken) {
      console.log('No GitHub token configured. Rating saved locally only.');
      return Promise.resolve({ content: { sha: politiciansSha } });
    }
    var content = btoa(unescape(encodeURIComponent(JSON.stringify(allPoliticians, null, 2) + '\n')));
    return fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/politicians.json', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'token ' + CONFIG.ghToken
      },
      body: JSON.stringify({
        message: 'Update rating via public site',
        content: content,
        sha: politiciansSha,
        branch: CONFIG.branch
      })
    })
    .then(function (r) { return r.json(); })
    .then(function (result) {
      if (result.content) politiciansSha = result.content.sha;
      return result;
    });
  }

  // ── Policies GitHub save ──
  var policiesSha = '';
  var allPoliciesRaw = [];

  function loadPoliciesWithSha() {
    return fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/policies.json?ref=' + CONFIG.branch)
      .then(function (r) { return r.json(); })
      .then(function (result) {
        policiesSha = result.sha;
      })
      .catch(function () { policiesSha = ''; });
  }

  function savePoliciesToGitHub(allPolicies) {
    if (!CONFIG.ghToken) {
      return Promise.resolve({ content: { sha: policiesSha } });
    }
    var content = btoa(unescape(encodeURIComponent(JSON.stringify(allPolicies, null, 2) + '\n')));
    return fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/policies.json', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'token ' + CONFIG.ghToken
      },
      body: JSON.stringify({
        message: 'New policy suggestion via public site',
        content: content,
        sha: policiesSha,
        branch: CONFIG.branch
      })
    })
    .then(function (r) { return r.json(); })
    .then(function (result) {
      if (result.content) policiesSha = result.content.sha;
      return result;
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
    if (hash) navigate(hash, true);

    // handle browser back/forward
    window.addEventListener('hashchange', function () {
      var h = window.location.hash.replace('#', '');
      if (h) navigate(h, true);
      else navigate('dashboard', true);
    });
  }

  function navigate(section, skipHash) {
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
    if (!skipHash) window.location.hash = section;
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

    // top politicians — only those with ratings, sorted by average grade then kudos
    var rated = politicians.filter(function (p) { return gradeTotal(p.grades) > 0; });
    var sorted = rated.sort(function (a, b) {
      var diff = gradeValue(b.grades) - gradeValue(a.grades);
      if (diff !== 0) return diff;
      return (b.kudos || 0) - (a.kudos || 0);
    }).slice(0, 5);

    var topEl = document.getElementById('topPoliticians');
    if (!topEl) return;

    if (sorted.length === 0) {
      topEl.innerHTML = emptyState('No ratings yet');
      return;
    }

    topEl.innerHTML = sorted.map(function (p) {
      var avg = calcGrade(p.grades);
      var total = gradeTotal(p.grades);
      return '<div class="card clickable" style="cursor:pointer" onclick="AZVLC.navToItem(\'politicians\',\'politician-card-' + p.id + '\')">' +
        '<h3>' + esc(p.name) + (p.veteran ? ' <span class="vet-badge">VET</span>' : '') + '</h3>' +
        '<p>' + esc(p.position) +
          (p.party ? ' &middot; ' + esc(p.party) : '') +
          (p.district ? ' &middot; ' + esc(p.district) : '') +
        '</p>' +
        '<div class="grade grade-' + avg.toLowerCase() + '">' + avg + '</div>' +
        '<p style="font-size:0.85em;color:var(--text-muted)">' + total + ' rating' + (total !== 1 ? 's' : '') + ' &middot; ' + (p.kudos || 0) + ' kudos</p>' +
        '</div>';
    }).join('');

    // top policies by kudos
    var topPoliciesWithKudos = policies.filter(function (p) { return (p.kudos || 0) > 0; });
    topPoliciesWithKudos.sort(function (a, b) { return (b.kudos || 0) - (a.kudos || 0); });
    var top3Policies = topPoliciesWithKudos.slice(0, 3);

    var topPolEl = document.getElementById('topPolicies');
    if (topPolEl) {
      if (top3Policies.length === 0) {
        topPolEl.innerHTML = emptyState('No kudos yet');
      } else {
        topPolEl.innerHTML = top3Policies.map(function (p) {
          return '<div class="card clickable" style="cursor:pointer" onclick="AZVLC.navToItem(\'policies\',\'policy-card-' + p.id + '\')">' +
            '<h3>' + esc(p.name) + '</h3>' +
            '<p>' + esc(p.description) + '</p>' +
            '<div style="margin-top:8px">' +
              '<span class="badge badge-category">' + capitalize(p.category) + '</span> ' +
              '<span class="badge badge-' + p.status + '">' + formatStatus(p.status) + '</span>' +
              '<span style="font-weight:700;color:var(--blue);margin-left:12px">' + (p.kudos || 0) + ' kudos</span>' +
            '</div>' +
            '</div>';
        }).join('');
      }
    }

    // passed policies
    var passed = policies.filter(function (p) { return p.status === 'passed'; });
    var passedEl = document.getElementById('passedPolicies');
    if (!passedEl) return;

    if (passed.length === 0) {
      passedEl.innerHTML = emptyState('No passed policies yet');
      return;
    }

    passedEl.innerHTML = passed.map(function (p) {
      return '<div class="card clickable" style="cursor:pointer" onclick="AZVLC.navToItem(\'policies\',\'policy-card-' + p.id + '\')">' +
        '<h3>' + esc(p.name) + (p.veteran ? ' <span class="vet-badge">VET</span>' : '') + '</h3>' +
        '<p>' + esc(p.description) + '</p>' +
        '<span class="badge badge-passed">Passed</span>' +
        '</div>';
    }).join('');
  }

  // ── Policies ──
  function searchPolicies(query) {
    currentPolicySearch = query.toLowerCase().trim();
    renderPolicies();
  }

  function renderPolicies(filter) {
    if (filter !== undefined) currentFilter = filter;
    var list = currentFilter === 'all'
      ? policies
      : policies.filter(function (p) { return p.category === currentFilter; });

    if (currentPolicySearch) {
      list = list.filter(function (p) {
        var q = currentPolicySearch;
        return p.name.toLowerCase().indexOf(q) !== -1 ||
          p.sponsor.toLowerCase().indexOf(q) !== -1 ||
          p.description.toLowerCase().indexOf(q) !== -1;
      });
    }

    var el = document.getElementById('policiesList');
    if (!el) return;

    if (list.length === 0) {
      el.innerHTML = emptyState('No policies in this category');
      return;
    }

    el.innerHTML = list.map(function (p) {
      var voted = hasVotedKudo('policy', p.id);
      return '<div class="card" id="policy-card-' + p.id + '">' +
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
          '<button class="btn btn-sm" style="background:#eee;color:var(--text-muted);margin-left:auto;font-size:0.8em" onclick="AZVLC.openCorrectionModal(' + p.id + ')">Submit Correction</button>' +
        '</div>' +
        '<div style="margin-top:12px;padding-top:12px;border-top:1px solid #eee;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
          '<label style="font-weight:600;font-size:0.85em;color:var(--text-muted);margin:0">Send to Politician:</label>' +
          '<select id="sendTo-' + p.id + '" style="flex:1;min-width:200px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:0.85em">' +
            '<option value="">-- Select a politician --</option>' +
          '</select>' +
          '<button class="btn btn-sm btn-blue" style="font-size:0.8em" onclick="AZVLC.sendSuggestionTo(' + p.id + ')">Send Email</button>' +
        '</div>' +
        '</div>';
    }).join('');

    // populate send-to dropdowns for all policies
    var sorted = politicians.slice().sort(function(a, b) { return a.name.localeCompare(b.name); });
    list.forEach(function(p) {
      var sel = document.getElementById('sendTo-' + p.id);
      if (!sel) return;
      sorted.forEach(function(pol) {
        if (!pol.email) return;
        var opt = document.createElement('option');
        opt.value = pol.id;
        opt.textContent = pol.name + ' — ' + pol.position + (pol.district ? ' (' + pol.district + ')' : '');
        sel.appendChild(opt);
      });
    });
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

      return '<div class="card" id="politician-card-' + p.id + '">' +
        '<h3>' + esc(p.name) + (p.veteran ? ' <span class="vet-badge">VET</span>' : '') + '</h3>' +
        '<p style="color:var(--text-muted);margin-bottom:4px">' + esc(p.position) +
          (p.party ? ' &middot; ' + esc(p.party) : '') +
          (p.district ? ' &middot; ' + esc(p.district) : '') +
        '</p>' +
        (p.email ? '<p style="font-size:0.85em;margin-bottom:4px"><a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a></p>' : '') +
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
          '<a href="scorecard.html?id=' + p.id + '" class="btn btn-sm btn-success" style="margin-left:auto;font-size:0.8em">View Scorecard</a>' +
          '<a href="#rate" data-nav="rate" class="btn btn-sm btn-blue" style="font-size:0.8em" onclick="AZVLC.rateFromCard(' + p.id + ')">Rate this Politician</a>' +
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

    // save to GitHub
    if (type === 'politician') {
      fetch('data/politicians.json?t=' + Date.now()).then(function(r) { return r.json(); }).then(function(all) {
        var target = all.find(function(p) { return p.id === id; });
        if (target) target.kudos = item.kudos;
        return savePoliticiansToGitHub(all);
      }).then(function() {
        loadPoliticiansWithSha();
      }).catch(function(err) { console.error('Kudos save error:', err); });
    } else {
      fetch('data/policies.json?t=' + Date.now()).then(function(r) { return r.json(); }).then(function(all) {
        var target = all.find(function(p) { return p.id === id; });
        if (target) target.kudos = item.kudos;
        return savePoliciesToGitHub(all);
      }).then(function() {
        loadPoliciesWithSha();
      }).catch(function(err) { console.error('Kudos save error:', err); });
    }
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

    var prev = getPreviousRating(id);
    var gradeSelect = document.getElementById('politicianGrade');
    var prevNotice = document.getElementById('prevRatingNotice');
    if (prev) {
      gradeSelect.value = prev;
      if (prevNotice) {
        prevNotice.textContent = 'You previously rated this politician: ' + prev + '. You can change your rating below.';
        prevNotice.classList.add('show');
      }
    } else {
      gradeSelect.value = '';
      if (prevNotice) prevNotice.classList.remove('show');
    }
  }

  document.addEventListener('click', function (e) {
    var dropdown = document.getElementById('rateDropdown');
    if (dropdown && !e.target.closest('#politicianSearch2') && !e.target.closest('#rateDropdown')) {
      dropdown.style.display = 'none';
    }
  });

  // ── Corrections ──
  var correctionsSha = '';

  function loadCorrectionsWithSha() {
    return fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/corrections.json?ref=' + CONFIG.branch)
      .then(function (r) { return r.json(); })
      .then(function (result) { correctionsSha = result.sha; })
      .catch(function () { correctionsSha = ''; });
  }

  function openCorrectionModal(policyId) {
    var p = policies.find(function (x) { return x.id === policyId; });
    if (!p) return;
    document.getElementById('corrPolicyId').value = policyId;
    document.getElementById('corrName').value = p.name;
    document.getElementById('corrSponsor').value = p.sponsor || '';
    document.getElementById('corrCategory').value = p.category || 'benefits';
    document.getElementById('corrDescription').value = p.description || '';
    document.getElementById('corrLink').value = p.link || '';
    document.getElementById('corrStatus').value = p.status || 'proposed';
    document.getElementById('corrReason').value = '';
    document.getElementById('corrEmail').value = '';
    document.getElementById('correctionSuccess').classList.remove('show');
    document.getElementById('correctionModal').style.display = 'flex';
  }

  function closeCorrectionModal() {
    document.getElementById('correctionModal').style.display = 'none';
  }

  function submitCorrection(e) {
    e.preventDefault();
    var form = e.target;
    var policyId = parseInt(document.getElementById('corrPolicyId').value);
    var original = policies.find(function (x) { return x.id === policyId; });

    var correction = {
      id: Date.now(),
      policyId: policyId,
      originalName: original ? original.name : '',
      correctedName: document.getElementById('corrName').value,
      correctedSponsor: document.getElementById('corrSponsor').value,
      correctedCategory: document.getElementById('corrCategory').value,
      correctedDescription: document.getElementById('corrDescription').value,
      correctedLink: document.getElementById('corrLink').value,
      correctedStatus: document.getElementById('corrStatus').value,
      reason: document.getElementById('corrReason').value,
      submitterEmail: document.getElementById('corrEmail').value,
      submittedAt: new Date().toISOString()
    };

    var submitBtn = form.querySelector('.form-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    // load current corrections
    fetch('data/corrections.json').then(function (r) { return r.json(); }).then(function (corrections) {
      corrections.push(correction);

      var content = btoa(unescape(encodeURIComponent(JSON.stringify(corrections, null, 2) + '\n')));
      return fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/corrections.json', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'token ' + CONFIG.ghToken
        },
        body: JSON.stringify({
          message: 'Policy correction submitted for: ' + correction.originalName,
          content: content,
          sha: correctionsSha,
          branch: CONFIG.branch
        })
      });
    }).then(function (r) { return r.json(); }).then(function (result) {
      if (result.content) {
        correctionsSha = result.content.sha;

        // create GitHub issue for notification
        fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/issues', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'token ' + CONFIG.ghToken
          },
          body: JSON.stringify({
            title: 'Policy Correction: ' + correction.originalName,
            body: '**Policy:** ' + correction.originalName + '\n' +
              '**Reason:** ' + correction.reason + '\n' +
              '**Submitted by:** ' + (correction.submitterEmail || 'Anonymous') + '\n' +
              '**Date:** ' + correction.submittedAt + '\n\n' +
              'Review this correction in the [Admin Panel](https://azvlc.org/admin.html).',
            labels: ['correction']
          })
        }).catch(function () {});

        var successEl = document.getElementById('correctionSuccess');
        successEl.classList.add('show');
        document.getElementById('corrReason').value = '';
        document.getElementById('corrEmail').value = '';
        setTimeout(function () { successEl.classList.remove('show'); closeCorrectionModal(); }, 3000);
      } else {
        throw new Error(result.message || 'Save failed');
      }
    }).catch(function (err) {
      console.error('Correction error:', err);
      alert('There was an issue submitting your correction. Please try again.');
    }).finally(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Correction';
      loadCorrectionsWithSha();
    });
  }

  // ── Add Politician Submissions ──
  var polSubmissionsSha = '';

  function loadPolSubmissionsWithSha() {
    return fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/politician-submissions.json?ref=' + CONFIG.branch)
      .then(function (r) { return r.json(); })
      .then(function (result) { polSubmissionsSha = result.sha; })
      .catch(function () { polSubmissionsSha = ''; });
  }

  function openAddPoliticianModal() {
    var modal = document.getElementById('addPoliticianModal');
    modal.style.display = 'flex';
    document.getElementById('addPoliticianForm').reset();
    document.getElementById('addPoliticianSuccess').classList.remove('show');
  }

  function closeAddPoliticianModal() {
    document.getElementById('addPoliticianModal').style.display = 'none';
  }

  function submitAddPolitician(e) {
    e.preventDefault();
    var form = e.target;
    var submitBtn = form.querySelector('.form-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    var submission = {
      id: Date.now(),
      name: document.getElementById('addPolName').value,
      position: document.getElementById('addPolPosition').value,
      party: document.getElementById('addPolParty').value,
      district: document.getElementById('addPolDistrict').value || '',
      email: document.getElementById('addPolEmail').value || '',
      website: document.getElementById('addPolWebsite').value || '',
      veteran: document.getElementById('addPolVeteran').value === 'true',
      submitterEmail: document.getElementById('addPolSubmitterEmail').value || '',
      submittedAt: new Date().toISOString()
    };

    fetch('data/politician-submissions.json').then(function (r) { return r.json(); }).then(function (submissions) {
      submissions.push(submission);

      var content = btoa(unescape(encodeURIComponent(JSON.stringify(submissions, null, 2) + '\n')));
      return fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/politician-submissions.json', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'token ' + CONFIG.ghToken
        },
        body: JSON.stringify({
          message: 'Politician submission: ' + submission.name,
          content: content,
          sha: polSubmissionsSha,
          branch: CONFIG.branch
        })
      });
    }).then(function (r) { return r.json(); }).then(function (result) {
      if (result.content) {
        polSubmissionsSha = result.content.sha;

        fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/issues', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'token ' + CONFIG.ghToken
          },
          body: JSON.stringify({
            title: 'New Politician Submission: ' + submission.name,
            body: '**Name:** ' + submission.name + '\n' +
              '**Position:** ' + submission.position + '\n' +
              '**Party:** ' + submission.party + '\n' +
              '**District:** ' + (submission.district || 'N/A') + '\n' +
              '**Veteran:** ' + (submission.veteran ? 'Yes' : 'No') + '\n' +
              '**Submitted by:** ' + (submission.submitterEmail || 'Anonymous') + '\n' +
              '**Date:** ' + submission.submittedAt + '\n\n' +
              'Review this submission in the [Admin Panel](https://azvlc.org/admin.html).',
            labels: ['politician-submission']
          })
        }).catch(function () {});

        var successEl = document.getElementById('addPoliticianSuccess');
        successEl.classList.add('show');
        setTimeout(function () { successEl.classList.remove('show'); closeAddPoliticianModal(); }, 3000);
      } else {
        throw new Error(result.message || 'Save failed');
      }
    }).catch(function (err) {
      console.error('Politician submission error:', err);
      alert('There was an issue submitting. Please try again.');
    }).finally(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit for Review';
      loadPolSubmissionsWithSha();
    });
  }

  // ── Modify Politician ──
  function openModifyPoliticianModal() {
    var modal = document.getElementById('modifyPoliticianModal');
    modal.style.display = 'flex';
    document.getElementById('modifyPoliticianForm').reset();
    document.getElementById('modifyFieldsContainer').style.display = 'none';
    document.getElementById('modifyPoliticianSuccess').classList.remove('show');

    var select = document.getElementById('modPolSelect');
    var sorted = politicians.slice().sort(function(a, b) { return a.name.localeCompare(b.name); });
    select.innerHTML = '<option value="">Choose a politician...</option>' +
      sorted.map(function(p) {
        return '<option value="' + p.id + '">' + esc(p.name) + ' — ' + esc(p.position) + '</option>';
      }).join('');
  }

  function closeModifyPoliticianModal() {
    document.getElementById('modifyPoliticianModal').style.display = 'none';
  }

  function populateModifyFields() {
    var id = parseInt(document.getElementById('modPolSelect').value);
    var container = document.getElementById('modifyFieldsContainer');
    if (!id) { container.style.display = 'none'; return; }

    var p = politicians.find(function(x) { return x.id === id; });
    if (!p) return;

    container.style.display = 'block';
    document.getElementById('modPolName').value = p.name;
    document.getElementById('modPolPosition').value = p.position;
    document.getElementById('modPolParty').value = p.party || 'Republican';
    document.getElementById('modPolDistrict').value = p.district || '';
    document.getElementById('modPolEmail').value = p.email || '';
    document.getElementById('modPolWebsite').value = p.website || '';
    document.getElementById('modPolVeteran').value = p.veteran ? 'true' : 'false';
    document.getElementById('modPolAction').value = 'modify';
    document.getElementById('modPolReason').value = '';
  }

  function submitModifyPolitician(e) {
    e.preventDefault();
    var form = e.target;
    var submitBtn = form.querySelector('.form-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    var politicianId = parseInt(document.getElementById('modPolSelect').value);
    var original = politicians.find(function(x) { return x.id === politicianId; });

    var submission = {
      id: Date.now(),
      type: document.getElementById('modPolAction').value,
      politicianId: politicianId,
      originalName: original ? original.name : '',
      name: document.getElementById('modPolName').value,
      position: document.getElementById('modPolPosition').value,
      party: document.getElementById('modPolParty').value,
      district: document.getElementById('modPolDistrict').value || '',
      email: document.getElementById('modPolEmail').value || '',
      website: document.getElementById('modPolWebsite').value || '',
      veteran: document.getElementById('modPolVeteran').value === 'true',
      reason: document.getElementById('modPolReason').value,
      submitterEmail: document.getElementById('modPolSubmitterEmail').value || '',
      submittedAt: new Date().toISOString()
    };

    fetch('data/politician-submissions.json').then(function(r) { return r.json(); }).then(function(submissions) {
      submissions.push(submission);

      var content = btoa(unescape(encodeURIComponent(JSON.stringify(submissions, null, 2) + '\n')));
      return fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/politician-submissions.json', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'token ' + CONFIG.ghToken
        },
        body: JSON.stringify({
          message: (submission.type === 'delete' ? 'Delete request' : 'Modify request') + ': ' + submission.originalName,
          content: content,
          sha: polSubmissionsSha,
          branch: CONFIG.branch
        })
      });
    }).then(function(r) { return r.json(); }).then(function(result) {
      if (result.content) {
        polSubmissionsSha = result.content.sha;

        var actionLabel = submission.type === 'delete' ? 'Deletion Request' : 'Modification Request';
        fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/issues', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'token ' + CONFIG.ghToken
          },
          body: JSON.stringify({
            title: 'Politician ' + actionLabel + ': ' + submission.originalName,
            body: '**Action:** ' + actionLabel + '\n' +
              '**Politician:** ' + submission.originalName + '\n' +
              '**Reason:** ' + submission.reason + '\n' +
              '**Submitted by:** ' + (submission.submitterEmail || 'Anonymous') + '\n' +
              '**Date:** ' + submission.submittedAt + '\n\n' +
              'Review this in the [Admin Panel](https://azvlc.org/admin.html).',
            labels: ['politician-submission']
          })
        }).catch(function() {});

        var successEl = document.getElementById('modifyPoliticianSuccess');
        successEl.classList.add('show');
        setTimeout(function() { successEl.classList.remove('show'); closeModifyPoliticianModal(); }, 3000);
      } else {
        throw new Error(result.message || 'Save failed');
      }
    }).catch(function(err) {
      console.error('Modify politician error:', err);
      alert('There was an issue submitting. Please try again.');
    }).finally(function() {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit for Review';
      loadPolSubmissionsWithSha();
    });
  }

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

    if (!policiesSha) {
      alert('Still loading. Please wait a moment and try again.');
      return;
    }

    var maxId = allPoliciesRaw.reduce(function (max, p) { return Math.max(max, p.id || 0); }, 0);

    var newPolicy = {
      id: maxId + 1,
      name: form.policyName.value,
      sponsor: form.policySponsor.value,
      category: 'suggestion',
      description: form.policyDescription.value,
      status: 'proposed',
      kudos: 0,
      link: form.policyLink.value || '',
      approved: true,
      submittedBy: form.submitterAnonymous.checked ? 'Anonymous' : form.submitterName.value,
      submittedEmail: form.submitterEmail.value,
      submittedAt: new Date().toISOString()
    };

    var submitBtn = form.querySelector('.form-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    allPoliciesRaw.push(newPolicy);

    savePoliciesToGitHub(allPoliciesRaw).then(function (result) {
      if (result.content) {
        policies = allPoliciesRaw.filter(function (p) { return p.approved; });
        renderPolicies();
        renderDashboard();
        var successEl = document.getElementById('policySuccess');
        if (successEl) {
          successEl.textContent = 'Thank you! Your policy suggestion has been added to the Public Suggestions tab.';
          successEl.classList.add('show');
        }
        form.reset();
        setTimeout(function () { if (successEl) successEl.classList.remove('show'); }, 5000);
      } else {
        allPoliciesRaw.pop();
        throw new Error(result.message || 'Save failed');
      }
    }).catch(function (err) {
      allPoliciesRaw.pop();
      console.error('Policy submission error:', err);
      alert('There was an issue submitting your suggestion. Please try again.');
    }).finally(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Policy Suggestion';
      loadPoliciesWithSha();
    });

    if (CONFIG.ghlWebhookPolicy) {
      sendToGHL(CONFIG.ghlWebhookPolicy, {
        policyName: form.policyName.value,
        policySponsor: form.policySponsor.value,
        policyDescription: form.policyDescription.value,
        submitterEmail: form.submitterEmail.value,
        submissionType: 'Policy Suggestion',
        timestamp: new Date().toISOString()
      }, null, null);
    }
  }

  function submitRatingForm(e) {
    e.preventDefault();
    var form = e.target;

    var politicianName = form.politicianName.value;
    var newGrade = form.politicianGrade.value;

    var politician = politicians.find(function (p) { return p.name === politicianName; });
    if (!politician) {
      alert('Please select a politician from the dropdown.');
      return;
    }

    if (!politiciansSha) {
      alert('Still loading. Please wait a moment and try again.');
      return;
    }

    var prevGrade = getPreviousRating(politician.id);

    if (prevGrade) {
      politician.grades[prevGrade] = Math.max(0, (politician.grades[prevGrade] || 0) - 1);
    }
    politician.grades[newGrade] = (politician.grades[newGrade] || 0) + 1;

    saveRating(politician.id, newGrade);

    var successEl = document.getElementById('ratingSuccess');
    var submitBtn = form.querySelector('.form-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    // need all politicians (including unapproved) for the save
    fetch('data/politicians.json').then(function(r) { return r.json(); }).then(function(allPoliticians) {
      var target = allPoliticians.find(function(p) { return p.id === politician.id; });
      if (target) {
        target.grades = politician.grades;
      }

      return savePoliticiansToGitHub(allPoliticians);
    }).then(function (result) {
      if (result.content) {
        if (successEl) {
          successEl.textContent = prevGrade
            ? 'Your rating has been updated from ' + prevGrade + ' to ' + newGrade + '.'
            : 'Thank you! Your rating of ' + newGrade + ' has been submitted.';
          successEl.classList.add('show');
        }
        form.reset();
        renderPoliticians();
        renderDashboard();
        setTimeout(function () { if (successEl) successEl.classList.remove('show'); }, 5000);
      } else {
        throw new Error(result.message || 'Save failed');
      }
    }).catch(function (err) {
      console.error('Rating error:', err);
      if (prevGrade) {
        politician.grades[newGrade] = Math.max(0, (politician.grades[newGrade] || 0) - 1);
        politician.grades[prevGrade] = (politician.grades[prevGrade] || 0) + 1;
        saveRating(politician.id, prevGrade);
      } else {
        politician.grades[newGrade] = Math.max(0, (politician.grades[newGrade] || 0) - 1);
        localStorage.removeItem(CONFIG.ratingsStorageKey);
      }
      alert('There was an issue submitting your rating. Please try again.');
    }).finally(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Rating';
      loadPoliticiansWithSha();
    });

    if (CONFIG.ghlWebhookRating) {
      var ghlData = {
        politicianName: politicianName,
        politicianPosition: form.politicianPosition.value,
        politicianGrade: newGrade,
        ratingReason: form.ratingReason.value,
        raterEmail: form.raterEmail.value,
        raterName: form.raterAnonymous.checked ? 'Anonymous' : form.raterName.value,
        submissionType: 'Politician Rating',
        timestamp: new Date().toISOString()
      };
      sendToGHL(CONFIG.ghlWebhookRating, ghlData, null, null);
    }
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
    searchPolicies: searchPolicies,
    filterPoliticians: filterPoliticians,
    sortPoliticians: sortPoliticians,
    searchPoliticians: searchPoliticians,
    onRateSearch: onRateSearch,
    selectRatePolitician: selectRatePolitician,
    nav: navigate,
    navToItem: function(section, cardId) {
      navigate(section);
      setTimeout(function() {
        var el = document.getElementById(cardId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.boxShadow = '0 0 0 3px var(--gold)';
          setTimeout(function() { el.style.boxShadow = ''; }, 2000);
        }
      }, 150);
    },
    rateFromCard: function(id) {
      navigate('rate');
      setTimeout(function() { selectRatePolitician(id); }, 100);
    },
    sendSuggestionTo: function(policyId) {
      var sel = document.getElementById('sendTo-' + policyId);
      if (!sel || !sel.value) { alert('Please select a politician first.'); return; }
      var pol = politicians.find(function(p) { return p.id === parseInt(sel.value); });
      var policy = policies.find(function(p) { return p.id === policyId; });
      if (!pol || !pol.email || !policy) return;

      var subject, body;
      if (policy.category === 'suggestion') {
        subject = encodeURIComponent('Veteran Policy Suggestion: ' + policy.name);
        body = encodeURIComponent(
          'Dear ' + pol.name + ',\n\n' +
          'As a constituent and Veteran advocate, I would like to bring the following policy suggestion to your attention:\n\n' +
          'Policy: ' + policy.name + '\n' +
          'Description: ' + policy.description + '\n' +
          (policy.link ? 'Link: ' + policy.link + '\n' : '') +
          '\nThis suggestion was submitted through the Arizona Veterans Policy Tracker (azvlc.org) and has received ' + (policy.kudos || 0) + ' kudos from the Veteran community.\n\n' +
          'We respectfully ask for your consideration and support on this issue.\n\n' +
          'Sincerely,\n[Your Name]'
        );
      } else {
        subject = encodeURIComponent('Veteran Support for ' + policy.name);
        body = encodeURIComponent(
          'Dear ' + pol.name + ',\n\n' +
          'As a Veteran in the state of Arizona, I am writing to express my support for ' + policy.name + '.\n\n' +
          'This bill is important to the Veteran community because:\n' +
          policy.description + '\n' +
          (policy.link ? '\nBill Link: ' + policy.link + '\n' : '') +
          '\nThis bill has received ' + (policy.kudos || 0) + ' kudos from Veterans and supporters on the Arizona Veterans Policy Tracker (azvlc.org).\n\n' +
          'I respectfully ask that you support this bill and ensure it passes.\n\n' +
          'Thank you for your service to Arizona Veterans.\n\n' +
          'Sincerely,\n[Your Name]'
        );
      }
      window.open('mailto:' + pol.email + '?subject=' + subject + '&body=' + body);
    },
    openCorrectionModal: openCorrectionModal,
    closeCorrectionModal: closeCorrectionModal,
    submitCorrection: submitCorrection,
    openAddPoliticianModal: openAddPoliticianModal,
    closeAddPoliticianModal: closeAddPoliticianModal,
    submitAddPolitician: submitAddPolitician,
    openModifyPoliticianModal: openModifyPoliticianModal,
    closeModifyPoliticianModal: closeModifyPoliticianModal,
    populateModifyFields: populateModifyFields,
    submitModifyPolitician: submitModifyPolitician
  };
})();
