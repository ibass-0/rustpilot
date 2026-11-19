# RustPilot - everyday command shortcuts.
# Run `make` or `make help` to list the targets.

.DEFAULT_GOAL := help
.PHONY: help install dev web test test-web test-rust check build clean

help:
	@echo RustPilot - available targets:
	@echo   make install    install frontend dependencies (pnpm)
	@echo   make dev        run the desktop app in dev mode
	@echo   make web        run the frontend only in a browser (Vite)
	@echo   make test       run all tests (Vitest + cargo test)
	@echo   make test-web   run frontend tests only
	@echo   make test-rust  run Rust tests only
	@echo   make check      typecheck TS + cargo check
	@echo   make build      release build + NSIS installer
	@echo   make clean      remove build output (dist, target)

install:
	pnpm install

dev:
	pnpm tauri dev

web:
	pnpm dev

test: test-web test-rust

test-web:
	pnpm test

test-rust:
	cd src-tauri && cargo test

check:
	pnpm exec tsc --noEmit
	cd src-tauri && cargo check

build:
	pnpm tauri build

clean:
	node -e "require('fs').rmSync('dist',{recursive:true,force:true})"
	cd src-tauri && cargo clean
