/**
 * INSPECTRA Global Header Status Synchronizer
 * Monitors real-time backend health, camera capabilities, and data log persistence.
 */

(function() {
  'use strict';

  function updateHeaderStatus() {
    // 1. Data Log Status
    const logBeacon = document.getElementById('status-beacon-log');
    const logLabel = document.getElementById('status-label-log');
    if (logBeacon && logLabel) {
      if (window.dataLogService) {
        const count = window.dataLogService.getRecords().length;
        logBeacon.className = 'status-beacon beacon-cyan';
        logLabel.className = 'status-label label-cyan';
        logLabel.textContent = count > 0 ? `DATA LOG ACTIVE [${count}]` : 'DATA LOG ACTIVE';
      } else {
        logBeacon.className = 'status-beacon beacon-amber';
        logLabel.className = 'status-label label-amber';
        logLabel.textContent = 'DATA LOG PENDING';
      }
    }

    // 2. Camera Status
    const camBeacon = document.getElementById('status-beacon-cam');
    const camLabel = document.getElementById('status-label-cam');
    if (camBeacon && camLabel) {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        camBeacon.className = 'status-beacon beacon-cyan';
        camLabel.className = 'status-label label-cyan';
        camLabel.textContent = 'CAMERA READY';
      } else {
        camBeacon.className = 'status-beacon beacon-amber';
        camLabel.className = 'status-label label-amber';
        camLabel.textContent = 'CAMERA UNAVAILABLE';
      }
    }

    // 3. AI Engine Status (Check FastAPI / inspect endpoint)
    const aiBeacon = document.getElementById('status-beacon-ai');
    const aiLabel = document.getElementById('status-label-ai');
    if (aiBeacon && aiLabel) {
      fetch('/api/config/status')
        .then(res => res.json())
        .then(data => {
          if (data && data.aiOnline) {
            aiBeacon.className = 'status-beacon beacon-emerald';
            aiLabel.className = 'status-label';
            aiLabel.textContent = 'AI ONLINE';
          } else {
            aiBeacon.className = 'status-beacon beacon-red';
            aiLabel.className = 'status-label label-red';
            aiLabel.textContent = 'AI OFFLINE';
          }
        })
        .catch(() => {
          aiBeacon.className = 'status-beacon beacon-red';
          aiLabel.className = 'status-label label-red';
          aiLabel.textContent = 'AI OFFLINE';
        });
    }
  }

  // Subscribe to storage & log updates
  window.addEventListener('inspectra:data-log-updated', updateHeaderStatus);
  window.addEventListener('storage', updateHeaderStatus);

  // Initial and periodic run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateHeaderStatus);
  } else {
    updateHeaderStatus();
  }

  setInterval(updateHeaderStatus, 5000);
})();
