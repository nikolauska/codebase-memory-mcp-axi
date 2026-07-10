.PHONY: build test fmt lint check-skill dist install clean

BIN := cbm-axi
VERSION ?= dev
LDFLAGS := -X main.version=$(VERSION)

build:
	go build -ldflags "$(LDFLAGS)" -o $(BIN) .

test:
	go test ./...

fmt:
	gofmt -w .

lint:
	test -z "$$(gofmt -l .)"
	go vet ./...

check-skill:
	go run . --print-skill | cmp -s - skills/cbm-axi/SKILL.md

dist:
	@mkdir -p dist
	GOOS=darwin GOARCH=arm64 go build -ldflags "$(LDFLAGS)" -o dist/$(BIN)-darwin-arm64 .
	GOOS=darwin GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o dist/$(BIN)-darwin-amd64 .
	GOOS=linux GOARCH=arm64 go build -ldflags "$(LDFLAGS)" -o dist/$(BIN)-linux-arm64 .
	GOOS=linux GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o dist/$(BIN)-linux-amd64 .
	GOOS=windows GOARCH=arm64 go build -ldflags "$(LDFLAGS)" -o dist/$(BIN)-windows-arm64.exe .
	GOOS=windows GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o dist/$(BIN)-windows-amd64.exe .

install:
	go install -ldflags "$(LDFLAGS)" .

clean:
	rm -rf $(BIN) dist/
