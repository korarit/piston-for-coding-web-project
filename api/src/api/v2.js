// const express = require('express');
// const router = express.Router();

const grpc = require('@grpc/grpc-js');


const runtime = require('../runtime');
const { Job } = require('../job');
const package = require('../package');
const logger = require('logplease').create('api/v2');

const SIGNALS = [
    'SIGABRT',
    'SIGALRM',
    'SIGBUS',
    'SIGCHLD',
    'SIGCLD',
    'SIGCONT',
    'SIGEMT',
    'SIGFPE',
    'SIGHUP',
    'SIGILL',
    'SIGINFO',
    'SIGINT',
    'SIGIO',
    'SIGIOT',
    'SIGKILL',
    'SIGLOST',
    'SIGPIPE',
    'SIGPOLL',
    'SIGPROF',
    'SIGPWR',
    'SIGQUIT',
    'SIGSEGV',
    'SIGSTKFLT',
    'SIGSTOP',
    'SIGTSTP',
    'SIGSYS',
    'SIGTERM',
    'SIGTRAP',
    'SIGTTIN',
    'SIGTTOU',
    'SIGUNUSED',
    'SIGURG',
    'SIGUSR1',
    'SIGUSR2',
    'SIGVTALRM',
    'SIGXCPU',
    'SIGXFSZ',
    'SIGWINCH',
];
// ref: https://man7.org/linux/man-pages/man7/signal.7.html

function get_job(body) {
    let {
        language,
        version,
        args,
        stdin,
        files,
        compile_memory_limit,
        run_memory_limit,
        run_timeout,
        compile_timeout,
    } = body;

    return new Promise((resolve, reject) => {
        if (!language || typeof language !== 'string') {
            return reject({
                message: 'language is required as a string',
            });
        }
        if (!version || typeof version !== 'string') {
            return reject({
                message: 'version is required as a string',
            });
        }
        if (!files || !Array.isArray(files)) {
            return reject({
                message: 'files is required as an array',
            });
        }
        for (const [i, file] of files.entries()) {
            if (typeof file.content !== 'string') {
                return reject({
                    message: `files[${i}].content is required as a string`,
                });
            }
        }

        const rt = runtime.get_latest_runtime_matching_language_version(
            language,
            version
        );
        if (rt === undefined) {
            return reject({
                message: `${language}-${version} runtime is unknown`,
            });
        }

        if (
            rt.language !== 'file' &&
            !files.some(file => !file.encoding || file.encoding === 'utf8')
        ) {
            return reject({
                message: 'files must include at least one utf8 encoded file',
            });
        }

        for (const constraint of ['memory_limit', 'timeout']) {
            for (const type of ['compile', 'run']) {
                const constraint_name = `${type}_${constraint}`;
                const constraint_value = body[constraint_name];
                const configured_limit = rt[`${constraint}s`][type];
                if (!constraint_value) {
                    continue;
                }
                if (typeof constraint_value !== 'number') {
                    return reject({
                        message: `If specified, ${constraint_name} must be a number`,
                    });
                }
                if (configured_limit <= 0) {
                    continue;
                }
                if (constraint_value > configured_limit) {
                    return reject({
                        message: `${constraint_name} cannot exceed the configured limit of ${configured_limit}`,
                    });
                }
                if (constraint_value < 0) {
                    return reject({
                        message: `${constraint_name} must be non-negative`,
                    });
                }
            }
        }

        compile_timeout = compile_timeout || rt.timeouts.compile;
        run_timeout = run_timeout || rt.timeouts.run;
        compile_memory_limit = compile_memory_limit || rt.memory_limits.compile;
        run_memory_limit = run_memory_limit || rt.memory_limits.run;
        resolve(
            new Job({
                runtime: rt,
                args: args || [],
                stdin: stdin || '',
                files,
                timeouts: {
                    run: run_timeout,
                    compile: compile_timeout,
                },
                memory_limits: {
                    run: run_memory_limit,
                    compile: compile_memory_limit,
                },
            })
        );
    });
}

async function executeAPI(call, callback){
    let job;

    logger.info('Executing job', call.request);

    let data = {
        ...call.request,
        compile_timeout: Number(call.request.compile_timeout),
        compile_memory_limit: Number(call.request.compile_memory_limit),
        run_memory_limit: Number(call.request.run_memory_limit),
    }
    try {
        job = await get_job(data);
    } catch (error) {
        return callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: error.message
        });
    }
    try {
        await job.prime();

        let result = await job.execute();
        // Backward compatibility when the run stage is not started
        if (result.run === undefined) {
            result.run = result.compile;
        }

        logger.info(`Jobexecuted successfully`, result);
        return callback(null, result);

    } catch (error) {
        logger.error(`Error executing job: ${job.uuid}:\n${error}`);
        return callback({
            message: 'Error executing job',
            code: grpc.status.INTERNAL
        });
    } finally {
        try {
            await job.cleanup(); // This gets executed before the returns in try/catch
        } catch (error) {
            logger.error(`Error cleaning up job: ${job.uuid}:\n${error}`);
            callback({
                message: 'Error cleaning up job',
                code: grpc.status.INTERNAL
            })
        }
    }
}


async function getRunTimeAPI(call, callback){

    logger.info('Getting runtimes');
    const runtimes = runtime.map(rt => {
        return {
            language: rt.language,
            version: rt.version.raw,
            aliases: rt.aliases,
            runtime: rt.runtime,
        };
    });

    callback(null, {runtimes: runtimes});
}

async function getPackageListAPI(call, callback){
    let packages = await package.get_package_list();

    packages = packages.map(pkg => {
        return {
            language: pkg.language,
            language_version: pkg.version.raw,
            installed: pkg.installed,
        };
    });

    callback(null, { packages: packages });
}

async function installPackageAPI(call, callback){
    let { language, version } = call.request;

    let pkg = await package.get_package(language, version);

    if (pkg == null) {
        return callback({
            message: `Requested package ${language}-${version} does not exist`,
            code: grpc.status.NOT_FOUND
        });
    }

    try {
        let response = await pkg.install();
        return callback(null, response);
    } catch (error) {
        logger.error(`Error while installing package ${pkg.language}-${pkg.version}:\n${error}`);
        return callbackcallback({
            message: error.message,
            code: grpc.status.INTERNAL
        });
    }
}

async function uninstallPackageAPI(call, callback){
    let { language, version } = call.request;

    let pkg = await package.get_package(language, version);

    if (pkg == null) {
        return callback({
            message: `Requested package ${language}-${version} does not exist`,
            code: grpc.status.NOT_FOUND
        });
    }

    try {
        let response = await pkg.uninstall();
        return callback(null, response);
    } catch (error) {
        logger.error(`Error while uninstalling package ${pkg.language}-${pkg.version}:\n${error}`);
        return callback({
            message: error.message,
            code: grpc.status.INTERNAL
        });
    }
}

module.exports = {executeAPI, getRunTimeAPI, getPackageListAPI, installPackageAPI, uninstallPackageAPI};
