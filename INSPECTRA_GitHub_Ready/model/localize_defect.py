import cv2
import numpy as np


HEATMAP_PATH = "test_images/gradcam_heatmap.npy"
IMAGE_PATH = "dataset/validation/images/crazing/crazing_241.jpg"

OUTPUT_PATH = "test_images/localized_result.jpg"

HEATMAP_THRESHOLD = 0.50


print("======================================")
print("INSPECTRA - DEFECT LOCALIZATION")
print("======================================")


# Load heatmap
cam = np.load(HEATMAP_PATH)

# Load original image
image = cv2.imread(IMAGE_PATH)

if image is None:
    print("ERROR: Image not found.")
    exit()

height, width = image.shape[:2]


# Convert Grad-CAM into binary mask
mask = np.uint8(
    cam >= HEATMAP_THRESHOLD
) * 255


# Remove tiny noise
kernel = np.ones((5, 5), np.uint8)

mask = cv2.morphologyEx(
    mask,
    cv2.MORPH_OPEN,
    kernel
)

mask = cv2.morphologyEx(
    mask,
    cv2.MORPH_CLOSE,
    kernel
)


# Find contours
contours, _ = cv2.findContours(
    mask,
    cv2.RETR_EXTERNAL,
    cv2.CHAIN_APPROX_SIMPLE
)


print(f"\nImage size: {width}x{height}")
print(f"Contours found: {len(contours)}")


if len(contours) == 0:

    print("\nNo significant defect region found.")

else:

    # Select largest contour
    largest_contour = max(
        contours,
        key=cv2.contourArea
    )

    area = cv2.contourArea(
        largest_contour
    )

    x, y, w, h = cv2.boundingRect(
        largest_contour
    )

    image_area = width * height

    area_percentage = (
        area / image_area
    ) * 100


    # Draw bounding box
    cv2.rectangle(
        image,
        (x, y),
        (x + w, y + h),
        (0, 0, 255),
        2
    )


    # Add label
    label = (
        f"Defect "
        f"{w}x{h}px | "
        f"Area: {area_percentage:.2f}%"
    )

    cv2.putText(
        image,
        label,
        (x, max(y - 10, 20)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.5,
        (0, 0, 255),
        1,
        cv2.LINE_AA
    )


    print("\n--------------------------------------")
    print("DEFECT LOCATION")
    print("--------------------------------------")

    print(f"X position      : {x}px")
    print(f"Y position      : {y}px")

    print(f"Width           : {w}px")
    print(f"Height          : {h}px")

    print(f"Contour area    : {area:.2f} px²")

    print(
        f"Area percentage : "
        f"{area_percentage:.2f}%"
    )


    # Save localized image
    cv2.imwrite(
        OUTPUT_PATH,
        image
    )

    print("\nLocalized image saved to:")
    print(OUTPUT_PATH)


print("\n======================================")
print("DEFECT LOCALIZATION COMPLETE")
print("======================================")