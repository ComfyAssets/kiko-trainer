#!/bin/bash

echo "========================================="
echo "Kiko Trainer Installation Script"
echo "========================================="

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if venv exists, create if not
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python -m venv venv
else
    echo "Virtual environment already exists"
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip

# Install main requirements
echo ""
echo "Installing main requirements..."
pip install -r requirements.txt

# Install sd-scripts requirements
echo ""
echo "Installing sd-scripts requirements..."
cd sd-scripts
pip install -r requirements.txt
cd ..

# Install frontend dependencies
echo ""
echo "Installing frontend dependencies..."
cd web
npm install
cd ..

echo ""
echo "========================================="
echo "Installation Complete!"
echo "========================================="
echo ""
echo "To start the application:"
echo "1. Backend:  ./start-server.sh"
echo "2. Frontend: cd web && npm run dev"
echo ""
echo "Configuration:"
echo "- Backend port: 8888 (configurable in .env)"
echo "- Frontend port: 3333 (configurable in web/.env)"
echo ""
