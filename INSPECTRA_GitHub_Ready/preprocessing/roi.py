import cv2
import os

# Dataset path
IMAGE_PATH = "dataset/train/images/crazing"

# Find first image
image_files = [
    f for f in os.listdir(IMAGE_PATH)
    if f.lower().endswith((".jpg", ".jpeg", ".png", ".bmp"))
]

if not image_files:
    print("ERROR: No images found.")
    exit()

image_path = os.path.join(IMAGE_PATH, image_files[0])

# Load image
image = cv2.imread(image_path)

if image is None:
    print("ERROR: Could not load image.")
    exit()

# Grayscale
gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

# CLAHE
clahe = cv2.createCLAHE(
    clipLimit=2.0,
    tileGridSize=(8, 8)
)

enhanced = clahe.apply(gray)

# Gaussian denoising
denoised = cv2.GaussianBlur(
    enhanced,
    (5, 5),
    0
)

# -------------------------
# ROI
# -------------------------

height, width = denoised.shape

# Remove 5% border from each side
margin_x = int(width * 0.05)
margin_y = int(height * 0.05)

roi = denoised[
    margin_y:height - margin_y,
    margin_x:width - margin_x
]

print("ROI extraction successful!")

print(f"Original size : {image.shape}")
print(f"Processed size: {denoised.shape}")
print(f"ROI size      : {roi.shape}")

# Display
cv2.imshow("Denoised Image", denoised)
cv2.imshow("Inspection ROI", roi)

print("\nPress any key to close.")

cv2.waitKey(0)
cv2.destroyAllWindows()