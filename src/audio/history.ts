import type { GeneratedNarration } from './narration';

export const HISTORY_LIMIT = 3;

export interface NarrationTake extends GeneratedNarration {
  id: string;
  number: number;
  script: string;
  voiceLabel: string;
  rate: number;
  duration: number;
}

type NewTake = Omit<NarrationTake, 'number'>;
type Update = { takes: NarrationTake[]; added?: NarrationTake };

export function appendTake(takes: NarrationTake[], input: NewTake, replace: string | true | undefined): Update {
  if (takes.length >= HISTORY_LIMIT && replace !== true && replace !== takes[0].id) return { takes };
  const added = { ...input, number: (takes.at(-1)?.number ?? 0) + 1 };
  return { takes: [...takes.slice(-(HISTORY_LIMIT - 1)), added], added };
}

export async function openNarrationHistory(owner: string) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('xilo-narracoes', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('historicos');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.onversionchange = () => db.close();

  // Ler e substituir na mesma transação impede que duas abas apaguem uma
  // versão diferente daquela que a pessoa autorizou.
  function access(change?: (takes: NarrationTake[]) => Update): Promise<Update> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('historicos', change ? 'readwrite' : 'readonly');
      const store = tx.objectStore('historicos');
      const request = store.get(owner);
      let update: Update;
      request.onsuccess = () => {
        const takes: NarrationTake[] = request.result ?? [];
        update = change ? change(takes) : { takes };
        if (update.added) store.put(update.takes, owner);
      };
      tx.oncomplete = () => resolve(update);
      tx.onabort = () => reject(tx.error ?? new Error('Não foi possível guardar a narração neste navegador.'));
    });
  }

  return {
    read: async () => (await access()).takes,
    add: (input: NewTake, replace: string | true | undefined) => access(takes => appendTake(takes, input, replace)),
  };
}
