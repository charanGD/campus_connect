-- ====================================================================
-- College Event Recommendation System - Supabase SQL Schema
-- ====================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create Events Table
CREATE TABLE IF NOT EXISTS public.events (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    date DATE NOT NULL,
    venue TEXT NOT NULL,
    description TEXT DEFAULT '',
    popularity INTEGER DEFAULT 50 CHECK (popularity >= 0 AND popularity <= 100),
    capacity INTEGER DEFAULT 50 CHECK (capacity > 0),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Create Registrations Table
CREATE TABLE IF NOT EXISTS public.registrations (
    registration_id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    event_name TEXT NOT NULL,
    student_name TEXT NOT NULL,
    email TEXT NOT NULL,
    department TEXT NOT NULL,
    year TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    timestamp TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(event_id, email)
);

-- 4. Create User Profiles Table (Linked with Supabase Auth / Google Login)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'student' CHECK (role IN ('student', 'admin')),
    department TEXT DEFAULT 'General',
    year TEXT DEFAULT '1st Year',
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 6. Events Policies:
-- Allow anyone (public/anon & authenticated) to read events
CREATE POLICY "Allow public read access to events"
    ON public.events FOR SELECT
    USING (true);

-- Allow authenticated users or service role to create events
CREATE POLICY "Allow insert events"
    ON public.events FOR INSERT
    WITH CHECK (true);

-- Allow authenticated users or service role to update events
CREATE POLICY "Allow update events"
    ON public.events FOR UPDATE
    USING (true);

-- Allow authenticated users or service role to delete events
CREATE POLICY "Allow delete events"
    ON public.events FOR DELETE
    USING (true);

-- 7. Registrations Policies:
-- Allow reading registrations
CREATE POLICY "Allow read registrations"
    ON public.registrations FOR SELECT
    USING (true);

-- Allow creating registrations
CREATE POLICY "Allow insert registrations"
    ON public.registrations FOR INSERT
    WITH CHECK (true);

-- 8. Profiles Policies:
CREATE POLICY "Allow public read profiles"
    ON public.profiles FOR SELECT
    USING (true);

CREATE POLICY "Allow user update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Allow insert profile"
    ON public.profiles FOR INSERT
    WITH CHECK (true);

-- 9. Trigger to automatically create profile when new user signs up (via Google OAuth or Email)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
        CASE 
            WHEN NEW.email LIKE '%admin%' THEN 'admin'
            ELSE 'student'
        END
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 10. Initial Seed Data for Events
INSERT INTO public.events (id, name, category, date, venue, description, popularity, capacity)
VALUES 
    (101, 'AI Workshop', 'Technical', '2026-10-15', 'Computer Lab 1', 'Hands-on introduction to AI and machine learning.', 85, 40),
    (102, 'Hackathon', 'Technical', '2026-10-20', 'Innovation Hub', 'Build a solution with a team in a 24-hour coding challenge.', 95, 60),
    (103, 'Cultural Fest', 'Cultural', '2026-10-25', 'Main Auditorium', 'Music, dance, art and vibrant cultural performances.', 80, 150),
    (104, 'Tech Talk', 'Technical', '2026-10-12', 'Seminar Hall', 'Industry tech leaders discuss emerging technologies.', 72, 80),
    (105, 'Football Tournament', 'Sports', '2026-10-18', 'College Ground', 'Annual inter-department football tournament championship.', 88, 50),
    (106, 'Research Symposium', 'Academic', '2026-11-02', 'Block B Hall', 'Student and faculty research presentations & discussion.', 68, 45),
    (108, 'Data Science Bootcamp', 'Technical', '2026-11-05', 'Computer Lab 2', 'Practical sessions on data analysis and visualization with Python.', 90, 40),
    (109, 'Full Stack AI Hackathon 2026', 'Technical', '2026-11-15', 'Campus Main Convention Center', '48-hour national hackathon building AI agents, cloud architectures, and full-stack solutions.', 98, 120)
ON CONFLICT (id) DO NOTHING;

-- Restart sequence past the seed IDs
SELECT setval('public.events_id_seq', COALESCE((SELECT MAX(id) FROM public.events), 100) + 1);

-- 11. Initial Seed Registrations
INSERT INTO public.registrations (registration_id, event_id, event_name, student_name, email, department, year, timestamp)
VALUES
    (1, 101, 'AI Workshop', 'Aarav Sharma', 'aarav@college.edu', 'CSE', '3rd Year', '2026-10-08T10:15:00Z'),
    (2, 102, 'Hackathon', 'Sneha Patel', 'sneha@college.edu', 'IT', '2nd Year', '2026-10-08T11:30:00Z'),
    (3, 105, 'Football Tournament', 'Karthik Raja', 'karthik@college.edu', 'ECE', '4th Year', '2026-10-08T12:00:00Z')
ON CONFLICT (event_id, email) DO NOTHING;

SELECT setval('public.registrations_registration_id_seq', COALESCE((SELECT MAX(registration_id) FROM public.registrations), 10) + 1);