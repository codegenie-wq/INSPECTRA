import os

DATASET_PATH = "../dataset"

print("Checking dataset...\n")

for root, dirs, files in os.walk(DATASET_PATH):
    image_files = [
        f for f in files
        if f.lower().endswith((".jpg", ".jpeg", ".png", ".bmp"))
    ]

    if image_files:
        print(f"Folder: {root}")
        print(f"Images found: {len(image_files)}")
        print(f"Example: {image_files[0]}")
        print("-" * 50)