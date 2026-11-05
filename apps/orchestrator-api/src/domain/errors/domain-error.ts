// Base class for every error the domain can raise. Adapters translate infrastructure
// errors into subclasses so callers never see vendor error types.
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
