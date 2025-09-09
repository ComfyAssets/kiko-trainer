# Kiko Trainer Makefile
# Simplifies Docker operations and development workflows

.PHONY: help build build-api build-web up down restart logs shell clean dev prod test install setup

# Variables
COMPOSE = docker-compose
COMPOSE_FILE = docker-compose.yml
API_IMAGE = kiko-trainer-api
WEB_IMAGE = kiko-trainer-web
API_CONTAINER = kiko-trainer-api-1
WEB_CONTAINER = kiko-trainer-web-1

# Default target - show help
help: ## Show this help message
	@echo "Kiko Trainer - Docker Management"
	@echo "================================"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Build targets
build: ## Build all Docker images
	$(COMPOSE) build

build-api: ## Build only the API image
	$(COMPOSE) build api

build-web: ## Build only the web frontend image
	$(COMPOSE) build web

build-no-cache: ## Build all images without cache
	$(COMPOSE) build --no-cache

# Docker Compose operations
up: ## Start all services in detached mode
	$(COMPOSE) up -d

down: ## Stop and remove all containers
	$(COMPOSE) down

restart: ## Restart all services
	$(COMPOSE) restart

stop: ## Stop all services without removing
	$(COMPOSE) stop

start: ## Start previously stopped services
	$(COMPOSE) start

# Development helpers
dev: ## Start services in development mode with live reload
	$(COMPOSE) up

dev-api: ## Start only API in development mode
	$(COMPOSE) up api

dev-web: ## Start only web frontend in development mode
	$(COMPOSE) up web

# Logging and debugging
logs: ## Show logs from all services
	$(COMPOSE) logs -f

logs-api: ## Show logs from API service
	$(COMPOSE) logs -f api

logs-web: ## Show logs from web service
	$(COMPOSE) logs -f web

logs-tail: ## Show last 100 lines of logs
	$(COMPOSE) logs --tail=100

# Shell access
shell-api: ## Open shell in API container
	docker exec -it $(API_CONTAINER) /bin/bash

shell-web: ## Open shell in web container
	docker exec -it $(WEB_CONTAINER) /bin/sh

# Database operations (if you add a database later)
db-shell: ## Access database shell (placeholder for future)
	@echo "Database not configured yet"

db-backup: ## Backup database (placeholder for future)
	@echo "Database backup not configured yet"

db-restore: ## Restore database (placeholder for future)
	@echo "Database restore not configured yet"

# Cleanup operations
clean: ## Remove all containers, networks, and volumes
	$(COMPOSE) down -v
	docker system prune -f

clean-images: ## Remove all project Docker images
	docker rmi $(API_IMAGE) $(WEB_IMAGE) 2>/dev/null || true

clean-all: clean clean-images ## Complete cleanup of containers, volumes, and images

# Testing
test: ## Run tests in containers
	@echo "Running backend tests..."
	docker exec $(API_CONTAINER) python -m pytest tests/ || true
	@echo "Running frontend tests..."
	docker exec $(WEB_CONTAINER) npm test || true

test-api: ## Run only API tests
	docker exec $(API_CONTAINER) python -m pytest tests/

test-web: ## Run only frontend tests
	docker exec $(WEB_CONTAINER) npm test

# Installation and setup
install: ## Install dependencies locally (non-Docker)
	pip install -r requirements.txt
	cd web && npm install

setup: ## Initial project setup
	@echo "Setting up Kiko Trainer..."
	@cp -n .env.example .env 2>/dev/null || echo ".env already exists"
	@cp -n web/.env.example web/.env 2>/dev/null || echo "web/.env already exists"
	@echo "Creating necessary directories..."
	@mkdir -p outputs models dataset
	@echo "Setup complete!"

# Production
prod: ## Build and start in production mode
	$(COMPOSE) -f docker-compose.yml -f docker-compose.prod.yml up -d --build

prod-logs: ## Show production logs
	$(COMPOSE) -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Status and health checks
status: ## Show status of all containers
	$(COMPOSE) ps

health: ## Check health of services
	@echo "Checking API health..."
	@curl -f http://localhost:8888/health 2>/dev/null && echo "✓ API is healthy" || echo "✗ API is not responding"
	@echo "Checking Web health..."
	@curl -f http://localhost:3333/ 2>/dev/null && echo "✓ Web is healthy" || echo "✗ Web is not responding"

# Port forwarding info
ports: ## Show exposed ports
	@echo "Service ports:"
	@echo "  API: http://localhost:8888"
	@echo "  Web: http://localhost:3333"

# Docker stats
stats: ## Show resource usage of containers
	docker stats --no-stream $(shell docker ps --format "table {{.Names}}" | grep kiko)

# Rebuild and restart
rebuild: down build up ## Rebuild and restart all services
	@echo "Services rebuilt and restarted successfully!"

# Quick development restart
quick-restart: ## Quick restart without rebuilding
	$(COMPOSE) restart
	@echo "Services restarted!"

# View running processes in containers
ps-api: ## Show processes in API container
	docker exec $(API_CONTAINER) ps aux

ps-web: ## Show processes in web container
	docker exec $(WEB_CONTAINER) ps aux

# Environment info
env: ## Show environment configuration
	@echo "Current environment configuration:"
	@echo "===================================="
	@cat .env 2>/dev/null || echo "No .env file found"
	@echo ""
	@echo "Web environment:"
	@echo "================"
	@cat web/.env 2>/dev/null || echo "No web/.env file found"

# Version info
version: ## Show version information
	@echo "Docker version:"
	@docker --version
	@echo ""
	@echo "Docker Compose version:"
	@docker-compose --version
	@echo ""
	@echo "Images:"
	@docker images | grep kiko-trainer || echo "No kiko-trainer images found"

# Training specific commands
purge-vram: ## Purge VRAM (requires API running)
	@echo "Purging VRAM..."
	@curl -X POST http://localhost:8888/api/purge-vram

models: ## List available models
	@echo "Available models:"
	@curl -s http://localhost:8888/api/models | python -m json.tool

# Default target if no target specified
.DEFAULT_GOAL := help