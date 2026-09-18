import torch
import torch.nn as nn

from torch.utils.data import DataLoader
from torchvision import datasets, transforms
from torchvision.models import mobilenet_v2


# ==================================================
# CONFIGURATION
# ==================================================

VAL_PATH = "dataset/validation/images"
MODEL_PATH = "model/steelguard_mobilenetv2.pth"

NUM_CLASSES = 6
BATCH_SIZE = 16


# ==================================================
# DEVICE
# ==================================================

device = torch.device(
    "cuda" if torch.cuda.is_available() else "cpu"
)


print("======================================")
print("INSPECTRA - CONFIDENCE ANALYSIS")
print("======================================")

print(f"\nDevice: {device}")


# ==================================================
# TRANSFORM
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
# DATASET
# ==================================================

dataset = datasets.ImageFolder(
    VAL_PATH,
    transform=transform
)

loader = DataLoader(
    dataset,
    batch_size=BATCH_SIZE,
    shuffle=False,
    num_workers=0
)


# ==================================================
# MODEL
# ==================================================

model = mobilenet_v2(weights=None)

model.classifier[1] = nn.Linear(
    model.last_channel,
    NUM_CLASSES
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
# COLLECT CONFIDENCES
# ==================================================

correct_confidences = []
incorrect_confidences = []

all_confidences = []


with torch.no_grad():

    for images, labels in loader:

        images = images.to(device)
        labels = labels.to(device)

        outputs = model(images)

        probabilities = torch.softmax(
            outputs,
            dim=1
        )

        confidence, predictions = torch.max(
            probabilities,
            dim=1
        )

        for i in range(len(labels)):

            confidence_value = (
                confidence[i].item() * 100
            )

            all_confidences.append(
                confidence_value
            )

            if predictions[i] == labels[i]:

                correct_confidences.append(
                    confidence_value
                )

            else:

                incorrect_confidences.append(
                    confidence_value
                )


# ==================================================
# STATISTICS
# ==================================================

print("\n--------------------------------------")
print("CONFIDENCE STATISTICS")
print("--------------------------------------")

print(
    f"Total validation images : "
    f"{len(all_confidences)}"
)

print(
    f"Correct predictions     : "
    f"{len(correct_confidences)}"
)

print(
    f"Incorrect predictions   : "
    f"{len(incorrect_confidences)}"
)


print("\nCorrect prediction confidence:")

print(
    f"Minimum : "
    f"{min(correct_confidences):.2f}%"
)

print(
    f"Average : "
    f"{sum(correct_confidences) / len(correct_confidences):.2f}%"
)

print(
    f"Maximum : "
    f"{max(correct_confidences):.2f}%"
)


if incorrect_confidences:

    print("\nIncorrect prediction confidence:")

    print(
        f"Minimum : "
        f"{min(incorrect_confidences):.2f}%"
    )

    print(
        f"Average : "
        f"{sum(incorrect_confidences) / len(incorrect_confidences):.2f}%"
    )

    print(
        f"Maximum : "
        f"{max(incorrect_confidences):.2f}%"
    )

else:

    print(
        "\nNo incorrect predictions found."
    )


# ==================================================
# THRESHOLD ANALYSIS
# ==================================================

print("\n--------------------------------------")
print("THRESHOLD ANALYSIS")
print("--------------------------------------")

thresholds = [
    50,
    60,
    70,
    80,
    90,
    95
]


for threshold in thresholds:

    accepted_correct = sum(
        confidence >= threshold
        for confidence in correct_confidences
    )

    rejected_correct = (
        len(correct_confidences)
        - accepted_correct
    )

    print(
        f"\nThreshold {threshold}%:"
    )

    print(
        f"  Correct predictions accepted : "
        f"{accepted_correct}"
    )

    print(
        f"  Correct predictions rejected : "
        f"{rejected_correct}"
    )


print("\n======================================")
print("CONFIDENCE ANALYSIS COMPLETE")
print("======================================")