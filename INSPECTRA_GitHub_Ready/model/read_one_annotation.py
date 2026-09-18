import os

ANNOTATION_PATH = "dataset/train/annotations"

files = sorted(os.listdir(ANNOTATION_PATH))

first_file = files[0]
file_path = os.path.join(ANNOTATION_PATH, first_file)

print("======================================")
print("INSPECTRA - XML ANNOTATION INSPECTION")
print("======================================")

print(f"\nReading: {first_file}")

with open(file_path, "r", encoding="utf-8") as file:
    content = file.read()

print("\nXML CONTENT:")
print("--------------------------------------")
print(content)
print("--------------------------------------")