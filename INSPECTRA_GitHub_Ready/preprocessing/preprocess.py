import cv2


def preprocess_image(image):
    """
    Preprocess a steel surface image.

    Pipeline:
    1. Grayscale
    2. CLAHE
    3. Gaussian denoising
    4. Safe ROI
    """

    # -------------------------
    # 1. Grayscale
    # -------------------------
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # -------------------------
    # 2. CLAHE
    # -------------------------
    clahe = cv2.createCLAHE(
        clipLimit=2.0,
        tileGridSize=(8, 8)
    )

    enhanced = clahe.apply(gray)

    # -------------------------
    # 3. Gaussian denoising
    # -------------------------
    denoised = cv2.GaussianBlur(
        enhanced,
        (5, 5),
        0
    )

    # -------------------------
    # 4. Safe ROI
    # -------------------------
    height, width = denoised.shape

    margin_x = int(width * 0.05)
    margin_y = int(height * 0.05)

    roi = denoised[
        margin_y:height - margin_y,
        margin_x:width - margin_x
    ]

    return roi