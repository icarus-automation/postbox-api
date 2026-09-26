export type StoredObject = {
  contentType: string;
  byteSize: number;
};

export interface ObjectStorage {
  presignPut(input: {
    storageKey: string;
    contentType: string;
    byteSize: number;
  }): Promise<{ uploadUrl: string; headers: Record<string, string> }>;

  head(storageKey: string): Promise<StoredObject | null>;

  publicUrl(storageKey: string): string;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
