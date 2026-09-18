/* ==========================================================================
   INSPECTRA — AI-Powered Visual Intelligence Engine
   Core Application Controller
   ========================================================================== */

(function () {
  'use strict';

  // State Management
  const state = {
    frames: [],
    loadedImages: [],
    totalFrames: 0,
    currentFrame: 0,
    targetFrame: 0,
    isPreloaded: false,
    selectedFile: null,
    isInspecting: false,
    apiKey: localStorage.getItem('inspectra_gemini_key') || ''
  };

  // DOM Elements - Preloader
  const preloader = document.getElementById('preloader');
  const preloaderBar = document.getElementById('preloader-bar');
  const preloaderPercent = document.getElementById('preloader-percent');
  const preloaderFramesCount = document.getElementById('preloader-frames-count');
  const preloaderLabel = document.getElementById('preloader-label');

  // DOM Elements - Hero Stage & HUD
  const heroContainer = document.getElementById('hero');
  const heroStage = document.getElementById('hero-stage');
  const heroCanvas = document.getElementById('hero-canvas');
  const heroContent = document.getElementById('hero-content');
  const heroScrollPrompt = document.getElementById('hero-scroll-prompt');
  const hudCurrentFrame = document.getElementById('hud-current-frame');
  const hudTotalFrames = document.getElementById('hud-total-frames');
  const hudProgressFill = document.getElementById('hud-progress-fill');
  const hudStageBadge = document.getElementById('hud-stage-badge');
  const hudStageText = document.getElementById('hud-stage-text');
  const hudUnlockHint = document.getElementById('hud-unlock-hint');
  const canvasCtx = heroCanvas ? heroCanvas.getContext('2d', { alpha: false }) : null;

  // DOM Elements - Inspection Workbench
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const btnChooseImage = document.getElementById('btn-choose-image');
  const dropzoneEmptyState = document.getElementById('dropzone-empty-state');
  const imagePreviewPanel = document.getElementById('image-preview-panel');
  const exactUploadedPreview = document.getElementById('exact-uploaded-preview');
  const metaFilename = document.getElementById('meta-filename');
  const metaFormat = document.getElementById('meta-format');
  const metaDimensions = document.getElementById('meta-dimensions');
  const metaFilesize = document.getElementById('meta-filesize');
  const btnChangeImage = document.getElementById('btn-change-image');
  const btnRemoveImage = document.getElementById('btn-remove-image');
  const btnRunInspection = document.getElementById('btn-run-inspection');
  const inspectionResultPanel = document.getElementById('inspection-result-panel');
  const resultVerdict = document.getElementById('result-verdict');
  const resultSummary = document.getElementById('result-summary');
  const resultDefect = document.getElementById('result-defect');
  const resultConfidence = document.getElementById('result-confidence');
  const resultAnomaly = document.getElementById('result-anomaly');
  const resultSeverity = document.getElementById('result-severity');
  const resultArea = document.getElementById('result-area');
  const resultLocation = document.getElementById('result-location');
  const resultProductId = document.getElementById('result-product-id');
  const resultProductDetected = document.getElementById('result-product-detected');
  const resultProductConfidence = document.getElementById('result-product-confidence');
  const resultProductBox = document.getElementById('result-product-box');
  const resultAction = document.getElementById('result-action');
  const resultSource = document.getElementById('result-source');
  const defectBoxOverlay = document.getElementById('defect-box-overlay');
  const defectBoxLabel = document.getElementById('defect-box-label');
  const uploadValidationError = document.getElementById('upload-validation-error');

  // DOM Elements - Studio Telemetry Banner
  function updateStudioStatsBanner() {
    if (!window.dataLogService) return;
    const counters = window.dataLogService.getCounters();
    const elTotal = document.getElementById('studio-stat-total');
    const elPass = document.getElementById('studio-stat-pass');
    const elFail = document.getElementById('studio-stat-fail');
    const elReview = document.getElementById('studio-stat-review');
    const elRate = document.getElementById('studio-stat-rate');

    if (elTotal) elTotal.textContent = counters.total;
    if (elPass) elPass.textContent = counters.pass;
    if (elFail) elFail.textContent = counters.fail;
    if (elReview) elReview.textContent = counters.review;
    if (elRate) elRate.textContent = counters.passRate;
  }
  window.updateStudioStatsBanner = updateStudioStatsBanner;

  // Active camera product session ID
  let activeCameraProductId = null;

  // DOM Elements - API Config Modal
  const btnApiConfig = document.getElementById('btn-api-config');
  const apiModal = document.getElementById('api-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const inputApiKey = document.getElementById('input-api-key');
  const btnSaveKey = document.getElementById('btn-save-key');
  const btnClearKey = document.getElementById('btn-clear-key');
  const apiModalStatus = document.getElementById('api-modal-status');
  const statusLabel = document.getElementById('status-label');

  // ==========================================================================
  // 1. FRAME INITIALIZATION & PRELOADING
  // ==========================================================================
  async function initFrames() {
    try {
      if (preloaderLabel) preloaderLabel.textContent = 'CONNECTING OPTICAL SENSOR STREAM...';
      const response = await fetch('/api/frames');
      if (!response.ok) {
        throw new Error(`Failed to load frame manifest (${response.status})`);
      }

      const data = await response.json();
      state.frames = data.frames || [];
      state.totalFrames = state.frames.length;

      if (state.totalFrames === 0) {
        throw new Error('No disk animation frames found on server.');
      }

      if (hudTotalFrames) {
        hudTotalFrames.textContent = String(state.totalFrames - 1).padStart(3, '0');
      }
      if (preloaderFramesCount) {
        preloaderFramesCount.textContent = `0 / ${state.totalFrames}`;
      }

      await preloadAllFrames();
    } catch (err) {
      console.error('[INSPECTRA Init Error]:', err);
      if (preloaderLabel) {
        preloaderLabel.textContent = `INITIALIZATION ERROR: ${err.message}`;
      }
      if (preloaderBar) {
        preloaderBar.style.background = 'var(--color-crimson, #ff1744)';
      }
      // Fail gracefully: hide preloader after delay so page remains usable
      setTimeout(() => {
        if (preloader) preloader.classList.add('hidden');
      }, 1500);
    }
  }

  function preloadAllFrames() {
    return new Promise((resolve) => {
      let loadedCount = 0;
      state.loadedImages = new Array(state.totalFrames);

      state.frames.forEach((frameUrl, index) => {
        const img = new Image();
        img.onload = () => {
          state.loadedImages[index] = img;
          loadedCount++;
          updatePreloadProgress(loadedCount);
          if (loadedCount === state.totalFrames) {
            finishPreloading();
            resolve();
          }
        };
        img.onerror = () => {
          console.warn(`[INSPECTRA] Failed loading frame: ${frameUrl}`);
          loadedCount++;
          updatePreloadProgress(loadedCount);
          if (loadedCount === state.totalFrames) {
            finishPreloading();
            resolve();
          }
        };
        img.src = frameUrl;
      });
    });
  }

  function updatePreloadProgress(loadedCount) {
    const percent = Math.round((loadedCount / state.totalFrames) * 100);
    if (preloaderBar) preloaderBar.style.width = `${percent}%`;
    if (preloaderPercent) preloaderPercent.textContent = `${percent}%`;
    if (preloaderFramesCount) preloaderFramesCount.textContent = `${loadedCount} / ${state.totalFrames}`;
  }

  function finishPreloading() {
    state.isPreloaded = true;
    setTimeout(() => {
      if (preloader) preloader.classList.add('hidden');
      resizeCanvas();
      drawFrame(0);
      startRenderLoop();
    }, 300);
  }

  // ==========================================================================
  // 2. CANVAS & RENDERING ENGINE
  // ==========================================================================
  let canvasWidth = 0;
  let canvasHeight = 0;
  let dpr = 1;

  function resizeCanvas() {
    if (!heroCanvas || !canvasCtx || !heroStage) return;

    dpr = window.devicePixelRatio || 1;
    canvasWidth = heroStage.clientWidth;
    canvasHeight = heroStage.clientHeight;

    heroCanvas.width = canvasWidth * dpr;
    heroCanvas.height = canvasHeight * dpr;

    canvasCtx.scale(dpr, dpr);
    canvasCtx.imageSmoothingEnabled = true;
    canvasCtx.imageSmoothingQuality = 'high';

    drawFrame(Math.round(state.currentFrame));
  }

  function drawFrame(frameIdx) {
    if (!canvasCtx || state.totalFrames === 0) return;

    const safeIdx = Math.max(0, Math.min(frameIdx, state.totalFrames - 1));
    const img = state.loadedImages[safeIdx];
    if (!img || !img.complete) return;

    // Clear canvas
    canvasCtx.fillStyle = '#07080b';
    canvasCtx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Calculate aspect ratio scale (contain style to show full disk)
    const imgW = img.naturalWidth || 1280;
    const imgH = img.naturalHeight || 720;
    const imgRatio = imgW / imgH;
    const canvasRatio = canvasWidth / canvasHeight;

    let renderW, renderH, offsetX, offsetY;

    if (canvasRatio > imgRatio) {
      renderW = canvasWidth;
      renderH = canvasWidth / imgRatio;
      offsetX = 0;
      offsetY = (canvasHeight - renderH) / 2;
    } else {
      renderH = canvasHeight;
      renderW = canvasHeight * imgRatio;
      offsetX = (canvasWidth - renderW) / 2;
      offsetY = 0;
    }

    canvasCtx.drawImage(img, offsetX, offsetY, renderW, renderH);
  }

  // ==========================================================================
  // 3. APPLE-STYLE SCROLL PINNING & INTERACTION
  // ==========================================================================
  function updateScrollTarget() {
    if (!state.isPreloaded || state.totalFrames === 0 || !heroContainer) return;

    const containerRect = heroContainer.getBoundingClientRect();
    const scrollDistance = -containerRect.top;
    const maxScroll = heroContainer.offsetHeight - window.innerHeight;

    if (maxScroll <= 0) return;

    // Calculate scroll progress strictly within [0, 1]
    const rawProgress = scrollDistance / maxScroll;
    const progress = Math.min(Math.max(rawProgress, 0), 1);

    // Map progress to frames 0 ... totalFrames - 1
    state.targetFrame = Math.min(
      Math.floor(progress * (state.totalFrames - 1)),
      state.totalFrames - 1
    );

    // Dynamic UI feedback based on progress
    updateHeroVisuals(progress);
  }

  function updateHeroVisuals(progress) {
    const displayFrame = Math.round(state.currentFrame);
    if (hudCurrentFrame) {
      hudCurrentFrame.textContent = String(displayFrame).padStart(3, '0');
    }
    if (hudProgressFill) {
      hudProgressFill.style.width = `${(progress * 100).toFixed(1)}%`;
    }

    // Lock / Unlock State Badge
    if (hudStageBadge && hudStageText && hudUnlockHint) {
      if (progress >= 0.96) {
        hudStageBadge.classList.add('unlocked');
        hudStageText.textContent = 'FINAL FRAME // UNLOCKED';
        hudUnlockHint.textContent = 'SCROLL DOWN TO INSPECT STEEL SURFACES';
        hudUnlockHint.style.color = 'var(--color-emerald, #00e676)';
      } else {
        hudStageBadge.classList.remove('unlocked');
        hudStageText.textContent = 'HERO STAGE PINNED';
        hudUnlockHint.textContent = 'CONTINUE SCROLLING TO UNLOCK INSPECTOR';
        hudUnlockHint.style.color = 'var(--text-subtle, #5a6578)';
      }
    }

    // Smooth Hero text fade as disk rolls
    if (heroScrollPrompt) {
      if (progress > 0.04) {
        const textFade = Math.max(0, 1 - (progress - 0.04) * 4);
        heroScrollPrompt.style.opacity = textFade;
        heroScrollPrompt.style.transform = `translateY(${progress * 25}px)`;
      } else {
        heroScrollPrompt.style.opacity = 1;
        heroScrollPrompt.style.transform = 'translateY(0)';
      }
    }

    if (heroContent) {
      if (progress > 0.08) {
        const titleOpacity = Math.max(0.2, 1 - (progress - 0.08) * 2.2);
        heroContent.style.opacity = titleOpacity;
      } else {
        heroContent.style.opacity = 1;
      }
    }
  }

  // Smooth lerp loop using requestAnimationFrame
  function startRenderLoop() {
    function tick() {
      const delta = state.targetFrame - state.currentFrame;
      if (Math.abs(delta) > 0.01) {
        state.currentFrame += delta * 0.22;
        drawFrame(Math.round(state.currentFrame));
        updateHeroVisuals(state.currentFrame / (state.totalFrames - 1));
      }

      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ==========================================================================
  // 4. IMAGE UPLOAD & PREVIEW MANAGEMENT
  // ==========================================================================
  function setupUpload() {
    if (!dropzone || !fileInput) return;

    // Trigger file chooser via "CHOOSE IMAGE" button
    if (btnChooseImage) {
      btnChooseImage.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
      });
    }

    // Trigger file chooser on dropzone click
    dropzone.addEventListener('click', (e) => {
      // Don't double trigger if clicked directly on btnChooseImage
      if (e.target !== btnChooseImage && !btnChooseImage.contains(e.target)) {
        fileInput.click();
      }
    });

    // Handle file selection from dialog
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFileSelection(e.target.files[0]);
      }
    });

    // Drag and drop events
    ['dragenter', 'dragover'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files[0]) {
        handleFileSelection(dt.files[0]);
      }
    });

    // Change Image button triggers file dialog again
    if (btnChangeImage) {
      btnChangeImage.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
      });
    }

    // Remove Image button clears selection
    if (btnRemoveImage) {
      btnRemoveImage.addEventListener('click', (e) => {
        e.stopPropagation();
        clearSelectedImage();
      });
    }

    if (btnRunInspection) {
      btnRunInspection.addEventListener('click', (e) => {
        e.stopPropagation();
        inspectSelectedImage();
      });
    }
  }

  function handleFileSelection(file) {
    hideValidationError();

    // 1. File Type Validation (JPG, JPEG, PNG)
    const validMimes = ['image/jpeg', 'image/jpg', 'image/png'];
    const extension = file.name.split('.').pop().toLowerCase();
    const validExtensions = ['jpg', 'jpeg', 'png'];

    if (!validMimes.includes(file.type) && !validExtensions.includes(extension)) {
      showValidationError('Unsupported file format. Please upload a valid JPG, JPEG, or PNG steel surface image.');
      return;
    }

    // 2. File Size Validation (Max 20MB)
    const maxSizeBytes = 20 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      showValidationError('File size exceeds 20MB limit. Please upload an optimized industrial scan.');
      return;
    }

    state.selectedFile = file;
    resetInspectionResult();

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;

      // Load into an image object to get exact natural dimensions
      const tempImg = new Image();
      tempImg.onload = () => {
        const width = tempImg.naturalWidth;
        const height = tempImg.naturalHeight;

        // Display exact uploaded image
        if (exactUploadedPreview) {
          exactUploadedPreview.src = dataUrl;
        }

        // Display detailed metadata
        if (metaFilename) {
          metaFilename.textContent = file.name;
        }
        if (metaFormat) {
          const fmt = extension.toUpperCase() === 'JPG' ? 'JPEG' : extension.toUpperCase();
          metaFormat.textContent = fmt;
        }
        if (metaDimensions) {
          metaDimensions.textContent = `${width} × ${height} px`;
        }
        if (metaFilesize) {
          const mb = (file.size / (1024 * 1024)).toFixed(2);
          metaFilesize.textContent = `${mb} MB`;
        }

        // Switch view from dropzone to image preview panel
        if (dropzone) dropzone.style.display = 'none';
        if (imagePreviewPanel) imagePreviewPanel.style.display = 'flex';
      };
      tempImg.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function clearSelectedImage() {
    state.selectedFile = null;
    resetInspectionResult();
    if (fileInput) fileInput.value = '';
    if (exactUploadedPreview) exactUploadedPreview.src = '';

    if (imagePreviewPanel) imagePreviewPanel.style.display = 'none';
    if (dropzone) dropzone.style.display = 'flex';
    hideValidationError();
  }


  async function inspectSelectedImage() {
    if (!state.selectedFile || state.isInspecting) return;

    state.isInspecting = true;
    hideValidationError();
    if (btnRunInspection) {
      btnRunInspection.disabled = true;
      const label = btnRunInspection.querySelector('span');
      if (label) label.textContent = 'ANALYZING...';
    }
    if (inspectionResultPanel) inspectionResultPanel.style.display = 'block';
    if (resultVerdict) resultVerdict.textContent = 'ANALYZING SURFACE';
    if (resultSummary) resultSummary.textContent = 'Running preprocessing, classification, anomaly scanning and defect localization...';
    if (resultAction) resultAction.textContent = 'LOCAL AI ENGINE // PROCESSING';

    try {
      const formData = new FormData();
      formData.append('image', state.selectedFile);

      const response = await fetch('/api/inspect', {
        method: 'POST',
        body: formData
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || data.explanation || `Inspection failed (${response.status})`);
      }

      // Generate next sequential Product ID for this uploaded sample
      const productId = window.dataLogService
        ? window.dataLogService.generateProductId()
        : `STL-${new Date().getFullYear()}-00001`;

      data.product_id = productId;
      if (data.inspections && data.inspections[0]) {
        data.inspections[0].product_id = productId;
      }

      displayInspectionResult(data);
    } catch (err) {
      console.error('[INSPECTRA Inspection Error]:', err);
      if (inspectionResultPanel) inspectionResultPanel.style.display = 'block';
      if (resultVerdict) resultVerdict.textContent = 'INSPECTION ERROR';
      if (resultSummary) resultSummary.textContent = err.message || 'Could not reach the local AI backend.';
      if (resultAction) resultAction.textContent = 'CHECK THAT FASTAPI IS RUNNING ON PORT 8000';
      if (defectBoxOverlay) defectBoxOverlay.style.display = 'none';
    } finally {
      state.isInspecting = false;
      if (btnRunInspection) {
        btnRunInspection.disabled = false;
        const label = btnRunInspection.querySelector('span');
        if (label) label.textContent = 'RUN AI INSPECTION';
      }
    }
  }

  function displayInspectionResult(data) {
    const result = data?.inspections?.[0] || data;
    if (!result) return;

    const status = String(result.status || '').toUpperCase();
    const isNoProduct = (result.product_detected === false || status === 'NO_PRODUCT');
    const defect = result.defect || '—';
    const confidence = typeof result.confidence === 'number' ? `${result.confidence.toFixed(2)}%` : '—';
    const anomaly = typeof result.anomaly_score === 'number' ? result.anomaly_score.toFixed(6) : '—';
    const severity = result.severity || '—';
    const area = result.measurement?.area_percentage;
    const location = result.location;
    const productBox = result.product_box;
    const productDetected = result.product_detected;

    if (inspectionResultPanel) inspectionResultPanel.style.display = 'block';

    let productId = result.product_id || data?.product_id;
    if (!productId || !String(productId).startsWith('STL-20')) {
      productId = window.dataLogService
        ? window.dataLogService.generateProductId()
        : `STL-${new Date().getFullYear()}-00001`;
      result.product_id = productId;
      if (data) data.product_id = productId;
    }

    if (resultProductId) {
      resultProductId.textContent = isNoProduct ? '—' : productId;
    }

    const confVal = typeof result.confidence === 'number'
      ? result.confidence
      : parseFloat(result.confidence) || 0;

    const decision = isNoProduct
      ? 'NO_PRODUCT'
      : (window.dataLogService
          ? window.dataLogService.calculateDecision(status, confVal)
          : (status === 'SAFE' ? 'PASS' : status === 'DEFECT' ? 'FAIL' : 'REVIEW'));

    // Populate Product Detection Metrics
    if (resultProductDetected) {
      if (isNoProduct) {
        resultProductDetected.textContent = 'NO PRODUCT DETECTED';
        resultProductDetected.style.color = '#ff9100';
      } else if (productDetected === true) {
        resultProductDetected.textContent = '✓ PRODUCT ISOLATED';
        resultProductDetected.style.color = '#00e676';
      } else {
        resultProductDetected.textContent = 'FULL SURFACE SCAN';
        resultProductDetected.style.color = 'var(--text-secondary)';
      }
    }

    if (resultProductConfidence) {
      if (typeof result.product_confidence === 'number' && result.product_confidence > 0 && !isNoProduct) {
        const pConf = result.product_confidence <= 1.0 ? result.product_confidence * 100 : result.product_confidence;
        resultProductConfidence.textContent = `${pConf.toFixed(1)}%`;
      } else if (isNoProduct) {
        resultProductConfidence.textContent = '0.00%';
      } else {
        resultProductConfidence.textContent = '100.0%';
      }
    }

    if (resultProductBox) {
      if (productBox && !isNoProduct) {
        resultProductBox.textContent = `X${productBox.x} Y${productBox.y} · ${productBox.width}×${productBox.height}px`;
      } else {
        resultProductBox.textContent = '—';
      }
    }

    if (resultVerdict) {
      if (isNoProduct) {
        resultVerdict.innerHTML = '<span style="color:#ff9100; font-weight:700;">🟠 NO PRODUCT DETECTED</span> <span style="font-size:0.82rem; color:#8b949e; font-weight:500;">// POSITION PRODUCT IN INSPECTION AREA</span>';
      } else if (decision === 'PASS') {
        resultVerdict.innerHTML = '<span style="color:#00e676; font-weight:700;">🟢 PASS</span> <span style="font-size:0.82rem; color:#8b949e; font-weight:500;">// ASTM COMPLIANT · NO VISUAL DEVIATION</span>';
      } else if (decision === 'FAIL') {
        resultVerdict.innerHTML = `<span style="color:#ff1744; font-weight:700;">🔴 FAIL</span> <span style="font-size:0.82rem; color:#8b949e; font-weight:500;">// DEFECT DETECTED: ${String(defect).toUpperCase()}</span>`;
      } else {
        resultVerdict.innerHTML = '<span style="color:#ff9100; font-weight:700;">🟠 REVIEW</span> <span style="font-size:0.82rem; color:#8b949e; font-weight:500;">// MANUAL QA AUDIT REQUIRED</span>';
      }
    }

    if (isNoProduct) {
      if (resultSummary) resultSummary.textContent = 'Position the product inside the inspection area.';
      if (resultDefect) resultDefect.textContent = '—';
      if (resultConfidence) resultConfidence.textContent = '—';
      if (resultAnomaly) resultAnomaly.textContent = '—';
      if (resultSeverity) resultSeverity.textContent = '—';
      if (resultArea) resultArea.textContent = '—';
      if (resultLocation) resultLocation.textContent = '—';
      if (resultAction) resultAction.textContent = 'ACTION: POSITION PRODUCT INSIDE THE INSPECTION AREA';
      if (defectBoxOverlay) defectBoxOverlay.style.display = 'none';
      if (window.inspectionSession) {
        window.inspectionSession.resetCurrentProduct();
      }
    } else {
      if (resultSummary) resultSummary.textContent = result.message || 'Inspection completed.';
      if (resultDefect) resultDefect.textContent = status === 'SAFE' ? 'NONE' : defect;
      if (resultConfidence) resultConfidence.textContent = confidence;
      if (resultAnomaly) resultAnomaly.textContent = anomaly;
      if (resultSeverity) resultSeverity.textContent = status === 'SAFE' ? 'NONE' : severity;
      if (resultArea) resultArea.textContent = typeof area === 'number' ? `${area.toFixed(2)}%` : '—';
      if (resultLocation) {
        resultLocation.textContent = location
          ? `X${location.x} Y${location.y} · ${location.width}×${location.height}px`
          : '—';
      }
      if (resultAction) {
        resultAction.textContent = status === 'DEFECT'
          ? `ACTION: REJECT & REVIEW ${String(defect).toUpperCase()} REGION`
          : status === 'SAFE'
            ? 'ACTION: APPROVED // SURFACE PASSES ASTM QUALITY CHECK'
            : 'ACTION: HOLD FOR QA MANUAL REVIEW';
      }

      // Save to persistent production data log
      if (window.dataLogService && !isNoProduct) {
        window.dataLogService.saveInspection(result, {
          productId,
          decision,
          status,
          confidence: confVal,
          defect: status === 'SAFE' ? '—' : defect,
          severity: status === 'SAFE' ? '—' : severity,
          affected_area: area,
          location
        });
      }
      if (typeof updateStudioStatsBanner === 'function') {
        updateStudioStatsBanner();
      }
    }

    if (resultSource) resultSource.textContent = 'INSPECTRA LOCAL AI';

    if (!isNoProduct) {
      updateDefectOverlay(result);
    }
  }

  function updateDefectOverlay(result) {
    if (!defectBoxOverlay || !exactUploadedPreview) return;
    const box = result?.location;
    const img = exactUploadedPreview;

    if (!box || !img.naturalWidth || !img.naturalHeight || String(result.status).toUpperCase() !== 'DEFECT') {
      defectBoxOverlay.style.display = 'none';
      return;
    }

    const viewport = img.parentElement;
    const imgRect = img.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();

    const left = (imgRect.left - viewportRect.left) + (box.x / img.naturalWidth) * imgRect.width;
    const top = (imgRect.top - viewportRect.top) + (box.y / img.naturalHeight) * imgRect.height;
    const width = (box.width / img.naturalWidth) * imgRect.width;
    const height = (box.height / img.naturalHeight) * imgRect.height;

    defectBoxOverlay.style.left = `${left}px`;
    defectBoxOverlay.style.top = `${top}px`;
    defectBoxOverlay.style.width = `${Math.max(width, 8)}px`;
    defectBoxOverlay.style.height = `${Math.max(height, 8)}px`;
    defectBoxOverlay.style.display = 'block';
    if (defectBoxLabel) defectBoxLabel.textContent = `${String(result.defect || 'DEFECT').toUpperCase()} · ${result.severity || 'REVIEW'}`;
  }

  function resetInspectionResult() {
    if (inspectionResultPanel) inspectionResultPanel.style.display = 'none';
    if (defectBoxOverlay) defectBoxOverlay.style.display = 'none';
    if (resultVerdict) resultVerdict.textContent = 'READY';
    if (resultSummary) resultSummary.textContent = 'Upload an image and run the inspection.';
    if (resultAction) resultAction.textContent = '';
  }

  function showValidationError(msg) {
    if (uploadValidationError) {
      uploadValidationError.textContent = msg;
      uploadValidationError.style.display = 'block';
    }
  }

  function hideValidationError() {
    if (uploadValidationError) {
      uploadValidationError.textContent = '';
      uploadValidationError.style.display = 'none';
    }
  }

  // ==========================================================================
  // 5. API CONFIGURATION MODAL
  // ==========================================================================
  function setupApiConfig() {
    if (!btnApiConfig || !apiModal) return;

    btnApiConfig.addEventListener('click', () => {
      apiModal.style.display = 'flex';
      if (inputApiKey) inputApiKey.value = state.apiKey;
      if (apiModalStatus) apiModalStatus.style.display = 'none';
    });

    if (btnCloseModal) {
      btnCloseModal.addEventListener('click', () => {
        apiModal.style.display = 'none';
      });
    }

    apiModal.addEventListener('click', (e) => {
      if (e.target === apiModal) {
        apiModal.style.display = 'none';
      }
    });

    if (btnSaveKey) {
      btnSaveKey.addEventListener('click', async () => {
        const key = inputApiKey ? inputApiKey.value.trim() : '';
        state.apiKey = key;
        localStorage.setItem('inspectra_gemini_key', key);

        try {
          await fetch('/api/config/key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: key })
          });
        } catch (err) {
          console.warn('Could not sync key to server:', err);
        }

        if (apiModalStatus) {
          apiModalStatus.style.display = 'block';
          apiModalStatus.style.background = 'rgba(0, 230, 118, 0.12)';
          apiModalStatus.style.border = '1px solid rgba(0, 230, 118, 0.3)';
          apiModalStatus.style.color = 'var(--color-emerald, #00e676)';
          apiModalStatus.textContent = key ? 'API key stored. Gemini Multimodal activated.' : 'Running in local vision mode.';
        }

        updateSystemStatusBadge();
        setTimeout(() => {
          apiModal.style.display = 'none';
        }, 800);
      });
    }

    if (btnClearKey) {
      btnClearKey.addEventListener('click', async () => {
        state.apiKey = '';
        if (inputApiKey) inputApiKey.value = '';
        localStorage.removeItem('inspectra_gemini_key');
        try {
          await fetch('/api/config/key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: '' })
          });
        } catch (e) {}

        if (apiModalStatus) {
          apiModalStatus.style.display = 'block';
          apiModalStatus.style.background = 'rgba(255, 255, 255, 0.05)';
          apiModalStatus.style.border = '1px solid var(--border-subtle)';
          apiModalStatus.style.color = 'var(--text-muted)';
          apiModalStatus.textContent = 'API key removed. Running on local vision engine.';
        }
        updateSystemStatusBadge();
      });
    }

    checkServerConfig();
  }

  async function checkServerConfig() {
    try {
      const res = await fetch('/api/config/status');
      const data = await res.json();
      if (data.hasApiKey && !state.apiKey) {
        if (statusLabel) statusLabel.textContent = 'GEMINI VISION ACTIVE';
      } else {
        updateSystemStatusBadge();
      }
    } catch (e) {
      updateSystemStatusBadge();
    }
  }

  function updateSystemStatusBadge() {
    if (!statusLabel) return;
    if (state.apiKey) {
      statusLabel.textContent = 'GEMINI VISION ACTIVE';
      statusLabel.style.color = 'var(--color-cyan, #00f0ff)';
    } else {
      statusLabel.textContent = 'LOCAL VISION ENGINE';
      statusLabel.style.color = 'var(--color-emerald, #00e676)';
    }
  }

  // ==========================================================================
  // 6. EVENT LISTENERS & BOOTSTRAP
  // ==========================================================================
  window.addEventListener('scroll', updateScrollTarget, { passive: true });
  window.addEventListener('resize', () => {
    resizeCanvas();
    updateScrollTarget();
  });

  // Nav link smooth scroll (only for in-page hash anchors starting with #)
  document.querySelectorAll('.nav-links a').forEach((link) => {
    const href = link.getAttribute('href') || '';
    if (href.startsWith('#') && href.length > 1) {
      link.addEventListener('click', (e) => {
        const targetId = href.substring(1);
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          e.preventDefault();
          targetEl.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }
  });

    // Expose to other non-module scripts (e.g. V2.0 camera inspection script)
  window.displayInspectionResult = displayInspectionResult;

  // Start initialization
  setupUpload();
  setupApiConfig();
  initFrames();
})();

