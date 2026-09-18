import os
from PIL import Image

import torch
import torch.nn as nn
from torchvision import transforms

from autoencoder import SteelAutoencoder


MODEL_PATH = "model/steel_autoencoder.pth"
IMAGE_PATH = "dataset/validation/images"

THRESHOLD = 0.005028


print("======================================")
print("INSPECTRA - DEFECT ANOMALY TEST")
print("======================================")


device = torch.device("cpu")

model = SteelAutoencoder().to(device)

model.load_state_dict(
    torch.load(MODEL_PATH, map_location=device)
)

model.eval()

transform = transforms.ToTensor()

criterion = nn.MSELoss()


classes = [
    "crazing",
    "inclusion",
    "patches",
    "pitted_surface",
    "rolled-in_scale",
    "scratches"
]


with torch.no_grad():

    for class_name in classes:

        folder = os.path.join(
            IMAGE_PATH,
            class_name
        )

        files = [
            f for f in os.listdir(folder)
            if f.lower().endswith(".jpg")
        ]

        errors = []

        for filename in files[:20]:

            path = os.path.join(
                folder,
                filename
            )

            image = Image.open(path).convert("RGB")

            image = image.resize((64, 64))

            image = transform(image).unsqueeze(0)

            reconstructed = model(image)

            error = criterion(
                reconstructed,
                image
            ).item()

            errors.append(error)

        average_error = sum(errors) / len(errors)

        status = (
            "ANOMALY"
            if average_error > THRESHOLD
            else "NORMAL"
        )

        print(
            f"\n{class_name:<18} "
            f"Error: {average_error:.6f} "
            f"→ {status}"
        )


print("\n======================================")
print("DEFECT ANOMALY TEST COMPLETE")
print("======================================")