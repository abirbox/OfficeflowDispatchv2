# OfficeFlow – Product Requirements Document

## Original Problem Statement
Restore OfficeFlow full-stack app from https://github.com/crefixit/officeflow_v2.git and extend features. Recent focused ask: "for client logo, vendor logo, site logo, icon images are not uploading, make a storage so all image store".

## Architecture
- Frontend: React + Tailwind + Zustand (`/app/frontend`)
- Backend: FastAPI + Motor (async Mongo) (`/app/backend`)
- Storage: **Local filesystem** at `/app/backend/uploads/officeflow/<scope>/<uuid>.<ext>`, served through `GET /api/files/{path}`.

## User Personas
- Super Admin – configures branding, manages users
- Admin – manages employees, dispatch, reports
- Employee/Officer – daily operations, attendance
- Client & Vendor – referenced entities with logos

## Core Requirements (static)
- Auth (JWT), branding, dispatch (clients, vendors, officers, post-sites, schedules), attendance, tasks, leaves, payroll, notifications.
- Persistent image uploads for: site logo, site favicon/icon, client logo, vendor logo, company logo, employee avatar.

## Implemented (with dates)
- 2026-08-18: Restored codebase, resolved deps (`reportlab`), set `JWT_SECRET`, patched `AppSettingsContext` to hit `/settings/public` pre-auth.
- 2026-08-18: Replaced broken Emergent object-store integration with **local filesystem storage** (`utils/storage.py`). Same public API (`put_object`, `get_object`, `generate_upload_path`, `to_public_url`, `init_storage`) so no route changes needed. Verified end-to-end (iteration_5): 100% backend, 100% frontend.

## Prioritized Backlog
- P1: PWA install / offline shell
- P2: Activity logs UI + real-time officer status board
- P2: Optional Cloudinary/S3 driver behind the same storage interface for CDN delivery
- P3: Cleanup of non-blocking frontend lint warnings

## Test Credentials
See `/app/memory/test_credentials.md` – admin@example.com / admin123