// ============================================================
// INSPECTRA MANUFACTURING TELEMETRY & DATA LOG ADAPTER
// Wraps window.dataLogService for seamless backward compatibility
// ============================================================

let activeLiveCameraProductId = null;

const inspectionSession = {
    get stats() {
        return window.dataLogService
            ? window.dataLogService.getCounters()
            : { total: 0, pass: 0, fail: 0, review: 0, passRate: '0%' };
    },
    get logs() {
        return window.dataLogService ? window.dataLogService.getRecords() : [];
    },
    generateProductId() {
        return window.dataLogService
            ? window.dataLogService.generateProductId()
            : `STL-${new Date().getFullYear()}-00001`;
    },
    getCurrentProductId() {
        if (activeLiveCameraProductId) return activeLiveCameraProductId;
        return window.dataLogService
            ? window.dataLogService.peekCurrentProductId()
            : `STL-${new Date().getFullYear()}-00001`;
    },
    resetCurrentProduct() {
        activeLiveCameraProductId = null;
    },
    recordInspection(productId, decision, defect, confidence, severity, action) {
        if (window.dataLogService && productId && decision !== 'NO_PRODUCT') {
            window.dataLogService.saveInspection({
                product_id: productId,
                status: decision === 'PASS' ? 'SAFE' : decision === 'FAIL' ? 'DEFECT' : 'UNKNOWN',
                defect: defect,
                confidence: confidence,
                severity: severity
            }, { productId, decision });
        }
    },
    updateUI() {
        if (typeof updateStudioStatsBanner === 'function') {
            updateStudioStatsBanner();
        }
    },
    exportCsv() {
        window.dataLogService?.exportCsv();
    },
    resetLog() {
        window.dataLogService?.clearLog();
    }
};

