import os
import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from PIL import Image
from torchvision import transforms, models

from model.autoencoder import SteelAutoencoder
from model.product_detection import detect_product


from pathlib import Path
import tempfile

# ======================================
# INSPECTRA CONFIGURATION
# ======================================

BASE_DIR = Path(__file__).resolve().parent
CLASSIFIER_PATH = str(BASE_DIR / "steelguard_mobilenetv2.pth")
AUTOENCODER_PATH = str(BASE_DIR / "steel_autoencoder.pth")

ANOMALY_THRESHOLD = 0.005028
UNKNOWN_THRESHOLD = 42.0

PATCH_SIZE = 64
PATCH_STRIDE = 32
GRADCAM_THRESHOLD = 0.50

def _resolve_output_dir():
    if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        tmp_dir = os.path.join(tempfile.gettempdir(), "test_images")
        os.makedirs(tmp_dir, exist_ok=True)
        return tmp_dir
    try:
        local_dir = os.path.join(str(BASE_DIR.parent), "test_images")
        os.makedirs(local_dir, exist_ok=True)
        return local_dir
    except OSError:
        tmp_dir = os.path.join(tempfile.gettempdir(), "test_images")
        os.makedirs(tmp_dir, exist_ok=True)
        return tmp_dir

OUTPUT_DIR = _resolve_output_dir()

CLASS_NAMES = [
    "crazing",
    "inclusion",
    "patches",
    "pitted_surface",
    "rolled-in_scale",
    "scratches"
]


# ======================================
# LOAD MODELS
# ======================================

device = torch.device("cpu")


classifier = models.mobilenet_v2(weights=None)

classifier.classifier[1] = nn.Linear(
    classifier.classifier[1].in_features,
    6
)

classifier.load_state_dict(
    torch.load(
        CLASSIFIER_PATH,
        map_location=device
    )
)

classifier.eval()


autoencoder = SteelAutoencoder().to(device)

autoencoder.load_state_dict(
    torch.load(
        AUTOENCODER_PATH,
        map_location=device
    )
)

autoencoder.eval()


# ======================================
# TRANSFORMS
# ======================================

classifier_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])


autoencoder_transform = transforms.ToTensor()


# ======================================
# SEVERITY
# ======================================

def calculate_severity(area_percentage):

    if area_percentage < 1:
        return "LOW"

    elif area_percentage <= 5:
        return "MEDIUM"

    else:
        return "HIGH"


# ======================================
# ANOMALY SCAN
# ======================================

def calculate_anomaly_score(image):

    width, height = image.size

    highest_error = 0.0
    highest_position = None

    with torch.no_grad():

        for y in range(
            0,
            height - PATCH_SIZE + 1,
            PATCH_STRIDE
        ):

            for x in range(
                0,
                width - PATCH_SIZE + 1,
                PATCH_STRIDE
            ):

                patch = image.crop(
                    (
                        x,
                        y,
                        x + PATCH_SIZE,
                        y + PATCH_SIZE
                    )
                )

                tensor = (
                    autoencoder_transform(patch)
                    .unsqueeze(0)
                    .to(device)
                )

                reconstructed = autoencoder(
                    tensor
                )

                error = F.mse_loss(
                    reconstructed,
                    tensor
                ).item()

                if error > highest_error:

                    highest_error = error

                    highest_position = (
                        x,
                        y
                    )

    return highest_error, highest_position


# ======================================
# GRAD-CAM
# ======================================

def generate_gradcam(
    input_tensor,
    predicted_class
):

    activations = None
    gradients = None

    def forward_hook(module, input, output):
        nonlocal activations
        activations = output

    def backward_hook(module, grad_input, grad_output):
        nonlocal gradients
        gradients = grad_output[0]

    target_layer = classifier.features[-1]

    forward_handle = (
        target_layer.register_forward_hook(
            forward_hook
        )
    )

    backward_handle = (
        target_layer.register_full_backward_hook(
            backward_hook
        )
    )

    classifier.zero_grad()

    output = classifier(input_tensor)

    score = output[
        0,
        predicted_class
    ]

    score.backward()

    weights = gradients.mean(
        dim=(2, 3),
        keepdim=True
    )

    cam = (
        weights * activations
    ).sum(
        dim=1
    ).squeeze(0)

    cam = F.relu(cam)

    cam -= cam.min()

    if cam.max() > 0:
        cam /= cam.max()

    cam = cam.detach().numpy()

    forward_handle.remove()
    backward_handle.remove()

    return cam


