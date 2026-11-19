// The sections of the launch page, in order. The index in the hero and the side rail read
// from here; a section is listed only once it is built (docs/design/launch-page.md).
export const SECTIONS = [
  { id: 'problem', label: 'The problem' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'attack-tree', label: 'The attack tree' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

export function sectionNumber(id: SectionId): string {
  const i = SECTIONS.findIndex((s) => s.id === id);
  return String(i + 1).padStart(2, '0');
}
