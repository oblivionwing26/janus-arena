// Test cases for xss-sinks.yaml: `ruleid` lines must match, `ok` lines must not.

class SearchResult {
  constructor(private readonly sanitizer: { bypassSecurityTrustHtml(value: string): unknown }) {}

  show(queryParam: string) {
    // ruleid: janus.angular-bypass-security-trust
    this.searchValue = this.sanitizer.bypassSecurityTrustHtml(queryParam);
    // ruleid: janus.angular-bypass-security-trust
    this.badge = this.sanitizer.bypassSecurityTrustHtml(`<span>${queryParam}</span>`);
    // ok: janus.angular-bypass-security-trust
    this.icon = this.sanitizer.bypassSecurityTrustHtml('<i class="icon"></i>');
  }

  searchValue: unknown;
  badge: unknown;
  icon: unknown;
}

function render(element: HTMLElement, comment: string) {
  // ruleid: janus.dom-inner-html
  element.innerHTML = comment;
  // ok: janus.dom-inner-html
  element.innerHTML = '<div>&times;</div>';
  // ok: janus.dom-inner-html
  element.textContent = comment;
}

export { SearchResult, render };
