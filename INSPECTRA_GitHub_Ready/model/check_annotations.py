import os


ANNOTATION_PATH = "dataset/train/annotations"


print("======================================")
print("INSPECTRA - ANNOTATION CHECK")
print("======================================")


if not os.path.exists(ANNOTATION_PATH):

    print("ERROR: Annotation folder not found.")
    exit()


files = os.listdir(ANNOTATION_PATH)

print(f"\nTotal annotation files: {len(files)}")


# Show first 10 files

print("\nFirst annotation files:")

for filename in files[:10]:

    print(filename)


print("\n======================================")
print("Checking file extensions")
print("======================================")


extensions = {}

for filename in files:

    extension = os.path.splitext(
        filename
    )[1].lower()

    extensions[extension] = (
        extensions.get(extension, 0) + 1
    )


for extension, count in extensions.items():

    print(
        f"{extension or '[no extension]'} : "
        f"{count} files"
    )


print("\n======================================")
print("ANNOTATION CHECK COMPLETE")
print("======================================")