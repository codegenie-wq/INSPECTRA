import os
import json

from model.inspection_pipeline import inspect_image


def inspect_product(product_id, images):

    results = []

    for item in images:

        image_path = item["image_path"]
        image_id = item.get("image_id", "IMG-001")
        view = item.get("view", "TOP")
        is_camera = (str(view).upper() == "CAMERA")

        result = inspect_image(
            image_path,
            f"{product_id}_{image_id}.jpg",
            is_camera=is_camera
        )

        # Product identification
        result["product_id"] = product_id
        result["image_id"] = image_id
        result["view"] = view

        # Actual uploaded filename
        result["filename"] = os.path.basename(image_path)

        # Explicit anomaly flag
        result["anomaly_detected"] = (
            result["status"] == "DEFECT"
        )

        results.append(result)

    # -----------------------------
    # PRODUCT LEVEL SUMMARY
    # -----------------------------

    defect_results = [
        r for r in results
        if r["status"] == "DEFECT"
    ]

    unknown_results = [
        r for r in results
        if r["status"] == "UNKNOWN"
    ]

    safe_results = [
        r for r in results
        if r["status"] == "SAFE"
    ]

    no_product_results = [
        r for r in results
        if r.get("status") == "NO_PRODUCT" or r.get("product_detected") is False
    ]

    # Product status
    if no_product_results and len(no_product_results) == len(results):
        product_status = "NO_PRODUCT"
    elif defect_results:
        product_status = "DEFECT"
    elif unknown_results:
        product_status = "UNKNOWN"
    else:
        product_status = "SAFE"

    # Highest severity
    severity_order = {
        "LOW": 1,
        "MEDIUM": 2,
        "HIGH": 3
    }

    highest_severity = None

    for result in defect_results:

        severity = result.get("severity")

        if severity is None:
            continue

        if (
            highest_severity is None
            or severity_order[severity]
            > severity_order[highest_severity]
        ):
            highest_severity = severity

    # Unique defect types
    defect_types = sorted(
        list(
            set(
                r["defect"]
                for r in defect_results
                if r.get("defect")
            )
        )
    )

    # Product report
    product_result = {

        "product_id": product_id,

        "product_status": product_status,

        "total_images": len(results),

        "safe_images": len(safe_results),

        "defective_images": len(defect_results),

        "unknown_images": len(unknown_results),

        "highest_severity": highest_severity,

        "defect_types_detected": defect_types,

        "inspections": results
    }

    return product_result


if __name__ == "__main__":

    product_id = "STL-2026-00125"

    images = [

        {
            "image_id": "IMG-001",
            "view": "TOP",
            "image_path":
                "dataset/validation/images/crazing/crazing_241.jpg"
        },

        {
            "image_id": "IMG-002",
            "view": "LEFT",
            "image_path":
                "dataset/validation/images/inclusion/inclusion_241.jpg"
        },

        {
            "image_id": "IMG-003",
            "view": "RIGHT",
            "image_path":
                "dataset/validation/images/patches/patches_241.jpg"
        }
    ]

    result = inspect_product(
        product_id,
        images
    )

    print(
        json.dumps(
            result,
            indent=4
        )
    )