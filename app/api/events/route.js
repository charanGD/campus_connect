import { NextResponse } from "next/server";
import { getAllEvents, createEvent, deleteEvent } from "@/lib/db";

export async function GET() {
  try {
    const events = await getAllEvents();
    return NextResponse.json(events);
  } catch (error) {
    console.error("GET /api/events error:", error);
    return NextResponse.json({ error: "Failed to fetch events." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const data = await request.json().catch(() => ({}));
    const required = ["name", "category", "date", "venue"];
    
    for (const key of required) {
      if (!data[key] || !String(data[key]).trim()) {
        return NextResponse.json(
          { error: "Please provide name, category, date and venue." },
          { status: 400 }
        );
      }
    }

    if (data.popularity !== undefined && data.popularity !== "") {
      const popNum = Number(data.popularity);
      if (Number.isNaN(popNum) || popNum < 0 || popNum > 100) {
        return NextResponse.json(
          { error: "Popularity must be a number from 0 to 100." },
          { status: 400 }
        );
      }
    }

    const event = await createEvent({
      name: data.name,
      category: data.category,
      date: data.date,
      venue: data.venue,
      description: data.description,
      popularity: data.popularity,
      capacity: data.capacity
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error("POST /api/events error:", error);
    return NextResponse.json(
      { error: "Internal server error while creating event." },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Event ID is required." }, { status: 400 });
    }

    const success = await deleteEvent(id);
    if (!success) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    return NextResponse.json({ message: "Event deleted successfully.", id });
  } catch (error) {
    console.error("DELETE /api/events error:", error);
    return NextResponse.json({ error: "Failed to delete event." }, { status: 500 });
  }
}
