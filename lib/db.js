import { getSupabaseServerClient, isSupabaseConfigured } from "./supabaseClient";

// MinHeap implementation for Top-K event recommendation
export class MinHeap {
  constructor(compareFn) {
    this.heap = [];
    this.compare = compareFn || ((a, b) => a - b);
  }

  size() {
    return this.heap.length;
  }

  peek() {
    return this.heap[0];
  }

  push(val) {
    this.heap.push(val);
    this._bubbleUp(this.heap.length - 1);
  }

  pop() {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const bottom = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this._bubbleDown(0);
    }
    return top;
  }

  _bubbleUp(index) {
    while (index > 0) {
      const parentIdx = Math.floor((index - 1) / 2);
      if (this.compare(this.heap[index], this.heap[parentIdx]) < 0) {
        [this.heap[index], this.heap[parentIdx]] = [this.heap[parentIdx], this.heap[index]];
        index = parentIdx;
      } else {
        break;
      }
    }
  }

  _bubbleDown(index) {
    const length = this.heap.length;
    while (true) {
      let left = 2 * index + 1;
      let right = 2 * index + 2;
      let smallest = index;

      if (left < length && this.compare(this.heap[left], this.heap[smallest]) < 0) {
        smallest = left;
      }
      if (right < length && this.compare(this.heap[right], this.heap[smallest]) < 0) {
        smallest = right;
      }
      if (smallest !== index) {
        [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
        index = smallest;
      } else {
        break;
      }
    }
  }
}

// In-Memory store as a robust fallback if Supabase is not yet configured
const globalStore = globalThis.__EVENT_RECOMMENDER_STORE__ || {
  events: {
    101: { id: 101, name: "AI Workshop", category: "Technical", date: "2026-10-15", popularity: 85, description: "Hands-on introduction to AI and machine learning.", venue: "Computer Lab 1", capacity: 40 },
    102: { id: 102, name: "Hackathon", category: "Technical", date: "2026-10-20", popularity: 95, description: "Build a solution with a team in a coding challenge.", venue: "Innovation Hub", capacity: 60 },
    103: { id: 103, name: "Cultural Fest", category: "Cultural", date: "2026-10-25", popularity: 80, description: "Music, dance, art and cultural performances.", venue: "Main Auditorium", capacity: 150 },
    104: { id: 104, name: "Tech Talk", category: "Technical", date: "2026-10-12", popularity: 72, description: "Industry speakers discuss emerging technologies.", venue: "Seminar Hall", capacity: 80 },
    105: { id: 105, name: "Football Tournament", category: "Sports", date: "2026-10-18", popularity: 88, description: "Inter-department football tournament.", venue: "College Ground", capacity: 50 },
    106: { id: 106, name: "Research Symposium", category: "Academic", date: "2026-11-02", popularity: 68, description: "Student research presentations and discussion.", venue: "Block B", capacity: 45 },
    108: { id: 108, name: "Data Science Bootcamp", category: "Technical", date: "2026-11-05", popularity: 90, description: "Practical sessions on data analysis and visualization.", venue: "Computer Lab 2", capacity: 40 },
    109: { id: 109, name: "Full Stack AI Hackathon 2026", category: "Technical", date: "2026-11-15", popularity: 98, description: "48-hour national hackathon building AI agents, cloud architectures, and full-stack solutions.", venue: "Campus Main Convention Center", capacity: 120 }
  },
  registrations: [
    { registration_id: 1, event_id: 101, event_name: "AI Workshop", student_name: "Aarav Sharma", email: "aarav@college.edu", department: "CSE", year: "3rd Year", timestamp: "2026-10-08T10:15:00Z" },
    { registration_id: 2, event_id: 102, event_name: "Hackathon", student_name: "Sneha Patel", email: "sneha@college.edu", department: "IT", year: "2nd Year", timestamp: "2026-10-08T11:30:00Z" },
    { registration_id: 3, event_id: 105, event_name: "Football Tournament", student_name: "Karthik Raja", email: "karthik@college.edu", department: "ECE", year: "4th Year", timestamp: "2026-10-08T12:00:00Z" }
  ]
};

