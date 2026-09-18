import cv2
import os

from preprocess import preprocess_image


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


image_path = os.path.join(
    IMAGE_PATH,
    image_files[0]
)


# Load image
image = cv2.imread(image_path)

if image is None:
    print("ERROR: Could not load image.")
    exit()


# Run complete preprocessing pipeline
processed = preprocess_image(image)


print("================================")
print("INSPECTRA PREPROCESSING TEST")
print("================================")

print(f"Input shape     : {image.shape}")
print(f"Output shape    : {processed.shape}")
print(f"Input datatype  : {image.dtype}")
print(f"Output datatype : {processed.dtype}")

print("\nPreprocessing pipeline:")
print("BGR → Grayscale → CLAHE → Gaussian → ROI")

print("\nSUCCESS: Complete preprocessing pipeline works!")


# Display
cv2.imshow("Original Image", image)
cv2.imshow("Processed Image", processed)

print("\nPress any key to close.")

cv2.waitKey(0)
cv2.destroyAllWindows()