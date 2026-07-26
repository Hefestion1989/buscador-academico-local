import type { KnowledgeBase } from "./types";

const DATABASE_NAME = "rastreador-de-ideas";
const DATABASE_VERSION = 1;
const STORE_NAME = "knowledge-bases";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function listKnowledgeBases(): Promise<KnowledgeBase[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const result = await requestResult(
      transaction.objectStore(STORE_NAME).getAll() as IDBRequest<KnowledgeBase[]>,
    );
    return result.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } finally {
    database.close();
  }
}

export async function saveKnowledgeBase(base: KnowledgeBase): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    await requestResult(transaction.objectStore(STORE_NAME).put(base));
  } finally {
    database.close();
  }
}

export async function deleteKnowledgeBase(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    await requestResult(transaction.objectStore(STORE_NAME).delete(id));
  } finally {
    database.close();
  }
}
