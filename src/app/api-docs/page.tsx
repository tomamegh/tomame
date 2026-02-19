import type { Metadata } from "next";
import { getApiDocs } from "@/lib/swagger";
import dynamic from "next/dynamic";

export const metadata: Metadata = {
  title: "Tomame API Docs",
};

const SwaggerUI = dynamic(() => import("@/components/swagger-ui"), {
  ssr: true,
});

export default function ApiDocsPage() {
  const spec = JSON.stringify(getApiDocs());

  return <SwaggerUI spec={spec} />;
}

// export default function ApiDocsPage() {
//   const spec = JSON.stringify(getApiDocs());

//   return (
//     <>
//       <link
//         rel="stylesheet"
//         href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"
//       />
//       <Suspense fallback={<div>Loading API documentation...</div>}>
//         <div id="swagger-ui" />
//       </Suspense>
//       <script
//         dangerouslySetInnerHTML={{
//           __html: `
//             const s = document.createElement('script');
//             s.src = 'https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js';
//             s.onload = function() {
//               SwaggerUIBundle({
//                 spec: ${spec},
//                 dom_id: '#swagger-ui',
//                 deepLinking: true,
//                 presets: [
//                   SwaggerUIBundle.presets.apis,
//                   SwaggerUIBundle.SwaggerUIStandalonePreset,
//                 ],
//                 layout: 'BaseLayout',
//               });
//             };
//             document.body.appendChild(s);
//           `,
//         }}
//       />
//     </>
//   );
// }
