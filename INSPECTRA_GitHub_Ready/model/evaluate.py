import torch
import numpy as np

from torch.utils.data import DataLoader
from torchvision import datasets, transforms
from torchvision.models import mobilenet_v2

from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    accuracy_score
)


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
print("INSPECTRA - MODEL EVALUATION")
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
# VALIDATION DATASET
# ==================================================

val_dataset = datasets.ImageFolder(
    VAL_PATH,
    transform=transform
)

val_loader = DataLoader(
    val_dataset,
    batch_size=BATCH_SIZE,
    shuffle=False,
    num_workers=0
)


# ==================================================
# MODEL
# ==================================================

model = mobilenet_v2(
    weights=None
)

model.classifier[1] = torch.nn.Linear(
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
# PREDICTIONS
# ==================================================

all_labels = []
all_predictions = []


with torch.no_grad():

    for images, labels in val_loader:

        images = images.to(device)

        outputs = model(images)

        predictions = torch.argmax(
            outputs,
            dim=1
        )

        all_labels.extend(
            labels.numpy()
        )

        all_predictions.extend(
            predictions.cpu().numpy()
        )


# ==================================================
# ACCURACY
# ==================================================

accuracy = accuracy_score(
    all_labels,
    all_predictions
)

print("\nOverall Accuracy:")
print(f"{accuracy * 100:.2f}%")


# ==================================================
# CLASSIFICATION REPORT
# ==================================================

print("\nClassification Report:")
print("--------------------------------------")

print(
    classification_report(
        all_labels,
        all_predictions,
        target_names=val_dataset.classes,
        digits=4
    )
)


# ==================================================
# CONFUSION MATRIX
# ==================================================

matrix = confusion_matrix(
    all_labels,
    all_predictions
)

print("\nConfusion Matrix:")
print("--------------------------------------")

print(matrix)


# ==================================================
# CLASS NAMES
# ==================================================

print("\nClass order:")

for index, class_name in enumerate(
    val_dataset.classes
):

    print(
        f"{index} -> {class_name}"
    )


print("\n======================================")
print("EVALUATION COMPLETE")
print("======================================")