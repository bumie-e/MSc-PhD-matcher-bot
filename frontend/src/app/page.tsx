"use client";

import { Landing } from "@/components/landing/Landing";
import { useSession } from "@/hooks/useSession";

// The landing page is always the first thing visitors see. Signed-in users
// get an "Open dashboard" button instead of an automatic redirect.
export default function Home() {
  const { session } = useSession();
  return <Landing signedIn={!!session} />;
}
