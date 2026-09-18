import cv2
import numpy as np


def detect_product(image_bgr):
    """
    Isolates the actual physical product / metal component visible in the camera frame,
    excluding hands, face, background, table, and walls.
    
    Returns:
        found (bool): Whether a valid physical product was successfully isolated.
        product_box (dict | None): Bounding box {'x': int, 'y': int, 'width': int, 'height': int} in image coordinates.
        confidence (float): Confidence score of the product isolation (0.0 to 100.0).
    """
    if image_bgr is None:
        return False, None, 0.0

    height, width = image_bgr.shape[:2]
    total_area = height * width

    # Check for blank / nearly uniform frames (e.g. covered camera or plain dark wall)
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    if gray.std() < 12.0 or gray.mean() < 15.0 or gray.mean() > 245.0:
        return False, None, 0.0

    # ---------------------------------------------------------
    # 1. Skin Color Detection (Exclude Hands, Fingers & Face)
    # ---------------------------------------------------------
    # YCrCb color space: standard biometric skin cluster
    ycrcb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2YCrCb)
    skin_ycrcb = cv2.inRange(
        ycrcb,
        np.array([0, 133, 77], dtype=np.uint8),
        np.array([255, 173, 127], dtype=np.uint8)
    )

    # HSV color space: auxiliary skin validation
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    skin_hsv = cv2.inRange(
        hsv,
        np.array([0, 35, 60], dtype=np.uint8),
        np.array([25, 200, 255], dtype=np.uint8)
    )

    # Combined skin mask with morphological dilation to cover finger borders
    skin_mask = cv2.bitwise_or(skin_ycrcb, skin_hsv)
    skin_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    skin_mask = cv2.dilate(skin_mask, skin_kernel, iterations=1)

    # If skin covers almost the entire image (e.g. face right against camera)
    if cv2.countNonZero(skin_mask) > 0.70 * total_area:
        return False, None, 0.0

    # ---------------------------------------------------------
    # 2. Multi-Cue Foreground Segmentation
    # ---------------------------------------------------------
    # Fast multi-scale processing (scale to width 320 for speed & consistency)
    scale = 320.0 / float(width)
    small_w = 320
    small_h = int(height * scale)
    small = cv2.resize(image_bgr, (small_w, small_h))
    small_gray = cv2.resize(gray, (small_w, small_h))
    small_skin = cv2.resize(skin_mask, (small_w, small_h))

    # Margin bounds for center reticle prior (typical viewfinder area)
    margin_x = int(small_w * 0.06)
    margin_y = int(small_h * 0.06)

    # Mask for GrabCut / Saliency:
    # Outer margin is definite background (0)
    # Center region is probable foreground (3)
    # Skin regions are definite background (0)
    gc_mask = np.zeros((small_h, small_w), dtype=np.uint8)
    gc_mask[margin_y:small_h - margin_y, margin_x:small_w - margin_x] = cv2.GC_PR_FGD
    gc_mask[small_skin > 0] = cv2.GC_BGD

    # Edge and luminance saliency check
    blurred = cv2.GaussianBlur(small_gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 30, 100)
    edges[small_skin > 0] = 0

    # Fast presence gate: if frame contains almost no non-skin edges, there is no physical object
    non_skin_edge_count = np.count_nonzero(edges)
    if non_skin_edge_count < 35:
        return False, None, 0.0

    edge_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    closed_edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, edge_kernel)

    # Run lightweight GrabCut (2 iterations is very fast ~150ms on CPU)
    try:
        bgd_model = np.zeros((1, 65), np.float64)
        fgd_model = np.zeros((1, 65), np.float64)
        cv2.grabCut(small, gc_mask, None, bgd_model, fgd_model, 2, cv2.GC_INIT_WITH_MASK)
        fg_mask = np.where((gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)
    except Exception:
        # Fallback to edge contours if GrabCut fails
        fg_mask = (closed_edges > 0).astype(np.uint8)

    # Clean foreground mask
    clean_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, clean_kernel)
    fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, clean_kernel)

    # ---------------------------------------------------------
    # 3. Contour Extraction & Filtering
    # ---------------------------------------------------------
    contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return False, None, 0.0

    small_total_area = small_w * small_h
    center_x = small_w / 2.0
    center_y = small_h / 2.0
    max_diag = np.hypot(small_w, small_h)

    candidates = []
    for c in contours:
        area = cv2.contourArea(c)
        # Area must be between 2.0% and 65% of the frame (never full-screen)
        if area < 0.020 * small_total_area or area > 0.65 * small_total_area:
            continue

        x, y, cw, ch = cv2.boundingRect(c)

        # Do not allow candidate bounding box to cover the full frame
        if cw > 0.80 * small_w or ch > 0.80 * small_h:
            continue

        aspect = cw / float(ch) if ch > 0 else 0
        if aspect < 0.15 or aspect > 6.0:
            continue

        solidity = area / float(cw * ch) if cw * ch > 0 else 0
        if solidity < 0.20:
            continue

        # Candidate must contain actual edge/structural content
        candidate_edges = edges[y:y+ch, x:x+cw]
        if np.count_nonzero(candidate_edges) < 20:
            continue

        # Score candidate based on area and proximity to camera center
        c_cx = x + cw / 2.0
        c_cy = y + ch / 2.0
        dist = np.hypot(c_cx - center_x, c_cy - center_y)
        center_bias = max(0.25, 1.0 - (dist / max_diag))
        score = area * center_bias
        candidates.append((score, (x, y, cw, ch), area))

    if not candidates:
        return False, None, 0.0

    # Pick the most prominent candidate
    candidates.sort(key=lambda item: item[0], reverse=True)
    best_score, (sx, sy, scw, sch), best_area = candidates[0]

    # Map coordinates back to original image resolution
    orig_x = int(sx / scale)
    orig_y = int(sy / scale)
    orig_w = int(scw / scale)
    orig_h = int(sch / scale)

    # Apply 2% outward padding for clean defect inspection border
    pad_x = int(orig_w * 0.02)
    pad_y = int(orig_h * 0.02)
    x1 = max(0, orig_x - pad_x)
    y1 = max(0, orig_y - pad_y)
    x2 = min(width, orig_x + orig_w + pad_x)
    y2 = min(height, orig_y + orig_h + pad_y)

    final_w = x2 - x1
    final_h = y2 - y1

    # Final sanity check: product cannot be practically the entire frame
    if final_w >= int(width * 0.96) and final_h >= int(height * 0.96):
        return False, None, 0.0

    area_ratio = float(best_area) / float(small_total_area)
    confidence = round(min(98.5, max(60.0, area_ratio * 150.0 + 45.0)), 2)

    product_box = {
        "x": int(x1),
        "y": int(y1),
        "width": int(final_w),
        "height": int(final_h)
    }

    return True, product_box, confidence
