# RustPilot - everyday command shortcuts.
# Run `make` or `make help` to list the targets.

# Terminals opened before Rust was installed do not have cargo on PATH yet.
export PATH := $(USERPROFILE)\.cargo\bin;$(PATH)

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
	@echo   make build      release build, installer copied to installer/, cache removed
	@echo   make clean      remove all build output (dist, target)

install:
	pnpm install

# The incremental cache is dropped when the app exits so target/ stops growing.
dev:
	-pnpm tauri dev
	@node scripts/cache.mjs trim

web:
	pnpm dev

test: test-web test-rust

test-web:
	pnpm test

test-rust:
	cd src-tauri && cargo test
	@node scripts/cache.mjs trim

check:
	pnpm exec tsc --noEmit
	cd src-tauri && cargo check

# Keeps only the installer: the release cache is over 1 GB and is not needed afterwards.
build:
	pnpm tauri build
	@node scripts/cache.mjs collect

clean:
	node -e "require('fs').rmSync('dist',{recursive:true,force:true})"
	cd src-tauri && cargo clean
