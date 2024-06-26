function parse_overrides(overrides_string) {
    function get_parsed_json_or_null(overrides) {
        try {
            return JSON.parse(overrides);
        } catch (e) {
            return null;
        }
    }

    const overrides = get_parsed_json_or_null(overrides_string);
    if (overrides === null) {
        return null;
    }
    const parsed_overrides = {};
    for (const language in overrides) {
        parsed_overrides[language] = {};
        for (const key in overrides[language]) {
            if (
                ![
                    'max_process_count',
                    'max_open_files',
                    'max_file_size',
                    'compile_memory_limit',
                    'run_memory_limit',
                    'compile_timeout',
                    'run_timeout',
                    'output_max_size',
                ].includes(key)
            ) {
                return null;
            }
            // Find the option for the override
            const option = options[key];
            const parser = option.parser;
            const raw_value = overrides[language][key];
            const parsed_value = parser(raw_value);
            parsed_overrides[language][key] = parsed_value;
        }
    }
    return parsed_overrides;
}

module.exports = parse_overrides;