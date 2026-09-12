/** The schedule may enrich assigned classes, but must never grant access. */
export function teacherClassSubjects(
  assignedClasses: readonly string[],
  slots: readonly { classe: string; subject?: string }[] = [],
): Map<string, Set<string>> {
  const subjects = new Map(assignedClasses.map(classe => [classe, new Set<string>()]))
  for (const slot of slots) {
    const assigned = subjects.get(slot.classe)
    if (assigned && slot.subject) assigned.add(slot.subject)
  }
  return subjects
}
