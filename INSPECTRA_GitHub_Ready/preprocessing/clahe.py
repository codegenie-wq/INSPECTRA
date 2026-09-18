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

# Create CLAHE object
clahe = cv2.createCLAHE(
    clipLimit=2.0,
    tileGridSize=(8, 8)
)

# Apply CLAHE
enhanced = clahe.apply(gray)

print("CLAHE preprocessing successful!")

print(f"Original grayscale shape : {gray.shape}")
print(f"Enhanced image shape     : {enhanced.shape}")
print(f"Data type                : {enhanced.dtype}")

# Display images
cv2.imshow("Original Grayscale", gray)
cv2.imshow("CLAHE Enhanced", enhanced)

print("\nPress any key to close.")

cv2.waitKey(0)
cv2.destroyAllWindows()