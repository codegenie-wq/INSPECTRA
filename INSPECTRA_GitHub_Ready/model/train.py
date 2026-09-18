import os
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import datasets, transforms
from torchvision.models import mobilenet_v2, MobileNet_V2_Weights


# ==================================================
# CONFIGURATION
# ==================================================

TRAIN_PATH = "dataset/train/images"
VAL_PATH = "dataset/validation/images"

MODEL_PATH = "model/steelguard_mobilenetv2.pth"

NUM_CLASSES = 6
BATCH_SIZE = 16
EPOCHS = 5
LEARNING_RATE = 0.001


# ==================================================
# DEVICE
# ==================================================

device = torch.device(
    "cuda" if torch.cuda.is_available() else "cpu"
)

print("======================================")
print("INSPECTRA - MOBILE NET V2 TRAINING")
print("======================================")

print(f"\nDevice: {device}")


# ==================================================
# TRANSFORMS
# ==================================================

train_transform = transforms.Compose([
    transforms.Resize((224, 224)),

    transforms.RandomHorizontalFlip(),

    transforms.RandomRotation(10),

    transforms.ToTensor(),

    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])


val_transform = transforms.Compose([
    transforms.Resize((224, 224)),

    transforms.ToTensor(),

    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])


# ==================================================
# DATASETS
# ==================================================

train_dataset = datasets.ImageFolder(
    TRAIN_PATH,
    transform=train_transform
)

val_dataset = datasets.ImageFolder(
    VAL_PATH,
    transform=val_transform
)


print(f"\nTraining images   : {len(train_dataset)}")
print(f"Validation images : {len(val_dataset)}")

print("\nClasses:")

for index, class_name in enumerate(train_dataset.classes):
    print(f"{index} -> {class_name}")


# ==================================================
# DATALOADERS
# ==================================================

train_loader = DataLoader(
    train_dataset,
    batch_size=BATCH_SIZE,
    shuffle=True,
    num_workers=0
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

weights = MobileNet_V2_Weights.DEFAULT

model = mobilenet_v2(weights=weights)


# ==================================================
# FREEZE BACKBONE
# ==================================================

for parameter in model.features.parameters():
    parameter.requires_grad = False


# ==================================================
# REPLACE CLASSIFIER
# ==================================================

model.classifier[1] = nn.Linear(
    model.last_channel,
    NUM_CLASSES
)

model = model.to(device)


# ==================================================
# LOSS + OPTIMIZER
# ==================================================

criterion = nn.CrossEntropyLoss()

optimizer = torch.optim.Adam(
    model.classifier[1].parameters(),
    lr=LEARNING_RATE
)


# ==================================================
# TRAINING
# ==================================================

best_accuracy = 0.0


for epoch in range(EPOCHS):

    print(f"\nEpoch {epoch + 1}/{EPOCHS}")
    print("-" * 40)


    # ----------------------------------------------
    # TRAIN
    # ----------------------------------------------

    model.train()

    running_loss = 0.0
    correct = 0
    total = 0


    for images, labels in train_loader:

        images = images.to(device)
        labels = labels.to(device)


        optimizer.zero_grad()


        outputs = model(images)


        loss = criterion(
            outputs,
            labels
        )


        loss.backward()

        optimizer.step()


        running_loss += loss.item()

        _, predicted = torch.max(
            outputs,
            1
        )

        total += labels.size(0)

        correct += (
            predicted == labels
        ).sum().item()


    train_accuracy = 100 * correct / total

    train_loss = (
        running_loss / len(train_loader)
    )


    # ----------------------------------------------
    # VALIDATION
    # ----------------------------------------------

    model.eval()

    val_correct = 0
    val_total = 0


    with torch.no_grad():

        for images, labels in val_loader:

            images = images.to(device)
            labels = labels.to(device)


            outputs = model(images)


            _, predicted = torch.max(
                outputs,
                1
            )


            val_total += labels.size(0)

            val_correct += (
                predicted == labels
            ).sum().item()


    val_accuracy = (
        100 * val_correct / val_total
    )


    print(
        f"Train Loss: {train_loss:.4f}"
    )

    print(
        f"Train Accuracy: {train_accuracy:.2f}%"
    )

    print(
        f"Validation Accuracy: {val_accuracy:.2f}%"
    )


    # ----------------------------------------------
    # SAVE BEST MODEL
    # ----------------------------------------------

    if val_accuracy > best_accuracy:

        best_accuracy = val_accuracy

        torch.save(
            model.state_dict(),
            MODEL_PATH
        )

        print(
            f"✓ Best model saved "
            f"({best_accuracy:.2f}%)"
        )


# ==================================================
# COMPLETE
# ==================================================

print("\n======================================")
print("TRAINING COMPLETE")
print("======================================")

print(
    f"Best validation accuracy: "
    f"{best_accuracy:.2f}%"
)

print(
    f"Model saved to: {MODEL_PATH}"
)