if (process.env.NODE_ENV !== "production") {
  globalThis.__EVENT_RECOMMENDER_STORE__ = globalStore;
}

// -------------------------------------------------------------------------
// EVENTS
// -------------------------------------------------------------------------

export async function getAllEvents() {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      const { data: events, error } = await supabase
        .from("events")
        .select("*")
        .order("date", { ascending: true });

      if (!error && Array.isArray(events)) {
        // Fetch all registrations to compute live count dynamically
        const { data: registrations } = await supabase
          .from("registrations")
          .select("event_id");

        const counts = {};
        (registrations || []).forEach(r => {
          counts[r.event_id] = (counts[r.event_id] || 0) + 1;
        });

        return events.map(e => {
          const cap = e.capacity || 50;
          const regCount = counts[e.id] || 0;
          return {
            ...e,
            capacity: cap,
            registered_count: regCount,
            seats_left: Math.max(0, cap - regCount),
            _source: "supabase"
          };
        });
      }
      console.warn("Supabase fetch events failed, falling back to local memory store:", error?.message);
    } catch (err) {
      console.error("Supabase events error:", err);
    }
  }

  // Fallback to in-memory store
  return Object.values(globalStore.events).map(event => {
    const regCount = globalStore.registrations.filter(r => r.event_id === event.id).length;
    const capacity = event.capacity || 50;
    return {
      ...event,
      capacity,
      registered_count: regCount,
      seats_left: Math.max(0, capacity - regCount),
      _source: "memory"
    };
  });
}

export async function getEventById(id) {
  const idNum = Number(id);
  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      const { data: event, error } = await supabase
        .from("events")
        .select("*")
        .eq("id", idNum)
        .single();

      if (!error && event) {
        const { count } = await supabase
          .from("registrations")
          .select("*", { count: "exact", head: true })
          .eq("event_id", idNum);

        const cap = event.capacity || 50;
        const regCount = count || 0;
        return {
          ...event,
          capacity: cap,
          registered_count: regCount,
          seats_left: Math.max(0, cap - regCount),
          _source: "supabase"
        };
      }
    } catch (err) {
      console.error("Supabase getEventById error:", err);
    }
  }

  const event = globalStore.events[idNum];
  if (!event) return null;
  const regCount = globalStore.registrations.filter(r => r.event_id === event.id).length;
  const capacity = event.capacity || 50;
  return {
    ...event,
    capacity,
    registered_count: regCount,
    seats_left: Math.max(0, capacity - regCount),
    _source: "memory"
  };
}

export async function createEvent({ name, category, date, venue, description = "", popularity = 50, capacity = 50 }) {
  const payload = {
    name: String(name).trim(),
    category: String(category).trim(),
    date: String(date).trim(),
    venue: String(venue).trim(),
    description: String(description || "").trim(),
    popularity: Math.max(0, Math.min(100, Number(popularity) || 50)),
    capacity: Math.max(1, Number(capacity) || 50)
  };

  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("events")
        .insert([payload])
        .select()
        .single();

      if (!error && data) {
        return {
          ...data,
          registered_count: 0,
          seats_left: data.capacity,
          _source: "supabase"
        };
      }
      console.warn("Supabase createEvent failed:", error?.message);
    } catch (err) {
      console.error("Supabase createEvent error:", err);
    }
  }

  // Memory fallback
  const existingIds = Object.keys(globalStore.events).map(Number);
  const nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 101;
  const event = {
    id: nextId,
    ...payload
  };
  globalStore.events[nextId] = event;
  return {
    ...event,
    registered_count: 0,
    seats_left: event.capacity,
    _source: "memory"
  };
}

export async function deleteEvent(id) {
  const idNum = Number(id);
  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      const { error } = await supabase
        .from("events")
        .delete()
        .eq("id", idNum);

      if (!error) return true;
      console.warn("Supabase deleteEvent failed:", error?.message);
    } catch (err) {
      console.error("Supabase deleteEvent error:", err);
    }
  }

  // Memory fallback
  if (globalStore.events[idNum]) {
    delete globalStore.events[idNum];
    globalStore.registrations = globalStore.registrations.filter(r => r.event_id !== idNum);
    return true;
  }
  return false;
}

