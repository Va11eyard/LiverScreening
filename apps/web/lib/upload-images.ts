import { apiUploadForm, type UploadCaseImagesResult } from "./api";
import { prepareFilesForSubmit } from "./case-image-files";

const BATCH_SIZE = 10;

export async function uploadCaseImagesBatched(
  caseId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<UploadCaseImagesResult> {
  const prepared = await prepareFilesForSubmit(files);
  if (prepared.files.length === 0) {
    throw new Error("Не удалось прочитать снимки");
  }
  const uploadFiles = prepared.files;
  let last: UploadCaseImagesResult = { images: [] };
  const total = uploadFiles.length;
  for (let i = 0; i < uploadFiles.length; i += BATCH_SIZE) {
    const chunk = uploadFiles.slice(i, i + BATCH_SIZE);
    const formData = new FormData();
    for (const file of chunk) {
      formData.append("images", file, file.name);
    }
    last = await apiUploadForm<UploadCaseImagesResult>(`cases/${caseId}/images`, formData);
    onProgress?.(Math.min(i + chunk.length, total), total);
  }
  return last;
}

export const MAX_IMAGES_PER_CASE = 30;
export const UPLOAD_BATCH_SIZE = BATCH_SIZE;
