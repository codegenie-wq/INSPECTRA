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

# Convert BGR to grayscale
gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

print("Original image:")
print(f"Shape: {image.shape}")
print(f"Data type: {image.dtype}")

print("\nGrayscale image:")
print(f"Shape: {gray.shape}")
print(f"Data type: {gray.dtype}")

# Display
cv2.imshow("Original", image)
cv2.imshow("Grayscale", gray)

print("\nPress any key to close.")

cv2.waitKey(0)
cv2.destroyAllWindows()