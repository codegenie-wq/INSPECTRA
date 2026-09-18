import os
import cv2
import xml.etree.ElementTree as ET

IMAGE_PATH = "dataset/train/images"
ANNOTATION_PATH = "dataset/train/annotations"
OUTPUT_PATH = "dataset/normal_patches"

PATCH_SIZE = 64
PATCHES_PER_IMAGE = 3


os.makedirs(OUTPUT_PATH, exist_ok=True)

print("======================================")
print("INSPECTRA - NORMAL PATCH EXTRACTION")
print("======================================")


def get_defect_boxes(xml_file):
    tree = ET.parse(xml_file)
    root = tree.getroot()

    boxes = []

    for obj in root.findall("object"):
        box = obj.find("bndbox")

        if box is not None:
            xmin = int(float(box.find("xmin").text))
            ymin = int(float(box.find("ymin").text))
            xmax = int(float(box.find("xmax").text))
            ymax = int(float(box.find("ymax").text))

            boxes.append((xmin, ymin, xmax, ymax))

    return boxes


def overlaps_defect(x, y, size, boxes):
    patch_box = (x, y, x + size, y + size)

    for xmin, ymin, xmax, ymax in boxes:

        if not (
            patch_box[2] <= xmin
            or patch_box[0] >= xmax
            or patch_box[3] <= ymin
            or patch_box[1] >= ymax
        ):
            return True

    return False


count = 0

annotation_files = [
    f for f in os.listdir(ANNOTATION_PATH)
    if f.endswith(".xml")
]

for xml_filename in annotation_files:

    xml_path = os.path.join(
        ANNOTATION_PATH,
        xml_filename
    )

    image_filename = os.path.splitext(xml_filename)[0] + ".jpg"

    class_name = None

    for folder in os.listdir(IMAGE_PATH):
        folder_path = os.path.join(IMAGE_PATH, folder)

        if os.path.isdir(folder_path):
            if os.path.exists(
                os.path.join(folder_path, image_filename)
            ):
                class_name = folder
                break

    if class_name is None:
        continue

    image_path = os.path.join(
        IMAGE_PATH,
        class_name,
        image_filename
    )

    if not os.path.exists(image_path):
        continue

    image = cv2.imread(image_path)

    if image is None:
        continue

    height, width = image.shape[:2]

    boxes = get_defect_boxes(xml_path)

    attempts = 0
    saved = 0

    while saved < PATCHES_PER_IMAGE and attempts < 100:

        attempts += 1

        x = __import__("random").randint(
            0,
            width - PATCH_SIZE
        )

        y = __import__("random").randint(
            0,
            height - PATCH_SIZE
        )

        if not overlaps_defect(
            x,
            y,
            PATCH_SIZE,
            boxes
        ):

            patch = image[
                y:y + PATCH_SIZE,
                x:x + PATCH_SIZE
            ]

            output_filename = (
                f"normal_{count:05d}.jpg"
            )

            output_path = os.path.join(
                OUTPUT_PATH,
                output_filename
            )

            cv2.imwrite(
                output_path,
                patch
            )

            count += 1
            saved += 1


print("\n======================================")
print("EXTRACTION COMPLETE")
print("======================================")

print(f"Normal patches created: {count}")
print(f"Saved to: {OUTPUT_PATH}")