/**
 * INSPECTRA Production Telemetry & Data Log Service
 * Single source of truth for persistent product inspection records,
 * sequential product identification, configurable decision thresholds, and analytics.
 */

(function(global) {
  'use strict';

  const STORAGE_KEY = 'inspectra_inspection_log';
  const COUNTER_KEY = 'inspectra_product_counter';

  // Configurable AI Confidence threshold for ASTM Pass qualification
  let confidenceThreshold = 75.0;

  class DataLogService {
    constructor() {
      this._subscribers = new Set();
      this._initCounter();
    }

    /**
     * Get or set the confidence threshold (in percentage, 0-100)
     */
    getConfidenceThreshold() {
      return confidenceThreshold;
    }

    setConfidenceThreshold(threshold) {
      if (typeof threshold === 'number' && threshold >= 0 && threshold <= 100) {
        confidenceThreshold = threshold;
      }
    }

    /**
     * Set the current authenticated operator context
     */
    setCurrentUser(user) {
      this._currentUser = user;
      this._initCounter();
      this._notify(null);
    }

    /**
     * Retrieve the current authenticated operator context
     */
    getCurrentUser() {
      if (this._currentUser) return this._currentUser;
      try {
        const cached = localStorage.getItem('inspectra_current_user');
        if (cached) {
          this._currentUser = JSON.parse(cached);
          return this._currentUser;
        }
      } catch (_) {}
      return null;
    }

    /**
     * Storage key partitioned per operator (with automatic migration from legacy store)
     */
    _getStorageKey() {
      const user = this.getCurrentUser();
      const userKey = (user && (user.username || user.id))
        ? `inspectra_inspection_log_${user.username || user.id}`
        : STORAGE_KEY;

      // Migrate existing general records if user-specific log is empty
      if (user && !localStorage.getItem(userKey)) {
        const legacy = localStorage.getItem(STORAGE_KEY);
        if (legacy) {
          localStorage.setItem(userKey, legacy);
        }
      }
      return userKey;
    }

    _getCounterKey() {
      const user = this.getCurrentUser();
      return (user && (user.username || user.id))
        ? `inspectra_product_counter_${user.username || user.id}`
        : COUNTER_KEY;
    }

    /**
     * Initialize counter from storage or highest ID in existing logs
     */
    _initCounter() {
      const counterKey = this._getCounterKey();
      const stored = localStorage.getItem(counterKey);
      let val = stored !== null ? parseInt(stored, 10) : 0;
      if (isNaN(val)) val = 0;

      // Always scan existing records to ensure counter is at least as high as any stored record
      const records = this.getRecords();
      let maxNum = 0;
      for (const r of records) {
        const match = String(r.product_id || '').match(/STL-\d{4}-(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }

      const finalVal = Math.max(val, maxNum);
      localStorage.setItem(counterKey, String(finalVal));
      return finalVal;
    }

    /**
     * Generate the next sequential Product ID: STL-YYYY-00001
     * Guaranteed to be strictly greater than any existing ID in storage.
     */
    generateProductId() {
      let current = this._initCounter();
      current += 1;
      localStorage.setItem(this._getCounterKey(), String(current));

      const year = new Date().getFullYear();
      return `STL-${year}-${String(current).padStart(5, '0')}`;
    }

    /**
     * Peak at the current product ID without incrementing
     */
    peekCurrentProductId() {
      const current = parseInt(localStorage.getItem(this._getCounterKey()) || '0', 10);
      const year = new Date().getFullYear();
      const num = current === 0 ? 1 : current;
      return `STL-${year}-${String(num).padStart(5, '0')}`;
    }

    /**
     * Determine final manufacturing decision:
     * - DEFECT -> FAIL
     * - SAFE + confidence >= threshold -> PASS
     * - SAFE + confidence < threshold -> REVIEW
     * - UNKNOWN -> REVIEW
     */
    calculateDecision(status, confidence) {
      const s = String(status || '').toUpperCase().trim();
      const conf = typeof confidence === 'number' ? confidence : parseFloat(confidence) || 0;

      if (s === 'DEFECT') {
        return 'FAIL';
      }
      if (s === 'SAFE') {
        return conf >= confidenceThreshold ? 'PASS' : 'REVIEW';
      }
      return 'REVIEW';
    }

    /**
     * Retrieve all stored inspection records from localStorage for the active operator
     */
    getRecords() {
      try {
        const storageKey = this._getStorageKey();
        const data = localStorage.getItem(storageKey);
        if (!data) return [];
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        console.error('[DataLogService] Error reading localStorage:', err);
        return [];
      }
    }

    /**
     * Calculate summary KPI counters dynamically from stored records
     */
    getCounters() {
      const records = this.getRecords();
      const total = records.length;
      let pass = 0;
      let fail = 0;
      let review = 0;

      for (let i = 0; i < records.length; i++) {
        const dec = records[i].decision;
        if (dec === 'PASS') pass++;
        else if (dec === 'FAIL') fail++;
        else if (dec === 'REVIEW') review++;
      }

      const passRate = total > 0 ? Math.round((pass / total) * 100) : 0;

      return {
        total,
        pass,
        fail,
        review,
        passRate: `${passRate}%`
      };
    }

    /**
     * Create or update a complete inspection record.
     * Guaranteed NO DUPLICATES for the same product_id.
     * Returns the saved record object, or null if ignored (e.g. NO_PRODUCT).
     */
    saveInspection(resultData, options = {}) {
      if (!resultData) return null;

      // Extract result whether from array or direct object
      const result = resultData.inspections?.[0] || resultData;
      const rawStatus = String(result.status || options.status || '').toUpperCase().trim();

      // STRICT RULE: Never log if no product is detected
      const isNoProduct = (
        result.product_detected === false ||
        options.product_detected === false ||
        rawStatus === 'NO_PRODUCT'
      );
      if (isNoProduct) {
        return null;
      }

      // Confidence parsing
      let confNum = 0;
      if (typeof result.confidence === 'number') {
        confNum = result.confidence;
      } else if (typeof options.confidence === 'number') {
        confNum = options.confidence;
      } else if (result.confidence) {
        confNum = parseFloat(String(result.confidence).replace('%', '')) || 0;
      }

      // Determine product ID
      let productId = options.productId || result.product_id || resultData.product_id;
      if (!productId) {
        productId = this.generateProductId();
      }

      // Status & Defect
      const status = rawStatus || 'SAFE';
      const defect = (status === 'SAFE') ? '—' : (result.defect || options.defect || 'SURFACE ANOMALY');

      // Severity
      let severity = result.severity || options.severity || (status === 'SAFE' ? '—' : 'MODERATE');
      if (severity === 'NORMAL' || severity === 'NONE') {
        severity = status === 'SAFE' ? '—' : 'LOW';
      }

      // Affected area
      let affectedArea = '0%';
      const areaVal = result.measurement?.area_percentage ?? options.affected_area;
      if (typeof areaVal === 'number') {
        affectedArea = `${areaVal.toFixed(2)}%`;
      } else if (typeof areaVal === 'string' && areaVal !== '—') {
        affectedArea = areaVal;
      }

      // Location
      let location = '—';
      const loc = result.location || options.location;
      if (loc && typeof loc.x === 'number') {
        location = `X${loc.x} Y${loc.y} · ${loc.width}×${loc.height}px`;
      } else if (typeof loc === 'string') {
        location = loc;
      }

      // Decision
      const decision = options.decision || this.calculateDecision(status, confNum);

      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS
      const isoTimestamp = now.toISOString();

      const user = this.getCurrentUser();
      const userId = options.user_id || user?.id || user?.username || 'OP-2026-001';
      const operatorName = options.operator || user?.name || user?.username || 'Santhosh';

      const record = {
        product_id: productId,
        user_id: userId,
        operator: operatorName,
        timestamp: isoTimestamp,
        time_str: timeStr,
        status: status,
        decision: decision,
        confidence: Number(confNum.toFixed(2)),
        defect: defect,
        severity: severity,
        affected_area: affectedArea,
        location: location
      };

      const records = this.getRecords();
      const existingIdx = records.findIndex(r => r.product_id === productId);

      if (existingIdx >= 0) {
        // Update existing record for this product session
        records[existingIdx] = {
          ...records[existingIdx],
          ...record,
          timestamp: records[existingIdx].timestamp, // preserve original entry timestamp
          time_str: records[existingIdx].time_str
        };
      } else {
        // Insert new record at the top of the history
        records.unshift(record);
      }

      try {
        localStorage.setItem(this._getStorageKey(), JSON.stringify(records));
      } catch (err) {
        console.error('[DataLogService] Failed to save record to localStorage:', err);
      }

      this._notify(record);
      return record;
    }

    /**
     * Subscribe to new or updated inspection records
     */
    subscribe(fn) {
      this._subscribers.add(fn);
      return () => this._subscribers.delete(fn);
    }

    _notify(record) {
      const counters = this.getCounters();
      this._subscribers.forEach(fn => {
        try {
          fn(record, counters);
        } catch (e) {
          console.error('[DataLogService] Subscriber error:', e);
        }
      });

      // Dispatch global window event for cross-component and cross-tab sync
      try {
        window.dispatchEvent(new CustomEvent('inspectra:data-log-updated', {
          detail: { record, counters }
        }));
      } catch (_) {}
    }

    /**
     * Clear all inspection records from storage
     */
    clearLog() {
      try {
        localStorage.removeItem(this._getStorageKey());
        localStorage.removeItem(this._getCounterKey());
      } catch (err) {
        console.error('[DataLogService] Error clearing localStorage:', err);
      }
      this._notify(null);
    }

    /**
     * Export all stored records to a clean, standard CSV file
     */
    exportCsv() {
      const records = this.getRecords();
      if (records.length === 0) {
        alert('No inspection records available to export.');
        return;
      }

      const headers = [
        'Timestamp',
        'Product ID',
        'Status',
        'Decision',
        'Defect',
        'Confidence',
        'Severity',
        'Affected Area',
        'Location'
      ];

      const rows = records.map(r => [
        `"${r.time_str || ''} (${r.timestamp || ''})"`,
        `"${r.product_id || ''}"`,
        `"${r.status || ''}"`,
        `"${r.decision || ''}"`,
        `"${r.defect || '—'}"`,
        `"${r.confidence !== undefined ? r.confidence + '%' : '—'}"`,
        `"${r.severity || '—'}"`,
        `"${r.affected_area || '—'}"`,
        `"${r.location || '—'}"`
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `INSPECTRA_PRODUCTION_LOG_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    /**
     * Look up a single inspection record by product ID
     */
    getRecordById(productId) {
      if (!productId) return null;
      const cleanId = String(productId).trim().toUpperCase();
      const records = this.getRecords();
      return records.find(r => String(r.product_id || '').trim().toUpperCase() === cleanId) || null;
    }

    /**
     * Get a slice of the most recent inspection records
     */
    getRecentRecords(limit = 10) {
      const records = this.getRecords();
      return records.slice(0, limit);
    }

    /**
     * Compute defect distribution across all logged defect records.
     * Normalized across known classes: Scratches, Crazing, Patches, Pitted Surface, Inclusion, Rolled-in Scale
     */
    getDefectDistribution() {
      const records = this.getRecords();
      const standardClasses = [
        'Scratches',
        'Crazing',
        'Patches',
        'Pitted Surface',
        'Inclusion',
        'Rolled-in Scale'
      ];

      const counts = {};
      standardClasses.forEach(cls => { counts[cls] = 0; });

      let totalDefects = 0;

      for (const r of records) {
        if (r.decision === 'FAIL' || String(r.status).toUpperCase() === 'DEFECT') {
          const rawDefect = String(r.defect || '').trim();
          if (!rawDefect || rawDefect === '—' || rawDefect.toUpperCase() === 'NONE') {
            continue;
          }

          // Normalize name
          let matchedName = null;
          const lower = rawDefect.toLowerCase().replace(/[_\s-]+/g, ' ');
          for (const std of standardClasses) {
            if (std.toLowerCase().replace(/[_\s-]+/g, ' ') === lower || lower.includes(std.toLowerCase())) {
              matchedName = std;
              break;
            }
          }

          const finalName = matchedName || (rawDefect.charAt(0).toUpperCase() + rawDefect.slice(1));
          counts[finalName] = (counts[finalName] || 0) + 1;
          totalDefects++;
        }
      }

      // Convert to sorted array
      const items = Object.entries(counts).map(([name, count]) => {
        const pct = totalDefects > 0 ? ((count / totalDefects) * 100) : 0;
        return {
          name,
          count,
          percentage: Number(pct.toFixed(1)),
          percentageStr: `${pct.toFixed(1)}%`
        };
      });

      // Sort descending by count, then alphabetical
      items.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

      return {
        totalDefects,
        items
      };
    }

    /**
     * Compute severity distribution (LOW, MEDIUM, HIGH)
     */
    getSeverityDistribution() {
      const records = this.getRecords();
      let low = 0;
      let medium = 0;
      let high = 0;
      let totalDefective = 0;

      for (const r of records) {
        if (r.decision === 'FAIL' || String(r.status).toUpperCase() === 'DEFECT') {
          totalDefective++;
          const sev = String(r.severity || '').toUpperCase().trim();
          if (sev === 'HIGH' || sev === 'CRITICAL') {
            high++;
          } else if (sev === 'MEDIUM' || sev === 'MODERATE') {
            medium++;
          } else {
            low++;
          }
        }
      }

      const getPct = (cnt) => totalDefective > 0 ? Number(((cnt / totalDefective) * 100).toFixed(1)) : 0;

      return {
        totalDefective,
        low: { count: low, percentage: getPct(low), percentageStr: `${getPct(low)}%` },
        medium: { count: medium, percentage: getPct(medium), percentageStr: `${getPct(medium)}%` },
        high: { count: high, percentage: getPct(high), percentageStr: `${getPct(high)}%` }
      };
    }

    /**
     * Calculate comprehensive analytics summary across all records
     */
    getAnalyticsSummary() {
      const records = this.getRecords();
      const totalInspected = records.length;
      let passCount = 0;
      let failCount = 0;
      let reviewCount = 0;
      let confSum = 0;
      let validConfCount = 0;
      let areaSum = 0;
      let validAreaCount = 0;
      let highSeverityCount = 0;
      let mediumSeverityCount = 0;
      let lowSeverityCount = 0;

      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        if (r.decision === 'PASS') passCount++;
        else if (r.decision === 'FAIL') failCount++;
        else if (r.decision === 'REVIEW') reviewCount++;

        if (typeof r.confidence === 'number' && !isNaN(r.confidence)) {
          confSum += r.confidence;
          validConfCount++;
        }

        const sev = String(r.severity || '').toUpperCase().trim();
        if (sev === 'HIGH' || sev === 'CRITICAL') highSeverityCount++;
        else if (sev === 'MEDIUM' || sev === 'MODERATE') mediumSeverityCount++;
        else if (sev === 'LOW') lowSeverityCount++;

        if (r.affected_area) {
          const areaNum = parseFloat(String(r.affected_area).replace('%', ''));
          if (!isNaN(areaNum) && areaNum > 0) {
            areaSum += areaNum;
            validAreaCount++;
          }
        }
      }

      const passRateNum = totalInspected > 0 ? ((passCount / totalInspected) * 100) : 0;
      const defectRateNum = totalInspected > 0 ? ((failCount / totalInspected) * 100) : 0;
      const avgConfidenceNum = validConfCount > 0 ? (confSum / validConfCount) : 0;
      const avgAreaNum = validAreaCount > 0 ? (areaSum / validAreaCount) : 0;

      return {
        totalInspected,
        passCount,
        failCount,
        reviewCount,
        defectiveCount: failCount,
        passRate: `${passRateNum.toFixed(1)}%`,
        passRateNum: Number(passRateNum.toFixed(1)),
        defectRate: `${defectRateNum.toFixed(1)}%`,
        defectRateNum: Number(defectRateNum.toFixed(1)),
        averageConfidence: validConfCount > 0 ? `${avgConfidenceNum.toFixed(1)}%` : '—',
        averageConfidenceNum: Number(avgConfidenceNum.toFixed(1)),
        averageAffectedArea: validAreaCount > 0 ? `${avgAreaNum.toFixed(2)}%` : '—',
        averageAffectedAreaNum: Number(avgAreaNum.toFixed(2)),
        highSeverityCount,
        mediumSeverityCount,
        lowSeverityCount
      };
    }
  }

  // Register on global window object
  const instance = new DataLogService();
  global.dataLogService = instance;

  // Cross-tab storage synchronization
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      instance._notify(null);
    }
  });

})(typeof window !== 'undefined' ? window : this);