window.inspectionSession = inspectionSession;

// ============================================================
// V2.0 — LIVE CAMERA INSPECTION
// ============================================================

const imageModeBtn = document.getElementById("btn-image-mode");
const cameraModeBtn = document.getElementById("btn-camera-mode");

const imageInspectionMode =
  document.getElementById("image-inspection-mode");

const cameraInspectionMode =
  document.getElementById("camera-inspection-mode");

const cameraVideo = document.getElementById("camera-video");
const cameraCanvas = document.getElementById("camera-canvas");
const cameraReticle = document.getElementById("camera-reticle");
const cameraReticleCenter = document.getElementById("camera-reticle-center");

const cameraStatus = document.getElementById("camera-status");
const cameraCaptureMessage =
  document.getElementById("camera-capture-message");

const startCameraBtn =
  document.getElementById("btn-start-camera");

const captureFrameBtn =
  document.getElementById("btn-capture-frame");

const stopCameraBtn =
  document.getElementById("btn-stop-camera");

const startLiveDetectionBtn =
  document.getElementById("btn-start-live-detection") ||
  document.getElementById("btn-start-live-inspection");

const stopLiveDetectionBtn =
  document.getElementById("btn-stop-live-detection") ||
  document.getElementById("btn-stop-live-inspection");

let cameraStream = null;
let storedCameraFrameCanvas = null;
let latestCameraResult = null;
let isCapturedInspectionActive = false;

