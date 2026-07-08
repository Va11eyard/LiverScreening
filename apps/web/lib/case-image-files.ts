export const MAX_CASE_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_CASE_IMAGES = 30;
export const MAX_CASE_UPLOAD_BYTES = 190 * 1024 * 1024;

export type AddCaseImagesResult = {
  files: File[];
  skippedLarge: number;
  skippedEmpty: number;
  skippedLimit: number;
};

function guessImageType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff";
  return "image/jpeg";
}

export async function cloneFilesForUpload(
  incoming: FileList | File[],
  existing: File[],
  maxFiles = MAX_CASE_IMAGES,
): Promise<AddCaseImagesResult> {
  const next = [...existing];
  let skippedLarge = 0;
  let skippedEmpty = 0;
  let skippedLimit = 0;

  for (const file of Array.from(incoming)) {
    if (next.length >= maxFiles) {
      skippedLimit++;
      continue;
    }
    if (file.size === 0) {
      skippedEmpty++;
      continue;
    }
    if (file.size > MAX_CASE_IMAGE_BYTES) {
      skippedLarge++;
      continue;
    }
    try {
      const buf = await file.arrayBuffer();
      if (buf.byteLength === 0) {
        skippedEmpty++;
        continue;
      }
      const name = file.name?.trim() || `photo-${Date.now()}.jpg`;
      next.push(
        new File([buf], name, {
          type: guessImageType(file),
          lastModified: file.lastModified || Date.now(),
        }),
      );
    } catch {
      skippedEmpty++;
    }
  }

  return { files: next, skippedLarge, skippedEmpty, skippedLimit };
}

export function totalUploadBytes(files: File[]): number {
  return files.reduce((sum, file) => sum + file.size, 0);
}

export async function prepareFilesForSubmit(files: File[]): Promise<AddCaseImagesResult> {
  if (files.length === 0) {
    return { files: [], skippedLarge: 0, skippedEmpty: 0, skippedLimit: 0 };
  }
  return cloneFilesForUpload(files, [], MAX_CASE_IMAGES);
}
