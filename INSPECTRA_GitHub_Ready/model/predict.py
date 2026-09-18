import sys
import torch
import torch.nn as nn

from PIL import Image
from torchvision import transforms
from torchvision.models import mobilenet_v2


from pathlib import Path

# ==================================================
# CONFIGURATION
# ==================================================

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = str(BASE_DIR / "steelguard_mobilenetv2.pth")

CLASS_NAMES = [
    "crazing",
    "inclusion",
    "patches",
    "pitted_surface",
    "rolled-in_scale",
    "scratches"
]

# Initial prototype threshold
UNKNOWN_THRESHOLD = 42.0


# ==================================================
# DEVICE
# ==================================================

device = torch.device(
    "cuda" if torch.cuda.is_available() else "cpu"
)


# ==================================================
# LOAD MODEL
# ==================================================

model = mobilenet_v2(weights=None)

model.classifier[1] = nn.Linear(
    model.last_channel,
    len(CLASS_NAMES)
)

model.load_state_dict(
    torch.load(
        MODEL_PATH,
        map_location=device
    )
)

model = model.to(device)

model.eval()


# ==================================================
# TRANSFORMATION
# ==================================================

transform = transforms.Compose([
    transforms.Resize((224, 224)),

    transforms.ToTensor(),

    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])


# ==================================================
# PREDICTION
# ==================================================

def predict_image(image_path):

    image = Image.open(
        image_path
    ).convert("RGB")

    image_tensor = transform(image)

    image_tensor = image_tensor.unsqueeze(0)

    image_tensor = image_tensor.to(device)


    with torch.no_grad():

        outputs = model(image_tensor)

        probabilities = torch.softmax(
            outputs,
            dim=1
        )

        confidence, predicted_class = torch.max(
            probabilities,
            dim=1
        )


    confidence_value = (
        confidence.item() * 100
    )

    predicted_name = CLASS_NAMES[
        predicted_class.item()
    ]


    # ----------------------------------------------
    # OPEN-SET DECISION
    # ----------------------------------------------

    if confidence_value < UNKNOWN_THRESHOLD:

        result_type = "UNKNOWN"

        display_message = (
            "UNIDENTIFIED SURFACE SIGNATURE"
        )

        defect_class = "Unknown anomaly"

    else:

        result_type = "KNOWN"

        display_message = (
            "SURFACE IRREGULARITY IDENTIFIED"
        )

        defect_class = predicted_name


    return (
        result_type,
        defect_class,
        confidence_value,
        display_message
    )


# ==================================================
# MAIN
# ==================================================

if len(sys.argv) < 2:

    print(
        "Usage: python model/predict.py "
        "<image_path>"
    )

    sys.exit()


image_path = sys.argv[1]


result_type, defect_class, confidence, message = (
    predict_image(image_path)
)


print("\n======================================")
print("       INSPECTRA AI INSPECTION")
print("======================================")

print(
    f"\nInspection result : {message}"
)

print(
    f"Classification    : {defect_class}"
)

print(
    f"Confidence        : {confidence:.2f}%"
)

print(
    f"Decision type     : {result_type}"
)

print(
    f"Threshold         : {UNKNOWN_THRESHOLD:.2f}%"
)

print("\n======================================")