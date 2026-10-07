import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Website and app building are included in LEO OS plans. Choose a plan to continue.", upgrade_url: "/pricing" },
    { status: 410 },
  );
}
