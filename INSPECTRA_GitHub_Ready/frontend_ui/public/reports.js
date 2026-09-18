/**
 * INSPECTRA Quality Inspection Report Generator Logic
 * Dynamically computes executive batch summaries, defect incidence, and recent records
 * using DataLogService as the ground truth.
 */

(function() {
  'use strict';

  // Elements
  const reportDocumentPanel = document.getElementById('report-document-panel');
  const reportEmptyState = document.getElementById('report-empty-state');
  const reportGeneratedTime = document.getElementById('report-generated-time');

  // Summary KPI elements
  const reportTotal = document.getElementById('report-total');
  const reportPass = document.getElementById('report-pass');
  const reportPassRate = document.getElementById('report-pass-rate');
  const reportFail = document.getElementById('report-fail');
  const reportDefectRate = document.getElementById('report-defect-rate');
  const reportReview = document.getElementById('report-review');
  const reportAvgConfidence = document.getElementById('report-avg-confidence');

  // Severity elements
  const reportSevHigh = document.getElementById('report-sev-high');
  const reportSevMed = document.getElementById('report-sev-med');
  const reportSevLow = document.getElementById('report-sev-low');

  // Lists
  const reportTopDefectsList = document.getElementById('report-top-defects-list');
  const reportRecentTbody = document.getElementById('report-recent-tbody');

  // Actions
  const btnExportReport = document.getElementById('btn-export-report');
  const btnExportReportCsv = document.getElementById('btn-export-report-csv');

  function renderReport() {
    if (!window.dataLogService) return;

    const summary = window.dataLogService.getAnalyticsSummary();
    const defectDist = window.dataLogService.getDefectDistribution();
    const records = window.dataLogService.getRecords();

    // 1. Empty State Handling
    if (summary.totalInspected === 0) {
      if (reportEmptyState) reportEmptyState.style.display = 'block';
      if (reportDocumentPanel) reportDocumentPanel.style.display = 'none';
      return;
    }

    if (reportEmptyState) reportEmptyState.style.display = 'none';
    if (reportDocumentPanel) reportDocumentPanel.style.display = 'block';

    // 2. Timestamp
    if (reportGeneratedTime) {
      const now = new Date();
      reportGeneratedTime.textContent = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
    }

    // 3. Batch Summary KPIs
    if (reportTotal) reportTotal.textContent = summary.totalInspected;
    if (reportPass) reportPass.textContent = summary.passCount;
    if (reportPassRate) reportPassRate.textContent = `PASS RATE: ${summary.passRate}`;
    if (reportFail) reportFail.textContent = summary.failCount;
    if (reportDefectRate) reportDefectRate.textContent = `DEFECT RATE: ${summary.defectRate}`;
    if (reportReview) reportReview.textContent = summary.reviewCount;
    if (reportAvgConfidence) reportAvgConfidence.textContent = summary.averageConfidence;

    // 4. Severity Breakdown
    if (reportSevHigh) reportSevHigh.textContent = summary.highSeverityCount;
    if (reportSevMed) reportSevMed.textContent = summary.mediumSeverityCount;
    if (reportSevLow) reportSevLow.textContent = summary.lowSeverityCount;

    // 5. Top Detected Defects
    if (reportTopDefectsList) {
      const activeDefects = defectDist.items.filter(d => d.count > 0);
      if (activeDefects.length === 0) {
        reportTopDefectsList.innerHTML = `
          <div style="color: #00e676; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; padding: 12px;">
            🟢 ZERO DEFECTS DETECTED ACROSS ALL ${summary.totalInspected} PRODUCTS.
          </div>`;
      } else {
        reportTopDefectsList.innerHTML = activeDefects.map(d => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.04); font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;">
            <span style="color: #fff; font-weight: 600;">${d.name.toUpperCase()}</span>
            <span style="color: var(--color-cyan); font-weight: 700;">${d.count} (${d.percentageStr})</span>
          </div>
        `).join('');
      }
    }

    // 6. Recent Inspections Table
    if (reportRecentTbody) {
      const recent = records.slice(0, 8);
      reportRecentTbody.innerHTML = recent.map(r => {
        let badgeClass = 'badge-review';
        let icon = '🟠';
        if (r.decision === 'PASS') {
          badgeClass = 'badge-pass';
          icon = '🟢';
        } else if (r.decision === 'FAIL') {
          badgeClass = 'badge-fail';
          icon = '🔴';
        }

        const conf = typeof r.confidence === 'number' ? `${r.confidence.toFixed(1)}%` : (r.confidence ? `${r.confidence}%` : '—');

        return `
          <tr>
            <td style="color: var(--color-cyan); font-family: 'JetBrains Mono', monospace; font-weight: 700;">
              ${r.product_id || '—'}
            </td>
            <td>
              <span class="badge-decision ${badgeClass}" style="font-size: 0.7rem; padding: 2px 8px;">
                ${icon} ${r.decision || 'REVIEW'}
              </span>
            </td>
            <td style="color: ${r.decision === 'FAIL' ? '#ff7b72' : '#8b949e'}; font-weight: 600;">
              ${r.defect || '—'}
            </td>
            <td style="color: ${(r.severity === 'HIGH' || r.severity === 'CRITICAL') ? 'var(--color-crimson)' : '#8b949e'}; font-weight: 600;">
              ${r.severity || '—'}
            </td>
            <td style="color: #e6edf3; font-family: 'JetBrains Mono', monospace;">
              ${conf}
            </td>
          </tr>`;
      }).join('');
    }
  }

  // Bind Actions
  if (btnExportReport) {
    btnExportReport.addEventListener('click', () => {
      window.print();
    });
  }

  if (btnExportReportCsv) {
    btnExportReportCsv.addEventListener('click', () => {
      window.dataLogService?.exportCsv();
    });
  }

  // Reactive updates
  if (window.dataLogService) {
    window.dataLogService.subscribe(() => renderReport());
  }
  window.addEventListener('inspectra:data-log-updated', () => renderReport());
  window.addEventListener('storage', () => renderReport());

  document.addEventListener('DOMContentLoaded', () => {
    renderReport();
  });

  renderReport();
})();
