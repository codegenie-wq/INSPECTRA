import os
from PIL import Image

import torch
import torch.nn as nn
from torchvision import transforms

from autoencoder import SteelAutoencoder


DATA_PATH = "dataset/normal_patches"
MODEL_PATH = "model/steel_autoencoder.pth"


print("======================================")
print("INSPECTRA - AUTOENCODER TEST")
print("======================================")


device = torch.device("cpu")

model = SteelAutoencoder().to(device)

model.load_state_dict(
    torch.load(MODEL_PATH, map_location=device)
)

model.eval()

transform = transforms.ToTensor()

criterion = nn.MSELoss()


files = [
    f for f in os.listdir(DATA_PATH)
    if f.lower().endswith((".jpg", ".jpeg", ".png"))
]


errors = []


with torch.no_grad():

    for filename in files:

        path = os.path.join(DATA_PATH, filename)

        image = Image.open(path).convert("RGB")

        image = transform(image).unsqueeze(0).to(device)

        reconstructed = model(image)

        error = criterion(
            reconstructed,
            image
        ).item()

        errors.append(error)


errors.sort()

count = len(errors)

mean_error = sum(errors) / count

median_error = errors[count // 2]

min_error = errors[0]

max_error = errors[-1]

# 95th percentile
index_95 = int(count * 0.95)

threshold_95 = errors[index_95]


print(f"\nPatches tested : {count}")

print(f"\nMinimum error  : {min_error:.6f}")
print(f"Mean error     : {mean_error:.6f}")
print(f"Median error   : {median_error:.6f}")
print(f"Maximum error  : {max_error:.6f}")

print(f"\n95% threshold  : {threshold_95:.6f}")


print("\n======================================")
print("AUTOENCODER TEST COMPLETE")
print("======================================")