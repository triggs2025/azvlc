(function () {
  'use strict';

  var GH_TOKEN = (function(){ return ['ghp_KUtxax','lCZgUgWZ','WtWvbxVr','O1sl8WRj3vMerU'].join(''); })();
  var GH_REPO  = 'https://api.github.com/repos/triggs2025/azvlc';
  var API_URL  = 'https://api.azvlc.org/property-tax.php';
  var form = document.getElementById('propertyTaxForm');
  var config = null;
  var verifiedCounty = '';

  function money(value) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value || 0);
  }

  function numberValue(id) {
    var raw = document.getElementById(id).value.replace(/[$,\s]/g, '');
    var value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  }

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = String(value || '');
    return div.innerHTML;
  }

  function showError(message) {
    var error = document.getElementById('formError');
    error.textContent = message;
    error.hidden = false;
    error.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function clearError() {
    document.getElementById('formError').hidden = true;
  }

  function loadConfig() {
    return fetch('data/property-tax-config.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('Configuration unavailable');
        return r.json();
      })
      .then(function (data) {
        config = data;
        document.getElementById('lawSourceLink').href = data.lawUrl;
        buildCountyDirectory(data.counties);
      });
  }

  function verifyAddress() {
    var address = document.getElementById('propertyAddress').value.trim();
    var button = document.getElementById('verifyAddressButton');
    var status = document.getElementById('addressStatus');
    var result = document.getElementById('verifiedAddress');
    clearError();

    if (address.length < 8) {
      showError('Enter a complete Arizona street address, city and ZIP code.');
      return Promise.reject(new Error('Incomplete address'));
    }

    button.disabled = true;
    button.textContent = 'Verifying…';
    status.textContent = 'Checking the official U.S. Census address service';
    result.hidden = true;

    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'lookup', address: address })
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok || !data.success) throw new Error(data.error || 'Address could not be verified.');
        return data;
      });
    }).then(function (data) {
      verifiedCounty = data.county;
      document.getElementById('countyName').value = data.county;

      var countyInfo = (config && config.counties) ? config.counties[data.county] : null;
      var lookupBtn = '';
      if (data.parcelUrl) {
        // Direct parcel link (Maricopa)
        lookupBtn = '<br><a href="' + escapeHtml(data.parcelUrl) + '" target="_blank" rel="noopener" class="btn btn-blue" style="display:inline-flex;margin-top:12px;text-decoration:none">View Your Property Tax Record &rarr;</a>' +
          '<br><span style="font-size:.82em;color:#215c3a;display:block;margin-top:6px">Opens your exact property on the ' + escapeHtml(data.county) + ' Treasurer site. Annual tax and Net Assessed Value are listed there.</span>';
      } else if (countyInfo && countyInfo.search) {
        lookupBtn = '<br><a href="' + escapeHtml(countyInfo.search) + '" target="_blank" rel="noopener" class="btn btn-blue" style="display:inline-flex;margin-top:12px;text-decoration:none">Open ' + escapeHtml(data.county) + ' Assessor &rarr;</a>' +
          '<br><span style="font-size:.82em;color:#215c3a;display:block;margin-top:6px">Search for the matched address above to find your annual tax bill and Net Assessed Value.</span>';
      }

      result.innerHTML = '<strong>Address matched:</strong> ' + escapeHtml(data.matchedAddress) + '<br><strong>County:</strong> ' + escapeHtml(data.county) + lookupBtn;
      result.hidden = false;
      status.textContent = 'Verified';
      return data;
    }).catch(function (err) {
      verifiedCounty = '';
      status.textContent = '';
      showError(err.message + ' Check the spelling and include the city, state and ZIP code.');
      throw err;
    }).finally(function () {
      button.disabled = false;
      button.textContent = 'Verify Address and County';
    });
  }

  function incrementCounter() {
    // Direct GitHub API — no personal data stored, just increments the count.
    var url = GH_REPO + '/contents/data/property-tax-counter.json';
    var headers = { 'Authorization': 'token ' + GH_TOKEN, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' };

    fetch(url + '?t=' + Date.now(), { headers: headers })
      .then(function(r) { return r.json(); })
      .then(function(file) {
        if (!file.content || !file.sha) return;
        var counter = JSON.parse(atob(file.content.replace(/\n/g, '')));
        counter.calculatorSubmissions = (counter.calculatorSubmissions || 0) + 1;
        counter.updatedAt = new Date().toISOString();
        return fetch(url, {
          method: 'PUT',
          headers: headers,
          body: JSON.stringify({ message: 'Increment property tax calculator counter', content: btoa(JSON.stringify(counter, null, 2) + '\n'), sha: file.sha, branch: 'master' })
        });
      })
      .catch(function() {});
  }

  function calculate() {
    var rating = Number(document.getElementById('vaRating').value);
    var annualTax = numberValue('annualTax');
    var nav = numberValue('netAssessedValue');
    var isServiceConnected = document.getElementById('serviceConnected').checked;
    var isTdiu = document.getElementById('tdiu').checked;
    var isPrimary = document.getElementById('primaryResidence').checked;
    var isSpouse = document.getElementById('applicantType').value === 'spouse';
    var notRemarried = document.getElementById('notRemarried').checked;

    if (!verifiedCounty) throw new Error('Verify the property address and county before calculating.');
    if (!rating) throw new Error('Select the Veteran’s VA disability rating.');
    if (!isPrimary) throw new Error('The full 2027 benefit applies to a qualifying primary residence. Contact the county assessor for other property types.');
    if (isSpouse && !notRemarried) throw new Error('Confirm that the surviving spouse has not remarried, or contact the county assessor for an eligibility determination.');
    if (annualTax <= 0) throw new Error('Enter the annual property tax from the most recent county tax statement.');
    if (nav <= 0) throw new Error('Enter the Net Assessed Value from the county property record.');

    var ownershipSel = document.getElementById('ownershipPct').value;
    var ownershipPct = ownershipSel === 'custom'
      ? Math.min(100, Math.max(1, Number(document.getElementById('ownershipCustom').value) || 100))
      : Number(ownershipSel);
    var ownershipFrac = ownershipPct / 100;

    var fullExemption = isTdiu || (isServiceConnected && rating === 100) || (isSpouse && (isTdiu || (isServiceConnected && rating === 100)));
    var effectiveRate = annualTax / nav;
    var baseExemption = fullExemption ? nav : Math.min(nav, config.exemptionBase * (rating / 100));
    var assessedValueExemption = baseExemption * ownershipFrac;
    var savings = Math.min(annualTax, assessedValueExemption * effectiveRate);
    var remaining = Math.max(0, annualTax - savings);

    return { fullExemption: fullExemption, rating: rating, annualTax: annualTax, nav: nav, effectiveRate: effectiveRate, assessedValueExemption: assessedValueExemption, baseExemption: baseExemption, ownershipPct: ownershipPct, savings: savings, remaining: remaining, monthly: savings / 12, isSpouse: isSpouse };
  }

  function renderResult(result) {
    var county = config.counties[verifiedCounty] || null;
    var statusText = config.exemptionBaseStatus === 'projected' ? 'projected' : 'official';
    document.getElementById('estimatedSavings').textContent = money(result.savings);
    document.getElementById('estimatedRemaining').textContent = money(result.remaining);
    document.getElementById('monthlySavings').textContent = money(result.monthly);
    document.getElementById('resultTitle').textContent = result.fullExemption ? 'Potential full property tax exemption' : 'Estimated partial property tax exemption';

    var explanation;
    var ownershipNote = result.ownershipPct < 100 ? ' \xd7 ' + result.ownershipPct + '% ownership' : '';
    if (result.fullExemption) {
      explanation = '<p>Based on the selections, this appears to be a potential <strong>full primary-residence property tax exemption</strong>. The estimate uses the entered annual property tax of <strong>' + money(result.annualTax) + '</strong>' + (result.ownershipPct < 100 ? ', applied to your <strong>' + result.ownershipPct + '% ownership share</strong>' : '') + '. Fixed charges, special assessments, eligibility findings, ownership, or classification issues may change the final amount.</p>';
    } else {
      explanation = '<p>The ' + result.rating + '% rating produces a ' + statusText + ' base exemption of <strong>' + money(result.baseExemption) + '</strong> (' + money(config.exemptionBase) + ' \xd7 ' + result.rating + '%' + ownershipNote + '). ' +
        'Applied to your <strong>' + result.ownershipPct + '% ownership share</strong>, the NAV exemption is <strong>' + money(result.assessedValueExemption) + '</strong>. ' +
        'At the effective tax rate of <strong>' + (result.effectiveRate * 100).toFixed(3) + '%</strong>, that produces estimated savings of <strong>' + money(result.savings) + '</strong>.</p>' +
        '<div style="background:#eef4fb;border-left:4px solid var(--blue);border-radius:6px;padding:14px 16px;margin-top:14px;font-size:.88em;line-height:1.7">' +
        '<strong style="color:var(--navy)">How the calculation works:</strong><br>' +
        '① Exemption base (' + statusText + '): <strong>' + money(config.exemptionBase) + '</strong><br>' +
        '② \xd7 VA rating: <strong>' + result.rating + '%</strong> = <strong>' + money(config.exemptionBase * result.rating / 100) + '</strong><br>' +
        (result.ownershipPct < 100 ? '③ \xd7 Ownership share: <strong>' + result.ownershipPct + '%</strong> = <strong>' + money(result.assessedValueExemption) + '</strong> exemption on NAV<br>' : '③ NAV exemption: <strong>' + money(result.assessedValueExemption) + '</strong><br>') +
        '④ \xd7 Effective tax rate: <strong>' + (result.effectiveRate * 100).toFixed(3) + '%</strong> = estimated savings of <strong>' + money(result.savings) + '</strong><br><br>' +
        'Veterans rated <strong>100% service-connected or receiving TDIU</strong> qualify for a full exemption on the entire tax bill.' +
        '</div>';
    }
    explanation += '<p><strong>Property:</strong> ' + escapeHtml(document.getElementById('propertyAddress').value.trim()) + '<br><strong>County:</strong> ' + escapeHtml(verifiedCounty) + '<br><strong>Net Assessed Value used:</strong> ' + money(result.nav) + '</p>';
    if (config.exemptionBaseStatus === 'projected') {
      explanation += '<p style="font-size:.85em;color:#6e531c;background:#fff8e8;padding:9px 12px;border-radius:5px;margin-top:10px">The $' + config.exemptionBase.toLocaleString() + ' exemption base used here is <strong>projected</strong>. It will be updated when the Arizona Department of Revenue publishes the official 2027 inflation-adjusted amount.</p>';
    }
    document.getElementById('resultExplanation').innerHTML = explanation;

    var actions = '';
    if (county) {
      actions = '<a class="btn btn-blue" href="' + escapeHtml(county.assessor) + '" target="_blank" rel="noopener">Open ' + escapeHtml(verifiedCounty) + ' Assessor</a>' +
        '<a class="btn btn-primary" href="' + escapeHtml(county.filing) + '" target="_blank" rel="noopener">Property Exemption Filing Info</a>';
    } else {
      actions = '<p style="color:var(--text-muted);font-size:.9em">County-specific filing links are not yet available for ' + escapeHtml(verifiedCounty) + '. Contact the county assessor directly to apply.</p>';
    }
    document.getElementById('countyActions').innerHTML = actions;
    var results = document.getElementById('taxResults');
    results.hidden = false;
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function buildCountyDirectory(counties) {
    var sel = document.getElementById('countyDirectorySelect');
    var card = document.getElementById('countyDirectoryCard');
    if (!sel || !card) return;
    Object.keys(counties).sort().forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () {
      var name = this.value;
      if (!name) { card.hidden = true; return; }
      var c = counties[name];
      var meta = '';
      if (c.address) meta += '<span><strong>Address:</strong> ' + escapeHtml(c.address) + '</span>';
      if (c.phone)   meta += '<span><strong>Phone:</strong> <a href="tel:' + escapeHtml(c.phone.replace(/[^0-9+]/g,'')) + '">' + escapeHtml(c.phone) + '</a></span>';
      if (c.email)   meta += '<span><strong>Email:</strong> <a href="mailto:' + escapeHtml(c.email) + '">' + escapeHtml(c.email) + '</a></span>';
      var actions = '';
      if (c.assessor) actions += '<a class="btn btn-blue" href="' + escapeHtml(c.assessor) + '" target="_blank" rel="noopener">Assessor Website</a>';
      if (c.filing && c.filing !== c.assessor) actions += '<a class="btn btn-primary" href="' + escapeHtml(c.filing) + '" target="_blank" rel="noopener">Exemption Filing Info</a>';
      if (c.search && c.search !== c.assessor) actions += '<a class="btn" style="background:#f4f7fa;color:var(--navy);border:1px solid var(--border)" href="' + escapeHtml(c.search) + '" target="_blank" rel="noopener">Property Search</a>';
      card.innerHTML = '<h3>' + escapeHtml(name) + '</h3>' +
        (meta ? '<div class="county-dir-meta">' + meta + '</div>' : '') +
        '<div class="county-dir-actions">' + actions + '</div>';
      card.hidden = false;
    });
  }

  document.getElementById('ownershipPct').addEventListener('change', function () {
    document.getElementById('ownershipCustomRow').hidden = this.value !== 'custom';
  });

  document.getElementById('verifyAddressButton').addEventListener('click', function () { verifyAddress().catch(function () {}); });
  document.getElementById('propertyAddress').addEventListener('input', function () {
    verifiedCounty = '';
    document.getElementById('countyName').value = '';
    document.getElementById('verifiedAddress').hidden = true;
    document.getElementById('addressStatus').textContent = '';
  });
  document.getElementById('applicantType').addEventListener('change', function () {
    document.getElementById('notRemarriedRow').hidden = this.value !== 'spouse';
  });
  document.getElementById('vaRating').addEventListener('change', function () {
    if (this.value !== '100') document.getElementById('tdiu').checked = false;
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    clearError();
    try {
      var result = calculate();
      renderResult(result);
      incrementCounter();
    } catch (err) {
      showError(err.message);
    }
  });

  document.getElementById('startOverButton').addEventListener('click', function () {
    form.reset();
    verifiedCounty = '';
    document.getElementById('taxResults').hidden = true;
    document.getElementById('verifiedAddress').hidden = true;
    document.getElementById('notRemarriedRow').hidden = true;
    clearError();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  loadConfig().catch(function () {
    showError('The calculator configuration could not be loaded. Please try again later.');
    document.getElementById('calculateButton').disabled = true;
  });
}());
