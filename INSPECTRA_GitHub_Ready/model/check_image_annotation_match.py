import os

IMAGE_PATH = "dataset/train/images"
ANNOTATION_PATH = "dataset/train/annotations"

images = set(os.listdir(IMAGE_PATH))
annotations = set(
    os.path.splitext(f)[0]
    for f in os.listdir(ANNOTATION_PATH)
    if f.endswith(".xml")
)

print("======================================")
print("INSPECTRA - IMAGE / XML MATCH CHECK")
print("======================================")

print(f"\nImages: {len(images)}")
print(f"XML annotations: {len(annotations)}")

print("\nFirst 10 image files:")

for filename in sorted(images)[:10]:
    print(filename)

print("\nFirst 10 XML names:")

for filename in sorted(annotations)[:10]:
    print(filename)

print("\n======================================")
print("Checking exact matches")
print("======================================")

matched = 0

for image in images:
    name = os.path.splitext(image)[0]

    if name in annotations:
        matched += 1

print(f"Matched image/XML pairs: {matched}")

print("\n======================================")
print("CHECK COMPLETE")
print("======================================")