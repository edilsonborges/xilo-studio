// Leitor do CHANGELOG.md (formato Keep a Changelog) para o modal de novidades.

export interface Release {
  version: string;
  date: string;
  intro: string[];
  sections: Array<{ title: string; items: string[] }>;
}

/** Lê o formato Keep a Changelog: "## [x.y.z] - data", "### Seção" e listas. */
export function parseChangelog(text: string): Release[] {
  const releases: Release[] = [];
  let release: Release | null = null;
  let items: string[] | null = null;
  for (const raw of text.split('\n')) {
    const heading = /^## \[(\d+\.\d+\.\d+)\](?: - (\S+))?/.exec(raw);
    if (heading) {
      release = { version: heading[1], date: heading[2] ?? '', intro: [], sections: [] };
      releases.push(release);
      items = null;
      continue;
    }
    if (!release) continue;
    const section = /^### (.+)/.exec(raw);
    if (section) {
      items = [];
      release.sections.push({ title: section[1].trim(), items });
      continue;
    }
    const line = raw.trim();
    if (!line) continue;
    const bullet = /^\s*- (.+)/.exec(raw);
    if (bullet && items) {
      // sub-item ("  - ...") vira continuação do item anterior
      if (/^\s{2,}- /.test(raw) && items.length) items[items.length - 1] += ` ${bullet[1].trim()}`;
      else items.push(bullet[1].trim());
    } else if (items?.length) {
      items[items.length - 1] += ` ${line}`;
    } else if (!items) {
      release.intro.push(line);
    }
  }
  return releases;
}
