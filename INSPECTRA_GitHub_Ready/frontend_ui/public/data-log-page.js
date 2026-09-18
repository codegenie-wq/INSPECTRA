/**
 * INSPECTRA Dedicated Data Log Page Logic
 * Renders stored inspection records, summary KPI cards, CSV export, and clear action.
 */

(function() {
  'use strict';

  // Cached DOM elements
  const statTotal = document.getElementById('stat-total');
  const statPass = document.getElementById('stat-pass');
  const statFail = document.getElementById('stat-fail');
  const statReview = document.getElementById('stat-review');
  const statPassRate = document.getElementById('stat-pass-rate');
  const logCountBadge = document.getElementById('log-count-badge');
  const telemetryTableBody = document.getElementById('telemetry-table-body');
  const btnExportCsv = document.getElementById('btn-export-csv');
  const btnClearLog = document.getElementById('btn-clear-log');

  function renderUI() {
    if (!window.dataLogService) return;

    const counters = window.dataLogService.getCounters();
    const records = window.dataLogService.getRecords();

    // 1. Update Summary KPI Cards
    if (statTotal) statTotal.textContent = counters.total;
    if (statPass) statPass.textContent = counters.pass;
    if (statFail) statFail.textContent = counters.fail;
    if (statReview) statReview.textContent = counters.review;
    if (statPassRate) statPassRate.textContent = counters.passRate;

    if (logCountBadge) {
      logCountBadge.textContent = `${counters.total} ${counters.total === 1 ? 'RECORD' : 'RECORDS'}`;
    }

    // 2. Render Data Log Table
    if (!telemetryTableBody) return;

    if (records.length === 0) {
      telemetryTableBody.innerHTML = `
        <tr id="empty-state-row">
          <td colspan="10" class="telemetry-empty">
            No inspection records logged in this session yet.<br>
            Upload a sample or start camera inspection in the <a href="/" style="color:#00f0ff; text-decoration:underline;">Inspection Studio</a> to generate records.
          </td>
        </tr>`;
      return;
    }

    telemetryTableBody.innerHTML = records.map(r => {
      let badgeClass = 'badge-review';
      let icon = '🟠';
      if (r.decision === 'PASS') {
        badgeClass = 'badge-pass';
        icon = '🟢';
      } else if (r.decision === 'FAIL') {
        badgeClass = 'badge-fail';
        icon = '🔴';
      }

      const confText = typeof r.confidence === 'number'
        ? `${r.confidence.toFixed(1)}%`
        : (r.confidence ? `${r.confidence}%` : '—');

      return `
        <tr>
          <td style="color:#8b949e; font-family:'JetBrains Mono', monospace;">${r.time_str || '—'}</td>
          <td style="color:#00f0ff; font-weight:700; font-family:'JetBrains Mono', monospace;">${r.product_id || '—'}</td>
          <td style="color:#e6edf3; font-family:'JetBrains Mono', monospace; font-size:0.75rem;">👤 ${r.operator || 'Operator'}</td>
          <td>
            <span class="badge-decision ${badgeClass}">
              ${icon} ${r.decision || 'REVIEW'}
            </span>
          </td>
          <td style="font-weight:600; color:#e6edf3;">${r.status || '—'}</td>
          <td style="font-weight:600; color:${r.decision === 'FAIL' ? '#ff7b72' : '#f0f6fc'};">${r.defect || '—'}</td>
          <td style="color:#c9d1d9;">${confText}</td>
          <td style="color:${r.severity === 'HIGH' || r.severity === 'CRITICAL' ? '#ff1744' : '#8b949e'}; font-weight:600;">${r.severity || '—'}</td>
          <td style="color:#c9d1d9;">${r.affected_area || '0%'}</td>
          <td style="color:#8b949e; font-size:0.75rem;">${r.location || '—'}</td>
        </tr>`;
    }).join('');
  }

  // Bind Actions
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', () => {
      window.dataLogService?.exportCsv();
    });
  }

  if (btnClearLog) {
    btnClearLog.addEventListener('click', () => {
      const confirmed = window.confirm(
        'Are you sure you want to clear all inspection records?\n\nThis will remove all stored inspection history from this browser.'
      );
      if (confirmed) {
        window.dataLogService?.clearLog();
        renderUI();
      }
    });
  }

  // Listen for storage / log updates
  if (window.dataLogService) {
    window.dataLogService.subscribe(() => renderUI());
  }
  window.addEventListener('inspectra:data-log-updated', () => renderUI());
  window.addEventListener('storage', () => renderUI());

  // Initial render on DOM load
  document.addEventListener('DOMContentLoaded', () => {
    renderUI();
  });

  // Also trigger immediately in case script loads after DOMContentLoaded
  renderUI();

})();
