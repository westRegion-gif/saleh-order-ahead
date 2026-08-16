# V4
- Added first-run Admin setup.
- Added username/password login and logout.
- Added role-based permissions: Admin, Manager, Branch Staff.
- Added branch-level access restrictions.
- Added Users & Access management for Admin.
- Added password reset and user enable/disable controls.
- Passwords are PBKDF2-SHA256 hashed and are never hardcoded.
- Sessions use HttpOnly cookies with 7-day expiry.
- Sanitized real-time WebSocket notifications to avoid broadcasting customer/order details.
