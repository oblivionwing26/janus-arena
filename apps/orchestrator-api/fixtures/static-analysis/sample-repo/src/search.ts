// Sample code for the static analysis fixtures (F2.5): deliberately unsafe, never run.
export function showQuery(sanitizer: { bypassSecurityTrustHtml(value: string): unknown }, query: string) {
  return sanitizer.bypassSecurityTrustHtml(query);
}
