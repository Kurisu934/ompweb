import { normalizeFilePathSlashes } from "./file-paths";

export type FileEditorStatus = "clean" | "dirty" | "saving";
export interface FileMutation {
  path: string;
  newPath?: string;
}

/** Segment-boundary comparison for file tabs affected by folder operations. */
export function isFileWithinPath(filePath: string, parent: string): boolean {
  const normalize = (value: string) => {
    const normalized = normalizeFilePathSlashes(value).replace(/\/$/, "");
    return /^[a-z]:\//i.test(normalized) ? normalized.toLowerCase() : normalized;
  };
  const child = normalize(filePath);
  const root = normalize(parent);
  return child === root || child.startsWith(`${root}/`);
}
