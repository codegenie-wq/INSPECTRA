/**
 * INSPECTRA Product Analysis Page Logic
 * Single source of truth from DataLogService.
 * Renders summary KPI cards, interactive product performance table,
 * search filter, and individual product details inspection card.
 */

(function() {
  'use strict';

  // KPI elements
  const statTotalProducts = document.getElementById('stat-total-products');
  const statPassed = document.getElementById('stat-passed');
  const statFailed = document.getElementById('stat-failed');
  const statReview = document.getElementById('stat-review');
  const statPassRate = document.getElementById('stat-pass-rate');

  // Containers
  const emptyStateBanner = document.getElementById('empty-state-banner');
  const productContentSection = document.getElementById('product-content-section');
  const productPerformanceTbody = document.getElementById('product-performance-tbody');
  const productTableCount = document.getElementById('product-table-count');
  const productSearchInput = document.getElementById('product-search-input');

  // Details card elements
  const detailProductId = document.getElementById('detail-product-id');
  const detailInspectionTime = document.getElementById('detail-inspection-time');
  const detailDecisionBadge = document.getElementById('detail-decision-badge');
  const detailDecision = document.getElementById('detail-decision');
  const detailStatus = document.getElementById('detail-status');
  const detailConfidence = document.getElementById('detail-confidence');
  const detailDefect = document.getElementById('detail-defect');
  const detailSeverity = document.getElementById('detail-severity');
  const detailArea = document.getElementById('detail-area');
  const detailLocation = document.getElementById('detail-location');

  let selectedProductId = null;

  function renderPage() {
    if (!window.dataLogService) return;

    const counters = window.dataLogService.getCounters();
    const records = window.dataLogService.getRecords();

    // 1. Update KPI Counters (Strictly matching Data Log)
    if (statTotalProducts) statTotalProducts.textContent = counters.total;
    if (statPassed) statPassed.textContent = counters.pass;
    if (statFailed) statFailed.textContent = counters.fail;
    if (statReview) statReview.textContent = counters.review;
    if (statPassRate) statPassRate.textContent = counters.passRate;

    // 2. Empty State Handling
    if (records.length === 0) {
      if (emptyStateBanner) emptyStateBanner.style.display = 'block';
      if (productContentSection) productContentSection.style.display = 'none';
      return;
    } else {
      if (emptyStateBanner) emptyStateBanner.style.display = 'none';
      if (productContentSection) productContentSection.style.display = 'grid';
    }

    // 3. Filter Records by Search Query
    const query = (productSearchInput?.value || '').trim().toUpperCase();
    const filtered = query
      ? records.filter(r => String(r.product_id || '').toUpperCase().includes(query) || String(r.defect || '').toUpperCase().includes(query))
      : records;

    if (productTableCount) {
      productTableCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'UNIT' : 'UNITS'}`;
    }

    // 4. Populate Product Performance Table
    if (productPerformanceTbody) {
      if (filtered.length === 0) {
        productPerformanceTbody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; padding: 24px; color: #8b949e; font-family: 'JetBrains Mono', monospace;">
              No products matching "${query}"
            </td>
          </tr>`;
      } else {
        productPerformanceTbody.innerHTML = filtered.map(r => {
          const isSelected = (r.product_id === selectedProductId);
          let badgeClass = 'badge-review';
          let icon = '🟠';
          if (r.decision === 'PASS') {
            badgeClass = 'badge-pass';
            icon = '🟢';
          } else if (r.decision === 'FAIL') {
            badgeClass = 'badge-fail';
            icon = '🔴';
          }

          const conf = typeof r.confidence === 'number' ? `${r.confidence.toFixed(1)}%` : (r.confidence || '—');

          return `
            <tr
              class="product-row-clickable ${isSelected ? 'selected-product-row' : ''}"
              data-product-id="${r.product_id}"
            >
              <td style="color: var(--color-cyan); font-family: 'JetBrains Mono', monospace; font-weight: 700;">
                ${r.product_id}
              </td>
              <td>
                <span class="badge-decision ${badgeClass}">
                  ${icon} ${r.decision}
                </span>
              </td>
              <td style="font-family: 'JetBrains Mono', monospace; color: #e6edf3;">
                ${conf}
              </td>
              <td style="color: ${r.decision === 'FAIL' ? '#ff7b72' : '#8b949e'}; font-weight: 600;">
                ${r.defect || '—'}
              </td>
              <td>
                <button
                  type="button"
                  style="
                    background: rgba(0, 240, 255, 0.1);
                    border: 1px solid rgba(0, 240, 255, 0.3);
                    color: var(--color-cyan);
                    padding: 3px 8px;
                    border-radius: 4px;
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 0.7rem;
                    cursor: pointer;
                  "
                >
                  VIEW →
                </button>
              </td>
            </tr>`;
        }).join('');

        // Bind row click events
        productPerformanceTbody.querySelectorAll('tr[data-product-id]').forEach(row => {
          row.addEventListener('click', () => {
            const pId = row.getAttribute('data-product-id');
            selectProduct(pId);
          });
        });
      }
    }

    // Default select first product if none selected or selected product was deleted
    if (!selectedProductId || !records.some(r => r.product_id === selectedProductId)) {
      if (filtered.length > 0) {
        selectProduct(filtered[0].product_id);
      }
    } else {
      displayProductDetails(selectedProductId);
    }
  }

  function selectProduct(productId) {
    selectedProductId = productId;
    // Highlight table row
    if (productPerformanceTbody) {
      productPerformanceTbody.querySelectorAll('tr[data-product-id]').forEach(r => {
        if (r.getAttribute('data-product-id') === productId) {
          r.classList.add('selected-product-row');
        } else {
          r.classList.remove('selected-product-row');
        }
      });
    }
    displayProductDetails(productId);
  }

  function displayProductDetails(productId) {
    if (!window.dataLogService) return;
    const record = window.dataLogService.getRecordById(productId);
    if (!record) return;

    if (detailProductId) detailProductId.textContent = record.product_id;
    if (detailInspectionTime) {
      detailInspectionTime.textContent = `INSPECTION TIME: ${record.time_str || '—'} (${record.timestamp || 'RECENT'})`;
    }

    let badgeClass = 'badge-review';
    let icon = '🟠';
    if (record.decision === 'PASS') {
      badgeClass = 'badge-pass';
      icon = '🟢';
    } else if (record.decision === 'FAIL') {
      badgeClass = 'badge-fail';
      icon = '🔴';
    }

    if (detailDecisionBadge) {
      detailDecisionBadge.innerHTML = `
        <span class="badge-decision ${badgeClass}">
          ${icon} ${record.decision}
        </span>`;
    }

    if (detailDecision) detailDecision.textContent = record.decision || '—';
    if (detailStatus) detailStatus.textContent = record.status || '—';
    if (detailConfidence) {
      detailConfidence.textContent = typeof record.confidence === 'number'
        ? `${record.confidence.toFixed(1)}%`
        : (record.confidence ? `${record.confidence}%` : '—');
    }
    if (detailDefect) detailDefect.textContent = record.defect || '—';
    if (detailSeverity) {
      detailSeverity.textContent = record.severity || '—';
      detailSeverity.style.color = (record.severity === 'HIGH' || record.severity === 'CRITICAL') ? 'var(--color-crimson)' : '#fff';
    }
    if (detailArea) detailArea.textContent = record.affected_area || '0%';
    if (detailLocation) detailLocation.textContent = record.location || '—';
  }

  // Search input event
  if (productSearchInput) {
    productSearchInput.addEventListener('input', () => {
      renderPage();
    });
  }

  // Reactive updates on new inspections
  if (window.dataLogService) {
    window.dataLogService.subscribe(() => renderPage());
  }
  window.addEventListener('inspectra:data-log-updated', () => renderPage());
  window.addEventListener('storage', () => renderPage());

  document.addEventListener('DOMContentLoaded', () => {
    renderPage();
  });

  renderPage();
})();
