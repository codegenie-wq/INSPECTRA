import os

DATASET_PATH = "dataset"

print("Checking dataset...\n")

for split in ["train", "validation"]:

    split_path = os.path.join(DATASET_PATH, split, "images")

    print(f"===== {split.upper()} =====")

    if not os.path.exists(split_path):
        print(f"ERROR: Path not found: {split_path}")
        continue

    for defect_class in os.listdir(split_path):

        class_path = os.path.join(split_path, defect_class)

        if os.path.isdir(class_path):

            image_files = [
                f for f in os.listdir(class_path)
                if f.lower().endswith((".jpg", ".jpeg", ".png", ".bmp"))
            ]

            print(f"{defect_class}: {len(image_files)} images")

    print()