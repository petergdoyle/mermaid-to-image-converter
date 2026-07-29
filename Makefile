# Mermaid-to-Image Converter
# Static browser UI + Node.js conversion API + batch CLI
.PHONY: help env dev-up dev-down docker-up docker-down status convert clean

NODE := node
NPM  := npm
API_DIR := api
PORT := 3200

help: ## Show available targets
	@echo ""
	@echo "  🧜‍♀️ Mermaid-to-Image Converter"
	@echo "  ════════════════════════════════════════"
	@echo ""
	@echo "  Local Development:"
	@echo "    dev-up        Start API + UI server (background)"
	@echo "    dev-down      Stop local dev processes"
	@echo ""
	@echo "  Docker:"
	@echo "    docker-up     Build and start container (API + UI)"
	@echo "    docker-down   Stop and remove container"
	@echo ""
	@echo "  Utilities:"
	@echo "    env           Install Node.js dependencies"
	@echo "    status        Check running services (local + Docker)"
	@echo "    convert       Batch extract + render diagrams from .md files"
	@echo "    clean         Remove output/ directory"
	@echo ""
	@echo "  Static UI (no server needed):"
	@echo "    open index.html — works from filesystem, zero deps"
	@echo ""
	@echo "  Ports:"
	@echo "    API + UI:  http://localhost:$(PORT)"
	@echo "    UI only:   http://localhost:$(PORT)/ui"
	@echo "    File mode: file://$(PWD)/index.html"
	@echo ""

# ─── Utilities ───────────────────────────────────────────────────────────────

env: ## Install Node.js dependencies
	@cd $(API_DIR) && $(NPM) install
	@echo "✅ Dependencies installed"

clean: ## Remove output directory
	@rm -rf output
	@echo "✅ output/ removed"

status: ## Check running services
	@echo ""
	@echo "  Service Status:"
	@echo "  ─────────────────────────────────────────"
	@curl -s http://localhost:$(PORT)/health >/dev/null 2>&1 \
		&& echo "  ✅ API     http://localhost:$(PORT)" \
		|| echo "  ❌ API     http://localhost:$(PORT)"
	@curl -s http://localhost:$(PORT)/ui >/dev/null 2>&1 \
		&& echo "  ✅ UI      http://localhost:$(PORT)/ui" \
		|| echo "  ❌ UI      http://localhost:$(PORT)/ui"
	@docker ps --filter "name=mermaid" --format "  🐳 Docker: {{.Names}} ({{.Status}})" 2>/dev/null || true
	@echo ""

# ─── Local Development ───────────────────────────────────────────────────────

dev-up: env ## Start API + UI server (background)
	@echo ""
	@echo "  Starting Mermaid Converter..."
	@cd $(API_DIR) && $(NODE) server.js &
	@sleep 2
	@echo ""
	@echo "  ═══════════════════════════════════════════"
	@echo "  🧜‍♀️ Mermaid-to-Image Converter Running"
	@echo "  ═══════════════════════════════════════════"
	@echo "  🔌 API:     http://localhost:$(PORT)"
	@echo "  🖼️  UI:      http://localhost:$(PORT)/ui"
	@echo "  📁 Static:  file://$(PWD)/index.html"
	@echo "  ═══════════════════════════════════════════"
	@echo ""
	@echo "  Stop with:  make dev-down"
	@echo ""

dev-down: ## Stop local dev processes
	@echo "  Stopping local processes..."
	@pkill -f "node.*server.js" 2>/dev/null || true
	@echo "  ✅ Stopped"

# ─── Docker ──────────────────────────────────────────────────────────────────

docker-up: ## Build and start Docker container
	@echo "  Building and starting container..."
	@cd $(API_DIR) && docker compose up -d --build
	@echo ""
	@echo "  ═══════════════════════════════════════════"
	@echo "  🧜‍♀️ Mermaid Converter Running (Docker)"
	@echo "  ═══════════════════════════════════════════"
	@echo "  🔌 API:  http://localhost:$(PORT)"
	@echo "  🖼️  UI:   http://localhost:$(PORT)/ui"
	@echo "  ═══════════════════════════════════════════"
	@echo ""
	@echo "  Stop with:  make docker-down"

docker-down: ## Stop and remove Docker container
	@cd $(API_DIR) && docker compose down
	@echo "  ✅ Docker stack stopped"

# ─── Batch Conversion ────────────────────────────────────────────────────────

convert: env ## Batch extract + render (usage: make convert SOURCE=./docs FORMAT=png)
	@$(NODE) $(API_DIR)/cli.js $(or $(SOURCE),.) \
		--format $(or $(FORMAT),png) \
		--output $(or $(OUTPUT),./output) \
		--theme $(or $(THEME),neutral) \
		--scale $(or $(SCALE),2) \
		--thumb-width $(or $(THUMB_WIDTH),400)
