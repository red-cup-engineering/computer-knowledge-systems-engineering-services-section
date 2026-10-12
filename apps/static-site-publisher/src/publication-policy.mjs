// Publishing policy over cells admitted by CAIRN.

export function foundingDateRefusals(cells, founded) {
  if (founded === undefined) return [];
  return [...cells.values()]
    .filter((cell) => cell.status !== 'potential' && cell.dateCreated < founded && !cell.firstPublishedAt && !cell.archivedAt)
    .map((cell) => ({
      code: 'R-03',
      subject: cell.name,
      reason: `published cell "${cell.name}" is dated ${cell.dateCreated}, before site founding date ${founded}, but carries neither first-published-at nor archived-at`,
    }));
}