// Continuous Live Machine-Vision State
let isLiveDetectionActive = false;
let liveDetectionAnimationId = null;
let isAiRequestInFlight = false;
let currentRequestId = 0;
let lastInferenceTime = 0;
const MIN_INFERENCE_COOLDOWN_MS = 400; // Cooldown to protect CPU backend
const VISUAL_CHANGE_THRESHOLD = 0.055; // 5.5% normalized mean luminance delta
let lastInspectedTinyData = null;
let tinyDiffCanvas = null;


// ------------------------------------------------------------
// INTELLIGENT VISUAL CHANGE DETECTION
// ------------------------------------------------------------

function getTinyFrameData(video) {
    if (!tinyDiffCanvas) {
        tinyDiffCanvas = document.createElement("canvas");
        tinyDiffCanvas.width = 64;
        tinyDiffCanvas.height = 36;
    }
    const tCtx = tinyDiffCanvas.getContext("2d", { willReadFrequently: true });
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

        const rawStatus = String(inspection.status || "").toUpperCase();
        const hasProduct = (inspection.product_detected !== false && rawStatus !== "NO_PRODUCT" && Boolean(inspection.product_box));

        const entry = {
            productDetected: hasProduct,
            productBox: hasProduct ? { ...inspection.product_box } : null,
            status: hasProduct ? rawStatus : "NO_PRODUCT",
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
            return { isUnstable: false, status: "NO_PRODUCT", defect: null };
        }

        const validEntries = this.history.filter(h => h.productDetected);
        if (validEntries.length === 0) {
            return { isUnstable: false, status: "NO_PRODUCT", defect: null };
        }

        // Count defect classes
        const defectCounts = {};
        let maxCount = 0;
        let dominantDefect = null;

        validEntries.forEach(entry => {
            if (entry.status === "DEFECT" && entry.defect) {
                defectCounts[entry.defect] = (defectCounts[entry.defect] || 0) + 1;
                if (defectCounts[entry.defect] > maxCount) {
                    maxCount = defectCounts[entry.defect];
                    dominantDefect = entry.defect;
                }
            }
        });

        // Track transitions
        let transitions = 0;
        for (let i = 1; i < validEntries.length; i++) {
            if (validEntries[i].status !== validEntries[i - 1].status ||
                (validEntries[i].status === "DEFECT" && validEntries[i].defect !== validEntries[i - 1].defect)) {
                transitions++;
            }
        }

        const isJumping = validEntries.length >= 3 && transitions >= (validEntries.length - 1);
        const latest = validEntries[validEntries.length - 1];

        if (isJumping) {
            return { isUnstable: true, status: "UNKNOWN", defect: "Unstable reading" };
        }

        if (latest.status === "DEFECT") {
            if (maxCount >= 2 || latest.confidence >= 80.0) {
                return { isUnstable: false, status: "DEFECT", defect: dominantDefect || latest.defect };
            } else {
                return { isUnstable: true, status: "UNKNOWN", defect: "Uncertain anomaly" };
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
    },

    isUnstable() {
        return this.getStableVerdict().isUnstable;
    }
};


// ------------------------------------------------------------
// IMAGE MODE
// ------------------------------------------------------------

if (imageModeBtn) {
    imageModeBtn.addEventListener("click", () => {
        imageModeBtn.classList.add("active");
        cameraModeBtn?.classList.remove("active");

        if (imageInspectionMode) {
            imageInspectionMode.style.display = "";
        }

        if (cameraInspectionMode) {
            cameraInspectionMode.style.display = "none";
        }

        stopCamera();
    });
}


// ------------------------------------------------------------
// CAMERA MODE
// ------------------------------------------------------------

if (cameraModeBtn) {
    cameraModeBtn.addEventListener("click", () => {
        cameraModeBtn.classList.add("active");
        imageModeBtn?.classList.remove("active");

        if (imageInspectionMode) {
            imageInspectionMode.style.display = "none";
        }

        if (cameraInspectionMode) {
            cameraInspectionMode.style.display = "";
        }

        if (isCapturedInspectionActive && latestCameraResult) {
            setCameraStatus("INSPECTION ARCHIVE VISIBLE");
        } else if (isLiveDetectionActive) {
            setCameraStatus("⚡ LIVE DETECTION ACTIVE");
        } else if (cameraStream) {
            setCameraStatus("● CAMERA LIVE");
        } else {
            setCameraStatus("CAMERA READY");
        }
    });
}


// ------------------------------------------------------------
// COORDINATE SCALING & MACHINE-VISION OVERLAY RENDERER
// ------------------------------------------------------------

function scaleBoundingBox(loc, srcDim, targetDim) {
    if (!loc) return null;

    const x = Number(loc.x) || 0;
    const y = Number(loc.y) || 0;
    const w = Number(loc.width) || 0;
    const h = Number(loc.height) || 0;

    if (w <= 0 || h <= 0) return null;

    // Check if coordinates are normalized (0 to 1)
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
    ctx.lineCap = "square";
    ctx.lineJoin = "miter";

    const l = Math.min(len, w * 0.45, h * 0.45);

    ctx.beginPath();
    // Top-left
    ctx.moveTo(x, y + l);
    ctx.lineTo(x, y);
    ctx.lineTo(x + l, y);

    // Top-right
    ctx.moveTo(x + w - l, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + l);

    // Bottom-left
    ctx.moveTo(x, y + h - l);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + l, y + h);

    // Bottom-right
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
    const titleMetrics = ctx.measureText(title);
    const titleWidth = titleMetrics.width;

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
    ctx.textBaseline = "top";
    ctx.fillText(title, drawX + padX, drawY + padY);

    if (subtitle) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.90)";
        ctx.font = subFont;
        ctx.fillText(subtitle, drawX + padX, drawY + padY + Math.round(16 * scale));
    }

    ctx.restore();
}

