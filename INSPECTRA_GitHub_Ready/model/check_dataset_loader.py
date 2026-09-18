import torch
from torchvision import datasets, transforms


print("======================================")
print("INSPECTRA - PYTORCH DATASET CHECK")
print("======================================")


# --------------------------------------
# Image transformation
# --------------------------------------

transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor()
])


# --------------------------------------
# Load training dataset
# --------------------------------------

train_path = "dataset/train/images"

train_dataset = datasets.ImageFolder(
    root=train_path,
    transform=transform
)


# --------------------------------------
# Load validation dataset
# --------------------------------------

validation_path = "dataset/validation/images"

validation_dataset = datasets.ImageFolder(
    root=validation_path,
    transform=transform
)


# --------------------------------------
# Display dataset information
# --------------------------------------

print("\nTraining dataset:")
print(f"Number of images : {len(train_dataset)}")

print("\nValidation dataset:")
print(f"Number of images : {len(validation_dataset)}")


# --------------------------------------
# Class information
# --------------------------------------

print("\nClass mapping:")

for class_name, class_index in train_dataset.class_to_idx.items():
    print(f"{class_index} -> {class_name}")


# --------------------------------------
# Load one image
# --------------------------------------

image, label = train_dataset[0]


print("\nSample image:")
print(f"Tensor shape : {image.shape}")
print(f"Label        : {label}")
print(f"Class        : {train_dataset.classes[label]}")


# --------------------------------------
# Create DataLoader
# --------------------------------------

train_loader = torch.utils.data.DataLoader(
    train_dataset,
    batch_size=16,
    shuffle=True
)


# --------------------------------------
# Test one batch
# --------------------------------------

images, labels = next(iter(train_loader))


print("\nTraining batch:")
print(f"Images shape : {images.shape}")
print(f"Labels shape : {labels.shape}")


print("\n======================================")
print("SUCCESS: PyTorch dataset loader works!")
print("======================================")