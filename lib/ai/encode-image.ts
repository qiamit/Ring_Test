/**
 * Prepare a bounded JPEG for AI upload (keeps payload under Next body limits).
 */
export async function encodeImageForAiAnalysis(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  maxSide = 1024,
  quality = 0.82,
): Promise<{ base64: string; mimeType: "image/jpeg"; width: number; height: number }> {
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(64, Math.round(sourceWidth * scale));
  const height = Math.max(64, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare image for AI.");
  ctx.drawImage(source, 0, 0, width, height);
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return { base64, mimeType: "image/jpeg", width, height };
}
