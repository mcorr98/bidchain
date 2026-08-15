import { auth } from "@/auth";
import { hasBidderProfile } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }
  if (session.user.role === "agent") {
    redirect("/agent/listings");
  }
  if (session.user.role === "vendor" && !(await hasBidderProfile(Number(session.user.id)))) {
    redirect("/vendor/properties");
  }
  redirect("/properties");
}