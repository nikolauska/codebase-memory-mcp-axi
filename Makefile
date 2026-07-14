.PHONY: build test fmt lint check-skill check-npm dist npm-publish install clean

BIN := cbm-axi
VERSION ?= dev
LDFLAGS := -X main.version=$(VERSION)
GO ?= GO111MODULE=off go
INSTALL_DIR ?= $(shell if test -n "$$GOBIN"; then printf '%s' "$$GOBIN"; else printf '%s/bin' "$$($(GO) env GOPATH)"; fi)

build:
	$(GO) build -ldflags "$(LDFLAGS)" -o $(BIN) .

test:
	$(GO) test ./...
	npm test

fmt:
	gofmt -w .

lint:
	test -z "$$(gofmt -l .)"
	$(GO) vet ./...
	node --check npm/cbm-axi.js

check-skill:
	$(GO) run . --print-skill | cmp -s - skills/cbm-axi/SKILL.md

check-npm: dist
	npm pack --dry-run

dist:
	@mkdir -p dist
	GOOS=darwin GOARCH=arm64 $(GO) build -ldflags "$(LDFLAGS)" -o dist/$(BIN)-darwin-arm64 .
	GOOS=darwin GOARCH=amd64 $(GO) build -ldflags "$(LDFLAGS)" -o dist/$(BIN)-darwin-amd64 .
	GOOS=linux GOARCH=arm64 $(GO) build -ldflags "$(LDFLAGS)" -o dist/$(BIN)-linux-arm64 .
	GOOS=linux GOARCH=amd64 $(GO) build -ldflags "$(LDFLAGS)" -o dist/$(BIN)-linux-amd64 .
	GOOS=windows GOARCH=arm64 $(GO) build -ldflags "$(LDFLAGS)" -o dist/$(BIN)-windows-arm64.exe .
	GOOS=windows GOARCH=amd64 $(GO) build -ldflags "$(LDFLAGS)" -o dist/$(BIN)-windows-amd64.exe .

npm-publish:
	test "$$(node -p "require('./package.json').version")" = "$(patsubst v%,%,$(VERSION))"
	npm publish --access public

install:
	@mkdir -p "$(INSTALL_DIR)"
	$(GO) build -ldflags "$(LDFLAGS)" -o "$(INSTALL_DIR)/$(BIN)" .

clean:
	rm -rf $(BIN) dist/
