# NeuralScribe 🎙️✍️

NeuralScribe is a fast, offline-first application that automatically generates subtitles from audio files. Built with a premium, modern web interface and powered by the highly optimized `faster-whisper` AI engine, it transcribes audio locally on your machine—ensuring complete privacy and no reliance on cloud APIs.

## ✨ Features

- **100% Offline AI**: Uses `faster-whisper` for rapid, private transcription on your local CPU or GPU.
- **Premium UI**: A sleek, dark-mode web interface featuring glassmorphism elements and smooth micro-animations.
- **Drag & Drop**: Easily drag your audio files (MP3, WAV, M4A, etc.) directly into the browser to begin processing.
- **Auto-Formatting**: Automatically generates properly formatted `.srt` subtitle files ready for download.
- **Clean Architecture**: Backend strictly adheres to Domain-Driven Design principles with separate Domain, Infrastructure, and API layers.

## 🛠️ Tech Stack

- **Backend**: Python, FastAPI, `faster-whisper`, Pydantic
- **Frontend**: React, TypeScript, Vite, Vanilla CSS
- **Architecture**: Domain-Driven Design (DDD), Clean Architecture

## 🚀 Getting Started

### Prerequisites
- Python 3.9+
- Node.js 18+

### 1. Setup the Backend

```bash
# Navigate to the backend directory
cd backend

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the FastAPI server
export PYTHONPATH=$(pwd)/..
uvicorn src.api.main:app --port 8000
```
*(Note: On the first run, the app will download the `faster-whisper` base model which is ~150MB. Subsequent runs will be completely offline).*

### 2. Setup the Frontend

```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies
npm install

# Start the Vite development server
npm run dev
```

### 3. Generate Subtitles

Open your browser and navigate to `http://localhost:3000`. Drag an audio file into the drop zone, hit **Generate Subtitles**, and download your `.srt` file once complete!

## 🔧 Configuration

You can adjust the speed and accuracy of the transcription by changing the whisper model size. Open `backend/src/api/main.py` and modify the model instantiation:

```python
# Options: 'tiny', 'base', 'small', 'medium', 'large-v3'
transcriber = FasterWhisperService(model_size="base", device="cpu", compute_type="default")
```

## 📝 License
MIT License
# VocalScript
