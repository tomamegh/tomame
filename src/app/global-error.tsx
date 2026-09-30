"use client";

import React, { useEffect } from "react";
import "./globals.css";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/observability/report-client-error";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The root layout itself failed, so this is the worst screen a customer can
  // reach. It used to tell nobody.
  useEffect(() => {
    reportClientError({ kind: "render", message: error.message || "Root layout failed", digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            textAlign: "center",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <h2>Something went wrong!</h2>
          <p style={{ margin: "1rem 0", color: "#666" }}>
            A critical error occurred. Please try refreshing the page or contact
            support if the problem persists.
          </p>
          <Button onClick={() => reset()}>Try again</Button>
        </div>
      </body>
    </html>
  );
}
