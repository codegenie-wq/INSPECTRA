import os
from PIL import Image

import torch
import torch.nn as nn
from torchvision import transforms

from autoencoder import SteelAutoencoder


MODEL_PATH = "model/steel_autoencoder.pth"

IMAGE_PATH = "dataset/validation/images/crazing/crazing_241.jpg"

PATCH_SIZE = 64
STRIDE = 32


print("======================================")
print("INSPECTRA - LOCAL ANOMALY SCAN")
print("======================================")

device = torch.device("cpu")

model = SteelAutoencoder().to(device)

model.load_state_dict(
    torch.load(MODEL_PATH, map_location=device)
)

model.eval()

transform = transforms.ToTensor()

criterion = nn.MSELoss()


image = Image.open(IMAGE_PATH).convert("RGB")

width, height = image.size

print(f"\nImage: {IMAGE_PATH}")
print(f"Image size: {width}x{height}")

results = []


with torch.no_grad():

    for y in range(0, height - PATCH_SIZE + 1, STRIDE):

        for x in range(0, width - PATCH_SIZE + 1, STRIDE):

            patch = image.crop(
                (
                    x,
                    y,
                    x + PATCH_SIZE,
                    y + PATCH_SIZE
                )
            )

            tensor = transform(patch).unsqueeze(0)

            reconstructed = model(tensor)

            error = criterion(
                reconstructed,
                tensor
            ).item()

            results.append(
                (error, x, y)
            )


results.sort(reverse=True)

print(f"\nTotal patches scanned: {len(results)}")

print("\nTop 10 highest anomaly regions:")
print("--------------------------------------")

for i, (error, x, y) in enumerate(results[:10]):

    status = (
        "ANOMALY"
        if error > 0.005028
        else "NORMAL"
    )

    print(
        f"{i + 1}. "
        f"Position=({x},{y}) "
        f"Error={error:.6f} "
        f"→ {status}"
    )


highest_error = results[0][0]

print("\n--------------------------------------")
print(f"Highest anomaly score: {highest_error:.6f}")
print("--------------------------------------")

if highest_error > 0.005028:
    print("RESULT: ANOMALY DETECTED")
else:
    print("RESULT: NO STRONG ANOMALY DETECTED")


print("\n======================================")
print("LOCAL ANOMALY SCAN COMPLETE")
print("======================================")