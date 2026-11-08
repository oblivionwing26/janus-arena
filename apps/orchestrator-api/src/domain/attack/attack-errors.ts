import { DomainError } from '../errors/domain-error.js';

export class TestUserLoginError extends DomainError {
  readonly code = 'attack.test-user-login';
}

export class TestUserRegistrationError extends DomainError {
  readonly code = 'attack.test-user-registration';
}
