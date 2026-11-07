// The auth mount for this route is declared after it, so Express never applies it (F2.6 tests).
export function late () {
  return async (req, res) => res.json(await NoteModel.findAll())
}
