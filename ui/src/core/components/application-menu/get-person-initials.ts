export function getPersonInitials(name: string): string {
  const nameParts = name.split(/\s+/).filter(Boolean);
  const firstName = nameParts.at(0);
  const lastName = nameParts.length > 1 ? nameParts.at(-1) : undefined;
  const result = [firstName, lastName]
    .filter((namePart): namePart is string => namePart !== undefined)
    .map((namePart) => namePart[0]?.toUpperCase())
    .join('');

  return result;
}
