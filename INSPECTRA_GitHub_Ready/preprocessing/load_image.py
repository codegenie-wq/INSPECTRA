import cv2
import os

# Path to one sample image
IMAGE_PATH = "dataset/train/images/crazing"

# Find the first image in the folder
image_files = [
    f for f in os.listdir(IMAGE_PATH)
    if f.lower().endswith((".jpg", ".jpeg", ".png", ".bmp"))
]

if not image_files:
    print("ERROR: No images found.")
    exit()

image_path = os.path.join(IMAGE_PATH, image_files[0])

print("Loading image:")
print(image_path)

# Read image using OpenCV
image = cv2.imread(image_path)

if image is None:
    print("ERROR: OpenCV could not load the image.")
    exit()

# Image information
height, width, channels = image.shape

print("\nImage loaded successfully!")
print(f"Filename  : {image_files[0]}")
print(f"Width     : {width}")
print(f"Height    : {height}")
print(f"Channels  : {channels}")
print(f"Data type : {image.dtype}")
print(f"Shape     : {image.shape}")

# Open image in a window
cv2.imshow("NEU Steel Surface - Sample", image)

print("\nPress any key on the image window to close.")

cv2.waitKey(0)
cv2.destroyAllWindows()