# ======================================
# LOCALIZATION
# ======================================

def localize_defect(
    cam,
    original_image
):

    height, width = original_image.shape[:2]

    cam = cv2.resize(
        cam,
        (width, height)
    )

    mask = np.uint8(
        cam >= GRADCAM_THRESHOLD
    ) * 255

    kernel = np.ones(
        (5, 5),
        np.uint8
    )

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

    contours, _ = cv2.findContours(
        mask,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )

    if not contours:

        return None, mask

    largest = max(
        contours,
        key=cv2.contourArea
    )

    area = cv2.contourArea(
        largest
    )

    x, y, w, h = cv2.boundingRect(
        largest
    )

    image_area = width * height

    area_percentage = (
        area / image_area
    ) * 100

    location = {
        "x": int(x),
        "y": int(y),
        "width": int(w),
        "height": int(h)
    }

    measurement = {
        "area_pixels": round(
            float(area),
            2
        ),
        "area_percentage": round(
            float(area_percentage),
            2
        )
    }

    return (
        {
            "location": location,
            "measurement": measurement
        },
        mask
    )


# ======================================
# MAIN INSPECTION
# ======================================

def inspect_image(
    image_path,
    output_name="inspection_result.jpg",
    is_camera=False
):

    print("\n======================================")
    print("INSPECTRA - AI INSPECTION")
    print("======================================")

    original = cv2.imread(image_path)
    if original is None:
        raise ValueError(f"Could not load image at {image_path}")

    height, width = original.shape[:2]

    # ---------------------------------------------------------
    # 1. PRODUCT OBJECT DETECTION (ISOLATE PHYSICAL COMPONENT)
    # ---------------------------------------------------------
    if is_camera:
        found, product_box, product_confidence = detect_product(original)
        if not found:
            print("[INSPECTRA] No valid physical product detected in camera view.")
            result = {
                "status": "NO_PRODUCT",
                "message": "NO PRODUCT DETECTED // POSITION PRODUCT IN INSPECTION AREA",
                "defect": None,
                "confidence": 0.0,
                "anomaly_score": 0.0,
                "location": None,
                "crop_location": None,
                "measurement": None,
                "severity": None,
                "product_detected": False,
                "product_confidence": 0.0,
                "product_box": None,
                "dimensions": {"width": width, "height": height}
            }
            return result

        product_detected = True
        px = product_box["x"]
        py = product_box["y"]
        pw = product_box["width"]
        ph = product_box["height"]
        product_crop = original[py:py+ph, px:px+pw]
    else:
        # Static image upload mode (already a surface scan image)
        product_detected = True
        product_box = {"x": 0, "y": 0, "width": width, "height": height}
        product_confidence = 100.0
        px, py, pw, ph = 0, 0, width, height
        product_crop = original

    # Convert product crop to PIL RGB for MobileNetV2 & Autoencoder
    crop_pil = Image.fromarray(cv2.cvtColor(product_crop, cv2.COLOR_BGR2RGB))

    # ---------------------------------------------------------
    # 2. CLASSIFICATION (ON PRODUCT CROP ONLY)
    # ---------------------------------------------------------
    classifier_input = (
        classifier_transform(crop_pil)
        .unsqueeze(0)
        .to(device)
    )

    with torch.no_grad():
        output = classifier(classifier_input)
        probabilities = F.softmax(output, dim=1)
        top_probs, top_indices = torch.topk(probabilities, k=2, dim=1)

    top_prob = top_probs[0][0].item()
    second_prob = top_probs[0][1].item()
    confidence_percent = top_prob * 100.0
    confidence_margin = (top_prob - second_prob) * 100.0
    predicted_item = top_indices[0][0].item()
    predicted_class = CLASS_NAMES[predicted_item]

    # ---------------------------------------------------------
    # 3. ANOMALY DETECTION (ON PRODUCT CROP ONLY)
    # ---------------------------------------------------------
    anomaly_score, anomaly_position = calculate_anomaly_score(crop_pil)

    # ---------------------------------------------------------
    # 4. DECISION LOGIC WITH DOMAIN SAFEGUARDS
    # ---------------------------------------------------------
    # Distinguish:
    # A. Product detected + defect confidently identified (confidence >= 65%, margin >= 12%)
    # B. Product detected + uncertain defect (anomaly detected, but classifier uncertain)
    # C. Product detected + no visual anomaly (anomaly_score <= ANOMALY_THRESHOLD)
    if anomaly_score <= ANOMALY_THRESHOLD:
        status = "SAFE"
        message = "PRODUCT SAFE // NO VISUAL DEVIATION"
        defect = None
    elif confidence_percent >= 65.0 and confidence_margin >= 12.0:
        status = "DEFECT"
        message = "VISUAL DEVIATION DETECTED"
        defect = predicted_class
    else:
        # Anomaly present, but ambiguous defect classification - do not force scratches!
        status = "UNKNOWN"
        message = "UNKNOWN ANOMALY // MANUAL REVIEW RECOMMENDED"
        defect = "Uncertain anomaly"

    # ---------------------------------------------------------
    # 5. DEFECT LOCALIZATION (IF CONFIRMED DEFECT)
    # ---------------------------------------------------------
    location = None
    crop_location = None
    measurement = None
    severity = None

    if status == "DEFECT":
        cam = generate_gradcam(classifier_input, predicted_item)
        localization, mask = localize_defect(cam, product_crop)

        if localization is not None:
            c_loc = localization["location"]
            crop_location = c_loc
            # Translate relative defect coordinates on crop to absolute camera frame coordinates
            location = {
                "x": px + c_loc["x"],
                "y": py + c_loc["y"],
                "width": c_loc["width"],
                "height": c_loc["height"]
            }
            measurement = localization["measurement"]
            severity = calculate_severity(measurement["area_percentage"])

    result = {
        "status": status,
        "message": message,
        "defect": defect,
        "confidence": round(confidence_percent, 2),
        "anomaly_score": round(anomaly_score, 6),
        "location": location,
        "crop_location": crop_location,
        "measurement": measurement,
        "severity": severity,
        "product_detected": product_detected,
        "product_confidence": product_confidence,
        "product_box": product_box,
        "dimensions": {"width": width, "height": height}
    }

    # Draw visualization image for archival
    vis_img = original.copy()
    if product_detected and product_box:
        cv2.rectangle(
            vis_img,
            (px, py),
            (px + pw, py + ph),
            (0, 230, 118),
            2
        )
        cv2.putText(
            vis_img,
            f"PRODUCT ({product_confidence:.1f}%)",
            (px, max(py - 8, 20)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 230, 118),
            1,
            cv2.LINE_AA
        )

    if location:
        dx, dy, dw, dh = location["x"], location["y"], location["width"], location["height"]
        cv2.rectangle(
            vis_img,
            (dx, dy),
            (dx + dw, dy + dh),
            (0, 0, 255),
            2
        )
        label = f"{defect} | {severity or 'REVIEW'}"
        cv2.putText(
            vis_img,
            label,
            (dx, max(dy - 8, 20)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 0, 255),
            1,
            cv2.LINE_AA
        )

    try:
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        output_path = os.path.join(OUTPUT_DIR, output_name)
        cv2.imwrite(output_path, vis_img)
        result["visualization"] = output_path
    except Exception:
        try:
            tmp_dir = os.path.join(tempfile.gettempdir(), "test_images")
            os.makedirs(tmp_dir, exist_ok=True)
            output_path = os.path.join(tmp_dir, output_name)
            cv2.imwrite(output_path, vis_img)
            result["visualization"] = output_path
        except Exception:
            result["visualization"] = None

    # Print log summary
    print(f"STATUS       : {result['status']}")
    print(f"MESSAGE      : {result['message']}")
    print(f"PRODUCT      : detected={result['product_detected']}, box={result['product_box']}")
    print(f"DEFECT       : {result['defect']}")
    print(f"CONFIDENCE   : {result['confidence']:.2f}%")
    print(f"ANOMALY SCORE: {result['anomaly_score']:.6f}")
    if result["location"]:
        print(f"DEFECT LOC   : {result['location']}")
    print("======================================")
    print("INSPECTION COMPLETE")
    print("======================================")

    return result


# ======================================
# TEST
# ======================================

if __name__ == "__main__":

    test_image = (
        "dataset/validation/images/"
        "crazing/crazing_241.jpg"
    )

    inspect_image(
        test_image,
        "pipeline_result.jpg"
    )