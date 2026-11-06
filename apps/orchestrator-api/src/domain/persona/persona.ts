import type { ModelRole } from '@janus/shared-kernel';

import { InvalidPersonaError } from './invalid-persona-error.js';
import { PatienceBudget, type PatienceLimits } from './patience-budget.js';
import { isPersonaBias, type PersonaBias } from './persona-bias.js';

export type PersonaDevice = 'desktop' | 'mobile';
export type TrustSensitivity = 'low' | 'medium' | 'high';
export type PersonaModelRole = Extract<ModelRole, 'navigator' | 'competent-baseline'>;

export interface PersonaProps {
  /** Slug, also used as the agentId prefix of its sessions. */
  readonly id: string;
  readonly name: string;
  /** Who they are, in a sentence or two. Goes into the prompt. */
  readonly profile: string;
  /** What they came to do. */
  readonly goal: string;
  /** 1 (rarely uses the web) to 5 (fluent). */
  readonly digitalLiteracy: number;
  readonly patience: PatienceLimits;
  readonly device: PersonaDevice;
  /** BCP 47 language tag, e.g. es-ES. */
  readonly locale: string;
  readonly trustSensitivity: TrustSensitivity;
  readonly biases: readonly PersonaBias[];
  readonly modelRole: PersonaModelRole;
  /** One line on why this persona is in the set. Not shown to the agent. */
  readonly rationale: string;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,47}$/;
const LOCALE = /^[a-z]{2,3}(-[A-Z]{2})?$/;

/** A synthetic user the navigator agent plays (F1.3). Never based on real personal data. */
export class Persona {
  readonly id: string;
  readonly name: string;
  readonly profile: string;
  readonly goal: string;
  readonly digitalLiteracy: number;
  readonly patience: PatienceBudget;
  readonly device: PersonaDevice;
  readonly locale: string;
  readonly trustSensitivity: TrustSensitivity;
  readonly biases: readonly PersonaBias[];
  readonly modelRole: PersonaModelRole;
  readonly rationale: string;

  private constructor(props: PersonaProps) {
    this.id = props.id;
    this.name = props.name;
    this.profile = props.profile;
    this.goal = props.goal;
    this.digitalLiteracy = props.digitalLiteracy;
    this.patience = new PatienceBudget(props.patience, props.id);
    this.device = props.device;
    this.locale = props.locale;
    this.trustSensitivity = props.trustSensitivity;
    this.biases = [...props.biases];
    this.modelRole = props.modelRole;
    this.rationale = props.rationale;
  }

  /** The same persona with at most `maxSteps` of patience (a run's step limit, F1.7). */
  withMaxSteps(maxSteps: number): Persona {
    if (maxSteps >= this.patience.maxSteps) return this;
    return Persona.create({
      id: this.id,
      name: this.name,
      profile: this.profile,
      goal: this.goal,
      digitalLiteracy: this.digitalLiteracy,
      patience: { maxSteps, maxSeconds: this.patience.maxSeconds },
      device: this.device,
      locale: this.locale,
      trustSensitivity: this.trustSensitivity,
      biases: this.biases,
      modelRole: this.modelRole,
      rationale: this.rationale,
    });
  }

  static create(props: PersonaProps): Persona {
    const fail = (reason: string) => new InvalidPersonaError(props.id, reason);
    if (!SLUG.test(props.id)) throw fail('id must be a lowercase slug of up to 48 characters');
    for (const [field, value, max] of [
      ['name', props.name, 60],
      ['profile', props.profile, 400],
      ['goal', props.goal, 300],
      ['rationale', props.rationale, 200],
    ] as const) {
      if (value.trim() === '' || value.length > max) {
        throw fail(`${field} must be 1 to ${String(max)} characters`);
      }
    }
    if (props.rationale.includes('\n')) throw fail('rationale must be one line');
    if (
      !Number.isInteger(props.digitalLiteracy) ||
      props.digitalLiteracy < 1 ||
      props.digitalLiteracy > 5
    ) {
      throw fail('digitalLiteracy must be an integer from 1 to 5');
    }
    if (!LOCALE.test(props.locale)) throw fail('locale must be a language tag such as es-ES');
    // Checked as plain strings: props may come from data the type system never saw.
    const biases: readonly string[] = props.biases;
    const unknown = biases.find((bias) => !isPersonaBias(bias));
    if (unknown !== undefined) throw fail(`unknown bias ${unknown}`);
    if (new Set(biases).size !== biases.length) throw fail('biases repeat');
    const modelRole: string = props.modelRole;
    if (modelRole !== 'navigator' && modelRole !== 'competent-baseline') {
      throw fail('modelRole must be navigator or competent-baseline');
    }
    if (
      props.modelRole === 'competent-baseline' &&
      (props.biases.length > 0 || props.digitalLiteracy !== 5)
    ) {
      throw fail('the competent baseline has no biases and full digital literacy');
    }
    return new Persona(props);
  }
}
