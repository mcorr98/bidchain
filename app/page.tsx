import { auth } from "@/auth";
import { redirect } from "next/navigation";

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