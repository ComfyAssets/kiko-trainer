#!/usr/bin/env bash
set -euo pipefail

# Clone sd-scripts if missing
if [ ! -d sd-scripts ]; then
  echo "Cloning kohya-ss/sd-scripts (branch sd3)..."
  git clone -b sd3 https://github.com/kohya-ss/sd-scripts sd-scripts
fi

python -m venv venv
source venv/bin/activate

echo "Installing backend requirements..."
pip install --upgrade pip
pip install -r requirements.txt

echo "Installing sd-scripts requirements..."
cd sd-scripts
pip install -r requirements.txt
cd ..

echo "Done. Start the API with:"
echo "  source venv/bin/activate && uvicorn server:app --host 0.0.0.0 --port 8001 --reload"
