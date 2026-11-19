# RustPilot — pintasan perintah harian.
# Pakai: `make` atau `make help` untuk melihat daftar target.

.DEFAULT_GOAL := help
.PHONY: help install dev web test test-web test-rust check build clean

help: ## Tampilkan daftar target
	@echo RustPilot - target yang tersedia:
	@echo   make install    pasang dependensi frontend (pnpm)
	@echo   make dev        jalankan aplikasi desktop (mode dev)
	@echo   make web        jalankan frontend saja di browser (Vite)
	@echo   make test       semua tes (Vitest + cargo test)
	@echo   make test-web   tes frontend saja
	@echo   make test-rust  tes Rust saja
	@echo   make check      typecheck TS + cargo check
	@echo   make build      build release + installer NSIS
	@echo   make clean      hapus hasil build (dist, target)

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
