import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getApiDocs } from "@/lib/swagger";
import dynamic from "next/dynamic";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";

export const metadata: Metadata = {
  title: "API docs · Admin",
  robots: { index: false, follow: false },
};

const SwaggerUI = dynamic(() => import("@/components/swagger-ui"), {
  ssr: true,
});

/** Admins only: the spec maps every route, which is not for the public. */
export default async function ApiDocsPage() {
  const user = await getAuthenticatedUser();
  if (!canAccessAdmin(user)) notFound();

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
