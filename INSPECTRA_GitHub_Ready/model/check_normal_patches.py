import os
import cv2

PATCH_PATH = "dataset/normal_patches"

print("======================================")
print("INSPECTRA - NORMAL PATCH CHECK")
print("======================================")

files = [
    f for f in os.listdir(PATCH_PATH)
    if f.lower().endswith((".jpg", ".jpeg", ".png"))
]

print(f"\nTotal patches: {len(files)}")

print("\nFirst 10 patches:")

for filename in files[:10]:
    image_path = os.path.join(PATCH_PATH, filename)
    image = cv2.imread(image_path)

    if image is not None:
        print(
            f"{filename} -> "
            f"{image.shape[1]}x{image.shape[0]}"
        )

print("\n======================================")
print("PATCH CHECK COMPLETE")
print("======================================")