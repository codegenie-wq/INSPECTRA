"""
Vercel Serverless Function entrypoint for INSPECTRA FastAPI backend.
"""

import sys
from pathlib import Path

# Add project root directory to sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# Import the FastAPI ASGI app from backend/app.py
from backend.app import app
