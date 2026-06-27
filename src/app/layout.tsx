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
  const [copilotSessionKey, setCopilotSessionKey] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const resetKey = searchParams.get("reset");
    setCopilotSessionKey(
      (current) => resetKey ?? current ?? `session-${Date.now()}`,
    );
  }, [searchParams]);

  return (
    <>
      {copilotSessionKey ? (
        <CopilotKit
          key={copilotSessionKey}
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
