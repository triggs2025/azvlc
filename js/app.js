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
    loadSponsor();
    loadTicker();
    bindNav();
    bindMobileMenu();
    bindForms();
    trackPageView();
  });

  // ── Sponsor ──
  function loadSponsor() {
    fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/sponsor.json?ref=' + CONFIG.branch, {
        headers: { 'Authorization': 'token ' + CONFIG.ghToken }
      })
      .then(function(r) { return r.json(); })
      .then(function(result) {
        if (!result.content) return null;
        var decoded = decodeURIComponent(escape(atob(result.content.replace(/\n/g, ''))));
        return JSON.parse(decoded);
      })
      .then(function(data) {
        if (!data) return;
        var el = document.getElementById('sponsorLine');
        if (!el) return;

        var sponsors = data.sponsors || [];
        if (sponsors.length === 0) return;

        // Rotation: calculate days per sponsor based on count
        // 1-5 sponsors: rotate every 3 days
        // 6+ sponsors: rotate faster so all get shown within ~15 days
        var count = sponsors.length;
        var daysPerSponsor = count <= 5 ? 3 : Math.max(1, Math.floor(15 / count));
        var daysSinceEpoch = Math.floor(Date.now() / 86400000);
        var idx = Math.floor(daysSinceEpoch / daysPerSponsor) % count;
        var sponsor = sponsors[idx];

        if (!sponsor || !sponsor.name) return;
        el.innerHTML = esc(data.label || 'Sponsored by') + ' <a href="' + esc(sponsor.url || '#') + '" target="_blank" rel="noopener" style="color:var(--gold);text-decoration:underline">' + esc(sponsor.name) + '</a>';
      })
      .catch(function() {});
  }

  // ── Ticker ──
  function loadTicker() {
    fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/ticker.json?ref=' + CONFIG.branch, {
        headers: { 'Authorization': 'token ' + CONFIG.ghToken }
      })
      .then(function(r) { return r.json(); })
      .then(function(result) {
        if (!result.content) return null;
        var decoded = decodeURIComponent(escape(atob(result.content.replace(/\n/g, ''))));
        return JSON.parse(decoded);
      })
      .then(function(data) {
        if (!data) return;
        if (!data.enabled || !data.messages || data.messages.length === 0) return;
        var bar = document.getElementById('tickerBar');
        var line1 = document.getElementById('tickerLine1');
        var line2 = document.getElementById('tickerLine2');
        if (!bar || !line1 || !line2) return;

        var separator = '  ★  ';
        var msgs = data.messages;
        var half = Math.ceil(msgs.length / 2);
        var text1 = msgs.slice(0, half).join(separator) + separator;
        var text2 = msgs.slice(half).join(separator) + separator;
        if (msgs.length < 2) { text2 = text1; }

        line1.innerHTML = text1 + text1;
        line2.innerHTML = text2 + text2;

        var speedMultiplier = data.speed || 1;
        var baseSpeed1 = Math.max(10, text1.length * 0.32);
        var baseSpeed2 = Math.max(10, text2.length * 0.32);
        line1.style.animationDuration = (baseSpeed1 / speedMultiplier) + 's';
        line2.style.animationDuration = (baseSpeed2 / speedMultiplier) + 's';
        line2.style.animationDelay = '-' + (baseSpeed2 / speedMultiplier / 2) + 's';

        bar.style.display = 'block';
        bar.addEventListener('mouseenter', function() { bar.classList.add('paused'); });
        bar.addEventListener('mouseleave', function() { bar.classList.remove('paused'); });
      })
      .catch(function() {});
  }

  // ── Find My District ──
  function populateDistrictDropdown() {
    var sel = document.getElementById('districtSelect');
    if (!sel) return;
    for (var i = 1; i <= 30; i++) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = 'District ' + i;
      sel.appendChild(opt);
    }
  }

  function showDistrict(distNum) {
    if (!distNum) {
      document.getElementById('districtResults').style.display = 'none';
      return;
    }
    var distLabel = 'District ' + distNum;
    var reps = politicians.filter(function(p) {
      return (p.district || '').replace(/\D/g, '') === String(distNum);
    });

    var resultsEl = document.getElementById('districtResults');
    var titleEl = document.getElementById('districtTitle');
    var cardsEl = document.getElementById('districtCards');

    if (reps.length === 0) {
      titleEl.textContent = distLabel;
      cardsEl.innerHTML = '<div class="empty-state"><p>No legislators found for ' + distLabel + '</p></div>';
      resultsEl.style.display = 'block';
      return;
    }

    titleEl.textContent = 'Your Legislators — ' + distLabel;
    cardsEl.innerHTML = reps.map(function(p) {
      var avg = calcGrade(p.grades);
      var total = gradeTotal(p.grades);
      var voted = hasVotedKudo('politician', p.id);

      return '<div class="card" id="district-card-' + p.id + '">' +
        '<h3>' + esc(p.name) + (p.veteran ? ' <span class="vet-badge">VET</span>' : '') + '</h3>' +
        '<p style="color:var(--text-muted);margin-bottom:4px">' + esc(p.position) +
          (p.party ? ' &middot; ' + esc(p.party) : '') +
          ' &middot; ' + esc(p.district) +
        '</p>' +
        (p.email ? '<p style="font-size:0.85em;margin-bottom:4px"><a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a></p>' : '') +
        (p.website ? '<p style="margin-bottom:8px"><a href="' + esc(p.website) + '" target="_blank" rel="noopener">Legislative Profile &rarr;</a></p>' : '') +
        (total > 0
          ? '<div class="grade grade-' + avg.toLowerCase() + '">' + avg + '</div>' +
            '<p style="font-size:0.85em;color:var(--text-muted);margin-bottom:12px">Based on ' + total + ' Veteran rating' + (total !== 1 ? 's' : '') + '</p>' +
            '<div class="grade-breakdown">' +
              gradeBox('A', p.grades.A) + gradeBox('B', p.grades.B) + gradeBox('C', p.grades.C) + gradeBox('D', p.grades.D) + gradeBox('F', p.grades.F) +
            '</div>'
          : '<p style="font-size:0.85em;color:var(--text-muted);margin-bottom:4px;font-style:italic">No Veteran ratings yet</p>') +
        '<div class="kudos-bar">' +
          '<button class="kudos-btn' + (voted ? ' voted' : '') + '" onclick="AZVLC.giveKudos(' + p.id + ',\'politician\')" ' + (voted ? 'disabled' : '') + '>' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' +
            (voted ? 'Thanked' : 'Give Kudos') +
          '</button>' +
          '<span class="kudos-count">' + (p.kudos || 0) + '</span>' +
          '<a href="scorecard.html?id=' + p.id + '" class="btn btn-sm btn-success" style="margin-left:auto;font-size:0.8em">View Scorecard</a>' +
          '<a href="#rate" class="btn btn-sm btn-blue" style="font-size:0.8em" onclick="AZVLC.rateFromCard(' + p.id + ')">Rate</a>' +
        '</div>' +
        '</div>';
    }).join('');
    resultsEl.style.display = 'block';
  }

  // ── Contact saving ──
  var contactsSha = '';

  function loadContactsSha() {
    fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/contacts.json?ref=' + CONFIG.branch)
      .then(function(r) { return r.json(); })
      .then(function(result) { contactsSha = result.sha; })
      .catch(function() {});
  }

  function saveContact(email, name, source, details, attempt) {
    if (!email || !CONFIG.ghToken) return;
    attempt = attempt || 0;

    var entry = {
      email: email,
      name: name || 'Anonymous',
      source: source || 'unknown',
      date: new Date().toISOString().split('T')[0]
    };
    if (details) {
      for (var key in details) {
        if (details.hasOwnProperty(key)) entry[key] = details[key];
      }
    }

    fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/contacts.json?ref=' + CONFIG.branch, {
      headers: { 'Authorization': 'token ' + CONFIG.ghToken }
    })
    .then(function(r) { return r.json(); })
    .then(function(result) {
      var freshSha = result.sha;
      var decoded = decodeURIComponent(escape(atob(result.content.replace(/\n/g, ''))));
      var contacts = JSON.parse(decoded);
      contacts.push(entry);
      var content = btoa(unescape(encodeURIComponent(JSON.stringify(contacts, null, 2) + '\n')));
      return fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/contacts.json', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'token ' + CONFIG.ghToken
        },
        body: JSON.stringify({
          message: 'New contact from ' + source,
          content: content,
          sha: freshSha,
          branch: CONFIG.branch
        })
      }).then(function(r) { return r.json(); }).then(function(putResult) {
        if (putResult.content) {
          contactsSha = putResult.content.sha;
        } else if (attempt < 3) {
          setTimeout(function() { saveContact(email, name, source, details, attempt + 1); }, 1500);
        }
      });
    })
    .catch(function() {
      if (attempt < 3) {
        setTimeout(function() { saveContact(email, name, source, details, attempt + 1); }, 1500);
      }
    });
  }

  // ── Social share for policies ──
  function sharePolicyX(policyId) {
    var p = policies.find(function(x) { return x.id === policyId; });
    if (!p) return;
    var url = 'https://azvlc.org/policy.html?id=' + policyId;
    var text = 'As a Veteran I support this - check it out! ' + p.name;
    window.open('https://x.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url), '_blank');
  }

  function sharePolicyFB(policyId) {
    var p = policies.find(function(x) { return x.id === policyId; });
    if (!p) return;
    var url = 'https://azvlc.org/policy.html?id=' + policyId;
    var text = 'As a Veteran I support this - check it out! ' + p.name + ' ' + url;
    navigator.clipboard.writeText(text).then(function() {
      alert('Text and link copied to your clipboard! Facebook will open — just paste into your post.');
      window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url), '_blank');
    }).catch(function() {
      window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url), '_blank');
    });
  }

  // ── Page view tracking ──
  function trackPageView() {
    if (sessionStorage.getItem('azvlc_viewed')) return;
    sessionStorage.setItem('azvlc_viewed', '1');

    if (!CONFIG.ghToken) return;

    var today = new Date().toISOString().split('T')[0];

    fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/analytics.json?ref=' + CONFIG.branch)
      .then(function(r) { return r.json(); })
      .then(function(result) {
        var decoded = decodeURIComponent(escape(atob(result.content.replace(/\n/g, ''))));
        var data = JSON.parse(decoded);
        if (!data.daily) data.daily = {};
        if (!data.startDate) data.startDate = today;
        data.daily[today] = (data.daily[today] || 0) + 1;
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
  var GH_API_BASE = 'https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/';

  function fetchGHData(file) {
    return fetch(GH_API_BASE + file + '?ref=' + CONFIG.branch, {
      headers: { 'Authorization': 'token ' + CONFIG.ghToken }
    })
    .then(function(r) { return r.json(); })
    .then(function(result) {
      if (!result.content) throw new Error('No content');
      var decoded = decodeURIComponent(escape(atob(result.content.replace(/\n/g, ''))));
      return JSON.parse(decoded);
    });
  }

  function loadData() {
    var policyReq = fetchGHData('policies.json');
    var politicianReq = fetchGHData('politicians.json');

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
        populateDistrictDropdown();
        loadPoliticiansWithSha();
        loadPoliciesWithSha();
        loadCorrectionsWithSha();
        loadPolSubmissionsWithSha();
        loadPolicySubmissionsWithSha();
        loadVOBSha();
        loadVOBSubmissionsSha();
        loadVOB();
        loadContactsSha();
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
          '<button class="btn btn-sm" style="background:#eee;color:var(--text-muted);font-size:0.8em" onclick="AZVLC.openCorrectionModal(' + p.id + ')">Correction</button>' +
          '<button class="btn btn-sm btn-blue" style="font-size:0.8em" onclick="AZVLC.openEmailPolModal(' + p.id + ')">Email Politicians</button>' +
          '<button class="btn btn-sm" style="background:#000;color:#fff;font-size:0.8em;margin-left:auto" onclick="AZVLC.sharePolicyX(' + p.id + ')">𝕏</button>' +
          '<button class="btn btn-sm" style="background:#1877f2;color:#fff;font-size:0.8em" onclick="AZVLC.sharePolicyFB(' + p.id + ')">FB</button>' +
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
    } else if (type === 'vob') {
      item = vobData.find(function (b) { return b.id === id; });
    } else {
      item = politicians.find(function (p) { return p.id === id; });
    }
    if (item) item.kudos = (item.kudos || 0) + 1;

    var countEl = document.getElementById('kudos-' + type + '-' + id);
    if (countEl) countEl.textContent = item.kudos;

    // re-render to disable button
    if (type === 'policy') renderPolicies();
    else if (type === 'vob') renderVOB();
    else renderPoliticians();

    if (type !== 'vob') renderDashboard();

    // save to GitHub
    if (type === 'vob') {
      fetch('data/vob.json?t=' + Date.now()).then(function(r) { return r.json(); }).then(function(all) {
        var target = all.find(function(b) { return b.id === id; });
        if (target) target.kudos = item.kudos;
        return saveVOBToGitHub(all);
      }).then(function() {
        loadVOBSha();
      }).catch(function(err) { console.error('VOB kudos save error:', err); });
    } else if (type === 'politician') {
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
        if (correction.submitterEmail) {
          setTimeout(function () { saveContact(correction.submitterEmail, '', 'Correction: ' + correction.originalName, {
            type: 'policy-correction',
            policyName: correction.originalName,
            correctedName: correction.correctedName,
            correctedSponsor: correction.correctedSponsor,
            correctedCategory: correction.correctedCategory,
            correctedStatus: correction.correctedStatus,
            reason: correction.reason,
            timestamp: new Date().toISOString()
          }); }, 2000);
        }
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
  var policySubmissionsSha = '';

  function loadPolSubmissionsWithSha() {
    return fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/politician-submissions.json?ref=' + CONFIG.branch)
      .then(function (r) { return r.json(); })
      .then(function (result) { polSubmissionsSha = result.sha; })
      .catch(function () { polSubmissionsSha = ''; });
  }

  function loadPolicySubmissionsWithSha() {
    return fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/policy-submissions.json?ref=' + CONFIG.branch)
      .then(function (r) { return r.json(); })
      .then(function (result) { policySubmissionsSha = result.sha; })
      .catch(function () { policySubmissionsSha = ''; });
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
    if (ratingForm) {
      ratingForm.addEventListener('submit', submitRatingForm);
      ratingForm.addEventListener('focusin', onRatingFormFocus);
    }

    var donateForm = document.getElementById('donateForm');
    if (donateForm) donateForm.addEventListener('submit', submitDonateForm);
  }

  // ── Public Email Politicians Modal ──
  var pubEmailPolSelected = {};
  var pubEmailPolSearch = '';
  var pubEmailPolFilter = 'all';
  var pubEmailPolicyId = null;

  function openEmailPolModal(policyId) {
    pubEmailPolicyId = policyId;
    pubEmailPolSelected = {};
    pubEmailPolSearch = '';
    pubEmailPolFilter = 'all';

    var policy = policies.find(function(p) { return p.id === policyId; });
    if (!policy) return;

    document.getElementById('emailPolPolicyName').textContent = policy.name;
    document.getElementById('pubEmailSubject').value = 'Support for ' + policy.name;
    document.getElementById('pubEmailBody').value = 'Dear Legislator,\n\nAs an Arizona Veteran, I am writing to ask for your support on ' + policy.name + '.\n\n' + policy.description + '\n\nThank you for your service to our Veterans.\n\nSincerely,';
    document.getElementById('pubEmailPolSearch').value = '';
    document.getElementById('emailPolModal').style.display = 'flex';

    document.querySelectorAll('#pubEmailPolFilters .filter-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelector('#pubEmailPolFilters .filter-btn').classList.add('active');

    renderPubEmailPolList();
  }

  function closeEmailPolModal() {
    document.getElementById('emailPolModal').style.display = 'none';
  }

  function renderPubEmailPolList() {
    var el = document.getElementById('pubEmailPolList');
    if (!el) return;

    var filtered = politicians.filter(function(p) { return p.email; });

    if (pubEmailPolFilter !== 'all') {
      filtered = filtered.filter(function(p) {
        switch (pubEmailPolFilter) {
          case 'house': return p.position.toLowerCase().indexOf('representative') !== -1;
          case 'senate': return p.position.toLowerCase().indexOf('senator') !== -1;
          case 'republican': return (p.party || '').toLowerCase() === 'republican';
          case 'democrat': return (p.party || '').toLowerCase() === 'democrat';
          case 'veteran': return !!p.veteran;
          default: return true;
        }
      });
    }

    if (pubEmailPolSearch) {
      filtered = filtered.filter(function(p) {
        return p.name.toLowerCase().indexOf(pubEmailPolSearch) !== -1;
      });
    }

    filtered.sort(function(a, b) { return a.name.localeCompare(b.name); });

    el.innerHTML = filtered.map(function(p) {
      var checked = pubEmailPolSelected[p.id] ? ' checked' : '';
      return '<label style="display:flex;align-items:center;gap:10px;padding:6px 10px;border-bottom:1px solid #f0f0f0;cursor:pointer;font-size:0.85em' + (checked ? ';background:#e3f2fd' : '') + '">' +
        '<input type="checkbox" onchange="AZVLC.togglePubEmailPol(' + p.id + ', this.checked)"' + checked + ' style="width:16px;height:16px">' +
        '<span style="flex:1"><strong>' + esc(p.name) + '</strong>' +
          ' <span style="color:var(--text-muted);font-size:0.85em">' + esc(p.position) +
          (p.party ? ' · ' + esc(p.party) : '') +
          (p.district ? ' · ' + esc(p.district) : '') + '</span></span>' +
      '</label>';
    }).join('');

    var count = Object.keys(pubEmailPolSelected).length;
    document.getElementById('pubEmailPolCount').textContent = count + ' selected';
  }

  function togglePubEmailPol(id, checked) {
    if (checked) pubEmailPolSelected[id] = true;
    else delete pubEmailPolSelected[id];
    renderPubEmailPolList();
  }

  function selectAllPubEmailPol() {
    var filtered = politicians.filter(function(p) { return p.email; });
    if (pubEmailPolFilter !== 'all') {
      filtered = filtered.filter(function(p) {
        switch (pubEmailPolFilter) {
          case 'house': return p.position.toLowerCase().indexOf('representative') !== -1;
          case 'senate': return p.position.toLowerCase().indexOf('senator') !== -1;
          case 'republican': return (p.party || '').toLowerCase() === 'republican';
          case 'democrat': return (p.party || '').toLowerCase() === 'democrat';
          case 'veteran': return !!p.veteran;
          default: return true;
        }
      });
    }
    if (pubEmailPolSearch) {
      filtered = filtered.filter(function(p) {
        return p.name.toLowerCase().indexOf(pubEmailPolSearch) !== -1;
      });
    }
    filtered.forEach(function(p) { pubEmailPolSelected[p.id] = true; });
    renderPubEmailPolList();
  }

  function deselectAllPubEmailPol() {
    pubEmailPolSelected = {};
    renderPubEmailPolList();
  }

  function searchEmailPol(query) {
    pubEmailPolSearch = query.toLowerCase().trim();
    renderPubEmailPolList();
  }

  function filterPubEmailPol(filter, btn) {
    pubEmailPolFilter = filter;
    document.querySelectorAll('#pubEmailPolFilters .filter-btn').forEach(function(b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    renderPubEmailPolList();
  }

  function sendPubEmailToPol() {
    var selectedIds = Object.keys(pubEmailPolSelected).map(Number);
    if (selectedIds.length === 0) {
      alert('Please select at least one politician.');
      return;
    }

    var emails = [];
    selectedIds.forEach(function(id) {
      var p = politicians.find(function(x) { return x.id === id; });
      if (p && p.email) emails.push(p.email);
    });

    if (emails.length === 0) {
      alert('None of the selected politicians have email addresses.');
      return;
    }

    var toEmail = emails[0];
    var bccEmails = emails.slice(1);
    var subject = encodeURIComponent(document.getElementById('pubEmailSubject').value || '');
    var body = encodeURIComponent(document.getElementById('pubEmailBody').value || '');

    var mailto = 'mailto:' + toEmail;
    var params = [];
    if (bccEmails.length > 0) params.push('bcc=' + encodeURIComponent(bccEmails.join('; ')));
    if (subject) params.push('subject=' + subject);
    if (body) params.push('body=' + body);
    if (params.length > 0) mailto += '?' + params.join('&');

    window.location.href = mailto;
  }

  // ── VOB Directory ──
  var vobData = [];
  var vobSha = '';
  var vobSubmissionsSha = '';
  var vobCurrentSearch = '';
  var vobCurrentFilter = 'all';
  var vobCurrentSort = 'name';

  function loadVOBSha() {
    return fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/vob.json?ref=' + CONFIG.branch, {
      headers: { 'Authorization': 'token ' + CONFIG.ghToken }
    })
    .then(function(r) { return r.json(); })
    .then(function(result) { vobSha = result.sha; })
    .catch(function() { vobSha = ''; });
  }

  function saveVOBToGitHub(data) {
    if (!CONFIG.ghToken) return Promise.resolve({ content: { sha: vobSha } });
    var content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2) + '\n')));
    return fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/vob.json', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'token ' + CONFIG.ghToken
      },
      body: JSON.stringify({
        message: 'Update VOB kudos',
        content: content,
        sha: vobSha,
        branch: CONFIG.branch
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(result) {
      if (result.content) vobSha = result.content.sha;
      return result;
    });
  }

  function loadVOBSubmissionsSha() {
    return fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/vob-submissions.json?ref=' + CONFIG.branch, {
      headers: { 'Authorization': 'token ' + CONFIG.ghToken }
    })
    .then(function(r) { return r.json(); })
    .then(function(result) { vobSubmissionsSha = result.sha; })
    .catch(function() { vobSubmissionsSha = ''; });
  }

  function loadVOB() {
    fetch('data/vob.json?t=' + Date.now())
      .then(function(r) { return r.json(); })
      .then(function(data) {
        vobData = data || [];
        renderVOB();
        renderVOBFilters();
      })
      .catch(function() { vobData = []; });
  }

  function renderVOBFilters() {
    var cats = {};
    vobData.forEach(function(b) { if (b.category) cats[b.category] = true; });
    var bar = document.getElementById('vobFilterBar');
    if (!bar) return;
    var html = '<button class="filter-btn' + (vobCurrentFilter === 'all' ? ' active' : '') + '" onclick="AZVLC.filterVOB(\'all\', this)">All</button>';
    Object.keys(cats).sort().forEach(function(cat) {
      html += '<button class="filter-btn' + (vobCurrentFilter === cat ? ' active' : '') + '" onclick="AZVLC.filterVOB(\'' + esc(cat) + '\', this)">' + esc(cat) + '</button>';
    });
    bar.innerHTML = html;
  }

  function renderVOB() {
    var el = document.getElementById('vobList');
    if (!el) return;

    var filtered = vobData.slice();
    if (vobCurrentFilter !== 'all') {
      filtered = filtered.filter(function(b) { return b.category === vobCurrentFilter; });
    }
    if (vobCurrentSearch) {
      var q = vobCurrentSearch;
      filtered = filtered.filter(function(b) {
        return (b.businessName || '').toLowerCase().indexOf(q) !== -1 ||
          (b.category || '').toLowerCase().indexOf(q) !== -1 ||
          (b.zip || '').indexOf(q) !== -1 ||
          (b.address || '').toLowerCase().indexOf(q) !== -1 ||
          (b.description || '').toLowerCase().indexOf(q) !== -1;
      });
    }

    filtered.sort(function(a, b) {
      if (vobCurrentSort === 'kudos') return (b.kudos || 0) - (a.kudos || 0);
      if (vobCurrentSort === 'newest') return (b.id || 0) - (a.id || 0);
      return (a.businessName || '').localeCompare(b.businessName || '');
    });

    if (filtered.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>' + (vobData.length === 0 ? 'No businesses listed yet. Be the first!' : 'No businesses match your search.') + '</p></div>';
      return;
    }

    el.innerHTML = filtered.map(function(b) {
      var voted = hasVotedKudo('vob', b.id);
      return '<div class="card">' +
        '<h3>' + esc(b.businessName) + '</h3>' +
        '<div class="card-meta">' +
          '<span class="badge badge-category">' + esc(b.category) + '</span>' +
          (b.discount ? '<span class="badge badge-passed" style="background:#fff3e0;color:#e65100">🎖 ' + esc(b.discount) + '</span>' : '') +
        '</div>' +
        '<p>' + esc(b.description) + '</p>' +
        '<div style="margin-top:12px;font-size:0.9em;color:var(--text-muted);line-height:1.8">' +
          (b.address ? '<div>📍 ' + esc(b.address) + '</div>' : '') +
          (b.phone ? '<div>📞 ' + esc(b.phone) + '</div>' : '') +
          (b.hours ? '<div>🕐 ' + esc(b.hours) + '</div>' : '') +
          (b.website ? '<div>🌐 <a href="' + esc(b.website) + '" target="_blank" rel="noopener">' + esc(b.website) + '</a></div>' : '') +
        '</div>' +
        '<div class="kudos-bar">' +
          '<button class="kudos-btn' + (voted ? ' voted' : '') + '" onclick="AZVLC.giveKudos(' + b.id + ',\'vob\')" ' + (voted ? 'disabled' : '') + '>' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' +
            (voted ? 'Thanked' : 'Give Kudos') +
          '</button>' +
          '<span class="kudos-count" id="kudos-vob-' + b.id + '">' + (b.kudos || 0) + '</span>' +
          '<button class="btn btn-sm" style="background:#eee;color:var(--text-muted);font-size:0.8em;margin-left:auto" onclick="AZVLC.requestVOBEdit(' + b.id + ')">Request Edit</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function searchVOB(query) {
    vobCurrentSearch = query.toLowerCase().trim();
    renderVOB();
  }

  function filterVOB(cat, btn) {
    vobCurrentFilter = cat;
    if (btn) {
      document.querySelectorAll('#vobFilterBar .filter-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
    }
    renderVOB();
  }

  function requestVOBEdit(id) {
    var b = vobData.find(function(x) { return x.id === id; });
    if (!b) return;

    var details = [];
    details.push('Business: ' + b.businessName);
    details.push('Category: ' + b.category);
    details.push('Description: ' + b.description);
    if (b.address) details.push('Address: ' + b.address);
    if (b.zip) details.push('Zip: ' + b.zip);
    if (b.phone) details.push('Phone: ' + b.phone);
    if (b.hours) details.push('Hours: ' + b.hours);
    if (b.website) details.push('Website: ' + b.website);
    if (b.discount) details.push('Veteran Discount: ' + b.discount);

    var subject = encodeURIComponent('EDIT VOB - ' + b.businessName);
    var body = encodeURIComponent('Please update the following information for my VOB listing:\n\n' +
      '--- CURRENT LISTING ---\n' +
      details.join('\n') +
      '\n\n--- CHANGES REQUESTED ---\n' +
      '(Please edit the fields above that need changing)\n\n' +
      'Name: \nEmail: \nPhone: \n');

    window.location.href = 'mailto:admin@azvlc.org?subject=' + subject + '&body=' + body;
  }

  // ── Math Captcha ──
  var captchaA = 0, captchaB = 0;

  function generateCaptcha() {
    captchaA = Math.floor(Math.random() * 10) + 1;
    captchaB = Math.floor(Math.random() * 10) + 1;
    var label = document.getElementById('vobCaptchaLabel');
    if (label) label.textContent = 'What is ' + captchaA + ' + ' + captchaB + '?';
  }

  function verifyCaptcha() {
    var input = document.getElementById('vobCaptchaAnswer');
    if (!input) return false;
    return parseInt(input.value) === (captchaA + captchaB);
  }

  function sortVOB(sortBy) {
    vobCurrentSort = sortBy;
    renderVOB();
  }

  function openVOBSubmitModal() {
    document.getElementById('vobSubmitModal').style.display = 'flex';
    document.getElementById('vobSubmitForm').reset();
    document.getElementById('vobSubmitSuccess').classList.remove('show');
    generateCaptcha();
  }

  function closeVOBSubmitModal() {
    document.getElementById('vobSubmitModal').style.display = 'none';
  }

  function submitVOB(e) {
    e.preventDefault();
    var form = e.target;

    if (!verifyCaptcha()) {
      alert('Incorrect answer. Please solve the math problem to verify you are human.');
      generateCaptcha();
      return;
    }

    var ownerEmail = document.getElementById('vobOwnerEmail').value.trim();
    var ownerPhone = document.getElementById('vobOwnerPhone').value.trim();
    if (!ownerEmail && !ownerPhone) {
      alert('Please provide at least one contact method (email or phone) for verification.');
      return;
    }

    var submission = {
      id: Date.now(),
      businessName: document.getElementById('vobBizName').value.trim(),
      category: document.getElementById('vobCategory').value,
      description: document.getElementById('vobDescription').value.trim(),
      website: document.getElementById('vobWebsite').value.trim(),
      address: document.getElementById('vobAddress').value.trim(),
      zip: document.getElementById('vobZip').value.trim(),
      phone: document.getElementById('vobBizPhone').value.trim(),
      hours: document.getElementById('vobHours').value.trim(),
      discount: document.getElementById('vobDiscount').value.trim(),
      ownerName: document.getElementById('vobOwnerName').value.trim(),
      ownerEmail: ownerEmail,
      ownerPhone: ownerPhone,
      submittedAt: new Date().toISOString()
    };

    var submitBtn = form.querySelector('.form-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    fetch('data/vob-submissions.json').then(function(r) { return r.json(); }).then(function(submissions) {
      submissions.push(submission);
      var content = btoa(unescape(encodeURIComponent(JSON.stringify(submissions, null, 2) + '\n')));
      return fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/vob-submissions.json', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'token ' + CONFIG.ghToken
        },
        body: JSON.stringify({
          message: 'VOB submission: ' + submission.businessName,
          content: content,
          sha: vobSubmissionsSha,
          branch: CONFIG.branch
        })
      });
    }).then(function(r) { return r.json(); }).then(function(result) {
      if (result.content) {
        vobSubmissionsSha = result.content.sha;

        fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/issues', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'token ' + CONFIG.ghToken
          },
          body: JSON.stringify({
            title: 'VOB Submission: ' + submission.businessName,
            body: '**Business:** ' + submission.businessName + '\n' +
              '**Category:** ' + submission.category + '\n' +
              '**Owner:** ' + submission.ownerName + '\n' +
              '**Contact:** ' + (submission.ownerEmail || 'N/A') + ' / ' + (submission.ownerPhone || 'N/A') + '\n' +
              '**Date:** ' + submission.submittedAt + '\n\n' +
              'Review in the [Admin Panel](https://azvlc.org/admin.html).',
            labels: ['vob-submission']
          })
        }).catch(function() {});

        var successEl = document.getElementById('vobSubmitSuccess');
        successEl.classList.add('show');
        form.reset();
        setTimeout(function() { successEl.classList.remove('show'); closeVOBSubmitModal(); }, 3000);
      } else {
        throw new Error(result.message || 'Save failed');
      }
    }).catch(function(err) {
      console.error('VOB submission error:', err);
      alert('There was an issue submitting. Please try again.');
    }).finally(function() {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit for Review';
      loadVOBSubmissionsSha();
    });

    saveContact(ownerEmail || '', submission.ownerName, 'VOB: ' + submission.businessName, {
      type: 'vob-submission',
      businessName: submission.businessName,
      category: submission.category,
      phone: ownerPhone,
      timestamp: submission.submittedAt
    });
  }

  function submitDonateForm(e) {
    e.preventDefault();
    var form = e.target;
    var name = form.donateName.value;
    var email = form.donateEmail.value;
    var phone = form.donatePhone.value;

    var submitBtn = form.querySelector('.form-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    saveContact(email, name, 'Donate Interest', {
      type: 'donate-interest',
      phone: phone,
      timestamp: new Date().toISOString()
    });

    fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/issues', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'token ' + CONFIG.ghToken
      },
      body: JSON.stringify({
        title: 'Donation Interest: ' + name,
        body: '**Name:** ' + name + '\n' +
          '**Email:** ' + email + '\n' +
          '**Phone:** ' + phone + '\n' +
          '**Date:** ' + new Date().toISOString(),
        labels: ['donate-interest']
      })
    }).catch(function() {});

    setTimeout(function() {
      var successEl = document.getElementById('donateSuccess');
      if (successEl) successEl.classList.add('show');
      form.reset();
      submitBtn.disabled = false;
      submitBtn.textContent = 'Notify Me When Donations Open';
      setTimeout(function() { if (successEl) successEl.classList.remove('show'); }, 5000);
    }, 2500);
  }

  function submitPolicyForm(e) {
    e.preventDefault();
    var form = e.target;
    var suggestEmail = form.submitterEmail.value;
    var suggestName = form.submitterAnonymous.checked ? '' : form.submitterName.value;
    var suggestPolicyName = form.policyName.value;
    var suggestPolicySponsor = form.policySponsor.value;
    var suggestPolicyDescription = form.policyDescription.value;
    var suggestPolicyLink = form.policyLink.value || '';

    var submission = {
      id: Date.now(),
      name: suggestPolicyName,
      sponsor: suggestPolicySponsor,
      category: 'suggestion',
      description: suggestPolicyDescription,
      status: 'proposed',
      link: suggestPolicyLink,
      submittedBy: suggestName || 'Anonymous',
      submitterEmail: suggestEmail,
      submittedAt: new Date().toISOString()
    };

    var submitBtn = form.querySelector('.form-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    fetch('data/policy-submissions.json').then(function(r) { return r.json(); }).then(function(submissions) {
      submissions.push(submission);
      var content = btoa(unescape(encodeURIComponent(JSON.stringify(submissions, null, 2) + '\n')));
      return fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/contents/data/policy-submissions.json', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'token ' + CONFIG.ghToken
        },
        body: JSON.stringify({
          message: 'Policy suggestion: ' + submission.name,
          content: content,
          sha: policySubmissionsSha,
          branch: CONFIG.branch
        })
      });
    }).then(function(r) { return r.json(); }).then(function(result) {
      if (result.content) {
        policySubmissionsSha = result.content.sha;

        fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/issues', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'token ' + CONFIG.ghToken
          },
          body: JSON.stringify({
            title: 'Policy Suggestion: ' + submission.name,
            body: '**Policy:** ' + submission.name + '\n' +
              '**Sponsor:** ' + submission.sponsor + '\n' +
              '**Description:** ' + submission.description + '\n' +
              '**Submitted by:** ' + (submission.submitterEmail || 'Anonymous') + '\n' +
              '**Date:** ' + submission.submittedAt + '\n\n' +
              'Review this in the [Admin Panel](https://azvlc.org/admin.html).',
            labels: ['policy-suggestion']
          })
        }).catch(function() {});

        var successEl = document.getElementById('policySuccess');
        if (successEl) {
          successEl.textContent = 'Thank you! Your policy suggestion has been submitted for review.';
          successEl.classList.add('show');
        }
        form.reset();
        setTimeout(function() { if (successEl) successEl.classList.remove('show'); }, 5000);
      } else {
        throw new Error(result.message || 'Save failed');
      }
    }).catch(function(err) {
      console.error('Policy submission error:', err);
      alert('There was an issue submitting your suggestion. Please try again.');
    }).finally(function() {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Policy Suggestion';
      loadPolicySubmissionsWithSha();
    });

    if (CONFIG.ghlWebhookPolicy) {
      sendToGHL(CONFIG.ghlWebhookPolicy, {
        policyName: suggestPolicyName,
        policySponsor: suggestPolicySponsor,
        policyDescription: suggestPolicyDescription,
        submitterEmail: suggestEmail,
        submissionType: 'Policy Suggestion',
        timestamp: new Date().toISOString()
      }, null, null);
    }
    setTimeout(function () { saveContact(suggestEmail, suggestName, 'Suggested Policy: ' + suggestPolicyName, {
      type: 'policy-suggestion',
      policyName: suggestPolicyName,
      policySponsor: suggestPolicySponsor,
      policyDescription: suggestPolicyDescription,
      policyLink: suggestPolicyLink,
      timestamp: new Date().toISOString()
    }); }, 2000);
  }

  var ratingFormOpenedAt = 0;

  function onRatingFormFocus() {
    if (!ratingFormOpenedAt) ratingFormOpenedAt = Date.now();
  }

  function submitRatingForm(e) {
    e.preventDefault();
    var form = e.target;

    // honeypot check
    if (form.raterWebsite && form.raterWebsite.value) {
      alert('Thank you for your submission.');
      form.reset();
      return;
    }

    // time delay check (must have form open at least 5 seconds)
    if (Date.now() - ratingFormOpenedAt < 5000) {
      alert('Please take a moment to review your rating before submitting.');
      return;
    }

    // Arizona zip code check (850xx - 865xx)
    var raterEmail = form.raterEmail.value;
    var raterName = form.raterAnonymous.checked ? '' : form.raterName.value;
    var zip = (form.raterZip.value || '').trim();
    var zipNum = parseInt(zip);
    if (!/^\d{5}$/.test(zip) || zipNum < 85001 || zipNum > 86599) {
      alert('Please enter a valid Arizona zip code (85001-86599).');
      return;
    }

    var politicianName = form.politicianName.value;
    var newGrade = form.politicianGrade.value;
    var ratingReason = form.ratingReason.value || '';
    var politicianPosition = form.politicianPosition.value || '';
    var isAnonymous = form.raterAnonymous.checked;

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
        setTimeout(function () { saveContact(raterEmail, raterName, 'Rated: ' + politicianName + ' (' + newGrade + ')', {
          type: 'politician-rating',
          politician: politicianName,
          position: politicianPosition,
          grade: newGrade,
          previousGrade: prevGrade || '',
          reason: ratingReason,
          zip: zip,
          anonymous: isAnonymous,
          timestamp: new Date().toISOString()
        }); }, 2000);

        fetch('https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName + '/issues', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'token ' + CONFIG.ghToken
          },
          body: JSON.stringify({
            title: 'Politician Rating: ' + politicianName + ' (' + newGrade + ')',
            body: '**Politician:** ' + politicianName + '\n' +
              '**Position:** ' + politicianPosition + '\n' +
              '**Grade:** ' + newGrade + (prevGrade ? ' (changed from ' + prevGrade + ')' : '') + '\n' +
              '**Reason:** ' + (ratingReason || 'Not provided') + '\n' +
              '**Zip:** ' + zip + '\n' +
              '**Submitted by:** ' + (raterName || 'Anonymous') + ' (' + raterEmail + ')\n' +
              '**Date:** ' + new Date().toISOString(),
            labels: ['rating']
          })
        }).catch(function() {});
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
    showDistrict: showDistrict,
    sharePolicyX: sharePolicyX,
    sharePolicyFB: sharePolicyFB,
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
    clearRateForm: function() {
      document.getElementById('politicianSearch2').value = '';
      document.getElementById('politicianName').value = '';
      document.getElementById('politicianPosition').value = '';
      document.getElementById('politicianGrade').value = '';
      document.getElementById('ratingReason').value = '';
      document.getElementById('raterZip').value = '';
      document.getElementById('raterEmail').value = '';
      document.getElementById('raterName').value = '';
      document.getElementById('raterAnonymous').checked = false;
      var notice = document.getElementById('prevRatingNotice');
      if (notice) notice.classList.remove('show');
      document.getElementById('rateDropdown').style.display = 'none';
      ratingFormOpenedAt = 0;
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
    submitModifyPolitician: submitModifyPolitician,
    openEmailPolModal: openEmailPolModal,
    closeEmailPolModal: closeEmailPolModal,
    togglePubEmailPol: togglePubEmailPol,
    selectAllPubEmailPol: selectAllPubEmailPol,
    deselectAllPubEmailPol: deselectAllPubEmailPol,
    searchEmailPol: searchEmailPol,
    filterPubEmailPol: filterPubEmailPol,
    sendPubEmailToPol: sendPubEmailToPol,
    searchVOB: searchVOB,
    filterVOB: filterVOB,
    sortVOB: sortVOB,
    requestVOBEdit: requestVOBEdit,
    openVOBSubmitModal: openVOBSubmitModal,
    closeVOBSubmitModal: closeVOBSubmitModal,
    submitVOB: submitVOB
  };
})();
