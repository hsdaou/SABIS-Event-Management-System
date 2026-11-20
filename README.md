# SABIS® Event Management System

Full-stack event registration, multi-attendee QR ticketing, role-based Control & Regular Dashboards, and Mobile Gate Control scanning powered by **React + Vite + Tailwind CSS + Supabase + Vercel**.

## Key Features

- **Separate Control Dashboard (`/control`)**:
  - Toggle appearance ON/OFF for every Invitation Page field (Parent Number, Full Name, Register Phone Number, Number of Attendees, School Attending with 12 SABIS®/ISC UAE branches, Register Email, Age of Attendees, Contact Details of Other Attendee).
  - Switch QR Delivery Mode between **Generate QR Code Upon Registration** (immediate on-screen passes) and **Send QR to Registered Contact Info** (`/api/send-qr`).
  - Exclusive control over Event Title, Venue Setup (including max capacity), VIP & Regular Invitation Link Generation, and Per-Venue CSV Imports.
  - **2-Tier User Access Management** via registered email addresses:
    - **Tier 1 (`regular`)**: Regular Dashboard Users (view-only + Staff Desk Manual Registration & Pass Lookup + Event Logs).
    - **Tier 2 (`gate`)**: Gate Control Mobile Scanner Users (mobile camera QR scanner + Event Logs).
  - Built-in **Control Dashboard ↔ Regular Dashboard** view toggle for authenticated Control Admins.
- **Public Invitation Page (`/register?venue=...&tier=...`)**:
  - Locked to venue & tier from the generated link.
  - Dynamic fields controlled in real time by the Control Dashboard.
  - Conditional **SABIS® / International School of Choueifat (ISC)** grouped branch dropdown (8 ISC branches + 4 SIS branches) or Other School entry.
  - Generates or dispatches **N distinct single-use QR codes** matching `Number of Attendees`.
- **Clean Regular Dashboard (`/dashboard`)**:
  - Clean landing page with **5 clickable KPI summary cards** (Registered Parents, Checked In, Didn't Arrive Yet, Total Attendees Arrived/Reg, Gate Scan Alerts) opening interactive detail modals.
  - **Staff Desk Manual Registration & Pass Lookup** kept intact.
  - **Live Attendance** page kept intact (read-only, without max capacity display).
  - No Link Generation, no Venue Settings, no destructive controls.
- **Mobile Gate Control Scanner (`/gate`)**:
  - Rear-camera live QR scanning (`html5-qrcode`), image upload, and manual code verification.
  - Logs every scan with exact timing logs and **`VALID`**, **`USED`** (with first-used timestamp), or **`INVALID`** outcomes.
  - Event Scan Logs are visible to all authenticated users.

## Supabase Setup

1. Open your Supabase project Dashboard → **SQL Editor**.
2. Paste and execute [`supabase/schema.sql`](supabase/schema.sql).
3. In **Authentication → Users**, create your Control Admin account (or enable Email OTP / Magic Link) and make sure its email exists in `public.authorized_users` with `role = 'control'`.

## Vercel Deployment

1. Import `https://github.com/hsdaou/SABIS-Event-Management-System` into [Vercel](https://vercel.com/new).
2. Add Environment Variables in Vercel Project Settings:
   - `VITE_SUPABASE_URL` — Your Supabase Project URL (`https://<ref>.supabase.co`)
   - `VITE_SUPABASE_ANON_KEY` — Your Supabase `anon` public key
   - `VITE_DEFAULT_CONTROL_EMAIL` — (Optional) Primary Control Admin email
   - `RESEND_API_KEY` — (Optional) Resend API key for live email QR delivery in "Send QR to Registered Contact Info" mode
   - `RESEND_FROM_EMAIL` — (Optional) Verified sender address for Resend
3. Deploy — `vercel.json` is already configured for SPA routing and `/api/send-qr`.
