/**
 * The native CSV column order for the player board.
 *
 * This lives in its own module so format translators (FantasyPros and any
 * future source) can target the native columns without importing the parser,
 * which would create a circular import.
 */
export const CSV_HEADERS: string[] = [
  'name',
  'team',
  'position',
  'bye',
  'overallRank',
  'posRank',
  'tier',
  'adp',
  'projPoints',
  'upside',
  'floor',
  'risk',
  'notes',
  'tags',
  'rationale',
  'customRank',
]