// ------------------------------------------------------------
// TRANSPARENT LIVE OVERLAY (RENDERED OVER RUNNING VIDEO)
// ------------------------------------------------------------

function drawLiveCameraOverlay(data) {
    if (!cameraCanvas) return;

    const width = cameraCanvas.width || (cameraVideo ? cameraVideo.videoWidth : 1280) || 1280;
    const height = cameraCanvas.height || (cameraVideo ? cameraVideo.videoHeight : 720) || 720;
    if (cameraCanvas.width !== width || cameraCanvas.height !== height) {
        cameraCanvas.width = width;
        cameraCanvas.height = height;
    }

    const ctx = cameraCanvas.getContext("2d");

    // Clear canvas so running video underneath is 100% visible
    ctx.clearRect(0, 0, width, height);

    // If manual single-shot capture mode is active, paint the frozen captured frame base
    if (isCapturedInspectionActive && storedCameraFrameCanvas) {
        ctx.drawImage(storedCameraFrameCanvas, 0, 0, width, height);
    }

    const inspection = data?.inspections?.[0] || data;
    if (!inspection) return;

    const scale = Math.max(width, height) / 1000;
    const pad = Math.round(16 * scale);

    const srcDim = {
        width: Number(inspection.dimensions?.width || inspection.image_width) || width,
        height: Number(inspection.dimensions?.height || inspection.image_height) || height
    };
    const targetDim = { width, height };

    const rawStatus = String(inspection.status || "").toUpperCase();
    const productDetected = (inspection.product_detected !== false && rawStatus !== "NO_PRODUCT" && Boolean(inspection.product_box));

    // ========================================================
    // STATE 1: NO PRODUCT DETECTED
    // Draw targeting search reticle — NEVER draw full-frame box!
    // ========================================================
    if (!productDetected) {
        ctx.save();
        const amberColor = "#ff9100";

        // Center search reticle in middle 46% of frame
        const reticleW = Math.round(width * 0.46);
        const reticleH = Math.round(height * 0.46);
        const reticleX = Math.round((width - reticleW) / 2);
        const reticleY = Math.round((height - reticleH) / 2);

        // Dashed reticle boundary
        ctx.strokeStyle = "rgba(255, 145, 0, 0.45)";
        ctx.lineWidth = Math.max(1.5, Math.round(2 * scale));
        ctx.setLineDash([8 * scale, 6 * scale]);
        ctx.strokeRect(reticleX, reticleY, reticleW, reticleH);
        ctx.setLineDash([]);

        // Solid corner brackets around search reticle
        drawCornerBrackets(
            ctx,
            reticleX,
            reticleY,
            reticleW,
            reticleH,
            Math.round(24 * scale),
            amberColor,
            Math.max(2, Math.round(3 * scale))
        );

        // Center crosshair marker
        const centerX = Math.round(width / 2);
        const centerY = Math.round(height / 2);
        const crossSize = Math.round(14 * scale);
        ctx.strokeStyle = "rgba(255, 145, 0, 0.7)";
        ctx.lineWidth = Math.max(1.5, Math.round(2 * scale));
        ctx.beginPath();
        ctx.moveTo(centerX - crossSize, centerY);
        ctx.lineTo(centerX + crossSize, centerY);
        ctx.moveTo(centerX, centerY - crossSize);
        ctx.lineTo(centerX, centerY + crossSize);
        ctx.stroke();

        // Prominent HUD Badge at top
        drawHudBadge(
            ctx,
            pad + Math.round(10 * scale),
            pad + Math.round(10 * scale),
            "🟠 NO PRODUCT DETECTED // POSITION PRODUCT IN INSPECTION AREA",
            "ALIGN METAL COMPONENT IN RETICLE FOR MACHINE VISION SCAN",
            "rgba(34, 18, 2, 0.94)",
            amberColor,
            amberColor,
            scale
        );

        // Bottom telemetry tag
        const stats = window.inspectionSession?.stats || { total: 0, pass: 0, fail: 0, review: 0 };
        const passRate = stats.total > 0 ? Math.round((stats.pass / stats.total) * 100) : 100;
        const batchLine = `INSPECTRA BATCH // TOTAL: ${stats.total} · PASS: ${stats.pass} · FAIL: ${stats.fail} · REVIEW: ${stats.review} · RATE: ${passRate}%`;

        ctx.font = `600 ${Math.round(9.5 * scale)}px "JetBrains Mono", monospace`;
        ctx.fillStyle = "rgba(255, 145, 0, 0.85)";
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText(
            batchLine,
            width - pad - Math.round(12 * scale),
            height - pad - Math.round(8 * scale)
        );

        ctx.restore();
        return;
    }

    // ========================================================
    // STATES 2, 3, 4: PRODUCT DETECTED
    // Scale product box (using temporal smoothing if available)
    // ========================================================
    const rawBox = inspection.product_box;
    const smoothed = temporalBuffer.getSmoothedProductBox();
    const effectiveBox = smoothed || rawBox;
    const prodBox = scaleBoundingBox(effectiveBox, srcDim, targetDim);

    if (!prodBox) return;

    const verdict = temporalBuffer.getStableVerdict();
    const isUnstable = verdict.isUnstable;
    const status = verdict.status;
    const defect = verdict.defect || inspection.defect || "DEFECT";

    const productId = data?.product_id || inspection?.product_id || (window.inspectionSession ? window.inspectionSession.getCurrentProductId() : "STL-PROD");
    const stats = window.inspectionSession?.stats || { total: 0, pass: 0, fail: 0, review: 0 };
    const passRate = stats.total > 0 ? Math.round((stats.pass / stats.total) * 100) : 100;
    const batchLine = `INSPECTRA BATCH // TOTAL: ${stats.total} · PASS: ${stats.pass} · FAIL: ${stats.fail} · REVIEW: ${stats.review} · RATE: ${passRate}%`;

    const confidence = typeof inspection.confidence === "number"
        ? inspection.confidence.toFixed(2)
        : (inspection.confidence || "—");
    const anomaly = typeof inspection.anomaly_score === "number"
        ? inspection.anomaly_score.toFixed(6)
        : (inspection.anomaly_score !== undefined ? inspection.anomaly_score : "—");
    const severity = inspection.severity || "HIGH";
    const area = inspection.measurement?.area_percentage !== undefined
        ? `${inspection.measurement.area_percentage}%`
        : (inspection.area_percentage !== undefined ? `${inspection.area_percentage}%` : "—");

    // Product ID tag positioning on top of product box
    let prodBadgeY = prodBox.y - Math.round(28 * scale);
    if (prodBadgeY < pad) prodBadgeY = prodBox.y + 4;

    if (isUnstable || status === "UNKNOWN") {
        // ========================================================
        // STATE 4: UNKNOWN / MANUAL REVIEW (ORANGE PRODUCT BOX)
        // ========================================================
        const amberColor = "#ff9100";
        ctx.save();

        ctx.fillStyle = "rgba(255, 145, 0, 0.07)";
        ctx.fillRect(prodBox.x, prodBox.y, prodBox.width, prodBox.height);

        ctx.strokeStyle = amberColor;
        ctx.lineWidth = Math.max(2.5, Math.round(3.5 * scale));
        ctx.strokeRect(prodBox.x, prodBox.y, prodBox.width, prodBox.height);

        drawCornerBrackets(
            ctx,
            prodBox.x,
            prodBox.y,
            prodBox.width,
            prodBox.height,
            Math.min(Math.round(24 * scale), prodBox.width * 0.3, prodBox.height * 0.3),
            amberColor,
            Math.round(4.5 * scale)
        );

        // Product ID tag
        drawHudBadge(
            ctx,
            prodBox.x,
            prodBadgeY,
            `🆔 ${productId} · REVIEW`,
            null,
            "rgba(34, 18, 2, 0.94)",
            amberColor,
            amberColor,
            scale
        );

        let badgeY = prodBox.y - Math.round(44 * scale);
        if (badgeY < pad) badgeY = prodBox.y + prodBox.height + Math.round(6 * scale);

        drawHudBadge(
            ctx,
            prodBox.x,
            badgeY,
            isUnstable ? "⚠️ UNSTABLE CLASSIFICATION" : "🟠 REVIEW // UNCERTAIN ANOMALY",
            isUnstable ? `PRODUCT ID: ${productId} · PREDICTION JUMPING · HOLD STEADY` : `PRODUCT ID: ${productId} · QA AUDIT RECOMMENDED · CONF: ${confidence}%`,
            "rgba(34, 18, 2, 0.94)",
            amberColor,
            amberColor,
            scale
        );

        ctx.font = `600 ${Math.round(9.5 * scale)}px "JetBrains Mono", monospace`;
        ctx.fillStyle = "rgba(255, 145, 0, 0.85)";
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText(
            batchLine,
            width - pad - Math.round(12 * scale),
            height - pad - Math.round(8 * scale)
        );
        ctx.restore();

    } else if (status === "DEFECT") {
        // ========================================================
        // STATE 3: CONFIRMED DEFECT
        // 1. GREEN Product Boundary Box
        // 2. RED Defect Boundary Box strictly inside
        // ========================================================
        const greenColor = "#00e676";
        const redColor = "#ff1744";

        ctx.save();

        // 1. Draw GREEN PRODUCT BOX
        ctx.fillStyle = "rgba(0, 230, 118, 0.05)";
        ctx.fillRect(prodBox.x, prodBox.y, prodBox.width, prodBox.height);

        ctx.strokeStyle = greenColor;
        ctx.lineWidth = Math.max(2.5, Math.round(3 * scale));
        ctx.strokeRect(prodBox.x, prodBox.y, prodBox.width, prodBox.height);

        drawCornerBrackets(
            ctx,
            prodBox.x,
            prodBox.y,
            prodBox.width,
            prodBox.height,
            Math.min(Math.round(22 * scale), prodBox.width * 0.25, prodBox.height * 0.25),
            greenColor,
            Math.round(4.5 * scale)
        );

        // Product detected & ID tag on top of product box
        drawHudBadge(
            ctx,
            prodBox.x,
            prodBadgeY,
            `🆔 ${productId} · FAIL`,
            null,
            "rgba(36, 4, 10, 0.95)",
            redColor,
            redColor,
            scale
        );

        // 2. Draw RED DEFECT BOX strictly inside product box
        const rawDefectBox = scaleBoundingBox(inspection.location, srcDim, targetDim);
        if (rawDefectBox) {
            const defectX = Math.max(prodBox.x + 2, Math.min(rawDefectBox.x, prodBox.x + prodBox.width - 20));
            const defectY = Math.max(prodBox.y + 2, Math.min(rawDefectBox.y, prodBox.y + prodBox.height - 20));
            const defectW = Math.max(16, Math.min(rawDefectBox.width, prodBox.x + prodBox.width - defectX - 2));
            const defectH = Math.max(16, Math.min(rawDefectBox.height, prodBox.y + prodBox.height - defectY - 2));

            // Translucent red fill
            ctx.fillStyle = "rgba(255, 23, 68, 0.22)";
            ctx.fillRect(defectX, defectY, defectW, defectH);

            // Red border
            ctx.strokeStyle = redColor;
            ctx.lineWidth = Math.max(2.5, Math.round(3 * scale));
            ctx.strokeRect(defectX, defectY, defectW, defectH);

            // Red corner brackets
            const defectCornerLen = Math.min(Math.round(14 * scale), defectW * 0.35, defectH * 0.35);
            drawCornerBrackets(
                ctx,
                defectX,
                defectY,
                defectW,
                defectH,
                defectCornerLen,
                redColor,
                Math.round(4 * scale)
            );

            // Red defect badge
            let defectBadgeY = defectY - Math.round(44 * scale);
            if (defectBadgeY < prodBox.y) {
                defectBadgeY = defectY + defectH + Math.round(6 * scale);
            }
            if (defectBadgeY + Math.round(44 * scale) > height - pad) {
                defectBadgeY = defectY + Math.round(6 * scale);
            }

            drawHudBadge(
                ctx,
                defectX,
                defectBadgeY,
                `🔴 FAIL // ${String(defect).toUpperCase()}`,
                `PRODUCT ID: ${productId} · CONF: ${confidence}% · SEVERITY: ${severity}`,
                "rgba(36, 4, 10, 0.95)",
                redColor,
                "#ffffff",
                scale
            );
        }

        // Bottom telemetry tag
        ctx.font = `600 ${Math.round(9.5 * scale)}px "JetBrains Mono", monospace`;
        ctx.fillStyle = "rgba(255, 23, 68, 0.85)";
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText(
            batchLine,
            width - pad - Math.round(12 * scale),
            height - pad - Math.round(8 * scale)
        );

        ctx.restore();

    } else if (status === "SAFE") {
        // ========================================================
        // STATE 2: PRODUCT SAFE (GREEN PRODUCT BOX)
        // ========================================================
        const greenColor = "#00e676";
        ctx.save();

        ctx.fillStyle = "rgba(0, 230, 118, 0.05)";
        ctx.fillRect(prodBox.x, prodBox.y, prodBox.width, prodBox.height);

        ctx.strokeStyle = greenColor;
        ctx.lineWidth = Math.max(3, Math.round(3.5 * scale));
        ctx.strokeRect(prodBox.x, prodBox.y, prodBox.width, prodBox.height);

        drawCornerBrackets(
            ctx,
            prodBox.x,
            prodBox.y,
            prodBox.width,
            prodBox.height,
            Math.min(Math.round(28 * scale), prodBox.width * 0.3, prodBox.height * 0.3),
            greenColor,
            Math.round(5 * scale)
        );

        // Product ID tag on top of product box
        drawHudBadge(
            ctx,
            prodBox.x,
            prodBadgeY,
            `🆔 ${productId} · PASS`,
            null,
            "rgba(2, 28, 14, 0.94)",
            greenColor,
            greenColor,
            scale
        );

        let badgeY = prodBox.y - Math.round(44 * scale);
        if (badgeY < pad) badgeY = prodBox.y + prodBox.height + Math.round(6 * scale);

        drawHudBadge(
            ctx,
            prodBox.x,
            badgeY,
            "🟢 PASS // ASTM COMPLIANT",
            `PRODUCT ID: ${productId} · NO VISUAL DEVIATION · CONF: ${confidence}%`,
            "rgba(2, 28, 14, 0.94)",
            greenColor,
            greenColor,
            scale
        );

        ctx.font = `600 ${Math.round(9.5 * scale)}px "JetBrains Mono", monospace`;
        ctx.fillStyle = "rgba(0, 230, 118, 0.85)";
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText(
            batchLine,
            width - pad - Math.round(12 * scale),
            height - pad - Math.round(8 * scale)
        );
        ctx.restore();
    }
}

