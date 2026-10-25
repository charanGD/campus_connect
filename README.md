# College Event Recommendation System (CampusConnect)

A full-stack **Next.js (App Router)** institutional event recommendation and registration platform powered by **Supabase PostgreSQL**, **Google OAuth Authentication**, and algorithmic **DSA (HashMaps, Sorting, & MinHeap Priority Queue)**.

---

## ⚡ Key Highlights

1. **Supabase PostgreSQL Backend**:
   - Dynamic `events` table for campus events with seat capacities and categories.
   - Dynamic `registrations` table recording attendee enrollments, unique constraints, and timestamping.
   - Dynamic `profiles` table automatically linked to Supabase Auth and Google accounts.
   - Real-time seat calculation: remaining seats are dynamically recomputed on every booking.

2. **Google Single Sign-On (SSO)**:
   - Official Google OAuth login via Supabase Auth with Google account details (Full Name, Email, Profile Picture).
   - Seamless role switching between Student and Faculty Administrator for demonstration and evaluation.
   - 1-Click Quick Demo sign-in for instant offline/evaluator testing.

3. **Dynamic Real-time Data**:
   - No hardcoded data: all events, recommendations, bookings, and digital passes flow dynamically from the backend and database.
   - Real-time PostgreSQL subscription support for live multi-user sync.

4. **Data Structures & Algorithms (DSA)**:
   - **HashMap / Relational Lookup**: Fast indexed event retrieval.
   - **Scoring Engine**: Interest match (+30 points) + Popularity (0–100) + Priority Bonus.
   - **MinHeap / Priority Queue**: $O(n \log k)$ Top-K extraction for event recommendations.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Supabase Environment Variables
Copy `.env.local.example` to `.env.local`:
```bash
cp .env.local.example .env.local
```
Fill in your Supabase project keys from your [Supabase Dashboard](https://supabase.com/dashboard) (Project Settings → API):
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Initialize Supabase Database Schema
In your Supabase project's **SQL Editor**, run the contents of [`supabase_schema.sql`](file:///home/charan/Sem5/college_event_recommendation_system/supabase_schema.sql).
This creates:
- `public.events` table with default seed events.
- `public.registrations` table with foreign keys & capacity validation.
- `public.profiles` table with automatic triggers for Google sign-ups.
- Row Level Security (RLS) policies.

*(Note: If Supabase credentials are not configured yet, the app automatically runs in a robust in-memory mock mode so you can test all features immediately without any setup roadblocks!)*

### 4. Enable Google Auth in Supabase (Optional for Google SSO)
1. Go to Supabase Dashboard → **Authentication** → **Providers** → **Google**.
2. Enable Google and enter your Google Cloud OAuth Client ID and Secret.
3. Add the redirect URL shown in Supabase to your Google Cloud Console.

### 5. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) (or the port assigned by Next.js) in your browser.

---

## 🔑 Authentication Options

1. **Google Single Sign-On**:
   - Click **"Continue with Google"** on the login page.
   - Automatically imports student name, email, and Google profile avatar.

2. **1-Click Quick Demo Sign-In**:
   - Click **🎓 Demo Student** (`student@college.edu`) or **🛡️ Demo Admin** (`admin@college.edu`).

3. **Institutional Credentials**:
   - Student: `student@college.edu` / `student123`
   - Admin: `admin@college.edu` / `admin123`

---

## 🌐 API Endpoints

- **`GET /api/status`**: Checks database connectivity, backend driver, and total counts.
- **`GET /api/events`**: Dynamically fetches all events from Supabase with live seat counts.
- **`POST /api/events`**: Inserts a new event into Supabase (Admin).
- **`DELETE /api/events?id=:id`**: Deletes an event from Supabase (Admin).
- **`POST /api/recommend`**: Runs the scoring algorithm and MinHeap Top-K selection over dynamic events.
- **`GET /api/register?email=:email`**: Queries Supabase for digital passes registered to an email.
- **`POST /api/register`**: Validates seat availability and inserts registration into Supabase.

---

## 📂 Project Structure

```
college_event_recommendation_system/
├── app/
│   ├── api/
│   │   ├── events/route.js        # Dynamic events API (GET, POST, DELETE)
│   │   ├── recommend/route.js     # Top-K recommendation engine (POST)
│   │   ├── register/route.js      # Student registrations & passes (GET, POST)
│   │   └── status/route.js        # Supabase connectivity & diagnostic status
│   ├── globals.css                # Design system, Google button, animations
│   ├── layout.jsx                 # Root layout & Inter typography
│   └── page.jsx                   # University portal, Google login, dashboard
├── lib/
│   ├── db.js                      # Supabase DB operations & MinHeap algorithm
│   └── supabaseClient.js          # Supabase client & environment helpers
├── supabase_schema.sql            # PostgreSQL tables, triggers, and seed data
├── .env.local.example             # Supabase environment variables template
├── jsconfig.json                  # Path aliases (@/*)
├── package.json                   # Project dependencies
└── README.md                      # Project documentation
```
