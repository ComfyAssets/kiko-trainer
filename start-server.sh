#!/bin/bash
# File              : start-server.sh
# Author            : kiko
# Date              : 05.09.2025
# Last Modified Date: 05.09.2025
# Last Modified By  : kiko
#
cd "$(dirname "$0")"

# Load environment variables from .env if it exists
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Default values if not set in .env
API_PORT=${API_PORT:-8888}
API_HOST=${API_HOST:-0.0.0.0}

# Change to backend directory where server.py is located
cd backend

# Use the virtual environment's uvicorn directly to ensure proper dependencies
../venv/bin/uvicorn server:app --host $API_HOST --port $API_PORT --reload
