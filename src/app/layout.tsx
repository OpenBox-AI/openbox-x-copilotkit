"use client";

import "./globals.css";
import "@copilotkit/react-core/v2/styles.css";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CopilotKit } from "@copilotkit/react-core/v2";
import { ThemeProvider } from "@/hooks/use-theme";
import { withBasePath } from "@/lib/base-path";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <title>CopilotKit</title>
        <link
          rel="icon"
          type="image/svg+xml"
          href={withBasePath("/copilotkit-logo-mark.svg")}
        />
      </head>
      <body className={`antialiased`}>
        <ThemeProvider>
          <Suspense fallback={null}>
            <CopilotProviderWithReset>{children}</CopilotProviderWithReset>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}

function CopilotProviderWithReset({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const [session, setSession] = useState<{
    key: string;
    threadId: string;
  } | null>(null);

  useEffect(() => {
    const resetKey = searchParams.get("reset");
    setSession((current) => {
      // Keep the session stable within a tab; a fresh load or ?reset= starts a
      // new session (and a new thread). Pinning ONE stable thread per session
      // lets a langgraph interrupt() pause and resume on the SAME thread.
      if (current && !resetKey) return current;
      return {
        key: resetKey ?? crypto.randomUUID(),
        // langgraph requires a UUID thread_id, so always mint a UUID here.
        threadId: crypto.randomUUID(),
      };
    });
  }, [searchParams]);

  return (
    <>
      {session ? (
        <CopilotKit
          key={session.key}
          threadId={session.threadId}
          runtimeUrl={withBasePath("/api/copilotkit")}
          inspectorDefaultAnchor={{ horizontal: "right", vertical: "top" }}
          useSingleEndpoint={false}
        >
          {children}
        </CopilotKit>
      ) : null}
    </>
  );
}
