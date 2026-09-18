import torch
from torchvision.models import mobilenet_v2, MobileNet_V2_Weights


print("================================")
print("INSPECTRA - MOBILENETV2 CHECK")
print("================================")


# ------------------------------------------------
# 1. Load pretrained MobileNetV2
# ------------------------------------------------

weights = MobileNet_V2_Weights.DEFAULT

model = mobilenet_v2(weights=weights)

print("\nPretrained MobileNetV2 loaded successfully!")


# ------------------------------------------------
# 2. Check original classifier
# ------------------------------------------------

print("\nOriginal classifier:")
print(model.classifier)


# ------------------------------------------------
# 3. Replace classifier
# ------------------------------------------------

NUM_CLASSES = 6

model.classifier[1] = torch.nn.Linear(
    model.last_channel,
    NUM_CLASSES
)


# ------------------------------------------------
# 4. Check new classifier
# ------------------------------------------------

print("\nNew classifier:")
print(model.classifier)


# ------------------------------------------------
# 5. Count parameters
# ------------------------------------------------

total_parameters = sum(
    p.numel()
    for p in model.parameters()
)

trainable_parameters = sum(
    p.numel()
    for p in model.parameters()
    if p.requires_grad
)


print("\nModel information:")
print(f"Total parameters     : {total_parameters:,}")
print(f"Trainable parameters : {trainable_parameters:,}")


# ------------------------------------------------
# 6. Test with dummy image
# ------------------------------------------------

dummy_image = torch.randn(
    1, 3, 224, 224
)


with torch.no_grad():

    output = model(dummy_image)


print("\nTest inference:")
print(f"Input shape  : {dummy_image.shape}")
print(f"Output shape : {output.shape}")


print("\nExpected output:")
print("(1, 6) → six defect classes")


print("\nSUCCESS: MobileNetV2 is ready!")