// ------------------------------------------------------------
// CAPTURED INSPECTION OVERLAY (FOR MANUAL SINGLE-SHOT CAPTURE)
// ------------------------------------------------------------

function drawCapturedInspectionOverlay(data) {
    if (!cameraCanvas || !storedCameraFrameCanvas) return;

    const ctx = cameraCanvas.getContext("2d");
    const width = cameraCanvas.width;
    const height = cameraCanvas.height;

    // Draw base captured frame
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(storedCameraFrameCanvas, 0, 0, width, height);

    // Draw machine-vision overlays on top
    drawLiveCameraOverlay(data);
}

function drawScanningHudOverlay() {
    if (!cameraCanvas || !storedCameraFrameCanvas) return;
    const ctx = cameraCanvas.getContext("2d");
    const width = cameraCanvas.width;
    const height = cameraCanvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(storedCameraFrameCanvas, 0, 0, width, height);

    const scale = Math.max(width, height) / 1000;
    const pad = Math.round(16 * scale);

    ctx.save();
    ctx.strokeStyle = "rgba(0, 240, 255, 0.4)";
    ctx.lineWidth = Math.max(2, Math.round(2 * scale));
    ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);

    drawCornerBrackets(
        ctx,
        pad,
        pad,
        width - pad * 2,
        height - pad * 2,
        Math.round(28 * scale),
        "#00f0ff",
        Math.max(2, Math.round(3 * scale))
    );

    drawHudBadge(
        ctx,
        pad + Math.round(10 * scale),
        pad + Math.round(10 * scale),
        "🔍 ANALYZING SURFACE // RUNNING INSPECTRA AI",
        "OBJECT SEGMENTATION & SURFACE DEFECT LOCALIZATION...",
        "rgba(2, 14, 24, 0.92)",
        "#00f0ff",
        "#00f0ff",
        scale
    );
    ctx.restore();
}


// ------------------------------------------------------------
// START CAMERA
// ------------------------------------------------------------

async function startCamera() {
    try {
        setCameraStatus("REQUESTING CAMERA...");

        if (cameraVideo) {
            cameraVideo.style.display = "block";
            cameraVideo.muted = true;
            cameraVideo.playsInline = true;
        }
        if (cameraCanvas) {
            cameraCanvas.style.display = "none";
            cameraCanvas.style.background = "transparent";
            const ctx = cameraCanvas.getContext("2d");
            ctx.clearRect(0, 0, cameraCanvas.width, cameraCanvas.height);
        }
        if (cameraReticle) {
            cameraReticle.style.display = "";
        }
        if (cameraReticleCenter) {
            cameraReticleCenter.style.display = "";
        }
        isCapturedInspectionActive = false;
        latestCameraResult = null;

        if (!cameraStream) {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: "environment",
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            });
        }

        if (cameraVideo) {
            cameraVideo.muted = true;
            cameraVideo.playsInline = true;
            cameraVideo.srcObject = cameraStream;

            console.log("camera stream:", cameraStream);
            console.log("video:", cameraVideo);

            await new Promise((resolve) => {
                let done = false;
                const finish = () => {
                    if (!done) {
                        done = true;
                        resolve();
                    }
                };
                cameraVideo.onloadedmetadata = finish;
                cameraVideo.onplaying = finish;
                cameraVideo.play().then(finish).catch((err) => {
                    console.warn("cameraVideo.play() warning:", err);
                    finish();
                });
                setTimeout(finish, 500);
            });

            console.log("video width:", cameraVideo.videoWidth);
            console.log("video height:", cameraVideo.videoHeight);
            console.log("video readyState:", cameraVideo.readyState);

            if (cameraCanvas && cameraVideo.videoWidth && cameraVideo.videoHeight) {
                cameraCanvas.width = cameraVideo.videoWidth;
                cameraCanvas.height = cameraVideo.videoHeight;
            }
        }

        setCameraStatus("● CAMERA LIVE");

        if (captureFrameBtn) {
            captureFrameBtn.disabled = false;
        }
        if (startLiveDetectionBtn) {
            startLiveDetectionBtn.disabled = false;
            startLiveDetectionBtn.style.display = "";
        }
        if (stopLiveDetectionBtn) {
            stopLiveDetectionBtn.disabled = true;
            stopLiveDetectionBtn.style.display = "none";
        }
        if (stopCameraBtn) {
            stopCameraBtn.disabled = false;
        }
        if (startCameraBtn) {
            startCameraBtn.disabled = true;
        }

        if (cameraCaptureMessage) {
            cameraCaptureMessage.textContent =
                "Live feed active. Position product in reticle and click START LIVE DETECTION or CAPTURE FRAME.";
        }

    } catch (error) {
        console.error("Camera error:", error);
        setCameraStatus("CAMERA ACCESS FAILED");

        if (cameraCaptureMessage) {
            cameraCaptureMessage.textContent =
                "Camera access was denied or is unavailable.";
        }
    }
}


