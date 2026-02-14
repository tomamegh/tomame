import { createSwaggerSpec } from "next-swagger-doc";

export function getApiDocs() {
  return createSwaggerSpec({
    apiFolder: "src/app/api",
    definition: {
      openapi: "3.0.0",
      info: {
        title: "Tomame API",
        version: "0.1.0",
        description:
          "Concierge shopping platform for Ghanaian customers — API documentation",
      },
      servers: [
        {
          url: "http://localhost:3000",
          description: "Local development",
        },
      ],
      tags: [
        { name: "Health", description: "Health check" },
        { name: "Auth", description: "Authentication & password management" },
        { name: "Orders", description: "Product quote submission & order management" },
        { name: "Admin", description: "Admin user & pricing management (requires admin role)" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "Supabase access token from login response",
          },
        },
        schemas: {
          Error: {
            type: "object",
            properties: {
              error: { type: "string" },
            },
            required: ["error"],
          },
          Success: {
            type: "object",
            properties: {
              data: { type: "object" },
            },
          },
        },
      },
    },
  });
}
