# LMTD POS Android

Dedicated Android shell for the LMTD branch POS screen.

- Loads the production Staff / POS web application.
- Keeps the screen awake on the counter device.
- Exposes a native `LMTDPrinter` JavaScript bridge for Telpo thermal printing.
- Targets Telpo M1-class Android terminals (Android 12 / 58mm printer).
- Each device still authenticates with its branch-scoped POS account from the LMTD admin console.

The CI workflow downloads the Telpo API runtime used by the M1-oriented open-source integration and builds an installable APK. Replace those runtime files with the official SDK package for the exact device serial before production rollout if Telpo provides a newer device-specific SDK.
