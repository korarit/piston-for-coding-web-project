const Logger = require('logplease');
const logger = Logger.create('config');

const options = require('./config_data/options');

Object.freeze(options);

function apply_validators(validators, validator_parameters) {
    for (const validator of validators) {
        const validation_response = validator(...validator_parameters);
        if (validation_response !== true) {
            return validation_response;
        }
    }
    return true;
}

logger.info(`Loading Configuration from environment`);

let config = {};

for (const option_name in options) {
    const env_key = 'PISTON_' + option_name.to_upper_case();
    const option = options[option_name];
    const parser = option.parser || (x => x);
    const env_val = process.env[env_key];
    const parsed_val = parser(env_val);
    const value = env_val === undefined ? option.default : parsed_val;
    const validator_parameters =
        env_val === undefined ? [value, value] : [parsed_val, env_val];
    const validation_response = apply_validators(
        option.validators,
        validator_parameters
    );
    if (validation_response !== true) {
        logger.error(
            `Config option ${option_name} failed validation:`,
            validation_response
        );
        process.exit(1);
    }
    config[option_name] = value;
}

logger.info('Configuration successfully loaded');

module.exports = config;
