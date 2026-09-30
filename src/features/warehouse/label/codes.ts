import "server-only";

import bwip from "bwip-js/node";

/**
 * The two machine-readable marks on a package label (081), drawn as SVG on the
 * server so the label page ships no barcode library and prints crisp at any
 * DPI — a thermal printer rasterises vectors at its own resolution, which a
 * canvas PNG would already have blurred.
 *
 * bwip-js is the Barcode Writer in Pure JavaScript port of BWIPP: no native
 * dependency, no network, deterministic output.
 */

/** Size the SVG to its box: a label cell decides the dimensions, not the encoder. */
function fill(svg: string, stretch: boolean): string {
  return svg.replace(
    "<svg ",
    `<svg width="100%" height="100%" ${stretch ? 'preserveAspectRatio="none" ' : ""}shape-rendering="crispEdges" role="img" `,
  );
}

/** QR, error correction M: survives a scuffed corner, still scans small. */
export function qrSvg(text: string): string {
  // `eclevel` is a BWIPP option the typings do not list; the encoder reads it.
  const options = { bcid: "qrcode", text, eclevel: "M" };
  return fill(bwip.toSVG(options as Parameters<typeof bwip.toSVG>[0]), false);
}

/**
 * Code 128 — what the handheld scanners on a warehouse bench read. The human-
 * readable text is set by the label in its own type, so the encoder draws bars only.
 */
export function code128Svg(text: string): string {
  return fill(bwip.toSVG({ bcid: "code128", text, height: 12, includetext: false }), true);
}