// ------------------------------------------------------------
// CONTINUOUS LIVE DETECTION (requestAnimationFrame LOOP)
// ------------------------------------------------------------

async function startLiveDetection() {
    if (!cameraStream) {
        await startCamera();
        if (!cameraStream) return;
    }

    isLiveDetectionActive = true;
    isCapturedInspectionActive = false;
    isAiRequestInFlight = false;
    lastInspectedTinyData = null;
    lastInferenceTime = 0;
    temporalBuffer.clear();

    // Ensure video is visible and playing smoothly
    if (cameraVideo) {
        cameraVideo.style.display = "block";
    }
    if (cameraCanvas) {
        cameraCanvas.style.display = "block";
        cameraCanvas.style.background = "transparent";
        if (cameraVideo && cameraVideo.videoWidth && cameraVideo.videoHeight) {
            cameraCanvas.width = cameraVideo.videoWidth;
            cameraCanvas.height = cameraVideo.videoHeight;
        }
        const ctx = cameraCanvas.getContext("2d");
        ctx.clearRect(0, 0, cameraCanvas.width, cameraCanvas.height);
    }
    // Reticle is drawn directly on canvas during live detection
    if (cameraReticle) cameraReticle.style.display = "none";
    if (cameraReticleCenter) cameraReticleCenter.style.display = "none";

    if (startLiveDetectionBtn) {
        startLiveDetectionBtn.style.display = "none";
    }
    if (stopLiveDetectionBtn) {
        stopLiveDetectionBtn.style.display = "";
        stopLiveDetectionBtn.disabled = false;
    }
    if (captureFrameBtn) {
        captureFrameBtn.disabled = false;
    }

    setCameraStatus("LIVE AI SCANNING");
    if (cameraCaptureMessage) {
        cameraCaptureMessage.textContent =
            "Continuous live detection active. Analyzing stream periodically with INSPECTRA AI.";
    }

    // Launch requestAnimationFrame loop
    if (liveDetectionAnimationId) {
        cancelAnimationFrame(liveDetectionAnimationId);
    }
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
        startLiveDetectionBtn.style.display = "";
        startLiveDetectionBtn.disabled = !cameraStream;
    }
    if (stopLiveDetectionBtn) {
        stopLiveDetectionBtn.style.display = "none";
        stopLiveDetectionBtn.disabled = true;
    }

    // Clear and hide live overlay canvas
    if (cameraCanvas) {
        cameraCanvas.style.display = "none";
        const ctx = cameraCanvas.getContext("2d");
        ctx.clearRect(0, 0, cameraCanvas.width, cameraCanvas.height);
    }

    if (cameraVideo) {
        cameraVideo.style.display = "block";
    }

    if (cameraStream) {
        if (cameraReticle) cameraReticle.style.display = "";
        if (cameraReticleCenter) cameraReticleCenter.style.display = "";
        setCameraStatus("● CAMERA LIVE");
        if (cameraCaptureMessage) {
            cameraCaptureMessage.textContent =
                "Live detection stopped. Click START LIVE DETECTION or CAPTURE FRAME.";
        }
    }
}

function liveDetectionLoop(timestamp) {
    if (!isLiveDetectionActive) return;

    // Check that video is playing and ready
    if (!cameraVideo || cameraVideo.readyState < 2) {
        liveDetectionAnimationId = requestAnimationFrame(liveDetectionLoop);
        return;
    }

    const now = performance.now();

    // Latest-Frame Strategy: If AI inference is already running, DO NOT queue!
    if (isAiRequestInFlight) {
        liveDetectionAnimationId = requestAnimationFrame(liveDetectionLoop);
        return;
    }

    // Periodic inspection cadence every 1.2s to maintain continuous live inspection
    const INSPECTION_INTERVAL_MS = 1200;
    if (now - lastInferenceTime >= INSPECTION_INTERVAL_MS) {
        lastInferenceTime = now;
        triggerLiveInference();
    }

    liveDetectionAnimationId = requestAnimationFrame(liveDetectionLoop);
}

async function triggerLiveInference() {
    if (!isLiveDetectionActive || isAiRequestInFlight || !cameraVideo || cameraVideo.readyState < 2) {
        return;
    }

    const width = cameraVideo.videoWidth;
    const height = cameraVideo.videoHeight;
    if (!width || !height) return;

    isAiRequestInFlight = true;
    const thisRequestId = ++currentRequestId;

    try {
        console.log('[LIVE INSPECTION] loop started');

        if (!storedCameraFrameCanvas) {
            storedCameraFrameCanvas = document.createElement("canvas");
        }
        storedCameraFrameCanvas.width = width;
        storedCameraFrameCanvas.height = height;
        const sCtx = storedCameraFrameCanvas.getContext("2d");
        sCtx.drawImage(cameraVideo, 0, 0, width, height);

        console.log(`[LIVE INSPECTION] frame captured (${width}x${height})`);

        // Synchronize cameraCanvas dimensions with video resolution
        if (cameraCanvas && (cameraCanvas.width !== width || cameraCanvas.height !== height)) {
            cameraCanvas.width = width;
            cameraCanvas.height = height;
        }

        const blob = await new Promise((resolve) =>
            storedCameraFrameCanvas.toBlob(resolve, "image/jpeg", 0.85)
        );

        if (!blob || !isLiveDetectionActive || thisRequestId !== currentRequestId) {
            isAiRequestInFlight = false;
            return;
        }

        const currentId = activeLiveCameraProductId || (window.dataLogService
            ? window.dataLogService.peekCurrentProductId()
            : (window.inspectionSession ? window.inspectionSession.getCurrentProductId() : `STL-${new Date().getFullYear()}-00001`));

        const formData = new FormData();
        formData.append("product_id", currentId);
        formData.append("metadata", JSON.stringify([{ image_id: "CAM-LIVE", view: "CAMERA" }]));
        formData.append("image", blob, "live_frame.jpg");

        setCameraStatus("ANALYZING FRAME");
        console.log('[LIVE INSPECTION] request started');

        const response = await fetch("/api/inspect", {
            method: "POST",
            body: formData
        });

        console.log(`[LIVE INSPECTION] request completed (status: ${response.status})`);
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `AI backend returned ${response.status}`);
        }

        const result = await response.json();

        // Discard if user stopped or newer request completed
        if (!isLiveDetectionActive || thisRequestId !== currentRequestId) {
            return;
        }

        const inspection = result.inspections?.[0] || result;
        const rawStatus = String(inspection?.status || result.product_status || "").toUpperCase().trim();
        console.log(`[LIVE INSPECTION] result status: ${rawStatus}`);

        window.cameraInspectionResult = result;
        latestCameraResult = result;

        // Push into temporal buffer for stabilization
        temporalBuffer.push(result);

        const isProd = (inspection.product_detected !== false && rawStatus !== "NO_PRODUCT" && Boolean(inspection.product_box));
        const verdict = temporalBuffer.getStableVerdict();

        // Update camera status indicator with explicit states
        if (!isProd || verdict.status === "NO_PRODUCT") {
            setCameraStatus("NO PRODUCT DETECTED");
            activeLiveCameraProductId = null;
            if (window.inspectionSession) {
                window.inspectionSession.resetCurrentProduct();
            }
        } else {
            // Manage active product session: assign ONE sequential Product ID for this physical unit
            if (!activeLiveCameraProductId) {
                activeLiveCameraProductId = window.dataLogService
                    ? window.dataLogService.generateProductId()
                    : `STL-${new Date().getFullYear()}-00001`;
            }
            result.product_id = activeLiveCameraProductId;
            if (inspection) inspection.product_id = activeLiveCameraProductId;

            if (verdict.isUnstable) {
                setCameraStatus("UNKNOWN PATTERN");
            } else if (verdict.status === "DEFECT") {
                setCameraStatus(`DEFECT DETECTED [${String(verdict.defect || inspection.defect || "").toUpperCase()}]`);
            } else if (verdict.status === "SAFE") {
                setCameraStatus("PRODUCT SAFE");
            } else {
                setCameraStatus("UNKNOWN PATTERN");
            }

            // Save or update that ONE product record in persistent Data Log
            if (window.dataLogService) {
                window.dataLogService.saveInspection(result, {
                    productId: activeLiveCameraProductId,
                    status: verdict.status || rawStatus
                });
            }
        }

        // Update result panel
        const renderResultFn =
            window.displayInspectionResult ||
            (typeof displayInspectionResult === "function" ? displayInspectionResult : null);
        if (renderResultFn) {
            renderResultFn(result);
        }

        // Draw transparent machine-vision overlay on top of running live video
        drawLiveCameraOverlay(result);

    } catch (err) {
        console.error("[LIVE INSPECTION] Error:", err);
        if (isLiveDetectionActive) {
            setCameraStatus("AI INSPECTION FAILED");
        }
    } finally {
        if (thisRequestId === currentRequestId) {
            isAiRequestInFlight = false;
        }
    }
}


