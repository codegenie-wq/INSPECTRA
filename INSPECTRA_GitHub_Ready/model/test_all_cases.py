import os
import torch
import torch.nn as nn

from PIL import Image
from torchvision import transforms
from torchvision.models import mobilenet_v2


# ==================================================
# CONFIGURATION
# ==================================================

MODEL_PATH = "model/steelguard_mobilenetv2.pth"

DATASET_PATH = "dataset/validation/images"

CLASS_NAMES = [
    "crazing",
    "inclusion",
    "patches",
    "pitted_surface",
    "rolled-in_scale",
    "scratches"
]


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
# TEST EACH CLASS
# ==================================================

print("======================================")
print("INSPECTRA - SIX CLASS TEST")
print("======================================")

correct = 0


for actual_class in CLASS_NAMES:

    class_path = os.path.join(
        DATASET_PATH,
        actual_class
    )

    image_files = [
        f for f in os.listdir(class_path)
        if f.lower().endswith(
            (".jpg", ".jpeg", ".png", ".bmp")
        )
    ]

    if not image_files:
        print(f"\nNo image found for {actual_class}")
        continue

    image_name = image_files[0]

    image_path = os.path.join(
        class_path,
        image_name
    )


    # Load image
    image = Image.open(
        image_path
    ).convert("RGB")


    # Transform
    image_tensor = transform(image)

    image_tensor = image_tensor.unsqueeze(0)

    image_tensor = image_tensor.to(device)


    # Prediction
    with torch.no_grad():

        outputs = model(image_tensor)

        probabilities = torch.softmax(
            outputs,
            dim=1
        )

        confidence, predicted = torch.max(
            probabilities,
            dim=1
        )


    predicted_class = CLASS_NAMES[
        predicted.item()
    ]

    confidence_value = (
        confidence.item() * 100
    )


    is_correct = (
        predicted_class == actual_class
    )


    if is_correct:
        correct += 1


    status = "✓" if is_correct else "✗"


    print(
        f"\n{status} Actual     : {actual_class}"
    )

    print(
        f"  Predicted  : {predicted_class}"
    )

    print(
        f"  Confidence : {confidence_value:.2f}%"
    )

    print(
        f"  Image      : {image_name}"
    )


# ==================================================
# SUMMARY
# ==================================================

print("\n======================================")
print("TEST SUMMARY")
print("======================================")

print(
    f"Correct classes: {correct}/6"
)

print(
    f"Class-level test accuracy: "
    f"{(correct / 6) * 100:.2f}%"
)

print("\n======================================")