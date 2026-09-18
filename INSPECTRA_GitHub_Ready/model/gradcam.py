import torch
import torch.nn.functional as F
import cv2
import numpy as np

from PIL import Image
from torchvision import transforms, models


MODEL_PATH = "model/steelguard_mobilenetv2.pth"
IMAGE_PATH = "dataset/validation/images/crazing/crazing_241.jpg"

CLASS_NAMES = [
    "crazing",
    "inclusion",
    "patches",
    "pitted_surface",
    "rolled-in_scale",
    "scratches"
]


print("======================================")
print("INSPECTRA - GRAD-CAM")
print("======================================")


device = torch.device("cpu")


# -----------------------------
# Load model
# -----------------------------

model = models.mobilenet_v2(weights=None)

model.classifier[1] = torch.nn.Linear(
    model.classifier[1].in_features,
    6
)

model.load_state_dict(
    torch.load(
        MODEL_PATH,
        map_location=device
    )
)

model = model.to(device)
model.eval()


# -----------------------------
# Grad-CAM storage
# -----------------------------

activations = None
gradients = None


def forward_hook(module, input, output):
    global activations
    activations = output


def backward_hook(module, grad_input, grad_output):
    global gradients
    gradients = grad_output[0]


# Last convolutional layer
target_layer = model.features[-1]

target_layer.register_forward_hook(forward_hook)
target_layer.register_full_backward_hook(backward_hook)


# -----------------------------
# Prepare image
# -----------------------------

transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])


image = Image.open(
    IMAGE_PATH
).convert("RGB")


input_tensor = transform(
    image
).unsqueeze(0).to(device)


# -----------------------------
# Forward pass
# -----------------------------

output = model(input_tensor)

probabilities = F.softmax(
    output,
    dim=1
)

confidence, predicted = torch.max(
    probabilities,
    dim=1
)

predicted_class = CLASS_NAMES[
    predicted.item()
]


print(f"\nImage: {IMAGE_PATH}")
print(f"Prediction: {predicted_class}")
print(
    f"Confidence: "
    f"{confidence.item() * 100:.2f}%"
)


# -----------------------------
# Backward pass
# -----------------------------

model.zero_grad()

target_score = output[
    0,
    predicted.item()
]

target_score.backward()


# -----------------------------
# Generate Grad-CAM
# -----------------------------

weights = gradients.mean(
    dim=(2, 3),
    keepdim=True
)

cam = (
    weights * activations
).sum(
    dim=1
).squeeze(0)


cam = F.relu(cam)

cam -= cam.min()

if cam.max() > 0:
    cam /= cam.max()


cam = cam.detach().numpy()

cam = cv2.resize(
    cam,
    image.size
)


# -----------------------------
# Create heatmap
# -----------------------------

heatmap = np.uint8(
    255 * cam
)

heatmap = cv2.applyColorMap(
    heatmap,
    cv2.COLORMAP_JET
)


original = np.array(image)

original = cv2.cvtColor(
    original,
    cv2.COLOR_RGB2BGR
)


overlay = cv2.addWeighted(
    original,
    0.6,
    heatmap,
    0.4,
    0
)



np.save(
    "test_images/gradcam_heatmap.npy",
    cam
)
output_path = "test_images/gradcam_result.jpg"

cv2.imwrite(
    output_path,
    overlay
)


print(f"\nGrad-CAM saved to:")
print(output_path)

print("\n======================================")
print("GRAD-CAM COMPLETE")
print("======================================")