// ------------------------------------------------------------
// MANUAL SINGLE-SHOT CAPTURE (FALLBACK WORKFLOW)
// ------------------------------------------------------------

async function captureCameraFrame() {
    if (!cameraVideo || !cameraCanvas) {
        return;
    }

    if (!cameraStream || cameraVideo.readyState < 2) {
        setCameraStatus("START CAMERA FIRST");
        if (cameraCaptureMessage) cameraCaptureMessage.textContent = "Camera is not active. Click START CAMERA first.";
        return;
    }

    // Pause live detection if active to freeze on single capture
    if (isLiveDetectionActive) {
        stopLiveDetection();
    }

    const width = cameraVideo.videoWidth;
    const height = cameraVideo.videoHeight;

    if (!width || !height) {
        setCameraStatus("CAMERA NOT READY");
        return;
    }

    console.log('[INSPECTRA CAMERA] capture started');
    console.log(`[INSPECTRA CAMERA] frame dimensions: ${width}x${height}`);

    // Offscreen storage for clean captured frame
    if (!storedCameraFrameCanvas) {
        storedCameraFrameCanvas = document.createElement("canvas");
    }
    storedCameraFrameCanvas.width = width;
    storedCameraFrameCanvas.height = height;
    const storedCtx = storedCameraFrameCanvas.getContext("2d");
    storedCtx.drawImage(cameraVideo, 0, 0, width, height);

    cameraCanvas.width = width;
    cameraCanvas.height = height;

    // Freeze display on camera canvas
    if (cameraVideo) {
        cameraVideo.style.display = "none";
    }
    cameraCanvas.style.display = "block";
    if (cameraReticle) {
        cameraReticle.style.display = "none";
    }
    if (cameraReticleCenter) {
        cameraReticleCenter.style.display = "none";
    }
    isCapturedInspectionActive = true;

    // Draw initial captured frame on frozen canvas
    const cCtx = cameraCanvas.getContext("2d");
    cCtx.clearRect(0, 0, width, height);
    cCtx.drawImage(storedCameraFrameCanvas, 0, 0, width, height);

    setCameraStatus("ANALYZING FRAME");
    if (cameraCaptureMessage) {
        cameraCaptureMessage.textContent =
            "Frame captured. Sending to INSPECTRA AI engine...";
    }

    if (captureFrameBtn) {
        captureFrameBtn.disabled = true;
    }

    try {
        const blob = await new Promise((resolve) =>
            storedCameraFrameCanvas.toBlob(resolve, "image/jpeg", 0.90)
        );

        if (!blob) {
            throw new Error("Canvas toBlob failed");
        }
        console.log(`[INSPECTRA CAMERA] blob created (${blob.size} bytes)`);

        window.inspectedCameraFrame = blob;

        const productId = activeLiveCameraProductId || (window.dataLogService
            ? window.dataLogService.generateProductId()
            : (window.inspectionSession ? window.inspectionSession.generateProductId() : `STL-${new Date().getFullYear()}-00001`));

        const formData = new FormData();
        formData.append("product_id", productId);
        formData.append("metadata", JSON.stringify([{ image_id: "CAM-001", view: "CAMERA" }]));
        formData.append("image", blob, "camera_capture.jpg");

        console.log('[INSPECTRA CAMERA] request sent to /api/inspect');
        const response = await fetch("/api/inspect", {
            method: "POST",
            body: formData
        });

        console.log(`[INSPECTRA CAMERA] response status: ${response.status}`);
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `AI server returned ${response.status}`);
        }

        const result = await response.json();
        console.log('[INSPECTRA CAMERA] response JSON:', result);

        result.product_id = productId;
        const inspection = result.inspections?.[0] || result;
        if (inspection) inspection.product_id = productId;

        window.cameraInspectionResult = result;
        latestCameraResult = result;

        temporalBuffer.push(result);

        const rawStatus = String(inspection?.status || result.product_status || "").toUpperCase().trim();
        const isProd = (inspection?.product_detected !== false && rawStatus !== "NO_PRODUCT");

        if (!isProd) {
            setCameraStatus("NO PRODUCT DETECTED");
            activeLiveCameraProductId = null;
            if (window.inspectionSession) {
                window.inspectionSession.resetCurrentProduct();
            }
        } else if (rawStatus === "SAFE") {
            setCameraStatus("PRODUCT SAFE");
            if (window.dataLogService) {
                window.dataLogService.saveInspection(result, { productId, status: "SAFE" });
            }
        } else if (rawStatus === "DEFECT") {
            setCameraStatus(`DEFECT DETECTED [${String(inspection.defect || "").toUpperCase()}]`);
            if (window.dataLogService) {
                window.dataLogService.saveInspection(result, { productId, status: "DEFECT" });
            }
        } else {
            setCameraStatus("UNKNOWN PATTERN");
            if (window.dataLogService) {
                window.dataLogService.saveInspection(result, { productId, status: "UNKNOWN" });
            }
        }

        if (cameraCaptureMessage) {
            cameraCaptureMessage.textContent =
                "AI inspection completed. Click START CAMERA or START LIVE DETECTION to continue.";
        }

        console.log('[INSPECTRA CAMERA] renderer called');
        const renderResultFn = window.displayInspectionResult || (typeof displayInspectionResult === "function" ? displayInspectionResult : null);
        if (renderResultFn) {
            renderResultFn(result);
        }

        // Draw frozen frame + overlay
        drawCapturedInspectionOverlay(result);

    } catch (error) {
        console.error('[INSPECTRA CAMERA] Error:', error);
        setCameraStatus("AI INSPECTION FAILED");

        if (cameraCaptureMessage) {
            cameraCaptureMessage.textContent = `AI inspection error: ${error.message}`;
        }
    } finally {
        if (startCameraBtn) startCameraBtn.disabled = false;
        if (captureFrameBtn) captureFrameBtn.disabled = false;
        if (startLiveDetectionBtn) startLiveDetectionBtn.disabled = false;
    }
}


// ------------------------------------------------------------
// STOP CAMERA
// ------------------------------------------------------------

function stopCamera() {
    if (isLiveDetectionActive) {
        stopLiveDetection();
    }

    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    if (cameraVideo) {
        cameraVideo.srcObject = null;
    }

    if (startCameraBtn) {
        startCameraBtn.disabled = false;
    }
    if (captureFrameBtn) {
        captureFrameBtn.disabled = true;
    }
    if (startLiveDetectionBtn) {
        startLiveDetectionBtn.disabled = true;
        startLiveDetectionBtn.style.display = "";
    }
    if (stopLiveDetectionBtn) {
        stopLiveDetectionBtn.disabled = true;
        stopLiveDetectionBtn.style.display = "none";
    }
    if (stopCameraBtn) {
        stopCameraBtn.disabled = true;
    }

    if (isCapturedInspectionActive) {
        setCameraStatus("CAMERA STOPPED // RESULT PRESERVED");
        if (cameraCaptureMessage) {
            cameraCaptureMessage.textContent =
                "Camera stopped. Visual inspection result is retained.";
        }
    } else {
        if (cameraCanvas) {
            cameraCanvas.style.display = "none";
            const ctx = cameraCanvas.getContext("2d");
            ctx.clearRect(0, 0, cameraCanvas.width, cameraCanvas.height);
        }
        if (cameraReticle) {
            cameraReticle.style.display = "";
        }
        if (cameraReticleCenter) {
            cameraReticleCenter.style.display = "";
        }
        setCameraStatus("CAMERA STOPPED");
        if (cameraCaptureMessage) {
            cameraCaptureMessage.textContent = "Camera stopped.";
        }
    }
}


// ------------------------------------------------------------
// STATUS HELPER
// ------------------------------------------------------------

function setCameraStatus(message) {
    if (cameraStatus) {
        cameraStatus.textContent = message;
    }
}


// ------------------------------------------------------------
// BUTTON EVENTS & LISTENERS
// ------------------------------------------------------------

if (startCameraBtn) {
    startCameraBtn.addEventListener("click", startCamera);
}

if (captureFrameBtn) {
    captureFrameBtn.addEventListener("click", captureCameraFrame);
}

if (startLiveDetectionBtn) {
    startLiveDetectionBtn.addEventListener("click", startLiveDetection);
}

if (stopLiveDetectionBtn) {
    stopLiveDetectionBtn.addEventListener("click", stopLiveDetection);
}

if (stopCameraBtn) {
    stopCameraBtn.addEventListener("click", stopCamera);
}

// Telemetry Studio Banner & Storage Listeners
if (typeof updateStudioStatsBanner === "function") {
    updateStudioStatsBanner();
}
window.addEventListener("inspectra:data-log-updated", () => {
    if (typeof updateStudioStatsBanner === "function") {
        updateStudioStatsBanner();
    }
});
window.addEventListener("storage", (e) => {
    if (e.key === "inspectra_inspection_log" && typeof updateStudioStatsBanner === "function") {
        updateStudioStatsBanner();
    }
});

// Redraw inspection overlay on resize if active
window.addEventListener("resize", () => {
    if (isCapturedInspectionActive && latestCameraResult) {
        drawCapturedInspectionOverlay(latestCameraResult);
    } else if (isLiveDetectionActive && latestCameraResult) {
        drawLiveCameraOverlay(latestCameraResult);
    }
});

// Stop camera automatically when leaving the page
window.addEventListener("beforeunload", stopCamera);