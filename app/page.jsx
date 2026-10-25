"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";

function prettyDate(value) {
  if (!value) return "";
  const d = new Date(value + "T00:00:00");
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
}

// Static Credentials (Fallback / Demo)
const STATIC_ACCOUNTS = {
  student: {
    role: "student",
    name: "Student Member",
    email: "student@college.edu",
    department: "Computer Science & Engineering",
    year: "3rd Year",
    password: "student123"
  },
  admin: {
    role: "admin",
    name: "Faculty Administrator",
    email: "admin@college.edu",
    department: "Department of CSE",
    year: "Faculty Staff",
    password: "admin123"
  }
};


export default function Home() {
  // Authentication State
  const [currentUser, setCurrentUser] = useState(null); // null means not logged in
  const [loginRole, setLoginRole] = useState("student"); // 'student' | 'admin'
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Supabase Backend & Database Diagnostics State
  const [backendStatus, setBackendStatus] = useState({
    configured: false,
    status: "checking",
    database: "Detecting backend...",
    url: "",
    totalEvents: 0,
    totalRegistrations: 0
  });

  // Navigation Tab State
  // For student: 'discover' | 'events' | 'passes'
  // For admin: 'monitor' | 'create' | 'events' | 'discover'
  const [activeTab, setActiveTab] = useState("discover");

  // Global Search State
  const [searchQuery, setSearchQuery] = useState("");

  // All Events State
  const [allEvents, setAllEvents] = useState([]);
  const [loadingAll, setLoadingAll] = useState(true);

  // Recommendations State
  const [recommendations, setRecommendations] = useState([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [loadingRecs, setLoadingRecs] = useState(true);
  const [recError, setRecError] = useState("");
  const [expandedScoreId, setExpandedScoreId] = useState(null);

  // Filters State
  const [interests, setInterests] = useState(["Technical"]);
  const [category, setCategory] = useState("All");
  const [priority, setPriority] = useState("Medium");
  const [limit, setLimit] = useState(3);
  const [sortBy, setSortBy] = useState("score");

  // Add Event Form State (Admin)
  const [addForm, setAddForm] = useState({
    name: "",
    category: "Technical",
    date: "",
    venue: "",
    popularity: 50,
    capacity: 50,
    description: ""
  });
  const [addMessage, setAddMessage] = useState({ text: "", isError: false });
  const [isAdding, setIsAdding] = useState(false);

  // Registration Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [registrationForm, setRegistrationForm] = useState({
    student_name: "",
    email: "",
    department: "",
    year: ""
  });
  const [regMessage, setRegMessage] = useState({ text: "", isError: false });
  const [isRegistered, setIsRegistered] = useState(false);
  const [lastRegistration, setLastRegistration] = useState(null);

  // Digital Passes State
  const [passesEmail, setPassesEmail] = useState("");
  const [passesList, setPassesList] = useState([]);
  const [loadingPasses, setLoadingPasses] = useState(false);

  // Admin Registrations Table State
  const [adminRegistrations, setAdminRegistrations] = useState([]);
  const [loadingAdminRegs, setLoadingAdminRegs] = useState(false);
  const [monitorSearch, setMonitorSearch] = useState("");

  // Check Backend Status & Connectivity
  const checkBackendStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const data = await res.json();
        setBackendStatus(data);
      }
    } catch (e) {
      console.error("Backend status check error:", e);
    }
  }, []);

  // Synchronize Supabase User into session
  const syncSupabaseUser = useCallback((user) => {
    if (!user) return;
    const meta = user.user_metadata || {};
    const email = user.email || "";
    const name = meta.full_name || meta.name || (email.split("@")[0] || "Campus Member");
    const avatar = meta.avatar_url || meta.picture || "";
    const savedRole =
      localStorage.getItem(`role_${user.id}`) ||
      (email.toLowerCase().includes("admin") ? "admin" : "student");

    const sessionUser = {
      id: user.id,
      name,
      email,
      avatar,
      role: savedRole,
      department:
        meta.department ||
        (savedRole === "admin" ? "Department of Administration" : "Computer Science & Engineering"),
      year: meta.year || (savedRole === "admin" ? "Faculty Staff" : "3rd Year"),
      isSupabase: true
    };

    setCurrentUser(sessionUser);
    localStorage.setItem("campus_user_session", JSON.stringify(sessionUser));
    setPassesEmail(email);
    setIsGoogleLoading(false);
  }, []);

  // Check saved session in LocalStorage on Mount + Supabase Auth
  useEffect(() => {
    checkBackendStatus();

    try {
      const saved = localStorage.getItem("campus_user_session");
      if (saved) {
        const parsed = JSON.parse(saved);
        setCurrentUser(parsed);
        setActiveTab(parsed.role === "admin" ? "monitor" : "discover");
        setPassesEmail(parsed.email || "");
      }
    } catch (e) {
      console.error(e);
    }

    // Supabase Auth listener
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          syncSupabaseUser(session.user);
        }
      });

      const {
        data: { subscription }
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
          syncSupabaseUser(session.user);
        } else if (event === "SIGNED_OUT") {
          setCurrentUser(null);
          localStorage.removeItem("campus_user_session");
        }
      });

      return () => {
        subscription?.unsubscribe();
      };
    }
  }, [checkBackendStatus, syncSupabaseUser]);

  // Sync user state with passes lookup
  useEffect(() => {
    if (currentUser?.email) {
      setPassesEmail(currentUser.email);
      fetchPasses(currentUser.email);
    }
  }, [currentUser]);

  // Handle Login Role Switch
  const switchLoginRole = (role) => {
    setLoginRole(role);
    setLoginError("");
    setLoginEmail("");
    setLoginPassword("");
  };

  // Perform Google OAuth Login
  const handleGoogleLogin = async () => {
    setLoginError("");
    setIsGoogleLoading(true);

    if (!isSupabaseConfigured() || !supabase) {
      setIsGoogleLoading(false);
      setLoginError(
        "Supabase credentials are not configured yet in .env.local. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to connect to Supabase. In the meantime, use the Quick Demo Sign-in below!"
      );
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
          queryParams: {
            access_type: "offline",
            prompt: "consent"
          }
        }
      });
      if (error) throw error;
    } catch (err) {
      setIsGoogleLoading(false);
      setLoginError(err.message || "Failed to initiate Google Sign In.");
    }
  };

  // Quick 1-Click Demo Login (for effortless testing/evaluation)
  const handleQuickDemo = (role) => {
    const target = STATIC_ACCOUNTS[role];
    const sessionUser = { ...target };
    setCurrentUser(sessionUser);
    localStorage.setItem("campus_user_session", JSON.stringify(sessionUser));
    setActiveTab(sessionUser.role === "admin" ? "monitor" : "discover");
    setPassesEmail(sessionUser.email);
  };

  // Toggle Role between Student and Faculty Admin
  const toggleUserRole = () => {
    if (!currentUser) return;
    const newRole = currentUser.role === "admin" ? "student" : "admin";
    const updated = {
      ...currentUser,
      role: newRole,
      department:
        newRole === "admin" ? "Department of Administration" : "Computer Science & Engineering",
      year: newRole === "admin" ? "Faculty Staff" : "3rd Year"
    };
    if (currentUser.id) {
      localStorage.setItem(`role_${currentUser.id}`, newRole);
    }
    setCurrentUser(updated);
    localStorage.setItem("campus_user_session", JSON.stringify(updated));
    setActiveTab(newRole === "admin" ? "monitor" : "discover");
  };

  // Perform Credentials Login
  const handleLoginSubmit = (e) => {
    e.preventDefault();
    setLoginError("");

    const targetAccount = STATIC_ACCOUNTS[loginRole];
    if (
      loginEmail.trim().toLowerCase() === targetAccount.email.toLowerCase() &&
      loginPassword === targetAccount.password
    ) {
      const sessionUser = { ...targetAccount };
      setCurrentUser(sessionUser);
      localStorage.setItem("campus_user_session", JSON.stringify(sessionUser));
      setActiveTab(sessionUser.role === "admin" ? "monitor" : "discover");
    } else {
      setLoginError("Invalid email or password. Please verify your credentials.");
    }
  };

  // Logout (handles Supabase & Local)
  const handleLogout = async () => {
    if (currentUser?.isSupabase && supabase) {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.error(e);
      }
    }
    setCurrentUser(null);
    localStorage.removeItem("campus_user_session");
    setLoginError("");
    switchLoginRole("student");
  };

  // Load All Events
  const loadAll = useCallback(async () => {
    try {
      setLoadingAll(true);
      const res = await fetch("/api/events");
      if (!res.ok) throw new Error("Failed to fetch events");
      const data = await res.json();
      const sorted = Array.isArray(data)
        ? [...data].sort((a, b) => a.date.localeCompare(b.date))
        : [];
      setAllEvents(sorted);
    } catch (err) {
      console.error(err);
      setAllEvents([]);
    } finally {
      setLoadingAll(false);
    }
  }, []);

  // Fetch Recommendations
  const fetchRecommendations = useCallback(
    async (
      currentInterests = interests,
      currentCategory = category,
      currentPriority = priority,
      currentLimit = limit,
      currentSort = sortBy
    ) => {
      setLoadingRecs(true);
      setRecError("");
      try {
        const res = await fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            interests: currentInterests,
            category: currentCategory,
            priority: currentPriority,
            limit: Number(currentLimit),
            sort_by: currentSort
          })
        });
        if (!res.ok) throw new Error("Could not load recommendations.");
        const data = await res.json();
        setRecommendations(data.recommendations || []);
        setTotalMatches(data.total_matches ?? 0);
      } catch (err) {
        setRecError(
          "Could not load recommendations. Check that the server is running."
        );
        setRecommendations([]);
        setTotalMatches(0);
      } finally {
        setLoadingRecs(false);
      }
    },
    [interests, category, priority, limit, sortBy]
  );

  // Fetch Passes
  const fetchPasses = async (emailToSearch) => {
    const q = (emailToSearch || passesEmail).trim();
    if (!q) return;
    setLoadingPasses(true);
    try {
      const res = await fetch(`/api/register?email=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setPassesList(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPasses(false);
    }
  };

  // Fetch Admin Registrations Table
  const fetchAdminRegistrations = useCallback(async () => {
    if (currentUser?.role !== "admin") return;
    setLoadingAdminRegs(true);
    try {
      const res = await fetch("/api/register");
      if (res.ok) {
        const data = await res.json();
        setAdminRegistrations(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAdminRegs(false);
    }
  }, [currentUser]);

  // Initial Load
  useEffect(() => {
    loadAll();
    fetchRecommendations();
  }, [loadAll, fetchRecommendations]);

  useEffect(() => {
    if (currentUser?.role === "admin") {
      fetchAdminRegistrations();
    }
  }, [currentUser, fetchAdminRegistrations]);

  // Real-time synchronization with Supabase events and registrations
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("campus_events_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => {
        loadAll();
        fetchRecommendations();
        checkBackendStatus();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "registrations" }, () => {
        loadAll();
        fetchRecommendations();
        checkBackendStatus();
        if (currentUser?.role === "admin") fetchAdminRegistrations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAll, fetchRecommendations, checkBackendStatus, currentUser, fetchAdminRegistrations]);

  // Filtered Events with Search
  const filteredRecommendations = useMemo(() => {
    if (!searchQuery.trim()) return recommendations;
    const q = searchQuery.toLowerCase();
    return recommendations.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.venue.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        (e.description && e.description.toLowerCase().includes(q))
    );
  }, [recommendations, searchQuery]);

  const filteredAllEvents = useMemo(() => {
    if (!searchQuery.trim()) return allEvents;
    const q = searchQuery.toLowerCase();
    return allEvents.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.venue.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        (e.description && e.description.toLowerCase().includes(q))
    );
  }, [allEvents, searchQuery]);

  // Filtered Admin Registrations
  const filteredAdminRegistrations = useMemo(() => {
    if (!monitorSearch.trim()) return adminRegistrations;
    const q = monitorSearch.toLowerCase();
    return adminRegistrations.filter(
      (r) =>
        r.student_name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.event_name.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q)
    );
  }, [adminRegistrations, monitorSearch]);

  // Checkbox Toggle
  const handleInterestChange = (val) => {
    setInterests((prev) => {
      const updated = prev.includes(val)
        ? prev.filter((item) => item !== val)
        : [...prev, val];
      return updated;
    });
  };

  // Recommendation Form Submit
  const handleRecommendSubmit = (e) => {
    e.preventDefault();
    fetchRecommendations(interests, category, priority, limit, sortBy);
  };

  // Sort Change
  const handleSortChange = (e) => {
    const newSort = e.target.value;
    setSortBy(newSort);
    fetchRecommendations(interests, category, priority, limit, newSort);
  };

  // Admin Add Event
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setIsAdding(true);
    setAddMessage({ text: "", isError: false });
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Unable to add event.");
      }
      setAddMessage({
        text: `Added “${data.name}” successfully (Capacity: ${data.capacity || 50}).`,
        isError: false
      });
      setAddForm({
        name: "",
        category: "Technical",
        date: "",
        venue: "",
        popularity: 50,
        capacity: 50,
        description: ""
      });
      await loadAll();
      await fetchRecommendations();
    } catch (err) {
      setAddMessage({ text: err.message, isError: true });
    } finally {
      setIsAdding(false);
    }
  };

  // Admin Delete Event
  const handleDeleteEvent = async (id, name) => {
    if (!confirm(`Are you sure you want to delete event "${name}"?`)) return;
    try {
      const res = await fetch(`/api/events?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        await loadAll();
        await fetchRecommendations();
        if (currentUser?.role === "admin") fetchAdminRegistrations();
      } else {
        alert("Failed to delete event.");
      }
    } catch (e) {
      alert("Error deleting event.");
    }
  };

  // Open Registration Modal
  const openRegistration = (event) => {
    setSelectedEvent(event);
    setRegMessage({ text: "", isError: false });
    setIsRegistered(false);
    setLastRegistration(null);
    setRegistrationForm({
      student_name: currentUser?.name || "Student Member",
      email: currentUser?.email || "student@college.edu",
      department: currentUser?.department || "Computer Science & Engineering",
      year: currentUser?.year || "3rd Year"
    });
    setIsModalOpen(true);
  };

  const closeRegistration = () => {
    setIsModalOpen(false);
    setSelectedEvent(null);
  };

  // Handle Registration Submit
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEvent) return;
    setRegMessage({ text: "", isError: false });

    try {
      const payload = {
        event_id: selectedEvent.id,
        user_id: currentUser?.id || null,
        ...registrationForm
      };
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Registration failed.");
      }
      setRegMessage({
        text: `✓ ${data.message} Your registration ID is #${data.registration.registration_id}.`,
        isError: false
      });
      setIsRegistered(true);
      setLastRegistration(data.registration);
      await loadAll();
      await fetchRecommendations();
      checkBackendStatus();
      fetchPasses(registrationForm.email);
    } catch (err) {
      setRegMessage({ text: err.message, isError: true });
    }
  };

  // Export CSV for Admin
  const handleExportCSV = () => {
    if (!adminRegistrations.length) return;
    const headers = [
      "Reg ID",
      "Event Name",
      "Student Name",
      "Email",
      "Department",
      "Year",
      "Date"
    ];
    const rows = adminRegistrations.map((r) => [
      r.registration_id,
      `"${r.event_name}"`,
      `"${r.student_name}"`,
      `"${r.email}"`,
      `"${r.department}"`,
      `"${r.year}"`,
      `"${r.timestamp}"`
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `event_registrations_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ==========================================
  // VIEW 1: DEDICATED PROFESSIONAL LOGIN SCREEN (LOGIN FIRST)
  // ==========================================
  if (!currentUser) {
    const isStudent = loginRole === "student";

    return (
      <>
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">✦</span>
            <span>
              Campus<span className="brand-accent">Connect</span>
            </span>
          </div>
          <span className="pill">✦ Institutional Single Sign-On</span>
        </header>

        <main className="login-screen-wrap">
          <div className="login-portal-container">
            {/* Left Brand Storytelling Panel */}
            <div className="login-brand-panel">
              <div className="login-brand-top">
                <div className="login-institution-badge">
                  <span>✦ University Event Portal</span>
                </div>
                <h2>
                  Connecting people, <span>events, and campus moments.</span>
                </h2>
                <p className="login-brand-sub">
                  CampusConnect is powered by a live <strong>Supabase backend</strong>. Sign in seamlessly with your Google institutional account or campus credentials to discover, register, and generate digital event passes.
                </p>

                <div className="login-features-list">
                  <div className="login-feature-item">
                    <span className="login-feature-icon">⚡</span>
                    <span>Dynamic Supabase PostgreSQL Database</span>
                  </div>
                  <div className="login-feature-item">
                    <span className="login-feature-icon">🔒</span>
                    <span>Official Google OAuth Single Sign-On</span>
                  </div>
                  <div className="login-feature-item">
                    <span className="login-feature-icon">🎯</span>
                    <span>MinHeap Top-K Recommendation Algorithm</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Authentication Form Panel */}
            <div className="login-form-panel">
              <div className="login-form-header">
                <h3>Portal Authentication</h3>
                <p>Sign in using Google or institutional credentials</p>
              </div>

              {/* Google Sign In Button */}
              <button
                type="button"
                className="google-signin-btn"
                onClick={handleGoogleLogin}
                disabled={isGoogleLoading}
              >
                <svg className="google-icon" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>{isGoogleLoading ? "Connecting to Google..." : "Continue with Google"}</span>
              </button>

              <div className="auth-divider">or sign in with password</div>

              {/* Segmented Role Tabs */}
              <div className="portal-tabs">
                <button
                  type="button"
                  className={`portal-tab ${isStudent ? "active" : ""}`}
                  onClick={() => switchLoginRole("student")}
                >
                  🎓 Student Portal
                </button>
                <button
                  type="button"
                  className={`portal-tab ${!isStudent ? "active" : ""}`}
                  onClick={() => switchLoginRole("admin")}
                >
                  🛡️ Faculty Admin
                </button>
              </div>

              <form onSubmit={handleLoginSubmit}>
                <div className="login-field-group">
                  <label htmlFor="portal-email">Institutional Email</label>
                  <input
                    id="portal-email"
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder={isStudent ? "student@college.edu" : "admin@college.edu"}
                  />
                </div>

                <div className="login-field-group">
                  <label htmlFor="portal-pass">Security Password</label>
                  <input
                    id="portal-pass"
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter security password"
                  />
                </div>

                {loginError && (
                  <p
                    role="status"
                    style={{
                      color: "#c34b62",
                      fontSize: "11px",
                      margin: "4px 0 12px",
                      fontWeight: 650
                    }}
                  >
                    {loginError}
                  </p>
                )}

                <button className="login-submit-btn" type="submit">
                  <span>Sign In to {isStudent ? "Student Portal" : "Faculty Portal"}</span>
                  <span>→</span>
                </button>
              </form>

              {/* 1-Click Quick Demo Sign In */}
              <div className="demo-logins-box">
                <div className="demo-logins-head">
                  <span>⚡ Quick Demo Access</span>
                  <small style={{ color: "#858ea6" }}>1-Click Sign In</small>
                </div>
                <div className="demo-logins-row">
                  <button
                    type="button"
                    className="demo-btn"
                    onClick={() => handleQuickDemo("student")}
                  >
                    🎓 Demo Student
                  </button>
                  <button
                    type="button"
                    className="demo-btn"
                    onClick={() => handleQuickDemo("admin")}
                  >
                    🛡️ Demo Admin
                  </button>
                </div>
              </div>

              <div className="login-security-tag">
                <span>🔒 Secure institutional authentication session</span>
              </div>
            </div>
          </div>
        </main>

        <footer>
          <div className="brand">
            <span className="brand-mark">✦</span>
            <span>
              Campus<span className="brand-accent">Connect</span>
            </span>
          </div>
          <span>College Event Recommendation System · Supabase & Google SSO</span>
        </footer>


      </>
    );
  }

  // ==========================================
  // VIEW 2: LOGGED IN APPLICATION WITH SEPARATE PAGES/TABS
  // ==========================================
  return (
    <>
      {/* TOPBAR WITH SEPARATE NAV TABS */}
      <header className="topbar">
        <div
          className="brand"
          style={{ cursor: "pointer" }}
          onClick={() =>
            setActiveTab(currentUser.role === "admin" ? "monitor" : "discover")
          }
        >
          <span className="brand-mark">✦</span>
          <span>
            Campus<span className="brand-accent">Connect</span>
          </span>
        </div>

        <div className="topbar-right">
          <nav>
            {currentUser.role === "student" ? (
              <>
                <button
                  type="button"
                  className={`nav-link ${activeTab === "discover" ? "active" : ""}`}
                  onClick={() => setActiveTab("discover")}
                >
                  Discover
                </button>
                <button
                  type="button"
                  className={`nav-link ${activeTab === "events" ? "active" : ""}`}
                  onClick={() => setActiveTab("events")}
                >
                  All Events
                </button>
                <button
                  type="button"
                  className={`nav-link ${activeTab === "passes" ? "active" : ""}`}
                  onClick={() => setActiveTab("passes")}
                >
                  My Passes
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`nav-link ${activeTab === "monitor" ? "active" : ""}`}
                  onClick={() => setActiveTab("monitor")}
                >
                  Monitor Registrations
                </button>
                <button
                  type="button"
                  className={`nav-link ${activeTab === "create" ? "active" : ""}`}
                  onClick={() => setActiveTab("create")}
                >
                  Create Event +
                </button>
                <button
                  type="button"
                  className={`nav-link ${activeTab === "events" ? "active" : ""}`}
                  onClick={() => setActiveTab("events")}
                >
                  All Events
                </button>
                <button
                  type="button"
                  className={`nav-link ${activeTab === "discover" ? "active" : ""}`}
                  onClick={() => setActiveTab("discover")}
                >
                  Recommendations
                </button>
              </>
            )}
          </nav>


          {/* User Profile & Role Switch Badge */}
          <div className="user-profile-badge">
            {currentUser.avatar ? (
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="user-avatar-img"
              />
            ) : (
              <div className="user-avatar-fallback">
                {(currentUser.name || "U").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="user-info-text">
              <span className="user-name-line">{currentUser.name}</span>
              <span className="user-email-line">
                <span
                  className={`role-badge-tag ${currentUser.role === "admin" ? "admin" : "student"}`}
                >
                  {currentUser.role === "admin" ? "Faculty Admin" : "Student"}
                </span>
              </span>
            </div>
            <button
              type="button"
              className="role-switch-btn"
              onClick={toggleUserRole}
              title="Switch role between student and faculty admin view"
            >
              ⇄ {currentUser.role === "admin" ? "Student View" : "Admin View"}
            </button>
            <button
              type="button"
              className="logout-btn"
              onClick={handleLogout}
              title="Logout from system"
            >
              Logout ✕
            </button>
          </div>
        </div>
      </header>

      <main className="tab-view-container">
        {/* ==================================================== */}
        {/* TAB: DISCOVER / RECOMMENDATIONS                      */}
        {/* ==================================================== */}
        {activeTab === "discover" && (
          <>
            {/* HERO SECTION */}
            <section className="hero">
              <div className="hero-copy">
                <p className="eyebrow">YOUR CAMPUS, YOUR MOMENTS</p>
                <h1>
                  Find events that
                  <br />
                  <span>move you.</span>
                </h1>
                <p className="hero-sub">
                  Discover workshops, cultural fests, sports and more—matched
                  to your interests.
                </p>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => {
                    const el = document.getElementById("discover-box");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  Explore recommendations <span>↗</span>
                </button>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="orbit orbit-one"></div>
                <div className="orbit orbit-two"></div>
                <div className="art-card card-back">
                  <span>✧</span>
                  <small>CREATE</small>
                </div>
                <div className="art-card card-front">
                  <div className="art-icon">✦</div>
                  <strong>
                    Make it
                    <br />
                    memorable.
                  </strong>
                  <small>DISCOVER • CONNECT • GROW</small>
                </div>
                <div className="float-dot dot-one"></div>
                <div className="float-dot dot-two"></div>
              </div>
            </section>

            {/* LIVE SEARCH BAR */}
            <div className="search-bar-wrap">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="search-input"
                placeholder="Search recommended events by title, venue, or keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* DISCOVER SECTION */}
            <section className="section" id="discover-box">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">PERSONALIZED FOR YOU</p>
                  <h2>Recommended events</h2>
                  <p className="muted">
                    Choose what you like and our Heap algorithm will rank the
                    events for you.
                  </p>
                </div>
                <span className="pill">✦ Smart matching</span>
              </div>

              <div className="panel">
                <form
                  id="recommend-form"
                  className="filters"
                  onSubmit={handleRecommendSubmit}
                >
                  <label>
                    Your interests <span className="hint">Select one or more</span>
                    <div className="checks">
                      <label className="check">
                        <input
                          type="checkbox"
                          value="Technical"
                          checked={interests.includes("Technical")}
                          onChange={() => handleInterestChange("Technical")}
                        />
                        <span>⌘ Technical</span>
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          value="Cultural"
                          checked={interests.includes("Cultural")}
                          onChange={() => handleInterestChange("Cultural")}
                        />
                        <span>♫ Cultural</span>
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          value="Sports"
                          checked={interests.includes("Sports")}
                          onChange={() => handleInterestChange("Sports")}
                        />
                        <span>⚽ Sports</span>
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          value="Academic"
                          checked={interests.includes("Academic")}
                          onChange={() => handleInterestChange("Academic")}
                        />
                        <span>▤ Academic</span>
                      </label>
                    </div>
                  </label>

                  <label>
                    Category
                    <select
                      id="category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option>All</option>
                      <option>Technical</option>
                      <option>Cultural</option>
                      <option>Sports</option>
                      <option>Academic</option>
                    </select>
                  </label>

                  <label>
                    Priority
                    <select
                      id="priority"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                    >
                      <option>Medium</option>
                      <option>High</option>
                      <option>Low</option>
                    </select>
                  </label>

                  <label>
                    Show top
                    <select
                      id="limit"
                      value={limit}
                      onChange={(e) => setLimit(Number(e.target.value))}
                    >
                      <option value="3">3 events</option>
                      <option value="5">5 events</option>
                      <option value="8">8 events</option>
                    </select>
                  </label>

                  <button className="primary-btn" type="submit">
                    Find my events <span>→</span>
                  </button>
                </form>
              </div>

              <div className="results-meta">
                <h3>
                  For you{" "}
                  <span id="match-count" className="count">
                    ({filteredRecommendations.length} matching)
                  </span>
                </h3>
                <label className="sort-label">
                  Sort by{" "}
                  <select
                    id="sort-by"
                    value={sortBy}
                    onChange={handleSortChange}
                  >
                    <option value="score">Relevance</option>
                    <option value="date">Date</option>
                    <option value="popularity">Popularity</option>
                  </select>
                </label>
              </div>

              <div id="recommendations" className="event-grid">
                {loadingRecs ? (
                  <div className="loading">Finding events for you…</div>
                ) : recError ? (
                  <div className="empty">{recError}</div>
                ) : filteredRecommendations.length > 0 ? (
                  filteredRecommendations.map((event) => {
                    const seatsLeft = event.seats_left ?? 45;
                    const capacity = event.capacity ?? 50;
                    const isFull = seatsLeft <= 0;
                    const isExpanded = expandedScoreId === event.id;

                    return (
                      <article key={event.id} className="event-card">
                        <div className="event-top">
                          <div className="card-badges">
                            <span
                              className={`category ${event.category.toLowerCase()}`}
                            >
                              {event.category}
                            </span>
                            <span
                              className={`seats-pill ${
                                isFull
                                  ? "full"
                                  : seatsLeft <= 5
                                  ? "low"
                                  : "available"
                              }`}
                            >
                              {isFull
                                ? "✕ Full"
                                : `${seatsLeft}/${capacity} seats left`}
                            </span>
                          </div>
                          <div className="score-tag">
                            <span className="score">✦ {event.score} pts</span>
                            {event.breakdown && (
                              <button
                                type="button"
                                className="breakdown-trigger"
                                onClick={() =>
                                  setExpandedScoreId(
                                    isExpanded ? null : event.id
                                  )
                                }
                                title="View DSA Score Breakdown"
                              >
                                {isExpanded ? "✕" : "[Why?]"}
                              </button>
                            )}
                          </div>
                        </div>

                        {isExpanded && event.breakdown && (
                          <div className="breakdown-box">
                            <div className="breakdown-row">
                              <span>Interest Match:</span>
                              <strong>
                                +{event.breakdown.categoryMatch} pts
                              </strong>
                            </div>
                            <div className="breakdown-row">
                              <span>Popularity:</span>
                              <strong>+{event.breakdown.popularity} pts</strong>
                            </div>
                            <div className="breakdown-row">
                              <span>Priority ({event.breakdown.priorityName}):</span>
                              <strong>+{event.breakdown.priorityBonus} pts</strong>
                            </div>
                            <div className="breakdown-row breakdown-total">
                              <span>Total DSA Score:</span>
                              <span>{event.score} pts</span>
                            </div>
                          </div>
                        )}

                        <h3>{event.name}</h3>
                        <p>
                          {event.description ||
                            "Join this campus event and be part of the experience."}
                        </p>
                        <div className="event-details">
                          <span>▣ {prettyDate(event.date)}</span>
                          <span>⌖ {event.venue}</span>
                        </div>

                        <button
                          className="register-btn"
                          type="button"
                          disabled={isFull}
                          onClick={() => openRegistration(event)}
                        >
                          {isFull ? (
                            <span>Registration Full ✕</span>
                          ) : (
                            <>
                              <span>Register for event</span>
                              <span>→</span>
                            </>
                          )}
                        </button>
                      </article>
                    );
                  })
                ) : (
                  <div className="empty">
                    No matching events found. Try selecting another category or interest.
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {/* ==================================================== */}
        {/* TAB: ALL CAMPUS EVENTS                               */}
        {/* ==================================================== */}
        {activeTab === "events" && (
          <section className="section all-section" id="events">
            <div className="section-heading">
              <div>
                <p className="eyebrow">WHAT’S HAPPENING</p>
                <h2>All campus events</h2>
                <p className="muted">
                  Browse the complete repository of college events.
                </p>
              </div>
            </div>

            {/* LIVE SEARCH BAR */}
            <div className="search-bar-wrap" style={{ margin: "0 0 20px" }}>
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="search-input"
                placeholder="Search campus events by name, venue, category, or keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div id="all-events" className="event-grid">
              {loadingAll ? (
                <div className="loading">Loading events…</div>
              ) : filteredAllEvents.length > 0 ? (
                filteredAllEvents.map((event) => {
                  const seatsLeft = event.seats_left ?? 45;
                  const capacity = event.capacity ?? 50;
                  const isFull = seatsLeft <= 0;

                  return (
                    <article key={event.id} className="event-card">
                      <div className="event-top">
                        <div className="card-badges">
                          <span
                            className={`category ${event.category.toLowerCase()}`}
                          >
                            {event.category}
                          </span>
                          <span
                            className={`seats-pill ${
                              isFull
                                ? "full"
                                : seatsLeft <= 5
                                ? "low"
                                : "available"
                            }`}
                          >
                            {isFull
                              ? "✕ Full"
                              : `${seatsLeft}/${capacity} seats left`}
                          </span>
                        </div>
                        <span className="score">♥ {event.popularity}%</span>
                      </div>
                      <h3>{event.name}</h3>
                      <p>
                        {event.description ||
                          "Join this campus event and be part of the experience."}
                      </p>
                      <div className="event-details">
                        <span>▣ {prettyDate(event.date)}</span>
                        <span>⌖ {event.venue}</span>
                      </div>

                      {currentUser.role === "admin" ? (
                        <div className="admin-card-actions">
                          <button
                            className="register-btn"
                            type="button"
                            disabled={isFull}
                            onClick={() => openRegistration(event)}
                          >
                            {isFull ? "Full" : "Register →"}
                          </button>
                          <button
                            type="button"
                            className="delete-btn"
                            onClick={() =>
                              handleDeleteEvent(event.id, event.name)
                            }
                          >
                            Delete ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          className="register-btn"
                          type="button"
                          disabled={isFull}
                          onClick={() => openRegistration(event)}
                        >
                          {isFull ? (
                            <span>Registration Full ✕</span>
                          ) : (
                            <>
                              <span>Register for event</span>
                              <span>→</span>
                            </>
                          )}
                        </button>
                      )}
                    </article>
                  );
                })
              ) : (
                <div className="empty">No events found matching your search.</div>
              )}
            </div>
          </section>
        )}

        {/* ==================================================== */}
        {/* TAB: MY PASSES (STUDENT PORTAL)                      */}
        {/* ==================================================== */}
        {activeTab === "passes" && (
          <section className="section" id="passes">
            <div className="section-heading">
              <div>
                <p className="eyebrow">STUDENT PORTAL</p>
                <h2>My registrations & digital pass</h2>
                <p className="muted">
                  View your confirmed registrations and download your digital entry
                  pass.
                </p>
              </div>
              <span className="pill">✦ Verified Pass</span>
            </div>

            <div className="panel">
              <form
                className="lookup-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  fetchPasses(passesEmail);
                }}
              >
                <input
                  type="email"
                  placeholder="Enter your student email (e.g. charan@college.edu)"
                  value={passesEmail}
                  onChange={(e) => setPassesEmail(e.target.value)}
                  required
                />
                <button className="primary-btn" type="submit">
                  Find my passes <span>→</span>
                </button>
              </form>
            </div>

            <div className="passes-grid">
              {loadingPasses ? (
                <div className="loading">Looking up your event passes…</div>
              ) : passesList.length > 0 ? (
                passesList.map((pass) => (
                  <div
                    key={pass.registration_id}
                    className="pass-ticket printable-pass"
                  >
                    <div className="pass-header">
                      <span className="pass-brand">
                        ✦ CampusConnect Entry Pass
                      </span>
                      <span className="pass-status">CONFIRMED</span>
                    </div>
                    <h3 className="pass-event-title">{pass.event_name}</h3>
                    <div className="pass-event-meta">
                      <span>▣ {prettyDate(pass.event?.date)}</span>
                      <span>⌖ {pass.event?.venue || "Campus Venue"}</span>
                    </div>
                    <div className="pass-details-box">
                      <div className="pass-field">
                        <small>Student Name</small>
                        <strong>{pass.student_name}</strong>
                      </div>
                      <div className="pass-field">
                        <small>Department</small>
                        <strong>{pass.department}</strong>
                      </div>
                      <div className="pass-field">
                        <small>Year of Study</small>
                        <strong>{pass.year}</strong>
                      </div>
                      <div className="pass-field">
                        <small>Registration ID</small>
                        <strong>#{pass.registration_id}</strong>
                      </div>
                    </div>
                    <div className="pass-footer">
                      <span className="pass-barcode">
                        ||| | ||||| | ||| #{pass.registration_id}
                      </span>
                      <button
                        type="button"
                        className="pass-print-btn"
                        onClick={() => window.print()}
                      >
                        <span>🖨️ Print / Save PDF</span>
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty">
                  No active registrations found for this email. Register for an
                  event from &ldquo;Discover&rdquo; or &ldquo;All Events&rdquo; to view your digital pass!
                </div>
              )}
            </div>
          </section>
        )}

        {/* ==================================================== */}
        {/* TAB: MONITOR REGISTRATIONS (ADMIN ONLY)              */}
        {/* ==================================================== */}
        {activeTab === "monitor" && currentUser.role === "admin" && (
          <section className="section" id="admin-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">FACULTY & ORGANIZER DASHBOARD</p>
                <h2>All student registrations</h2>
                <p className="muted">
                  Monitor all registered participants across campus events in real-time.
                </p>
              </div>
              <button
                type="button"
                className="primary-btn"
                onClick={handleExportCSV}
              >
                📥 Export CSV
              </button>
            </div>

            {/* Search within registrations */}
            <div className="search-bar-wrap" style={{ margin: "0 0 16px" }}>
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="search-input"
                placeholder="Search registrations by student name, email, department, or event..."
                value={monitorSearch}
                onChange={(e) => setMonitorSearch(e.target.value)}
              />
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Reg ID</th>
                    <th>Event</th>
                    <th>Student Name</th>
                    <th>Email</th>
                    <th>Dept & Year</th>
                    <th>Date Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingAdminRegs ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: "center" }}>
                        Loading registrations…
                      </td>
                    </tr>
                  ) : filteredAdminRegistrations.length > 0 ? (
                    filteredAdminRegistrations.map((reg) => (
                      <tr key={reg.registration_id}>
                        <td>
                          <span className="badge-reg">
                            #{reg.registration_id}
                          </span>
                        </td>
                        <td>
                          <strong>{reg.event_name}</strong>
                        </td>
                        <td>{reg.student_name}</td>
                        <td>{reg.email}</td>
                        <td>
                          {reg.department} · {reg.year}
                        </td>
                        <td>
                          {new Date(reg.timestamp).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric"
                          })}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" style={{ textAlign: "center" }}>
                        No registrations match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ==================================================== */}
        {/* TAB: CREATE EVENT (ADMIN ONLY)                       */}
        {/* ==================================================== */}
        {activeTab === "create" && currentUser.role === "admin" && (
          <section className="section add-section" id="add">
            <div className="section-heading">
              <div>
                <p className="eyebrow">FACULTY PORTAL</p>
                <h2>Create new campus event</h2>
                <p className="muted">
                  Add an event to the campus repository with seat capacity and details.
                </p>
              </div>
            </div>
            <form
              id="add-form"
              className="panel add-form"
              onSubmit={handleAddSubmit}
            >
              <label>
                Event name
                <input
                  name="name"
                  required
                  placeholder="e.g. AI & Robotics Bootcamp"
                  value={addForm.name}
                  onChange={(e) =>
                    setAddForm({ ...addForm, name: e.target.value })
                  }
                />
              </label>
              <label>
                Category
                <select
                  name="category"
                  value={addForm.category}
                  onChange={(e) =>
                    setAddForm({ ...addForm, category: e.target.value })
                  }
                >
                  <option>Technical</option>
                  <option>Cultural</option>
                  <option>Sports</option>
                  <option>Academic</option>
                </select>
              </label>
              <label>
                Date
                <input
                  name="date"
                  type="date"
                  required
                  value={addForm.date}
                  onChange={(e) =>
                    setAddForm({ ...addForm, date: e.target.value })
                  }
                />
              </label>
              <label>
                Venue
                <input
                  name="venue"
                  required
                  placeholder="e.g. Seminar Hall 2"
                  value={addForm.venue}
                  onChange={(e) =>
                    setAddForm({ ...addForm, venue: e.target.value })
                  }
                />
              </label>
              <label>
                Popularity (0–100)
                <input
                  name="popularity"
                  type="number"
                  min="0"
                  max="100"
                  value={addForm.popularity}
                  onChange={(e) =>
                    setAddForm({
                      ...addForm,
                      popularity: Number(e.target.value)
                    })
                  }
                />
              </label>
              <label>
                Seat Capacity
                <input
                  name="capacity"
                  type="number"
                  min="5"
                  max="500"
                  value={addForm.capacity}
                  onChange={(e) =>
                    setAddForm({
                      ...addForm,
                      capacity: Number(e.target.value)
                    })
                  }
                />
              </label>
              <label className="wide">
                Description
                <input
                  name="description"
                  placeholder="Detailed description of the event"
                  value={addForm.description}
                  onChange={(e) =>
                    setAddForm({ ...addForm, description: e.target.value })
                  }
                />
              </label>
              <div className="wide form-bottom">
                <p
                  id="form-message"
                  role="status"
                  style={{ color: addMessage.isError ? "#c34b62" : "#25966e" }}
                >
                  {addMessage.text}
                </p>
                <button
                  className="primary-btn"
                  type="submit"
                  disabled={isAdding}
                >
                  {isAdding ? "Publishing Event…" : "Publish Event +"}
                </button>
              </div>
            </form>
          </section>
        )}
      </main>

      {/* REGISTRATION MODAL */}
      <div
        id="registration-modal"
        className={`modal ${isModalOpen ? "open" : ""}`}
        aria-hidden={!isModalOpen}
      >
        <div className="modal-backdrop" onClick={closeRegistration}></div>
        <section
          className="modal-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="registration-title"
        >
          <button
            className="modal-close"
            type="button"
            aria-label="Close"
            onClick={closeRegistration}
          >
            ×
          </button>
          <p className="eyebrow">SAVE YOUR SPOT</p>
          <h2 id="registration-title">Event registration</h2>
          <p className="muted">
            Complete the form to register for{" "}
            <strong id="selected-event-name">
              {selectedEvent ? selectedEvent.name : "this event"}
            </strong>
            .
          </p>
          <form id="registration-form" onSubmit={handleRegisterSubmit}>
            <input
              type="hidden"
              name="event_id"
              id="selected-event-id"
              value={selectedEvent ? selectedEvent.id : ""}
            />
            <label>
              Full name
              <input
                name="student_name"
                required
                placeholder="Enter your name"
                value={registrationForm.student_name}
                onChange={(e) =>
                  setRegistrationForm({
                    ...registrationForm,
                    student_name: e.target.value
                  })
                }
              />
            </label>
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                placeholder="name@example.com"
                value={registrationForm.email}
                onChange={(e) =>
                  setRegistrationForm({
                    ...registrationForm,
                    email: e.target.value
                  })
                }
              />
            </label>
            <label>
              Department
              <input
                name="department"
                required
                placeholder="e.g. CSE"
                value={registrationForm.department}
                onChange={(e) =>
                  setRegistrationForm({
                    ...registrationForm,
                    department: e.target.value
                  })
                }
              />
            </label>
            <label>
              Year of study
              <select
                name="year"
                required
                value={registrationForm.year}
                onChange={(e) =>
                  setRegistrationForm({
                    ...registrationForm,
                    year: e.target.value
                  })
                }
              >
                <option value="">Select year</option>
                <option>1st Year</option>
                <option>2nd Year</option>
                <option>3rd Year</option>
                <option>4th Year</option>
              </select>
            </label>
            <p
              id="registration-message"
              role="status"
              style={{ color: regMessage.isError ? "#c34b62" : "#25966e" }}
            >
              {regMessage.text}
            </p>

            {isRegistered && lastRegistration ? (
              <button
                type="button"
                className="primary-btn view-pass-cta"
                onClick={() => {
                  closeRegistration();
                  setActiveTab("passes");
                  fetchPasses(registrationForm.email);
                }}
              >
                🎟️ View My Digital Pass <span>→</span>
              </button>
            ) : (
              <button
                className="primary-btn register-submit"
                type="submit"
                disabled={isRegistered}
              >
                Confirm registration <span>→</span>
              </button>
            )}
          </form>
        </section>
      </div>



      {/* FOOTER */}
      <footer>
        <div className="brand">
          <span className="brand-mark">✦</span>
          <span>
            Campus<span className="brand-accent">Connect</span>
          </span>
        </div>
        <span>College Event Recommendation System · Supabase & Google SSO</span>
      </footer>
    </>
  );
}
