import { NextResponse } from "next/server";
import { registerStudent, getRegistrations } from "@/lib/db";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    const id = searchParams.get("id");

    const registrations = await getRegistrations({ email, registration_id: id });
    return NextResponse.json(registrations);
  } catch (error) {
    console.error("GET /api/register error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve registrations." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const data = await request.json().catch(() => ({}));
    const required = ["event_id", "student_name", "email", "department", "year"];

    for (const key of required) {
      if (!data[key] || !String(data[key]).trim()) {
        return NextResponse.json(
          { error: "Please complete all required registration fields." },
          { status: 400 }
        );
      }
    }

    const eventIdNum = Number(data.event_id);
    if (Number.isNaN(eventIdNum)) {
      return NextResponse.json(
        { error: "Invalid event selected." },
        { status: 400 }
      );
    }

    const result = await registerStudent({
      event_id: eventIdNum,
      student_name: data.student_name,
      email: data.email,
      department: data.department,
      year: data.year,
      user_id: data.user_id || null
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }

    return NextResponse.json(
      {
        message: "Registration successful!",
        registration: result.registration
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/register error:", error);
    return NextResponse.json(
      { error: "Internal server error during registration." },
      { status: 500 }
    );
  }
}