// -------------------------------------------------------------------------
// REGISTRATIONS
// -------------------------------------------------------------------------

export async function registerStudent({ event_id, student_name, email, department, year, user_id }) {
  const idNum = Number(event_id);
  const cleanEmail = String(email).trim().toLowerCase();
  const supabase = getSupabaseServerClient();

  if (supabase) {
    try {
      // 1. Check event & capacity
      const { data: event, error: evErr } = await supabase
        .from("events")
        .select("*")
        .eq("id", idNum)
        .single();

      if (evErr || !event) {
        return { error: "This event does not exist in the database.", status: 404 };
      }

      const { count } = await supabase
        .from("registrations")
        .select("*", { count: "exact", head: true })
        .eq("event_id", idNum);

      const capacity = event.capacity || 50;
      if ((count || 0) >= capacity) {
        return { error: "Sorry, this event is already full! No seats left.", status: 400 };
      }

      // 2. Check duplicate registration
      const { data: existing } = await supabase
        .from("registrations")
        .select("registration_id")
        .eq("event_id", idNum)
        .ilike("email", cleanEmail)
        .limit(1);

      if (existing && existing.length > 0) {
        return { error: "You are already registered for this event with this email.", status: 400 };
      }

      // 3. Insert registration record
      const regPayload = {
        event_id: idNum,
        event_name: event.name,
        student_name: String(student_name).trim(),
        email: cleanEmail,
        department: String(department || "General").trim(),
        year: String(year || "1st Year").trim()
      };
      if (user_id) {
        regPayload.user_id = user_id;
      }

      const { data: newReg, error: insErr } = await supabase
        .from("registrations")
        .insert([regPayload])
        .select()
        .single();

      if (insErr) {
        throw insErr;
      }

      return {
        registration: {
          ...newReg,
          event
        },
        status: 201
      };
    } catch (err) {
      console.error("Supabase registerStudent error:", err);
      // If error occurred with Supabase, fall back or surface error
      return { error: err.message || "Failed to register in database.", status: 500 };
    }
  }

  // Memory fallback
  const event = globalStore.events[idNum];
  if (!event) {
    return { error: "This event does not exist.", status: 404 };
  }

  const currentRegCount = globalStore.registrations.filter(r => r.event_id === idNum).length;
  const capacity = event.capacity || 50;
  if (currentRegCount >= capacity) {
    return { error: "Sorry, this event is already full! No seats left.", status: 400 };
  }

  const alreadyRegistered = globalStore.registrations.some(
    r => r.event_id === idNum && r.email.toLowerCase() === cleanEmail
  );
  if (alreadyRegistered) {
    return { error: "You are already registered for this event with this email.", status: 400 };
  }

  const registration = {
    registration_id: globalStore.registrations.length + 1,
    event_id: idNum,
    event_name: event.name,
    student_name: String(student_name).trim(),
    email: cleanEmail,
    department: String(department).trim(),
    year: String(year).trim(),
    timestamp: new Date().toISOString()
  };

  globalStore.registrations.push(registration);
  return { registration, status: 201 };
}

export async function getAllRegistrations() {
  return getRegistrations();
}

