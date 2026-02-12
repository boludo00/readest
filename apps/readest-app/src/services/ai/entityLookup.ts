import type { BookEntity } from './types';

export class EntityLookupIndex {
  private nameMap = new Map<string, string>();

  buildFromEntities(entities: BookEntity[]): void {
    this.nameMap.clear();
    for (const entity of entities) {
      this.nameMap.set(entity.name.toLowerCase(), entity.id);
      for (const alias of entity.aliases) {
        this.nameMap.set(alias.toLowerCase(), entity.id);
      }
    }
  }

  lookup(text: string): string | undefined {
    return this.nameMap.get(text.toLowerCase());
  }

  lookupAll(text: string): string[] {
    const lowerText = text.toLowerCase();
    const matches: string[] = [];
    for (const [name, id] of this.nameMap) {
      if (lowerText.includes(name)) {
        if (!matches.includes(id)) {
          matches.push(id);
        }
      }
    }
    return matches;
  }
}
