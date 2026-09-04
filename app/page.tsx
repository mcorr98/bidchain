import { auth } from "@/auth";
import { redirect } from "next/navigation";

/**
 * Landing page. Routes signed-in users to their role's home.
 */
export default async function Home() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }
  if (session.user.role === "agent") {
    redirect("/agent/listings");
  } else {
    redirect("/properties");
  }
  
}