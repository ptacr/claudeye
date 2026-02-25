import { NextResponse } from "next/server";
import { getQueueStatus } from "@/lib/eval-queue";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getQueueStatus());
}
