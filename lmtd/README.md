# LMTD Next-Generation Platform

This directory is the production-oriented rebuild of the existing Saleh Order Ahead prototype.

The legacy FastAPI/SQLite V4 remains untouched at repository root while this rebuild is developed and tested.

## Apps
- `apps/customer` — Next.js 15 customer PWA
- `apps/admin` — Next.js 15 branch/HQ console
- `apps/api` — NestJS API

## Infrastructure
- PostgreSQL 16
- Redis 7
- Prisma ORM
- Socket.IO realtime
- BullMQ background jobs

## Local start
1. Copy `.env.example` to `.env`.
2. Run `docker compose up -d`.
3. Run `pnpm install`.
4. Run `pnpm dev`.

Implementation contract: `../docs/lmtd-v4/LMTD_V4_FINAL_LOCKED.zip`.
