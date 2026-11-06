/**
 * The refs of the latest observation (`e1` → role, exact name, position among equals), as the
 * observation builder hands them over. The executor turns a ref back into an ElementTarget.
 */
export type RefMap = ReadonlyMap<
  string,
  { readonly role: string; readonly name: string; readonly nth: number }
>;
