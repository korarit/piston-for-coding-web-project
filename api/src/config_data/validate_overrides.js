function validate_overrides(overrides) {
    for (const language in overrides) {
        for (const key in overrides[language]) {
            const value = overrides[language][key];
            const option = options[key];
            const validators = option.validators;
            const validation_response = apply_validators(validators, [
                value,
                value,
            ]);
            if (validation_response !== true) {
                return `In overridden option ${key} for ${language}, ${validation_response}`;
            }
        }
    }
    return true;
}

module.exports = validate_overrides;