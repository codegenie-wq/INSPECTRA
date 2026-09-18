INSPECTRA
AI-powered vision-based industrial inspection and defect detection system.

INSPECTRA combines computer vision, deep learning, and a web interface to inspect manufactured products, detect surface anomalies, localize defects, estimate severity, and maintain inspection records.

Key Features
Vision-based product inspection
Defect detection and localization
MobileNetV2-based classification pipeline
Autoencoder-based anomaly detection
Image preprocessing with OpenCV
Grad-CAM / visual analysis utilities
Severity and confidence analysis
Web-based inspection dashboard
Live inspection and reporting workflow
Tech Stack
Python
PyTorch / Torchvision
OpenCV
FastAPI
Node.js
HTML / CSS / JavaScript
Vercel configuration for deployment
Project Structure
model/ — AI models and inference/training utilities
preprocessing/ — image preprocessing pipeline
backend/ — Python API/backend
api/ — deployment API entry point
frontend_ui/ — web interface
Setup
Python backend
pip install -r requirements.txt
Run the FastAPI backend using the project's configured entry point.

Frontend
cd frontend_ui
npm install
npm start
Training datasets, generated uploads, test images, caches, and node_modules are intentionally excluded from this repository. Download/prepare them separately when required.
