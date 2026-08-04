"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// Dynamic's wallet-connector SDKs reference `window` at module-evaluation time,
// which crashes Next.js's server-side prerendering (e.g. of /_not-found). Loading
// this only in the browser keeps those modules out of the server bundle entirely.
const Providers = dynamic(() => import("./providers"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ),
});

export default Providers;
