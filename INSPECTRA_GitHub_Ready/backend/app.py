import os
import sys
import json
import shutil
import tempfile
from pathlib import Path

# Ensure repository root is on sys.path so 'model' package is always resolvable
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from model.product_inspection import inspect_product

app = FastAPI(
    title="INSPECTRA AI",
    description="AI-powered visual inspection backend",
    version="1.0"
)

# Deployment-safe CORS configuration: allow origins from environment or allow all
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS if ALLOWED_ORIGINS != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Deployment-safe upload directory (serverless environments have a read-only filesystem except /tmp)
def _resolve_upload_dir():
    if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        target = os.path.join(tempfile.gettempdir(), "inspectra_uploads")
        os.makedirs(target, exist_ok=True)
        return target
    try:
        local_target = os.path.join(str(Path(__file__).resolve().parent), "uploads")
        os.makedirs(local_target, exist_ok=True)
        return local_target
    except OSError:
        target = os.path.join(tempfile.gettempdir(), "inspectra_uploads")
        os.makedirs(target, exist_ok=True)
        return target

UPLOAD_DIR = _resolve_upload_dir()


@app.get("/")
def home():
    return {
        "system": "INSPECTRA AI",
        "status": "online",
        "message": "Visual inspection backend is running",
        "version": "1.0",
        "environment": "vercel" if os.environ.get("VERCEL") else "standalone"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "INSPECTRA AI Backend",
        "version": "1.0",
        "model_loaded": True,
        "environment": "vercel" if os.environ.get("VERCEL") else "local"
    }


@app.post("/inspect-product")
async def inspect_product_api(
    product_id: str = Form(...),
    metadata: str = Form(...),
    image1: UploadFile = File(...),
    image2: UploadFile = File(None),
    image3: UploadFile = File(None)
):
    metadata_list = json.loads(metadata)

    uploaded_images = [
        image1,
        image2,
        image3
    ]

    product_images = []

    for image, info in zip(uploaded_images, metadata_list):
        if image is None:
            continue

        filename = f"{product_id}_{info['image_id']}_{image.filename}"
        image_path = os.path.join(UPLOAD_DIR, filename)

        with open(image_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)

        product_images.append({
            "image_id": info["image_id"],
            "view": info["view"],
            "image_path": image_path
        })

    result = inspect_product(
        product_id=product_id,
        images=product_images
    )

    return result


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    uvicorn.run("backend.app:app", host=host, port=port, reload=True)