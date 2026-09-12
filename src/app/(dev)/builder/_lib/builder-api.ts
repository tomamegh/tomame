import type { MediaOverrideRow } from "@/db/queries/media-overrides";
import type { ApiResponse } from "@/types/api";

/**
 * Browser-side calls to /api/admin/builder/[key].
 *
 * Every failure path here ends in the server's own message. The upload
 * endpoint returns 422 text that says exactly what was wrong with the file
 * ("Image is too small (120x90)…"), which is far more useful than anything
 * this layer could invent, so nothing is paraphrased.
 */

export interface BuilderErrorShape {
  message: string;
  status: number;
}

export class BuilderRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BuilderRequestError";
  }
}

function endpoint(key: string): string {
  return `/api/admin/builder/${encodeURIComponent(key)}`;
}

/** Pull the server's message out of the standard error envelope. */
function messageFrom(payload: unknown, status: number): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof (payload as { error: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }
  return `Request failed (${status}).`;
}

async function send<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new BuilderRequestError(
      messageFrom(payload, response.status),
      response.status,
    );
  }
  return (payload as ApiResponse<T> & { success: true }).data;
}

/** PATCH the crop (and optionally the alt text) for one slot. */
export function saveCrop(
  key: string,
  body: { position: string; alt?: string },
): Promise<{ override: MediaOverrideRow }> {
  return send<{ override: MediaOverrideRow }>(endpoint(key), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** DELETE the override, restoring the built-in default. */
export function resetSlot(key: string): Promise<{ reset: true }> {
  return send<{ reset: true }>(endpoint(key), { method: "DELETE" });
}

/**
 * POST a replacement photo.
 *
 * XHR rather than fetch purely for `upload.onprogress`: a 12MB original over a
 * hotel wifi is many seconds of silence otherwise, and an admin who cannot tell
 * a slow upload from a dead one will hit the button again.
 */
export function uploadImage(
  key: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<{ override: MediaOverrideRow }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);

    const request = new XMLHttpRequest();
    request.open("POST", endpoint(key));
    request.responseType = "text";

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total);
      }
    });

    request.addEventListener("load", () => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(request.responseText) as unknown;
      } catch {
        payload = null;
      }

      if (request.status < 200 || request.status >= 300) {
        reject(
          new BuilderRequestError(
            messageFrom(payload, request.status),
            request.status,
          ),
        );
        return;
      }
      resolve(
        (payload as { data: { override: MediaOverrideRow } }).data,
      );
    });

    request.addEventListener("error", () => {
      reject(new BuilderRequestError("The upload could not reach the server.", 0));
    });
    request.addEventListener("abort", () => {
      reject(new BuilderRequestError("The upload was cancelled.", 0));
    });

    request.send(form);
  });
}
