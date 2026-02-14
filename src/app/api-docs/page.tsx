import type { Metadata } from "next";
import { getApiDocs } from "@/lib/swagger";

export const metadata: Metadata = {
  title: "Tomame API Docs",
};

export default function ApiDocsPage() {
  const spec = JSON.stringify(getApiDocs());

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"
      />
      <div id="swagger-ui" />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            const s = document.createElement('script');
            s.src = 'https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js';
            s.onload = function() {
              SwaggerUIBundle({
                spec: ${spec},
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                  SwaggerUIBundle.presets.apis,
                  SwaggerUIBundle.SwaggerUIStandalonePreset,
                ],
                layout: 'BaseLayout',
              });
            };
            document.body.appendChild(s);
          `,
        }}
      />
    </>
  );
}
