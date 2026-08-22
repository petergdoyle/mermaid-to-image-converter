# Mermaid-to-Image Converter — Development Makefile
# Stack: Node.js/Express (single server serves API + UI)
# Ports: API+UI=3200

.DEFAULT_GOAL := help
.PHONY: help setup _check-setup dev-up dev-down dev-restart dev-status build-samples batch-convert clean docker-up docker-down docker-status docker-restart

PORT := 3200
NODE := node
NPM := npm

help: ## Show this help message
	@echo "Usage: make [target]"
	@echo ""
	@echo "Available targets:"
	@echo "  help           Show this help message"
	@echo "  setup          Install all dependencies"
	@echo "  dev-up         Start dev server (idempotent)"
	@echo "  dev-down       Stop dev server (no-ops if nothing running)"
	@echo "  dev-restart    Restart dev server cleanly"
	@echo "  dev-status     Check health of local server"
	@echo "  build-samples  Compile Mermaid diagram samples library"
	@echo "  batch-convert  Batch extract + render diagrams from .md files"
	@echo "  clean          Remove output/ directory"
	@echo ""
	@echo "  Docker:"
	@echo "  docker-up      Build and start container"
	@echo "  docker-down    Stop and remove container"
	@echo "  docker-status  Check Docker container status"
	@echo "  docker-restart Restart Docker container"

# ─── Setup ────────────────────────────────────────────────────────────────────

setup: ## Install Node.js dependencies and build samples
	@echo "Installing Node.js dependencies..."
	@$(NPM) install
	@$(NODE) scripts/build-samples.js
	@echo ""
	@echo "✅ Setup complete. Run 'make dev-up' to start."

# ─── Internal Guards ──────────────────────────────────────────────────────────

_check-setup:
	@if [ ! -d node_modules ]; then \
		echo "❌ Dependencies not installed. Run 'make setup' first."; exit 1; \
	fi

# ─── Dev Lifecycle ────────────────────────────────────────────────────────────

dev-up: _check-setup ## Start dev server (idempotent)
	@STARTED=0; \
	if curl -sf http://localhost:$(PORT)/health > /dev/null 2>&1; then \
		echo "⚡ Server already running on :$(PORT), skipping..."; \
	else \
		echo "Starting Mermaid Converter server in background..."; \
		mkdir -p output; \
		nohup $(NODE) server.js > output/server.log 2>&1 & echo $$! > .server.pid; \
		STARTED=1; \
	fi; \
	if [ $$STARTED -eq 1 ]; then \
		echo "Waiting for server to start..."; sleep 3; \
	fi
	@$(MAKE) dev-status

dev-down: ## Stop dev server (no-ops if nothing running)
	@SERVER=$$(curl -sf http://localhost:$(PORT)/health > /dev/null 2>&1 && echo 1 || echo 0); \
	if [ $$SERVER -eq 0 ]; then \
		echo "ℹ️  No servers running. Nothing to stop."; \
	else \
		echo "Stopping server..."; \
		if [ -f .server.pid ]; then kill -9 $$(cat .server.pid) 2>/dev/null || true; rm -f .server.pid; fi; \
		pkill -f "node.*server.js" || true; \
		echo "Stopped."; \
	fi

dev-restart: _check-setup ## Restart dev server cleanly
	@RUNNING=0; \
	if curl -sf http://localhost:$(PORT)/health > /dev/null 2>&1; then RUNNING=1; fi; \
	if [ $$RUNNING -eq 1 ]; then \
		$(MAKE) dev-down; \
		echo "Waiting for port to clear..."; sleep 2; \
	else \
		echo "No server running, skipping shutdown..."; \
	fi
	@$(MAKE) dev-up

dev-status: ## Check health of local server
	@echo ""
	@echo "=================================================="
	@echo "🚀 Mermaid Converter Dev Environment Status"
	@echo "=================================================="
	@if curl -sf http://localhost:$(PORT)/health > /dev/null 2>&1; then \
		echo "✅ Online        | API Server      | http://localhost:$(PORT)/health"; \
	else \
		echo "❌ Offline       | API Server      | http://localhost:$(PORT)/health"; \
	fi
	@if curl -sf http://localhost:$(PORT)/ui > /dev/null 2>&1; then \
		echo "✅ Online        | Browser UI      | http://localhost:$(PORT)/ui"; \
	else \
		echo "❌ Offline       | Browser UI      | http://localhost:$(PORT)/ui"; \
	fi
	@if curl -sf http://localhost:11434/ > /dev/null 2>&1; then \
		echo "✅ Online        | Ollama Daemon   | http://localhost:11434/"; \
	else \
		echo "❌ Offline       | Ollama Daemon   | http://localhost:11434/"; \
	fi
	@echo "=================================================="
	@echo ""

# ─── Utilities ────────────────────────────────────────────────────────────────

build-samples: ## Compile Mermaid diagram samples library
	@$(NODE) scripts/build-samples.js

batch-convert: _check-setup ## Batch extract + render (interactive, or: make batch-convert SOURCE=./docs FORMAT=png)
	@if [ -n "$(SOURCE)" ]; then \
		$(NODE) cli.js $(SOURCE) \
			--format $(or $(FORMAT),png) \
			--output $(or $(OUTPUT),./output) \
			--theme $(or $(THEME),neutral) \
			--scale $(or $(SCALE),2) \
			--thumb-width $(or $(THUMB_WIDTH),400); \
	else \
		$(NODE) cli.js; \
	fi

# ─── Docker ──────────────────────────────────────────────────────────────────

docker-up: ## Build and start Docker container
	@echo "Building and starting container..."
	@docker-compose up -d --build
	@echo "✅ Docker stack running on :$(PORT)"

docker-down: ## Stop and remove Docker container
	@docker-compose down
	@echo "✅ Docker stack stopped"

docker-status: ## Check Docker container status
	@echo ""
	@echo "  Docker Container Status:"
	@echo "  ─────────────────────────────────────────"
	@docker ps --filter "name=mermaid" --format "  🐳 Docker: {{.Names}} ({{.Status}})" 2>/dev/null || true
	@echo ""

docker-restart: docker-down ## Restart Docker container
	@sleep 3
	@$(MAKE) docker-up

# ─── Cleanup ─────────────────────────────────────────────────────────────────

clean: ## Remove output directory and logs
	@echo "Cleaning up..."
	rm -rf output .server.pid
	@echo "✅ Clean."
