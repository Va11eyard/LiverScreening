import { describe, expect, it } from "vitest";

import { cloneFilesForUpload, prepareFilesForSubmit, totalUploadBytes } from "./case-image-files";

describe("cloneFilesForUpload", () => {
  it("copies file bytes into a new File", async () => {
    const original = new File([new Uint8Array([1, 2, 3])], "test.jpg", { type: "image/jpeg" });
    const result = await cloneFilesForUpload([original], []);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].size).toBe(3);
    expect(result.files[0].name).toBe("test.jpg");
  });

  it("skips empty files", async () => {
    const empty = new File([], "empty.jpg", { type: "image/jpeg" });
    const result = await cloneFilesForUpload([empty], []);
    expect(result.files).toHaveLength(0);
    expect(result.skippedEmpty).toBe(1);
  });
});

describe("prepareFilesForSubmit", () => {
  it("re-clones files for upload", async () => {
    const original = new File([new Uint8Array([9])], "x.jpg", { type: "image/jpeg" });
    const result = await prepareFilesForSubmit([original]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].size).toBe(1);
    expect(result.files[0]).not.toBe(original);
  });
});

describe("totalUploadBytes", () => {
  it("sums file sizes", () => {
    const files = [
      new File([new Uint8Array(10)], "a.jpg"),
      new File([new Uint8Array(5)], "b.jpg"),
    ];
    expect(totalUploadBytes(files)).toBe(15);
  });
});
