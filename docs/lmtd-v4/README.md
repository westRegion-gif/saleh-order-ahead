# LMTD V4 implementation contract

This directory contains the final locked LMTD V4 package approved for implementation.

- Source package: `LMTD_V4_FINAL_LOCKED.zip`
- Customer scope: UAE / AED, multiple branches, walk-in + vehicle pickup
- Customer authentication: phone OTP
- Realtime: Socket.IO
- Backend: NestJS + Prisma + PostgreSQL
- Customer/Admin: Next.js 15

## Implementation rule
Do not alter the legacy FastAPI V4 application while the rebuild is in progress. The new platform lives under `/lmtd` until the acceptance criteria in the package pass. Then migration/cutover can be handled deliberately.

## Start
Extract/read the ZIP and follow `00_README.md`, then `01_CLAUDE_MASTER_INSTRUCTION.md`. Do not call the rebuild complete until `12_ACCEPTANCE_CRITERIA.md` passes.
