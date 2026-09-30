import bwip from "bwip-js/node";
import jsQR from "jsqr";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { cameraHelp } from "../components/frame-decoder";

describe("camera fallback decoding (iPhone Safari has no BarcodeDetector)", () => {
  it("jsQR reads the label's QR at a phone frame's resolution", async () => {
    const url = "https://dev.tomame.ca/warehouse/p/PKG-10042";
    const png = await bwip.toBuffer({ bcid: "qrcode", text: url, scale: 3, paddingwidth: 12, paddingheight: 12, backgroundcolor: "FFFFFF" } as Parameters<typeof bwip.toBuffer>[0]);
    const { data, info } = await sharp(png).resize({ width: 240 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const result = jsQR(new Uint8ClampedArray(data), info.width, info.height, { inversionAttempts: "dontInvert" });
    expect(result?.data).toBe(url);
  });
});

describe("cameraHelp", () => {
  it("points iPhone Safari users at Website Settings", () => {
    const steps = cameraHelp("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1");
    expect(steps.join(" ")).toMatch(/Website Settings/);
  });
  it("points Chrome on Android at the site permissions", () => {
    const steps = cameraHelp("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36");
    expect(steps.join(" ")).toMatch(/Permissions/);
  });
});
