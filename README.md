# The Glen Grant — Bartender Notes Backend

> Production-ready Node.js / Express backend for the Glen Grant Bartender Notes Android event application.

---

## Table of Contents

1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Installation](#installation)
5. [Environment Variables](#environment-variables)
6. [MongoDB Setup](#mongodb-setup)
7. [Cloudinary Setup](#cloudinary-setup)
8. [Local Development](#local-development)
9. [API Reference](#api-reference)
10. [Admin Dashboard](#admin-dashboard)
11. [Excel Export](#excel-export)
12. [Offline Synchronisation Protocol](#offline-synchronisation-protocol)
13. [Render Deployment](#render-deployment)
14. [Security Notes](#security-notes)
15. [Rate Limiting Policy](#rate-limiting-policy)

---

## Overview

This backend supports the Glen Grant Bartender Notes Android tablet application.

**Key capabilities:**

- Accept live submissions from one or more Android tablets
- Upload signature images to Cloudinary
- Store all registration data in MongoDB Atlas
- Synchronise offline submissions when connectivity is restored
- Provide real-time submission counts (today + overall) in the configured event timezone
- Admin web dashboard with search, filtering, and pagination
- Export to XLSX (with embedded signature images) and ZIP backup
- Health check endpoint for monitoring

---

## Technology Stack

| Layer         | Technology                  |
|---------------|-----------------------------|
| Runtime       | Node.js 18+ LTS             |
| Framework     | Express.js 4.x              |
| Database      | MongoDB Atlas + Mongoose 8  |
| File storage  | Cloudinary                  |
| Excel export  | ExcelJS                     |
| ZIP backup    | Archiver                    |
| Sessions      | express-session + connect-mongo |
| Security      | Helmet, CORS                |
| HTTP client   | Axios (server-side Cloudinary downloads) |
| File upload   | Multer (memory storage)     |
| IDs           | UUID v4                     |

---

## Project Structure

```
glen-grant-backend/
├── src/
│   ├── config/
│   │   ├── database.js        # MongoDB connection
│   │   └── cloudinary.js      # Cloudinary SDK setup
│   ├── controllers/
│   │   ├── submissionController.js
│   │   ├── syncController.js
│   │   ├── countController.js
│   │   ├── exportController.js
│   │   └── adminController.js
│   ├── middleware/
│   │   ├── auth.js            # Session-based admin auth
│   │   ├── errorHandler.js    # Centralised error handler
│   │   ├── upload.js          # Multer + magic-byte validation
│   │   └── validation.js      # Field validators
│   ├── models/
│   │   └── Submission.js      # Mongoose schema + indexes
│   ├── routes/
│   │   ├── submissionRoutes.js
│   │   ├── syncRoutes.js
│   │   ├── countRoutes.js
│   │   ├── exportRoutes.js
│   │   └── adminRoutes.js
│   ├── services/
│   │   ├── cloudinaryService.js
│   │   ├── excelService.js
│   │   └── backupService.js
│   ├── utils/
│   │   └── timezone.js        # IANA timezone helpers (no external deps)
│   ├── views/
│   │   └── admin/
│   │       ├── login.html
│   │       ├── dashboard.html
│   │       └── submissions.html
│   ├── public/
│   │   ├── css/
│   │   └── js/
│   ├── app.js                 # Express app factory
│   └── server.js              # Entry point
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## Installation

### Prerequisites

- Node.js 18 or later (`node --version`)
- npm 9 or later (`npm --version`)
- A MongoDB Atlas account
- A Cloudinary account

### Steps

```bash
# 1. Clone or download the project
cd glen-grant-backend

# 2. Install dependencies
npm install

# 3. Copy and fill in environment variables
cp .env.example .env
# Edit .env with your actual values (see next section)

# 4. Start the development server
npm run dev
```

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable                  | Required | Description                                              |
|---------------------------|----------|----------------------------------------------------------|
| `PORT`                    | No       | HTTP port (default: 3000)                                |
| `MONGODB_URI`             | **Yes**  | MongoDB Atlas connection string                          |
| `CLOUDINARY_CLOUD_NAME`   | **Yes**  | Your Cloudinary cloud name                               |
| `CLOUDINARY_API_KEY`      | **Yes**  | Cloudinary API key                                       |
| `CLOUDINARY_API_SECRET`   | **Yes**  | Cloudinary API secret                                    |
| `ADMIN_USERNAME`          | **Yes**  | Admin dashboard login username                           |
| `ADMIN_PASSWORD`          | **Yes**  | Admin dashboard login password (use a strong password)   |
| `SESSION_SECRET`          | **Yes**  | Random 32+ character string for signing session cookies  |
| `EVENT_TIMEZONE`          | No       | IANA timezone string (default: `Asia/Kolkata`)           |
| `EVENT_ID`                | No       | Default event identifier (default: `glen-grant-default`) |
| `CORS_ORIGIN`             | No       | Comma-separated allowed origins, or `*` for all          |
| `NODE_ENV`                | No       | `development` or `production`                            |

### Example `.env`

```env
PORT=3000
MONGODB_URI=mongodb+srv://youruser:yourpassword@cluster0.xxxxx.mongodb.net/glen-grant?retryWrites=true&w=majority
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=your_cloudinary_secret_here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=YourStrongPasswordHere!
SESSION_SECRET=replace_with_64_random_characters_here_abcdef1234567890
EVENT_TIMEZONE=Asia/Kolkata
EVENT_ID=glen-grant-mumbai-2024
CORS_ORIGIN=*
NODE_ENV=development
```

> **Important:** Never commit `.env` to version control.

---

## MongoDB Setup

1. Go to [MongoDB Atlas](https://cloud.mongodb.com) and create a free account.
2. Create a **Cluster** (M0 free tier is sufficient for events).
3. Create a **Database User** with read/write access.
4. Whitelist your IP address (or use `0.0.0.0/0` for development).
5. Click **Connect → Connect your application** and copy the connection string.
6. Replace `<password>` in the connection string with your database user password.
7. Append the database name: add `/glen-grant` before the `?` query string.
8. Paste the full URI into `MONGODB_URI` in your `.env`.

The application creates the following collections automatically:
- `submissions` — all bartender registration records
- `sessions` — admin session storage

---

## Cloudinary Setup

1. Go to [Cloudinary](https://cloudinary.com) and create a free account.
2. From the dashboard, note your **Cloud Name**, **API Key**, and **API Secret**.
3. Add these to your `.env`.

Signatures are stored at:
```
glen-grant/
  signatures/
    {eventId}/
      {submissionId}.png
```

The public_id is deterministic — re-uploading the same submission simply replaces the existing asset without creating duplicates.

---

## Local Development

```bash
# Start with hot-reload (requires nodemon)
npm run dev

# Or start without hot-reload
npm start
```

The server will print startup information including:

```
  Admin Dashboard : http://localhost:3000/admin
  Health Check   : http://localhost:3000/api/health
  API Base       : http://localhost:3000/api
```

---

## API Reference

### Base URL

```
Local:      http://localhost:3000
Production: https://your-render-app.onrender.com
```

---

### `GET /api/health`

Public endpoint. Returns server and database status.

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "database": "connected",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "environment": "production"
}
```

---

### `POST /api/submissions`

Submit a new bartender registration.

**Content-Type:** `multipart/form-data`

| Field               | Type   | Required | Notes                                    |
|---------------------|--------|----------|------------------------------------------|
| `name`              | string | **Yes**  | Bartender's full name                    |
| `outletName`        | string | **Yes**  | Bar/restaurant name                      |
| `instagramHandle`   | string | **Yes**  | Instagram handle (with or without `@`)   |
| `testimonial`       | string | **Yes**  | Max 30 words                             |
| `signature`         | file   | **Yes**  | PNG/JPEG image, max 5 MB                 |
| `deviceId`          | string | **Yes**  | Unique Android device identifier         |
| `clientSubmissionId`| string | **Yes**  | UUID generated by Android (idempotency)  |
| `eventId`           | string | No       | Event identifier (falls back to `EVENT_ID` env) |
| `clientCreatedAt`   | string | No       | ISO timestamp from device                |

**Success Response (201):**
```json
{
  "success": true,
  "message": "Submission created successfully.",
  "submissionId": "550e8400-e29b-41d4-a716-446655440000",
  "submission": { ... }
}
```

**Already submitted (200):**
```json
{
  "success": true,
  "status": "already_submitted",
  "submissionId": "...",
  "submission": { ... }
}
```

---

### `POST /api/sync`

Synchronise multiple offline submissions from an Android device.

**Content-Type:** `application/json`

Signature images are sent as **base64-encoded strings** within the JSON array (with or without `data:image/png;base64,` prefix).

**Request Body:**
```json
{
  "submissions": [
    {
      "clientSubmissionId": "uuid-from-android",
      "name": "John Smith",
      "outletName": "The Whisky Bar",
      "instagramHandle": "@johnsmith",
      "testimonial": "Glen Grant is an exceptionally smooth single malt.",
      "deviceId": "android-device-uuid",
      "eventId": "glen-grant-mumbai-2024",
      "clientCreatedAt": "2024-01-15T14:30:00+05:30",
      "signatureBase64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "total": 3,
    "synced": 2,
    "already_synced": 1,
    "failed": 0
  },
  "results": [
    {
      "index": 0,
      "clientSubmissionId": "uuid-1",
      "status": "synced",
      "submissionId": "server-generated-uuid",
      "message": "Submission synchronized successfully."
    },
    {
      "index": 1,
      "clientSubmissionId": "uuid-2",
      "status": "already_synced",
      "submissionId": "existing-server-uuid",
      "message": "Submission already exists in the database."
    }
  ]
}
```

**Status values:**
| Value          | Meaning                                  |
|----------------|------------------------------------------|
| `synced`       | Successfully stored for the first time   |
| `already_synced` | Duplicate — existing record returned  |
| `failed`       | Validation or processing error           |

> One record failing does not abort the rest of the batch.

---

### `GET /api/count`

Get today's and overall submission counts.

**Query params (optional):**
- `eventId` — filter by event

**Response:**
```json
{
  "success": true,
  "today": 37,
  "overall": 842,
  "date": "2024-01-15",
  "timezone": "Asia/Kolkata",
  "eventId": "glen-grant-mumbai-2024"
}
```

> Counts use `submissionDate` (stored in event timezone at submission time) — no UTC boundary issues.

---

### `GET /api/submissions/:submissionId`

Get a single submission by server-generated `submissionId`.

**Response:**
```json
{
  "success": true,
  "submission": {
    "submissionId": "...",
    "name": "John Smith",
    "outletName": "The Whisky Bar",
    "instagramHandle": "johnsmith",
    "testimonial": "...",
    "signatureUrl": "https://res.cloudinary.com/...",
    "cloudinaryPublicId": "glen-grant/signatures/...",
    "submissionDate": "2024-01-15",
    "submissionTime": "14:30:00",
    "deviceId": "...",
    "eventId": "...",
    "syncStatus": "direct",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### `GET /api/export/excel` *(Admin auth required)*

Download `GLEN_GRANT_BARTENDER_TESTIMONIALS.xlsx`.

- Signature images are downloaded from Cloudinary and **embedded** in each row
- Frozen header row
- Auto-filter enabled
- Alternating row shading
- Summary sheet included

**Optional:** `?eventId=EVENT_ID` to filter by event.

---

### `GET /api/export/backup` *(Admin auth required)*

Download `GLEN_GRANT_EVENT_BACKUP.zip`.

Contents:
```
GLEN_GRANT_BARTENDER_TESTIMONIALS.xlsx
registrations.csv
signatures/
  001_uuid.png
  002_uuid.png
  ...
manifest.json
```

The archive is generated and streamed dynamically — no permanent files are written to the server filesystem.

---

## Admin Dashboard

### Access

Navigate to `/admin` in your browser.

Default credentials are set via `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables.

> Never use default credentials in production. Always set strong credentials.

### Pages

| URL                  | Description                                  |
|----------------------|----------------------------------------------|
| `/admin/login`       | Login page                                   |
| `/admin`             | Dashboard with stats, chart, recent entries  |
| `/admin/submissions` | Full table with search, filter, pagination   |

### Dashboard Features

- **Stats cards:** Today's count, overall count, device count, timezone
- **14-day trend chart:** Visual bar chart of daily submission volume
- **Recent submissions table:** Latest 10 with signature thumbnails
- **Export buttons:** Excel and ZIP backup
- **Auto-refresh:** Dashboard refreshes every 60 seconds

### Submissions Page Features

- **Text search:** Name, outlet name, Instagram handle
- **Date range filter:** From/To
- **Per-page control:** 20, 50, or 100 rows
- **Signature thumbnails:** Hover to zoom, click to open full size
- **Pagination:** Page-by-page navigation
- **Detail modal:** Click any row to open full submission details

---

## Excel Export

The Excel export creates a formatted `.xlsx` with:

1. **Column layout:**
   - S.No, Submission ID, Name, Outlet Name, Instagram Handle, Testimonial, Date, Time, Device ID, Signature

2. **Signature images:**
   - Downloaded from Cloudinary at export time
   - Embedded as actual PNG images (not URLs)
   - Rows sized to display the image

3. **Formatting:**
   - Dark navy header row with white bold text
   - Frozen header row (stays visible while scrolling)
   - Auto-filter on all columns
   - Alternating row shading
   - Summary sheet with metadata

4. **Fallback:**
   - If a Cloudinary download fails, the URL is written as a hyperlink instead

---

## Offline Synchronisation Protocol

### How the Android App Should Handle Offline Mode

1. **Generate a UUID locally** when the user submits (`clientSubmissionId`).
2. **Attempt immediate upload** to `POST /api/submissions` with multipart form data.
3. **If no internet:**
   - Save the submission locally (SQLite or Room database)
   - Store the signature PNG file locally
   - Store all form fields including `clientSubmissionId`
4. **When internet returns:**
   - Call `POST /api/sync` with a JSON batch
   - Include `signatureBase64` (base64-encoded PNG)
   - The server deduplicates by `clientSubmissionId`
5. **Parse the sync response:**
   - `status: "synced"` → mark local record as synced
   - `status: "already_synced"` → mark local record as synced (was previously uploaded directly)
   - `status: "failed"` → log error, optionally retry later

### Idempotency Guarantee

The `clientSubmissionId` is used as an idempotency key at both:
- `POST /api/submissions` (direct submission)
- `POST /api/sync` (batch sync)

Sending the same `clientSubmissionId` multiple times will **never create duplicate records**.

### Base64 Signature Format

Send the PNG as either:
```
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...
```
or raw base64 (without the data URL prefix):
```
iVBORw0KGgoAAAANSUhEUgAA...
```

Both are accepted by the `/api/sync` endpoint.

---

## Render Deployment

### Steps

1. Push your code to a GitHub repository.
2. Go to [Render](https://render.com) and create a new **Web Service**.
3. Connect your GitHub repository.
4. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
5. Add all environment variables from `.env.example` in the Render dashboard.
6. Click **Deploy**.

### Important

- The app binds to `0.0.0.0:PORT` — required for Render.
- Do **not** hard-code `localhost` in production.
- Use Render's environment variable panel — never commit `.env`.
- Render free instances sleep after inactivity; upgrade to a paid plan for events.

### Infrastructure Limits

The application itself has **no API rate limits**. However, external services have their own limits:

| Service         | Limit notes                                                       |
|-----------------|-------------------------------------------------------------------|
| Render          | Free tier: 750 hours/month, sleeps after 15 min inactivity       |
| MongoDB Atlas   | M0 free: 512 MB storage, shared compute                          |
| Cloudinary      | Free tier: 25 credits/month; varies by transformations and bandwidth |
| Network/ISP     | Android devices subject to mobile data limits                     |

These are infrastructure limits outside the application's control.

---

## Security Notes

- Admin credentials are environment-variable-only — never in source code
- Session cookies are `httpOnly`, `secure` (in production), and `sameSite: lax`
- Sessions stored in MongoDB (not in-memory)
- Helmet sets security HTTP headers
- CORS is configurable via `CORS_ORIGIN`
- File uploads: MIME type checked + magic-byte validation
- Content-type spoofing (e.g., renaming a script as `.png`) is rejected
- Stack traces are suppressed in production error responses
- Passwords use constant-time comparison to mitigate timing attacks

---

## Rate Limiting Policy

**This application does not implement any application-level rate limiting.**

There are no:
- Requests-per-minute limits
- Daily API call quotas
- Per-device submission limits
- Artificial API throttling

The Android application may make unlimited API calls from application logic.

Normal technical validation is applied:
- Required fields must be present
- Testimonial must not exceed 30 words
- Signature must be a valid image file
- Malformed requests are rejected

See [Infrastructure Limits](#infrastructure-limits) for external service limits.

---

## Support

For issues specific to this backend, check:
1. Server logs for `[Error]` and `[Warning]` messages
2. `GET /api/health` for database connectivity status
3. MongoDB Atlas dashboard for connection and storage metrics
4. Cloudinary dashboard for usage and upload history
