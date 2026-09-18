import os
from PIL import Image

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms

from autoencoder import SteelAutoencoder


DATA_PATH = "dataset/normal_patches"
MODEL_PATH = "model/steel_autoencoder.pth"

BATCH_SIZE = 32
EPOCHS = 10
LEARNING_RATE = 0.001


print("======================================")
print("INSPECTRA - AUTOENCODER TRAINING")
print("======================================")


class NormalPatchDataset(Dataset):

    def __init__(self, folder):

        self.folder = folder

        self.files = [
            f for f in os.listdir(folder)
            if f.lower().endswith(
                (".jpg", ".jpeg", ".png")
            )
        ]

        self.transform = transforms.ToTensor()

    def __len__(self):
        return len(self.files)

    def __getitem__(self, index):

        filename = self.files[index]

        path = os.path.join(
            self.folder,
            filename
        )

        image = Image.open(path).convert("RGB")

        image = self.transform(image)

        return image


dataset = NormalPatchDataset(DATA_PATH)

loader = DataLoader(
    dataset,
    batch_size=BATCH_SIZE,
    shuffle=True
)


print(f"\nTraining patches: {len(dataset)}")
print(f"Batch size: {BATCH_SIZE}")
print(f"Epochs: {EPOCHS}")


device = torch.device("cpu")

model = SteelAutoencoder().to(device)

criterion = nn.MSELoss()

optimizer = torch.optim.Adam(
    model.parameters(),
    lr=LEARNING_RATE
)


for epoch in range(EPOCHS):

    model.train()

    total_loss = 0

    for images in loader:

        images = images.to(device)

        reconstructed = model(images)

        loss = criterion(
            reconstructed,
            images
        )

        optimizer.zero_grad()

        loss.backward()

        optimizer.step()

        total_loss += loss.item()

    average_loss = (
        total_loss / len(loader)
    )

    print(
        f"Epoch [{epoch + 1}/{EPOCHS}] "
        f"Loss: {average_loss:.6f}"
    )


torch.save(
    model.state_dict(),
    MODEL_PATH
)


print("\n======================================")
print("AUTOENCODER TRAINING COMPLETE")
print("======================================")

print(f"Model saved to: {MODEL_PATH}")