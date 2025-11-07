import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type { OmlAstType, Concept } from './generated/ast.js';
import type { OmlServices } from './oml-module.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: OmlServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.OmlValidator;
    const checks: ValidationChecks<OmlAstType> = {
        Concept: validator.checkConceptStartsWithCapital
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class OmlValidator {

    checkConceptStartsWithCapital(concept: Concept, accept: ValidationAcceptor): void {
        if (concept.name) {
            const firstChar = concept.name.substring(0, 1);
            if (firstChar.toUpperCase() !== firstChar) {
                accept('warning', 'Concept name should start with a capital.', { node: concept, property: 'name' });
            }
        }
    }

}
