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

# Convert to grayscale
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

print("Gaussian denoising successful!")

print(f"Original image : {image.shape}")
print(f"Grayscale      : {gray.shape}")
print(f"CLAHE          : {enhanced.shape}")
print(f"Denoised       : {denoised.shape}")

# Display
cv2.imshow("CLAHE Enhanced", enhanced)
cv2.imshow("Gaussian Denoised", denoised)

print("\nPress any key to close.")

cv2.waitKey(0)
cv2.destroyAllWindows()