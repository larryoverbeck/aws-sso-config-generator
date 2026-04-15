/**
 * Inline HTML page for the AWS SSO Config Generator web UI.
 * Returns a complete, self-contained HTML page as a template string.
 */
export function renderWebUI(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AWS SSO Config Generator</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f5f7fa;
      color: #1a1a2e;
      line-height: 1.5;
      min-width: 900px;
    }

    header {
      background: #1a1a2e;
      color: #f0f0f5;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    header h1 { font-size: 1.15rem; font-weight: 600; }

    .header-actions { display: flex; gap: 8px; }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border: none;
      border-radius: 4px;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s, opacity 0.15s;
    }

    .btn:disabled { opacity: 0.45; cursor: not-allowed; }

    .btn-primary { background: #2563eb; color: #fff; }
    .btn-primary:hover:not(:disabled) { background: #1d4ed8; }

    .btn-secondary { background: #e2e8f0; color: #1a1a2e; }
    .btn-secondary:hover:not(:disabled) { background: #cbd5e1; }

    .btn-danger { background: #dc2626; color: #fff; }
    .btn-danger:hover:not(:disabled) { background: #b91c1c; }

    .btn-done { background: #64748b; color: #fff; }
    .btn-done:hover:not(:disabled) { background: #475569; }

    .main-layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      padding: 16px;
      max-width: 1920px;
      margin: 0 auto;
      min-height: calc(100vh - 52px);
    }

    .panel {
      background: #fff;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .panel-header {
      padding: 12px 16px;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
    }

    .panel-header h2 { font-size: 1rem; font-weight: 600; color: #1a1a2e; }

    .panel-body { padding: 16px; flex: 1; overflow-y: auto; }

    .section-heading {
      font-size: 0.85rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 16px 0 8px;
      color: #475569;
    }

    .section-heading:first-child { margin-top: 0; }

    .profile-card {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
      background: #fff;
    }

    .profile-card:hover { border-color: #93c5fd; background: #eff6ff; }

    .profile-card.selected {
      border-color: #2563eb;
      background: #dbeafe;
    }

    .profile-card.disabled {
      opacity: 0.55;
      cursor: not-allowed;
      background: #f1f5f9;
    }

    .profile-card.disabled:hover { border-color: #e2e8f0; background: #f1f5f9; }

    .profile-card-name {
      font-weight: 600;
      font-size: 0.9rem;
      color: #1a1a2e;
    }

    .profile-card-details {
      font-size: 0.8rem;
      color: #475569;
      margin-top: 2px;
    }

    .profile-card-badge {
      display: inline-block;
      font-size: 0.7rem;
      padding: 1px 6px;
      border-radius: 3px;
      margin-left: 6px;
      font-weight: 500;
    }

    .badge-prod { background: #fef3c7; color: #92400e; }
    .badge-configured { background: #e2e8f0; color: #475569; }

    .config-textarea {
      width: 100%;
      min-height: 120px;
      font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace;
      font-size: 0.8rem;
      padding: 10px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: #f8fafc;
      color: #1a1a2e;
      resize: vertical;
    }

    .selected-profile {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
      margin-bottom: 8px;
      background: #fff;
    }

    .selected-profile-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .selected-profile-info {
      font-size: 0.8rem;
      color: #475569;
    }

    .name-input {
      width: 100%;
      padding: 6px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      font-size: 0.85rem;
      font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace;
      color: #1a1a2e;
      background: #fff;
    }

    .name-input:focus { outline: 2px solid #2563eb; outline-offset: -1px; border-color: #2563eb; }

    .name-input.error { border-color: #dc2626; }
    .name-input.error:focus { outline-color: #dc2626; }

    .validation-error {
      color: #dc2626;
      font-size: 0.78rem;
      margin-top: 4px;
    }

    .placeholder-msg {
      color: #64748b;
      font-size: 0.85rem;
      text-align: center;
      padding: 32px 16px;
    }

    .btn-remove {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 1.1rem;
      padding: 2px 6px;
      border-radius: 3px;
      line-height: 1;
    }

    .btn-remove:hover { color: #dc2626; background: #fee2e2; }

    .status-banner {
      padding: 10px 16px;
      border-radius: 6px;
      margin-bottom: 12px;
      font-size: 0.85rem;
      font-weight: 500;
    }

    .status-success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .status-error { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }

    .backup-item {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .backup-info { font-size: 0.82rem; color: #475569; }
    .backup-name { font-weight: 600; font-size: 0.85rem; color: #1a1a2e; }

    .backup-actions { display: flex; gap: 6px; }

    .backup-preview {
      width: 100%;
      min-height: 100px;
      font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace;
      font-size: 0.8rem;
      padding: 10px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: #f8fafc;
      color: #1a1a2e;
      resize: vertical;
      margin-bottom: 12px;
    }

    .tab-bar {
      display: flex;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
    }

    .tab-btn {
      padding: 10px 20px;
      border: none;
      background: none;
      font-size: 0.85rem;
      font-weight: 500;
      color: #64748b;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: color 0.15s, border-color 0.15s;
    }

    .tab-btn:hover { color: #1a1a2e; }
    .tab-btn.active { color: #2563eb; border-bottom-color: #2563eb; }

    .tab-content { display: none; }
    .tab-content.active { display: block; }

    .loading { text-align: center; padding: 48px; color: #64748b; }

    @media (max-width: 1100px) {
      .main-layout { grid-template-columns: 1fr 1fr; gap: 12px; padding: 12px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>AWS SSO Config Generator</h1>
    <div class="header-actions">
      <button class="btn btn-done" id="doneBtn" type="button" aria-label="Close application and shut down server">Done</button>
    </div>
  </header>

  <main class="main-layout">
    <section class="panel" aria-label="Discovery Panel">
      <div class="panel-header">
        <h2>Discovered Profiles</h2>
        <div style="position:relative;margin-top:8px;">
          <input type="text" id="profileSearch" class="name-input" placeholder="Search profiles..." aria-label="Filter discovered profiles" style="padding-right:30px;">
          <button type="button" id="clearSearch" aria-label="Clear search" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#94a3b8;font-size:1.1rem;padding:2px 4px;line-height:1;display:none;">&times;</button>
        </div>
      </div>
      <div class="panel-body" id="discoveryPanel">
        <div class="loading">Loading profiles...</div>
      </div>
    </section>

    <section class="panel" aria-label="Configuration Panel">
      <div class="tab-bar" role="tablist" aria-label="Configuration tabs">
        <button class="tab-btn active" role="tab" aria-selected="true" aria-controls="configTab" id="configTabBtn" type="button">Config</button>
        <button class="tab-btn" role="tab" aria-selected="false" aria-controls="backupTab" id="backupTabBtn" type="button">Backups</button>
      </div>
      <div class="panel-body">
        <div class="tab-content active" id="configTab" role="tabpanel" aria-labelledby="configTabBtn">
          <div id="statusBanner"></div>
          <h3 class="section-heading">Current Config</h3>
          <label for="currentConfig" class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);">Current AWS config file contents</label>
          <textarea class="config-textarea" id="currentConfig" readonly aria-label="Current AWS config file contents"></textarea>

          <div id="existingProfilesList"></div>

          <div style="margin-top:16px; display:flex; gap:8px;">
            <button class="btn btn-primary save-btn-top" id="saveBtnTop" type="button" disabled>Save</button>
          </div>

          <h3 class="section-heading" style="margin-top:16px;">Selected Profiles</h3>
          <div id="selectedProfiles">
            <p class="placeholder-msg">Select profiles from the Discovery Panel to add them here.</p>
          </div>

          <div style="margin-top:16px; display:flex; gap:8px;">
            <button class="btn btn-primary save-btn-bottom" id="saveBtn" type="button" disabled>Save</button>
          </div>
        </div>

        <div class="tab-content" id="backupTab" role="tabpanel" aria-labelledby="backupTabBtn">
          <h3 class="section-heading">Available Backups</h3>
          <div id="backupList">
            <p class="placeholder-msg">Loading backups...</p>
          </div>
          <div id="backupPreviewArea"></div>
        </div>
      </div>
    </section>
  </main>

  <script>
    // ── State ──
    const state = {
      profiles: [],
      existingProfileNames: new Set(),
      existingConfigRaw: '',
      sso: {},
      selectedProfiles: new Map(),
      validationErrors: new Map(),
      saving: false,
      saveResult: null
    };

    // ── Sanitization (mirrors naming.ts sanitizeName) ──
    function sanitizeName(raw) {
      if (!raw) return '';
      return raw
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    // ── Validation ──
    function validateAll() {
      state.validationErrors.clear();
      const customNames = [];
      for (const [key, sel] of state.selectedProfiles) {
        customNames.push({ key, name: sel.customName });
      }
      for (const { key, name } of customNames) {
        const sanitized = sanitizeName(name);
        if (!sanitized) {
          state.validationErrors.set(key, 'Profile name is required.');
          continue;
        }
        if (state.existingProfileNames.has(sanitized)) {
          state.validationErrors.set(key, 'Profile name already exists in config.');
          continue;
        }
        const dupes = customNames.filter(c => c.key !== key && sanitizeName(c.name) === sanitized);
        if (dupes.length > 0) {
          state.validationErrors.set(key, 'Duplicate profile name.');
        }
      }
    }

    function isSaveDisabled() {
      return state.selectedProfiles.size === 0 || state.validationErrors.size > 0 || state.saving;
    }

    // ── Rendering ──
    function renderDiscovery() {
      const panel = document.getElementById('discoveryPanel');
      if (state.profiles.length === 0) {
        panel.innerHTML = '<p class="placeholder-msg">No profiles discovered.</p>';
        return;
      }

      const term = getSearchTerm();
      const filtered = state.profiles.filter(p => matchesSearch(p, term));

      if (filtered.length === 0) {
        panel.innerHTML = '<p class="placeholder-msg">No profiles match your search.</p>';
        return;
      }

      const prod = filtered.filter(p => p.isProduction);
      const nonProd = filtered.filter(p => !p.isProduction);
      let html = '';

      if (prod.length > 0) {
        html += '<h3 class="section-heading">\\u26a0\\ufe0f Production</h3>';
        for (const p of prod) {
          html += renderProfileCard(p);
        }
      }

      if (nonProd.length > 0) {
        html += '<h3 class="section-heading">Non-Production</h3>';
        for (const p of nonProd) {
          html += renderProfileCard(p);
        }
      }

      panel.innerHTML = html;
    }

    function renderProfileCard(p) {
      const isSelected = state.selectedProfiles.has(p.profileName);
      const isConfigured = state.existingProfileNames.has(p.profileName);
      let cls = 'profile-card';
      if (isSelected) cls += ' selected';
      if (isConfigured) cls += ' disabled';

      let badges = '';
      if (p.isProduction) badges += '<span class="profile-card-badge badge-prod">\\u26a0\\ufe0f PROD</span>';
      if (isConfigured) badges += '<span class="profile-card-badge badge-configured">Configured</span>';

      const clickAttr = isConfigured ? '' : ' onclick="toggleProfile(\\''+escapeAttr(p.profileName)+'\\')" tabindex="0" role="button" aria-pressed="'+isSelected+'"';

      return '<div class="'+cls+'"'+clickAttr+'>'
        + '<div class="profile-card-name">'+escapeHtml(p.profileName)+badges+'</div>'
        + '<div class="profile-card-details">'+escapeHtml(p.accountName)+' ('+escapeHtml(p.accountId)+') &mdash; '+escapeHtml(p.roleName)+'</div>'
        + '</div>';
    }

    function renderSelectedProfiles() {
      const container = document.getElementById('selectedProfiles');
      if (state.selectedProfiles.size === 0) {
        container.innerHTML = '<p class="placeholder-msg">Select profiles from the Discovery Panel to add them here.</p>';
        updateSaveBtn();
        return;
      }

      let html = '';
      for (const [key, sel] of state.selectedProfiles) {
        const err = state.validationErrors.get(key) || '';
        const errCls = err ? ' error' : '';
        const inputId = 'name-' + escapeAttr(key);
        const prodBadge = sel.isProduction ? '<span class="profile-card-badge badge-prod">\\u26a0\\ufe0f PROD</span>' : '';
        const configuredBadge = state.existingProfileNames.has(sanitizeName(sel.customName)) ? '<span class="profile-card-badge badge-configured">Already in config</span>' : '';
        html += '<div class="selected-profile">'
          + '<div class="selected-profile-header">'
          + '<div class="selected-profile-info">'+escapeHtml(sel.accountName)+' ('+escapeHtml(sel.accountId)+') &mdash; '+escapeHtml(sel.roleName)+prodBadge+configuredBadge+'</div>'
          + '<button class="btn-remove" type="button" onclick="removeProfile(\\''+escapeAttr(key)+'\\')" aria-label="Remove profile '+escapeAttr(sel.customName)+'">\\u00d7</button>'
          + '</div>'
          + '<label for="'+inputId+'" style="font-size:0.78rem;color:#475569;display:block;margin-bottom:2px;">Profile name</label>'
          + '<input class="name-input'+errCls+'" type="text" id="'+inputId+'" value="'+escapeAttr(sel.customName)+'" oninput="renameProfile(\\''+escapeAttr(key)+'\\', this.value)" aria-label="Profile name for '+escapeAttr(sel.accountName)+'">'
          + (err ? '<div class="validation-error" role="alert">'+escapeHtml(err)+'</div>' : '')
          + '</div>';
      }
      container.innerHTML = html;
      updateSaveBtn();
    }

    function updateSaveBtn() {
      const disabled = isSaveDisabled();
      document.getElementById('saveBtn').disabled = disabled;
      document.getElementById('saveBtnTop').disabled = disabled;
    }

    function renderConfig() {
      const ta = document.getElementById('currentConfig');
      ta.value = state.existingConfigRaw || 'No existing config found.';
      renderExistingProfiles();
    }

    function renderExistingProfiles() {
      const container = document.getElementById('existingProfilesList');
      const configured = state.profiles.filter(p => state.existingProfileNames.has(p.profileName));
      if (configured.length === 0) {
        container.innerHTML = '';
        return;
      }
      let html = '<h3 class="section-heading" style="margin-top:16px;">Already Configured (' + configured.length + ')</h3>';
      for (const p of configured) {
        const prodBadge = p.isProduction ? '<span class="profile-card-badge badge-prod">\\u26a0\\ufe0f PROD</span>' : '';
        html += '<div style="padding:6px 10px;margin-bottom:4px;border:1px solid #e2e8f0;border-radius:4px;background:#f1f5f9;display:flex;align-items:center;justify-content:space-between;">'
          + '<div style="opacity:0.7;">'
          + '<span style="font-size:0.85rem;font-weight:500;color:#475569;">'+escapeHtml(p.profileName)+prodBadge+'</span>'
          + '<span style="font-size:0.75rem;color:#94a3b8;margin-left:8px;">'+escapeHtml(p.accountName)+' &mdash; '+escapeHtml(p.roleName)+'</span>'
          + '</div>'
          + '<button class="btn-remove" type="button" onclick="deleteProfile(\\''+escapeAttr(p.profileName)+'\\')" aria-label="Delete profile '+escapeAttr(p.profileName)+'" title="Remove from config">\\u00d7</button>'
          + '</div>';
      }
      container.innerHTML = html;
    }

    async function deleteProfile(profileName) {
      if (!confirm('Remove profile \\u201c' + profileName + '\\u201d from your config? A backup will be created first.')) return;
      try {
        const res = await fetch('/api/delete-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileName })
        });
        const data = await res.json();
        if (data.success) {
          showStatus('Removed \\u201c' + profileName + '\\u201d. Backup: ' + (data.backupPath || 'none'), 'success');
          await loadData();
        } else {
          showStatus(data.error || 'Delete failed.', 'error');
        }
      } catch (e) {
        showStatus('Failed to delete. Check that the server is still running.', 'error');
      }
    }

    function showStatus(msg, type) {
      const banner = document.getElementById('statusBanner');
      banner.innerHTML = '<div class="status-banner status-'+type+'">'+escapeHtml(msg)+'</div>';
      setTimeout(() => { banner.innerHTML = ''; }, 8000);
    }

    // ── Actions ──
    function toggleProfile(profileName) {
      if (state.selectedProfiles.has(profileName)) {
        state.selectedProfiles.delete(profileName);
      } else {
        const p = state.profiles.find(pr => pr.profileName === profileName);
        if (!p) return;
        state.selectedProfiles.set(profileName, {
          originalName: p.profileName,
          customName: p.profileName,
          accountId: p.accountId,
          accountName: p.accountName,
          roleName: p.roleName,
          isProduction: p.isProduction
        });
      }
      validateAll();
      renderDiscovery();
      renderSelectedProfiles();
    }

    function removeProfile(key) {
      state.selectedProfiles.delete(key);
      validateAll();
      renderDiscovery();
      renderSelectedProfiles();
    }

    function renameProfile(key, value) {
      const sel = state.selectedProfiles.get(key);
      if (!sel) return;
      sel.customName = value;
      validateAll();
      // Update error display without full re-render to keep cursor position
      const err = state.validationErrors.get(key) || '';
      const inputEl = document.getElementById('name-' + key);
      if (inputEl) {
        if (err) {
          inputEl.classList.add('error');
          let errDiv = inputEl.nextElementSibling;
          if (!errDiv || !errDiv.classList.contains('validation-error')) {
            errDiv = document.createElement('div');
            errDiv.className = 'validation-error';
            errDiv.setAttribute('role', 'alert');
            inputEl.parentNode.insertBefore(errDiv, inputEl.nextSibling);
          }
          errDiv.textContent = err;
        } else {
          inputEl.classList.remove('error');
          const errDiv = inputEl.nextElementSibling;
          if (errDiv && errDiv.classList.contains('validation-error')) {
            errDiv.remove();
          }
        }
      }
      updateSaveBtn();
    }

    async function save() {
      if (isSaveDisabled()) return;
      state.saving = true;
      updateSaveBtn();

      const selections = [];
      for (const [, sel] of state.selectedProfiles) {
        selections.push({
          originalProfileName: sel.originalName,
          customProfileName: sanitizeName(sel.customName),
          accountId: sel.accountId,
          accountName: sel.accountName,
          roleName: sel.roleName,
          isProduction: sel.isProduction
        });
      }

      try {
        const res = await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selections })
        });
        const data = await res.json();
        if (data.success) {
          showStatus('Saved ' + data.writtenCount + ' profile(s). Backup: ' + (data.backupPath || 'none'), 'success');
          state.selectedProfiles.clear();
          state.validationErrors.clear();
          await loadData();
        } else {
          showStatus(data.error || 'Save failed.', 'error');
        }
      } catch (e) {
        showStatus('Failed to save. Check that the server is still running.', 'error');
      }

      state.saving = false;
      updateSaveBtn();
    }

    async function loadData() {
      try {
        const res = await fetch('/api/data');
        const data = await res.json();
        state.profiles = data.profiles || [];
        state.existingProfileNames = new Set(data.existingConfig?.profileNames || []);
        state.existingConfigRaw = data.existingConfig?.raw || '';
        state.sso = data.sso || {};
        validateAll();
        renderDiscovery();
        renderSelectedProfiles();
        renderConfig();
      } catch (e) {
        document.getElementById('discoveryPanel').innerHTML =
          '<div class="status-banner status-error">Failed to load discovery data. Please restart the tool.</div>';
      }
    }

    async function loadBackups() {
      const list = document.getElementById('backupList');
      try {
        const res = await fetch('/api/backups');
        const data = await res.json();
        const backups = data.backups || [];
        if (backups.length === 0) {
          list.innerHTML = '<p class="placeholder-msg">No backups available.</p>';
          return;
        }
        let html = '';
        for (const b of backups) {
          const ts = new Date(b.timestamp).toLocaleString();
          html += '<div class="backup-item">'
            + '<div><div class="backup-name">'+escapeHtml(b.filename)+'</div>'
            + '<div class="backup-info">'+escapeHtml(ts)+' &mdash; '+b.size+' bytes</div></div>'
            + '<div class="backup-actions">'
            + '<button class="btn btn-secondary" type="button" onclick="previewBackup(\\''+escapeAttr(b.path)+'\\')" aria-label="Preview backup '+escapeAttr(b.filename)+'">Preview</button>'
            + '<button class="btn btn-primary" type="button" onclick="restoreBackup(\\''+escapeAttr(b.path)+'\\')" aria-label="Restore backup '+escapeAttr(b.filename)+'">Restore</button>'
            + '</div></div>';
        }
        list.innerHTML = html;
      } catch (e) {
        list.innerHTML = '<div class="status-banner status-error">Failed to load backups.</div>';
      }
    }

    async function previewBackup(backupPath) {
      const area = document.getElementById('backupPreviewArea');
      try {
        const res = await fetch('/api/backups');
        const data = await res.json();
        const backup = (data.backups || []).find(b => b.path === backupPath);
        if (!backup) { area.innerHTML = '<p class="placeholder-msg">Backup not found.</p>'; return; }
        // Fetch the backup content via a dedicated preview mechanism
        // Since we don't have a dedicated preview endpoint, we read from restore info
        // For simplicity, we fetch the file content through a query param
        const previewRes = await fetch('/api/backup-preview?path=' + encodeURIComponent(backupPath));
        if (previewRes.ok) {
          const previewData = await previewRes.json();
          area.innerHTML = '<h3 class="section-heading" style="margin-top:12px;">Backup Preview</h3>'
            + '<label for="backupPreviewText" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);">Backup file preview</label>'
            + '<textarea class="backup-preview" id="backupPreviewText" readonly aria-label="Backup file preview">'+escapeHtml(previewData.content || '')+'</textarea>';
        } else {
          area.innerHTML = '<p class="placeholder-msg">Could not load backup preview.</p>';
        }
      } catch (e) {
        area.innerHTML = '<div class="status-banner status-error">Failed to preview backup.</div>';
      }
    }

    async function restoreBackup(backupPath) {
      if (!confirm('Restore this backup? A new backup of the current config will be created first.')) return;
      try {
        const res = await fetch('/api/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ backupPath })
        });
        const data = await res.json();
        if (data.success) {
          showStatus('Restored successfully. New backup created at: ' + (data.newBackupPath || 'unknown'), 'success');
          await loadData();
          await loadBackups();
          // Switch to config tab to show restored content
          switchTab('configTab');
        } else {
          showStatus(data.error || 'Restore failed.', 'error');
        }
      } catch (e) {
        showStatus('Failed to restore. Check that the server is still running.', 'error');
      }
    }

    async function shutdown() {
      try {
        await fetch('/api/shutdown', { method: 'POST' });
      } catch (e) {
        // Expected — server shuts down
      }
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#64748b;font-size:1.1rem;">Server stopped. You can close this tab.</div>';
    }

    // ── Tabs ──
    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');
      const btnId = tabId + 'Btn';
      const btn = document.getElementById(btnId);
      if (btn) { btn.classList.add('active'); btn.setAttribute('aria-selected', 'true'); }
      if (tabId === 'backupTab') loadBackups();
    }

    // ── Helpers ──
    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function escapeAttr(str) {
      if (!str) return '';
      return String(str).replace(/&/g,'&amp;').replace(/'/g,'&#39;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // ── Search / Filter ──
    function getSearchTerm() {
      const el = document.getElementById('profileSearch');
      return el ? el.value.toLowerCase().trim() : '';
    }

    function matchesSearch(profile, term) {
      if (!term) return true;
      return profile.profileName.toLowerCase().includes(term)
        || profile.accountName.toLowerCase().includes(term)
        || profile.accountId.includes(term)
        || profile.roleName.toLowerCase().includes(term);
    }

    // ── Init ──
    document.getElementById('saveBtn').addEventListener('click', save);
    document.getElementById('saveBtnTop').addEventListener('click', save);
    document.getElementById('doneBtn').addEventListener('click', shutdown);
    document.getElementById('configTabBtn').addEventListener('click', () => switchTab('configTab'));
    document.getElementById('backupTabBtn').addEventListener('click', () => switchTab('backupTab'));
    document.getElementById('profileSearch').addEventListener('input', () => {
      const btn = document.getElementById('clearSearch');
      btn.style.display = document.getElementById('profileSearch').value ? 'block' : 'none';
      renderDiscovery();
    });
    document.getElementById('clearSearch').addEventListener('click', () => {
      const input = document.getElementById('profileSearch');
      input.value = '';
      document.getElementById('clearSearch').style.display = 'none';
      input.focus();
      renderDiscovery();
    });

    loadData();
  </script>
</body>
</html>`;
}
