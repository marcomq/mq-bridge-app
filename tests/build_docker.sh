#!/bin/bash
set -e

# This script builds the Docker image.
# Usage: ./scripts/build_docker.sh [--multi-arch]

IMAGE_NAME="mq-bridge-app"

# Determine the project root relative to this script
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ "$1" == "--multi-arch" ]; then
    echo "Building for linux/amd64 and linux/arm64..."
    # Create a buildx builder if it doesn't exist (required for multi-arch)
    docker buildx inspect mybuilder > /dev/null 2>&1 || docker buildx create --name mybuilder --use
    
    # Build for both platforms.
    # Note: We cannot load multi-arch images into the local docker daemon directly, so we just verify the build.
    docker buildx build --platform linux/amd64,linux/arm64 -t ${IMAGE_NAME}:local "$PROJECT_ROOT"
else
    echo "Building for local architecture..."
    docker build -t ${IMAGE_NAME}:local "$PROJECT_ROOT"
fi
