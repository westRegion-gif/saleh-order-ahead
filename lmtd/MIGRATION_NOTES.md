# Migration notes

The repository root currently contains the legacy FastAPI/SQLite V4 prototype. It is intentionally preserved.

## Strategy
1. Build and validate the new `/lmtd` monorepo independently.
2. Reuse business knowledge and approved original LMTD assets where legally/operationally appropriate, but do not copy incompatible legacy architecture into the new domain layer.
3. Migrate real branch/menu data after schema/API foundations are stable.
4. Run customer + branch workflows side by side in staging.
5. Cut over production only after the locked acceptance criteria pass.

Do not point existing Railway production traffic at `/lmtd` yet.