export async function getRegistrations({ email, registration_id } = {}) {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      let query = supabase
        .from("registrations")
        .select("*, events(*)")
        .order("timestamp", { ascending: false });

      if (email) {
        query = query.ilike("email", String(email).trim());
      }
      if (registration_id) {
        query = query.eq("registration_id", Number(registration_id));
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        return data.map(reg => ({
          registration_id: reg.registration_id,
          event_id: reg.event_id,
          event_name: reg.event_name,
          student_name: reg.student_name,
          email: reg.email,
          department: reg.department,
          year: reg.year,
          timestamp: reg.timestamp,
          user_id: reg.user_id,
          event: reg.events || {
            id: reg.event_id,
            name: reg.event_name,
            category: "Event",
            date: "TBD",
            venue: "Campus"
          }
        }));
      }
    } catch (err) {
      console.error("Supabase getRegistrations error:", err);
    }
  }

  // Memory fallback
  let list = [...globalStore.registrations];
  if (email) {
    const qEmail = String(email).trim().toLowerCase();
    list = list.filter(r => r.email.toLowerCase() === qEmail);
  }
  if (registration_id) {
    const qId = Number(registration_id);
    list = list.filter(r => r.registration_id === qId);
  }
  return list.map(reg => ({
    ...reg,
    event: globalStore.events[reg.event_id] || {
      id: reg.event_id,
      name: reg.event_name,
      category: "Event",
      date: "TBD",
      venue: "Campus"
    }
  }));
}

// -------------------------------------------------------------------------
// ALGORITHM & RECOMMENDATIONS
// -------------------------------------------------------------------------

export function scoreEventWithBreakdown(event, interests = [], priority = "Medium") {
  // Transparent algorithm scoring: category match (30) + popularity + priority bonus
  const lowerInterests = (interests || []).map(i => String(i).trim().toLowerCase());
  const isMatched = lowerInterests.includes(event.category.toLowerCase());
  const match = isMatched ? 30 : 0;
  const priorityBonusMap = { Low: 0, Medium: 10, High: 20 };
  const priorityBonus = priorityBonusMap[priority] ?? 0;
  const total = match + (Number(event.popularity) || 0) + priorityBonus;
  return {
    total,
    breakdown: {
      categoryMatch: match,
      isMatched,
      popularity: event.popularity,
      priorityBonus,
      priorityName: priority
    }
  };
}

export function compareRecommendations(a, b) {
  if (b.score !== a.score) {
    return b.score - a.score;
  }
  return String(a.date).localeCompare(String(b.date));
}

export async function recommendEvents({
  interests = [],
  category = "All",
  priority = "Medium",
  limit = 3,
  sort_by = "score"
}) {
  const normInterests = (interests || []).map(x => String(x).trim().toLowerCase()).filter(Boolean);
  const normCategory = String(category || "All").trim();
  const normPriority = String(priority || "Medium").trim();
  const numLimit = Math.max(1, Math.min(Number(limit) || 3, 20));

  // Dynamically load all events from Supabase or fallback
  const allEvents = await getAllEvents();

  const candidates = [];
  for (const event of allEvents) {
    if (normCategory !== "All" && event.category !== normCategory) {
      continue;
    }
    if (normInterests.length > 0 && !normInterests.includes(event.category.toLowerCase())) {
      continue;
    }
    const item = { ...event };
    const scoring = scoreEventWithBreakdown(event, normInterests, normPriority);
    item.score = scoring.total;
    item.breakdown = scoring.breakdown;
    candidates.push(item);
  }

  if (sort_by === "date") {
    candidates.sort((a, b) => {
      const cmpDate = String(a.date).localeCompare(String(b.date));
      if (cmpDate !== 0) return cmpDate;
      return b.score - a.score;
    });
  } else if (sort_by === "popularity") {
    candidates.sort((a, b) => {
      if (b.popularity !== a.popularity) return b.popularity - a.popularity;
      return String(a.date).localeCompare(String(b.date));
    });
  } else {
    candidates.sort((a, b) => compareRecommendations(a, b));
  }

  // MinHeap / Priority Queue for Top-K extraction
  const heap = new MinHeap((a, b) => compareRecommendations(a, b));
  for (const candidate of candidates) {
    heap.push(candidate);
  }

  const top = [];
  while (top.length < numLimit && heap.size() > 0) {
    top.push(heap.pop());
  }

  return {
    recommendations: top,
    total_matches: candidates.length,
    backend_source: isSupabaseConfigured() ? "Supabase PostgreSQL Database" : "In-Memory Store (Supabase ready)",
    algorithm: {
      hashmap: "Supabase Relational Query + Indexed Lookup",
      sorting: "Array sort, O(n log n)",
      heap: "MinHeap / Priority Queue selects Top-K by score"
    }
  };
}
