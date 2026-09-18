/**
 * INSPECTRA Dedicated Continuous Live Inspection Console Logic
 * requestAnimationFrame continuous detection loop, intelligent visual change detection,
 * temporal stabilization buffer, HUD targeting overlays, and single-product-session logging.
 */

(function() {
  'use strict';

  // DOM Elements
  const cameraVideo = document.getElementById('camera-video');
  const cameraCanvas = document.getElementById('camera-canvas');
  const cameraReticle = document.getElementById('camera-reticle');
  const cameraReticleCenter = document.getElementById('camera-reticle-center');
  const cameraStatus = document.getElementById('camera-status');
  const cameraCaptureMessage = document.getElementById('camera-capture-message');

  const startCameraBtn = document.getElementById('btn-start-camera');
  const startLiveDetectionBtn = document.getElementById('btn-start-live-detection');
  const stopLiveDetectionBtn = document.getElementById('btn-stop-live-detection');
  const captureFrameBtn = document.getElementById('btn-capture-frame');
  const stopCameraBtn = document.getElementById('btn-stop-camera');

  const liveProductIdEl = document.getElementById('live-product-id');
  const liveVerdictTextEl = document.getElementById('live-verdict-text');
  const liveVerdictBannerEl = document.getElementById('live-verdict-banner');
  const liveConfidenceEl = document.getElementById('live-confidence');
  const liveDefectEl = document.getElementById('live-defect');
  const liveSeverityEl = document.getElementById('live-severity');
  const liveAreaEl = document.getElementById('live-area');
  const liveCoordsEl = document.getElementById('live-coords');

  // Camera & Detection State
  let cameraStream = null;
  let isLiveDetectionActive = false;
  let liveDetectionAnimationId = null;
  let isAiRequestInFlight = false;
  let currentRequestId = 0;
  let lastInferenceTime = 0;
  const MIN_INFERENCE_COOLDOWN_MS = 400;
  const VISUAL_CHANGE_THRESHOLD = 0.055;
  let lastInspectedTinyData = null;
  let tinyDiffCanvas = null;
  let storedCameraFrameCanvas = null;

  // Active product session tracking: ONE record per physical product unit
  let activeLiveCameraProductId = null;

  // Initial Product ID display
  if (liveProductIdEl && window.dataLogService) {
    liveProductIdEl.textContent = window.dataLogService.peekCurrentProductId();
  }

  function setCameraStatus(msg) {
    if (cameraStatus) cameraStatus.textContent = msg;
  }

  // ------------------------------------------------------------
  // INTELLIGENT VISUAL CHANGE DETECTION
  // ------------------------------------------------------------
  function getTinyFrameData(video) {
    if (!tinyDiffCanvas) {
      tinyDiffCanvas = document.createElement('canvas');
      tinyDiffCanvas.width = 64;
      tinyDiffCanvas.height = 36;
    }
    const tCtx = tinyDiffCanvas.getContext('2d', { willReadFrequently: true });
    tCtx.drawImage(video, 0, 0, 64, 36);
    return tCtx.getImageData(0, 0, 64, 36).data;
  }

  function computeVisualDifference(dataA, dataB) {
    if (!dataA || !dataB || dataA.length !== dataB.length) return 1.0;
    let totalDiff = 0;
    const len = dataA.length;
    for (let i = 0; i < len; i += 4) {
      const lumA = 0.299 * dataA[i] + 0.587 * dataA[i + 1] + 0.114 * dataA[i + 2];
      const lumB = 0.299 * dataB[i] + 0.587 * dataB[i + 1] + 0.114 * dataB[i + 2];
      totalDiff += Math.abs(lumA - lumB);
    }
    return totalDiff / ((len / 4) * 255);
  }

  // ------------------------------------------------------------
  // TEMPORAL SMOOTHING BUFFER & STABILITY TRACKER
  // ------------------------------------------------------------
  const temporalBuffer = {
    maxFrames: 5,
    history: [],

    push(result) {
      const inspection = result?.inspections?.[0] || result;
      if (!inspection) return;

      const rawStatus = String(inspection.status || '').toUpperCase();
      const hasProduct = (inspection.product_detected !== false && rawStatus !== 'NO_PRODUCT' && Boolean(inspection.product_box));

      const entry = {
        productDetected: hasProduct,
        productBox: hasProduct ? { ...inspection.product_box } : null,
        status: hasProduct ? rawStatus : 'NO_PRODUCT',
        defect: hasProduct ? (inspection.defect || null) : null,
        confidence: Number(inspection.confidence) || 0,
        timestamp: Date.now()
      };

      this.history.push(entry);
      if (this.history.length > this.maxFrames) {
        this.history.shift();
      }
    },

    clear() {
      this.history = [];
    },

    getStableVerdict() {
      if (this.history.length === 0) {
        return { isUnstable: false, status: 'NO_PRODUCT', defect: null };
      }

      const validEntries = this.history.filter(h => h.productDetected);
      if (validEntries.length === 0) {
        return { isUnstable: false, status: 'NO_PRODUCT', defect: null };
      }

      const defectCounts = {};
      let maxCount = 0;
      let dominantDefect = null;

      validEntries.forEach(entry => {
        if (entry.status === 'DEFECT' && entry.defect) {
          defectCounts[entry.defect] = (defectCounts[entry.defect] || 0) + 1;
          if (defectCounts[entry.defect] > maxCount) {
            maxCount = defectCounts[entry.defect];
            dominantDefect = entry.defect;
          }
        }
      });

      let transitions = 0;
      for (let i = 1; i < validEntries.length; i++) {
        if (validEntries[i].status !== validEntries[i - 1].status ||
            (validEntries[i].status === 'DEFECT' && validEntries[i].defect !== validEntries[i - 1].defect)) {
          transitions++;
        }
      }

      const isJumping = validEntries.length >= 3 && transitions >= (validEntries.length - 1);
      const latest = validEntries[validEntries.length - 1];

      if (isJumping) {
        return { isUnstable: true, status: 'UNKNOWN', defect: 'Unstable reading' };
      }

      if (latest.status === 'DEFECT') {
        if (maxCount >= 2 || latest.confidence >= 80.0) {
          return { isUnstable: false, status: 'DEFECT', defect: dominantDefect || latest.defect };
        } else {
          return { isUnstable: true, status: 'UNKNOWN', defect: 'Uncertain anomaly' };
        }
      }

      return { isUnstable: false, status: latest.status, defect: latest.defect };
    },

    getSmoothedProductBox() {
      const validBoxes = this.history
        .filter(h => h.productDetected && h.productBox)
        .map(h => h.productBox);

      if (validBoxes.length === 0) return null;

      let totalWeight = 0;
      let sumX = 0, sumY = 0, sumW = 0, sumH = 0;

      validBoxes.forEach((b, i) => {
        const weight = i + 1;
        sumX += b.x * weight;
        sumY += b.y * weight;
        sumW += b.width * weight;
        sumH += b.height * weight;
        totalWeight += weight;
      });

      return {
        x: Math.round(sumX / totalWeight),
        y: Math.round(sumY / totalWeight),
        width: Math.round(sumW / totalWeight),
        height: Math.round(sumH / totalWeight)
      };
    }
  };

  // ------------------------------------------------------------
  // COORDINATE SCALING & CORNER BRACKETS
  // ------------------------------------------------------------
  function scaleBoundingBox(loc, srcDim, targetDim) {
    if (!loc) return null;

    const x = Number(loc.x) || 0;
    const y = Number(loc.y) || 0;
    const w = Number(loc.width) || 0;
    const h = Number(loc.height) || 0;

    if (w <= 0 || h <= 0) return null;

    if (x <= 1 && y <= 1 && w <= 1 && h <= 1) {
      return {
        x: Math.round(x * targetDim.width),
        y: Math.round(y * targetDim.height),
        width: Math.max(Math.round(w * targetDim.width), 16),
        height: Math.max(Math.round(h * targetDim.height), 16)
      };
    }

    const srcW = Number(srcDim.width) || targetDim.width;
    const srcH = Number(srcDim.height) || targetDim.height;
    const scaleX = targetDim.width / srcW;
    const scaleY = targetDim.height / srcH;

    const scaledX = Math.round(x * scaleX);
    const scaledY = Math.round(y * scaleY);
    const scaledW = Math.max(Math.round(w * scaleX), 16);
    const scaledH = Math.max(Math.round(h * scaleY), 16);

    const clampedX = Math.max(4, Math.min(scaledX, targetDim.width - scaledW - 4));
    const clampedY = Math.max(4, Math.min(scaledY, targetDim.height - scaledH - 4));

    return {
      x: clampedX,
      y: clampedY,
      width: Math.min(scaledW, targetDim.width - clampedX - 4),
      height: Math.min(scaledH, targetDim.height - clampedY - 4)
    };
  }

  function drawCornerBrackets(ctx, x, y, w, h, len, color, lineWidth) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';

    const l = Math.min(len, w * 0.45, h * 0.45);

    ctx.beginPath();
    ctx.moveTo(x, y + l);
    ctx.lineTo(x, y);
    ctx.lineTo(x + l, y);

    ctx.moveTo(x + w - l, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + l);

    ctx.moveTo(x, y + h - l);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + l, y + h);

    ctx.moveTo(x + w - l, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - l);

    ctx.stroke();
    ctx.restore();
  }

  function drawHudBadge(ctx, x, y, title, subtitle, bgColor, borderColor, textColor, scale) {
    ctx.save();
    const titleFont = `700 ${Math.round(13 * scale)}px "Chakra Petch", "JetBrains Mono", monospace`;
    const subFont = `500 ${Math.round(10.5 * scale)}px "JetBrains Mono", monospace`;

    ctx.font = titleFont;
    const titleWidth = ctx.measureText(title).width;

    let subWidth = 0;
    if (subtitle) {
      ctx.font = subFont;
      subWidth = ctx.measureText(subtitle).width;
    }

    const contentWidth = Math.max(titleWidth, subWidth);
    const padX = Math.round(10 * scale);
    const padY = Math.round(6 * scale);
    const badgeW = contentWidth + padX * 2;
    const badgeH = subtitle ? Math.round(38 * scale) : Math.round(24 * scale);

    let drawX = x;
    if (drawX + badgeW > ctx.canvas.width - 8) {
      drawX = ctx.canvas.width - badgeW - 8;
    }
    if (drawX < 8) drawX = 8;

    let drawY = y;
    if (drawY < 8) drawY = 8;
    if (drawY + badgeH > ctx.canvas.height - 8) {
      drawY = ctx.canvas.height - badgeH - 8;
    }

    ctx.fillStyle = bgColor;
    ctx.fillRect(drawX, drawY, badgeW, badgeH);

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = Math.max(1, Math.round(1.5 * scale));
    ctx.strokeRect(drawX, drawY, badgeW, badgeH);

    ctx.fillStyle = textColor;
    ctx.font = titleFont;
    ctx.textBaseline = 'top';
    ctx.fillText(title, drawX + padX, drawY + padY);

    if (subtitle) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.90)';
      ctx.font = subFont;
      ctx.fillText(subtitle, drawX + padX, drawY + padY + Math.round(16 * scale));
    }

    ctx.restore();
  }

  // ------------------------------------------------------------
  // MACHINE-VISION OVERLAY RENDERER
  // ------------------------------------------------------------
  function drawLiveCameraOverlay(data) {
    if (!cameraCanvas) return;

    const width = cameraCanvas.width || (cameraVideo ? cameraVideo.videoWidth : 1280) || 1280;
    const height = cameraCanvas.height || (cameraVideo ? cameraVideo.videoHeight : 720) || 720;
    if (cameraCanvas.width !== width || cameraCanvas.height !== height) {
      cameraCanvas.width = width;
      cameraCanvas.height = height;
    }

    const ctx = cameraCanvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    const inspection = data?.inspections?.[0] || data;
    if (!inspection) return;

    const scale = Math.max(width, height) / 1000;
    const pad = Math.round(16 * scale);

    const srcDim = {
      width: Number(inspection.dimensions?.width || inspection.image_width) || width,
      height: Number(inspection.dimensions?.height || inspection.image_height) || height
    };
    const targetDim = { width, height };

    const rawStatus = String(inspection.status || '').toUpperCase();
    const productDetected = (inspection.product_detected !== false && rawStatus !== 'NO_PRODUCT' && Boolean(inspection.product_box));

    // STATE 1: NO PRODUCT DETECTED
    if (!productDetected) {
      ctx.save();
      const amberColor = '#ff9100';

      const reticleW = Math.round(width * 0.46);
      const reticleH = Math.round(height * 0.46);
      const reticleX = Math.round((width - reticleW) / 2);
      const reticleY = Math.round((height - reticleH) / 2);

      ctx.strokeStyle = 'rgba(255, 145, 0, 0.45)';
      ctx.lineWidth = Math.max(1.5, Math.round(2 * scale));
      ctx.setLineDash([8 * scale, 6 * scale]);
      ctx.strokeRect(reticleX, reticleY, reticleW, reticleH);
      ctx.setLineDash([]);

      drawCornerBrackets(ctx, reticleX, reticleY, reticleW, reticleH, Math.round(24 * scale), amberColor, Math.max(2, Math.round(3 * scale)));

      const centerX = Math.round(width / 2);
      const centerY = Math.round(height / 2);
      const crossSize = Math.round(14 * scale);
      ctx.strokeStyle = 'rgba(255, 145, 0, 0.7)';
      ctx.lineWidth = Math.max(1.5, Math.round(2 * scale));
      ctx.beginPath();
      ctx.moveTo(centerX - crossSize, centerY);
      ctx.lineTo(centerX + crossSize, centerY);
      ctx.moveTo(centerX, centerY - crossSize);
      ctx.lineTo(centerX, centerY + crossSize);
      ctx.stroke();

      drawHudBadge(
        ctx,
        pad + Math.round(10 * scale),
        pad + Math.round(10 * scale),
        '🟠 NO PRODUCT DETECTED // POSITION PRODUCT IN INSPECTION AREA',
        'ALIGN METAL COMPONENT IN RETICLE FOR MACHINE VISION SCAN',
        'rgba(34, 18, 2, 0.94)',
        amberColor,
        amberColor,
        scale
      );
      ctx.restore();
      return;
    }

    // STATES 2, 3, 4: PRODUCT DETECTED
    const rawBox = inspection.product_box;
    const smoothed = temporalBuffer.getSmoothedProductBox();
    const effectiveBox = smoothed || rawBox;
    const prodBox = scaleBoundingBox(effectiveBox, srcDim, targetDim);
    if (!prodBox) return;

    const verdict = temporalBuffer.getStableVerdict();
    const isUnstable = verdict.isUnstable;
    const status = verdict.status;
    const defect = verdict.defect || inspection.defect || 'DEFECT';
    const productId = activeLiveCameraProductId || 'STL-UNIT';

    let prodBadgeY = prodBox.y - Math.round(28 * scale);
    if (prodBadgeY < pad) prodBadgeY = prodBox.y + 4;

    if (isUnstable || status === 'UNKNOWN') {
      // STATE 4: UNKNOWN / REVIEW (ORANGE BOX)
      const amberColor = '#ff9100';
      ctx.save();
      ctx.fillStyle = 'rgba(255, 145, 0, 0.07)';
      ctx.fillRect(prodBox.x, prodBox.y, prodBox.width, prodBox.height);
      ctx.strokeStyle = amberColor;
      ctx.lineWidth = Math.max(2.5, Math.round(3.5 * scale));
      ctx.strokeRect(prodBox.x, prodBox.y, prodBox.width, prodBox.height);
      drawCornerBrackets(ctx, prodBox.x, prodBox.y, prodBox.width, prodBox.height, Math.round(24 * scale), amberColor, Math.round(4.5 * scale));

      drawHudBadge(ctx, prodBox.x, prodBadgeY, `🆔 ${productId} · REVIEW`, null, 'rgba(34, 18, 2, 0.94)', amberColor, amberColor, scale);
      ctx.restore();

    } else if (status === 'DEFECT') {
      // STATE 3: DEFECT (GREEN PRODUCT BOX + RED DEFECT BOX)
      const greenColor = '#00e676';
      const redColor = '#ff1744';

      ctx.save();
      // Green product box
      ctx.fillStyle = 'rgba(0, 230, 118, 0.05)';
      ctx.fillRect(prodBox.x, prodBox.y, prodBox.width, prodBox.height);
      ctx.strokeStyle = greenColor;
      ctx.lineWidth = Math.max(2.5, Math.round(3 * scale));
      ctx.strokeRect(prodBox.x, prodBox.y, prodBox.width, prodBox.height);
      drawCornerBrackets(ctx, prodBox.x, prodBox.y, prodBox.width, prodBox.height, Math.round(22 * scale), greenColor, Math.round(4.5 * scale));

      drawHudBadge(ctx, prodBox.x, prodBadgeY, `🆔 ${productId} · FAIL`, null, 'rgba(36, 4, 10, 0.95)', redColor, redColor, scale);

      // Red defect box
      const rawDefectBox = scaleBoundingBox(inspection.location, srcDim, targetDim);
      if (rawDefectBox) {
        const defectX = Math.max(prodBox.x + 2, Math.min(rawDefectBox.x, prodBox.x + prodBox.width - 20));
        const defectY = Math.max(prodBox.y + 2, Math.min(rawDefectBox.y, prodBox.y + prodBox.height - 20));
        const defectW = Math.max(16, Math.min(rawDefectBox.width, prodBox.x + prodBox.width - defectX - 2));
        const defectH = Math.max(16, Math.min(rawDefectBox.height, prodBox.y + prodBox.height - defectY - 2));

        ctx.fillStyle = 'rgba(255, 23, 68, 0.22)';
        ctx.fillRect(defectX, defectY, defectW, defectH);
        ctx.strokeStyle = redColor;
        ctx.lineWidth = Math.max(2.5, Math.round(3 * scale));
        ctx.strokeRect(defectX, defectY, defectW, defectH);

        drawHudBadge(ctx, defectX, defectY - Math.round(26 * scale), `🔴 ${String(defect).toUpperCase()}`, null, 'rgba(36, 4, 10, 0.95)', redColor, redColor, scale);
      }
      ctx.restore();

    } else {
      // STATE 2: SAFE (GREEN PRODUCT BOX)
      const greenColor = '#00e676';
      ctx.save();
      ctx.fillStyle = 'rgba(0, 230, 118, 0.05)';
      ctx.fillRect(prodBox.x, prodBox.y, prodBox.width, prodBox.height);
      ctx.strokeStyle = greenColor;
      ctx.lineWidth = Math.max(2.5, Math.round(3 * scale));
      ctx.strokeRect(prodBox.x, prodBox.y, prodBox.width, prodBox.height);
      drawCornerBrackets(ctx, prodBox.x, prodBox.y, prodBox.width, prodBox.height, Math.round(22 * scale), greenColor, Math.round(4.5 * scale));

      drawHudBadge(ctx, prodBox.x, prodBadgeY, `🆔 ${productId} · PASS`, null, 'rgba(2, 28, 14, 0.95)', greenColor, greenColor, scale);
      ctx.restore();
    }
  }

  // ------------------------------------------------------------
  // START / STOP CAMERA
  // ------------------------------------------------------------
  async function startCamera() {
    try {
      setCameraStatus('REQUESTING CAMERA...');

      if (!cameraStream) {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      }

      if (cameraVideo) {
        cameraVideo.srcObject = cameraStream;
        await cameraVideo.play().catch(e => console.warn('camera play error:', e));

        if (cameraCanvas && cameraVideo.videoWidth && cameraVideo.videoHeight) {
          cameraCanvas.width = cameraVideo.videoWidth;
          cameraCanvas.height = cameraVideo.videoHeight;
        }
      }

      setCameraStatus('● CAMERA LIVE');
      if (startCameraBtn) startCameraBtn.disabled = true;
      if (stopCameraBtn) stopCameraBtn.disabled = false;
      if (startLiveDetectionBtn) startLiveDetectionBtn.disabled = false;
      if (captureFrameBtn) captureFrameBtn.disabled = false;

      if (cameraCaptureMessage) {
        cameraCaptureMessage.textContent = 'Camera live. Click START LIVE DETECTION or CAPTURE FRAME.';
      }
    } catch (err) {
      console.error('Camera error:', err);
      setCameraStatus('CAMERA ACCESS FAILED');
      if (cameraCaptureMessage) {
        cameraCaptureMessage.textContent = 'Unable to access video camera. Check browser permissions.';
      }
    }
  }

  function stopCamera() {
    stopLiveDetection();

    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
    if (cameraVideo) cameraVideo.srcObject = null;

    setCameraStatus('CAMERA STOPPED');
    if (startCameraBtn) startCameraBtn.disabled = false;
    if (stopCameraBtn) stopCameraBtn.disabled = true;
    if (startLiveDetectionBtn) startLiveDetectionBtn.disabled = true;
    if (captureFrameBtn) captureFrameBtn.disabled = true;

    if (cameraCanvas) {
      cameraCanvas.style.display = 'none';
      const ctx = cameraCanvas.getContext('2d');
      ctx.clearRect(0, 0, cameraCanvas.width, cameraCanvas.height);
    }
    if (cameraReticle) cameraReticle.style.display = '';
    if (cameraReticleCenter) cameraReticleCenter.style.display = '';
  }

  // ------------------------------------------------------------
  // CONTINUOUS LIVE DETECTION
  // ------------------------------------------------------------
  async function startLiveDetection() {
    if (!cameraStream) {
      await startCamera();
      if (!cameraStream) return;
    }

    isLiveDetectionActive = true;
    isAiRequestInFlight = false;
    lastInspectedTinyData = null;
    lastInferenceTime = 0;
    temporalBuffer.clear();

    if (cameraCanvas) {
      cameraCanvas.style.display = 'block';
      if (cameraVideo && cameraVideo.videoWidth && cameraVideo.videoHeight) {
        cameraCanvas.width = cameraVideo.videoWidth;
        cameraCanvas.height = cameraVideo.videoHeight;
      }
    }
    if (cameraReticle) cameraReticle.style.display = 'none';
    if (cameraReticleCenter) cameraReticleCenter.style.display = 'none';

    if (startLiveDetectionBtn) startLiveDetectionBtn.style.display = 'none';
    if (stopLiveDetectionBtn) {
      stopLiveDetectionBtn.style.display = '';
      stopLiveDetectionBtn.disabled = false;
    }

    setCameraStatus('⚡ LIVE DETECTION ACTIVE');
    if (cameraCaptureMessage) {
      cameraCaptureMessage.textContent = 'Continuous machine-vision scan running. Evaluating surfaces on change.';
    }

    if (liveDetectionAnimationId) cancelAnimationFrame(liveDetectionAnimationId);
    liveDetectionAnimationId = requestAnimationFrame(liveDetectionLoop);
  }

  function stopLiveDetection() {
    isLiveDetectionActive = false;
    if (liveDetectionAnimationId) {
      cancelAnimationFrame(liveDetectionAnimationId);
      liveDetectionAnimationId = null;
    }
    isAiRequestInFlight = false;

    if (startLiveDetectionBtn) {
      startLiveDetectionBtn.style.display = '';
      startLiveDetectionBtn.disabled = !cameraStream;
    }
    if (stopLiveDetectionBtn) {
      stopLiveDetectionBtn.style.display = 'none';
      stopLiveDetectionBtn.disabled = true;
    }

    if (cameraCanvas) {
      cameraCanvas.style.display = 'none';
      const ctx = cameraCanvas.getContext('2d');
      ctx.clearRect(0, 0, cameraCanvas.width, cameraCanvas.height);
    }
    if (cameraStream) {
      if (cameraReticle) cameraReticle.style.display = '';
      if (cameraReticleCenter) cameraReticleCenter.style.display = '';
      setCameraStatus('● CAMERA LIVE');
    }
  }

  let isLiveInspectionProcessing = false;

  function liveDetectionLoop() {
    if (!isLiveDetectionActive) return;

    if (!cameraVideo || cameraVideo.readyState < 2) {
      liveDetectionAnimationId = requestAnimationFrame(liveDetectionLoop);
      return;
    }

    const now = performance.now();

    // Prevent overlapping requests
    if (isAiRequestInFlight || isLiveInspectionProcessing) {
      liveDetectionAnimationId = requestAnimationFrame(liveDetectionLoop);
      return;
    }

    // Periodic inspection cadence every 1.2 seconds to prevent CPU congestion
    const INSPECTION_INTERVAL_MS = 1200;
    if (now - lastInferenceTime >= INSPECTION_INTERVAL_MS) {
      lastInferenceTime = now;
      triggerLiveInference();
    }

    liveDetectionAnimationId = requestAnimationFrame(liveDetectionLoop);
  }

  async function triggerLiveInference() {
    if (!isLiveDetectionActive || isAiRequestInFlight || isLiveInspectionProcessing || !cameraVideo || cameraVideo.readyState < 2) {
      return;
    }

    const width = cameraVideo.videoWidth;
    const height = cameraVideo.videoHeight;
    if (!width || !height) return;

    isAiRequestInFlight = true;
    isLiveInspectionProcessing = true;
    const thisRequestId = ++currentRequestId;

    try {
      console.log('[LIVE INSPECTION] loop started');

      if (!storedCameraFrameCanvas) {
        storedCameraFrameCanvas = document.createElement('canvas');
      }
      storedCameraFrameCanvas.width = width;
      storedCameraFrameCanvas.height = height;
      const sCtx = storedCameraFrameCanvas.getContext('2d');
      sCtx.drawImage(cameraVideo, 0, 0, width, height);

      console.log(`[LIVE INSPECTION] frame captured (${width}x${height})`);

      if (cameraCanvas && (cameraCanvas.width !== width || cameraCanvas.height !== height)) {
        cameraCanvas.width = width;
        cameraCanvas.height = height;
      }

      const blob = await new Promise(resolve =>
        storedCameraFrameCanvas.toBlob(resolve, 'image/jpeg', 0.85)
      );

      if (!blob || !isLiveDetectionActive || thisRequestId !== currentRequestId) {
        isAiRequestInFlight = false;
        isLiveInspectionProcessing = false;
        return;
      }

      const tempId = activeLiveCameraProductId || (window.dataLogService ? window.dataLogService.peekCurrentProductId() : 'STL-TEMP');
      const formData = new FormData();
      formData.append('product_id', tempId);
      formData.append('metadata', JSON.stringify([{ image_id: 'CAM-LIVE', view: 'CAMERA' }]));
      formData.append('image', blob, 'live_frame.jpg');

      setCameraStatus('ANALYZING FRAME');
      console.log('[LIVE INSPECTION] request started');

      const response = await fetch('/api/inspect', {
        method: 'POST',
        body: formData
      });

      console.log(`[LIVE INSPECTION] request completed (status: ${response.status})`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `AI backend returned ${response.status}`);
      }

      const result = await response.json();
      if (!isLiveDetectionActive || thisRequestId !== currentRequestId) return;

      const inspection = result.inspections?.[0] || result;
      const rawStatus = String(inspection?.status || result.product_status || '').toUpperCase().trim();
      console.log(`[LIVE INSPECTION] result status: ${rawStatus}`);

      temporalBuffer.push(result);
      const isProd = (inspection.product_detected !== false && rawStatus !== 'NO_PRODUCT' && Boolean(inspection.product_box));
      const verdict = temporalBuffer.getStableVerdict();

      if (!isProd || verdict.status === 'NO_PRODUCT') {
        setCameraStatus('NO PRODUCT DETECTED');
        activeLiveCameraProductId = null;
      } else {
        if (!activeLiveCameraProductId) {
          activeLiveCameraProductId = window.dataLogService
            ? window.dataLogService.generateProductId()
            : `STL-${new Date().getFullYear()}-00001`;
        }
        result.product_id = activeLiveCameraProductId;
        if (inspection) inspection.product_id = activeLiveCameraProductId;

        if (verdict.isUnstable) {
          setCameraStatus('UNKNOWN PATTERN');
        } else if (verdict.status === 'DEFECT') {
          setCameraStatus(`DEFECT DETECTED [${String(verdict.defect || inspection.defect || '').toUpperCase()}]`);
        } else if (verdict.status === 'SAFE') {
          setCameraStatus('PRODUCT SAFE');
        } else {
          setCameraStatus('UNKNOWN PATTERN');
        }

        // ONE Product = ONE Saved Record in persistent Data Log
        if (window.dataLogService) {
          window.dataLogService.saveInspection(result, {
            productId: activeLiveCameraProductId,
            status: verdict.status || rawStatus
          });
        }
      }

      displayInspectionResult(result);

    } catch (err) {
      console.error('[LIVE INSPECTION] Error:', err);
      if (isLiveDetectionActive) {
        setCameraStatus('AI INSPECTION FAILED');
      }
    } finally {
      if (thisRequestId === currentRequestId) {
        isAiRequestInFlight = false;
        isLiveInspectionProcessing = false;
      }
    }
  }

  // ------------------------------------------------------------
  // UNIFIED INSPECTION RESULT RENDERER
  // ------------------------------------------------------------
  function displayInspectionResult(data) {
    const inspection = data?.inspections?.[0] || data;
    if (!inspection) return;

    const rawStatus = String(inspection.status || data?.product_status || '').toUpperCase().trim();
    const isNoProduct = (inspection.product_detected === false || rawStatus === 'NO_PRODUCT');
    const defect = inspection.defect || null;
    const confidence = typeof inspection.confidence === 'number' ? inspection.confidence : (parseFloat(inspection.confidence) || 0);
    const anomalyScore = typeof inspection.anomaly_score === 'number' ? inspection.anomaly_score : (parseFloat(inspection.anomaly_score) || 0);
    const severity = inspection.severity || null;
    const measurement = inspection.measurement || null;
    const location = inspection.location || null;
    const productBox = inspection.product_box || null;
    const message = inspection.message || '';

    // Update Product ID
    if (liveProductIdEl) {
      liveProductIdEl.textContent = isNoProduct ? '—' : (data.product_id || inspection.product_id || activeLiveCameraProductId || '—');
    }

    // Update Verdict Banner & Text
    if (liveVerdictTextEl) {
      if (isNoProduct) {
        liveVerdictTextEl.textContent = '🟠 NO PRODUCT DETECTED';
        liveVerdictTextEl.style.color = 'var(--color-amber)';
      } else if (rawStatus === 'DEFECT') {
        liveVerdictTextEl.textContent = `🔴 DEFECT DETECTED [${String(defect || 'SURFACE ANOMALY').toUpperCase()}]`;
        liveVerdictTextEl.style.color = 'var(--color-crimson)';
      } else if (rawStatus === 'SAFE') {
        liveVerdictTextEl.textContent = '🟢 PRODUCT SAFE [PASS]';
        liveVerdictTextEl.style.color = 'var(--color-emerald)';
      } else {
        liveVerdictTextEl.textContent = '🟠 UNKNOWN PATTERN / REVIEW';
        liveVerdictTextEl.style.color = 'var(--color-amber)';
      }
    }

    if (liveVerdictBannerEl) {
      if (isNoProduct) {
        liveVerdictBannerEl.style.background = 'rgba(255, 145, 0, 0.08)';
        liveVerdictBannerEl.style.borderColor = 'rgba(255, 145, 0, 0.3)';
      } else if (rawStatus === 'DEFECT') {
        liveVerdictBannerEl.style.background = 'rgba(255, 23, 68, 0.12)';
        liveVerdictBannerEl.style.borderColor = 'rgba(255, 23, 68, 0.4)';
      } else if (rawStatus === 'SAFE') {
        liveVerdictBannerEl.style.background = 'rgba(0, 230, 118, 0.12)';
        liveVerdictBannerEl.style.borderColor = 'rgba(0, 230, 118, 0.4)';
      } else {
        liveVerdictBannerEl.style.background = 'rgba(255, 145, 0, 0.12)';
        liveVerdictBannerEl.style.borderColor = 'rgba(255, 145, 0, 0.4)';
      }
    }

    // Update Telemetry Metrics
    if (liveConfidenceEl) {
      liveConfidenceEl.textContent = isNoProduct ? '—' : `${confidence.toFixed(2)}%`;
    }

    if (liveDefectEl) {
      liveDefectEl.textContent = isNoProduct ? '—' : (rawStatus === 'SAFE' ? 'NONE (COMPLIANT)' : (defect || 'SURFACE ANOMALY'));
    }

    if (liveSeverityEl) {
      liveSeverityEl.textContent = isNoProduct ? '—' : (rawStatus === 'SAFE' ? 'NONE' : (severity || 'LOW'));
    }

    if (liveAreaEl) {
      liveAreaEl.textContent = isNoProduct ? '—' : (measurement?.area_percentage !== undefined ? `${Number(measurement.area_percentage).toFixed(2)}%` : '0.00%');
    }

    if (liveCoordsEl) {
      if (!isNoProduct && location) {
        liveCoordsEl.textContent = `X:${location.x} Y:${location.y} · ${location.width}×${location.height}px`;
      } else if (!isNoProduct && productBox) {
        liveCoordsEl.textContent = `X:${productBox.x} Y:${productBox.y} · ${productBox.width}×${productBox.height}px`;
      } else {
        liveCoordsEl.textContent = '—';
      }
    }

    if (cameraCaptureMessage) {
      if (isNoProduct) {
        cameraCaptureMessage.textContent = 'NO PRODUCT DETECTED // POSITION PRODUCT IN INSPECTION AREA';
      } else {
        cameraCaptureMessage.textContent = message || `AI inspection completed successfully.`;
      }
    }

    // Draw transparent machine-vision overlay on top of video stream
    if (isLiveDetectionActive) {
      drawLiveCameraOverlay(data);
    }
  }

  // Expose displayInspectionResult globally
  window.displayInspectionResult = displayInspectionResult;

  function drawCapturedInspectionOverlay(data) {
    if (!cameraCanvas || !storedCameraFrameCanvas) return;
    const ctx = cameraCanvas.getContext('2d');
    const width = cameraCanvas.width;
    const height = cameraCanvas.height;

    // Draw the captured base frame
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(storedCameraFrameCanvas, 0, 0, width, height);

    // Draw detection overlay on top of the frozen captured frame
    drawLiveCameraOverlay(data);
  }

  // ------------------------------------------------------------
  // SINGLE-SHOT CAPTURE FRAME
  // ------------------------------------------------------------
  async function captureFrame() {
    if (!cameraVideo) {
      return;
    }

    if (!cameraStream || cameraVideo.readyState < 2) {
      setCameraStatus('START CAMERA FIRST');
      if (cameraCaptureMessage) cameraCaptureMessage.textContent = 'Camera is not active. Click START CAMERA first.';
      return;
    }

    // Stop live detection loop if running so frame can freeze
    if (isLiveDetectionActive) {
      stopLiveDetection();
    }

    const width = cameraVideo.videoWidth;
    const height = cameraVideo.videoHeight;
    if (!width || !height) {
      setCameraStatus('CAMERA NOT READY');
      return;
    }

    console.log('[INSPECTRA CAMERA] capture started');
    console.log(`[INSPECTRA CAMERA] frame dimensions: ${width}x${height}`);

    if (!storedCameraFrameCanvas) {
      storedCameraFrameCanvas = document.createElement('canvas');
    }
    storedCameraFrameCanvas.width = width;
    storedCameraFrameCanvas.height = height;
    const sCtx = storedCameraFrameCanvas.getContext('2d');
    sCtx.drawImage(cameraVideo, 0, 0, width, height);

    if (cameraCanvas) {
      cameraCanvas.width = width;
      cameraCanvas.height = height;
      cameraCanvas.style.display = 'block';
    }
    if (cameraVideo) {
      cameraVideo.style.display = 'none';
    }
    if (cameraReticle) cameraReticle.style.display = 'none';
    if (cameraReticleCenter) cameraReticleCenter.style.display = 'none';

    // Draw initial captured frame immediately
    const cCtx = cameraCanvas.getContext('2d');
    cCtx.clearRect(0, 0, width, height);
    cCtx.drawImage(storedCameraFrameCanvas, 0, 0, width, height);

    setCameraStatus('ANALYZING FRAME');
    if (cameraCaptureMessage) {
      cameraCaptureMessage.textContent = 'Frame captured. Sending to INSPECTRA AI engine...';
    }

    if (captureFrameBtn) captureFrameBtn.disabled = true;

    try {
      const blob = await new Promise(resolve =>
        storedCameraFrameCanvas.toBlob(resolve, 'image/jpeg', 0.90)
      );

      if (!blob) {
        throw new Error('Canvas toBlob failed');
      }
      console.log(`[INSPECTRA CAMERA] blob created (${blob.size} bytes)`);

      const productId = activeLiveCameraProductId || (window.dataLogService
        ? window.dataLogService.generateProductId()
        : `STL-${new Date().getFullYear()}-00001`);

      const formData = new FormData();
      formData.append('product_id', productId);
      formData.append('metadata', JSON.stringify([{ image_id: 'CAM-001', view: 'CAMERA' }]));
      formData.append('image', blob, 'camera_capture.jpg');

      console.log('[INSPECTRA CAMERA] request sent to /api/inspect');
      const response = await fetch('/api/inspect', {
        method: 'POST',
        body: formData
      });

      console.log(`[INSPECTRA CAMERA] response status: ${response.status}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `AI backend returned ${response.status}`);
      }

      const data = await response.json();
      console.log('[INSPECTRA CAMERA] response JSON:', data);

      data.product_id = productId;
      const inspection = data.inspections?.[0] || data;
      if (inspection) inspection.product_id = productId;

      console.log('[INSPECTRA CAMERA] renderer called');
      displayInspectionResult(data);
      drawCapturedInspectionOverlay(data);

      const rawStatus = String(inspection?.status || data.product_status || '').toUpperCase().trim();
      const isProd = (inspection?.product_detected !== false && rawStatus !== 'NO_PRODUCT');

      if (!isProd) {
        setCameraStatus('NO PRODUCT DETECTED');
        activeLiveCameraProductId = null;
      } else if (rawStatus === 'SAFE') {
        setCameraStatus('PRODUCT SAFE');
        if (window.dataLogService) {
          window.dataLogService.saveInspection(data, { productId, status: 'SAFE' });
        }
      } else if (rawStatus === 'DEFECT') {
        setCameraStatus(`DEFECT DETECTED [${String(inspection.defect || '').toUpperCase()}]`);
        if (window.dataLogService) {
          window.dataLogService.saveInspection(data, { productId, status: 'DEFECT' });
        }
      } else {
        setCameraStatus('UNKNOWN PATTERN');
        if (window.dataLogService) {
          window.dataLogService.saveInspection(data, { productId, status: 'UNKNOWN' });
        }
      }

      if (cameraCaptureMessage) {
        cameraCaptureMessage.textContent = 'AI inspection completed. Click START CAMERA or START LIVE DETECTION to continue.';
      }

    } catch (err) {
      console.error('[INSPECTRA CAMERA] Error:', err);
      setCameraStatus('AI INSPECTION FAILED');
      if (cameraCaptureMessage) {
        cameraCaptureMessage.textContent = `AI inspection error: ${err.message}`;
      }
      if (liveVerdictTextEl) {
        liveVerdictTextEl.textContent = `⚠️ AI INSPECTION FAILED: ${err.message}`;
        liveVerdictTextEl.style.color = 'var(--color-crimson)';
      }
    } finally {
      if (startCameraBtn) startCameraBtn.disabled = false;
      if (captureFrameBtn) captureFrameBtn.disabled = false;
      if (startLiveDetectionBtn) startLiveDetectionBtn.disabled = false;
    }
  }

  // Bind Buttons
  if (startCameraBtn) startCameraBtn.addEventListener('click', startCamera);
  if (stopCameraBtn) stopCameraBtn.addEventListener('click', stopCamera);
  if (startLiveDetectionBtn) startLiveDetectionBtn.addEventListener('click', startLiveDetection);
  if (stopLiveDetectionBtn) stopLiveDetectionBtn.addEventListener('click', stopLiveDetection);
  if (captureFrameBtn) captureFrameBtn.addEventListener('click', captureFrame);

})();
