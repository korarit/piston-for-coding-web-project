#!/usr/bin/env node
require('nocamel');
const Logger = require('logplease');

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const packageDefinition = protoLoader.loadSync(path.join(__dirname, './protos/service.proto'),{
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
});
const degreeProto = grpc.loadPackageDefinition(packageDefinition);

const expressWs = require('express-ws');
const globals = require('./globals');
const config = require('./config');
const path = require('path');
const fs = require('fs/promises');
const fss = require('fs');
const body_parser = require('body-parser');
const runtime = require('./runtime');

const logger = Logger.create('index');
(async () => {

    ////////////////////////////// CONFIGURATION //////////////////////////////

    logger.info('Setting loglevel to', config.log_level);
    Logger.setLogLevel(config.log_level);
    logger.debug('Ensuring data directories exist');

    Object.values(globals.data_directories).for_each(dir => {
        let data_path = path.join(config.data_directory, dir);

        logger.debug(`Ensuring ${data_path} exists`);

        if (!fss.exists_sync(data_path)) {
            logger.info(`${data_path} does not exist.. Creating..`);

            try {
                fss.mkdir_sync(data_path);
            } catch (e) {
                logger.error(`Failed to create ${data_path}: `, e.message);
            }
        }
    });
    fss.chmodSync(
        path.join(config.data_directory, globals.data_directories.jobs),
        0o711
    );


    ////////////////////////////// LOAD PACKAGES //////////////////////////////

    logger.info('Loading packages');
    const pkgdir = path.join(
        config.data_directory,
        globals.data_directories.packages
    );

    const pkglist = await fs.readdir(pkgdir);

    const languages = await Promise.all(
        pkglist.map(lang => {
            return fs.readdir(path.join(pkgdir, lang)).then(x => {
                return x.map(y => path.join(pkgdir, lang, y));
            });
        })
    );

    const installed_languages = languages
        .flat()
        .filter(pkg =>
            fss.exists_sync(path.join(pkg, globals.pkg_installed_file))
        );

    installed_languages.for_each(pkg => runtime.load_package(pkg));


    ////////////////////////////// API SERVER //////////////////////////////

    logger.info('Starting API Server');
    logger.debug('Constructing Express App');
    logger.debug('Registering middleware');

    app.use(body_parser.urlencoded({ extended: true }));
    app.use(body_parser.json());

    app.use((err, req, res, next) => {
        return res.status(400).send({
            stack: err.stack,
        });
    });

    logger.debug('Registering Routes');

    const {executeAPI, router} = require('./api/v2');
    app.use('/api/v2', router);

    const { version } = require('../package.json');

    app.get('/', (req, res, next) => {
        return res.status(200).send({ message: `Piston v${version}` });
    });

    app.use((req, res, next) => {
        return res.status(404).send({ message: 'Not Found' });
    });

    logger.debug('Calling app.listen');
    const [address, port] = config.bind_address.split(':');

    const server = app.listen(port, address, () => {
        logger.info('API server started on', config.bind_address);
    });

    //////////////////////////// MICROSERVICE SERVER ////////////////////////////
    const serverMicro = new grpc.Server();

    server.addService(degreeProto.ExcuteCodeService.service, { sendtoexcutecode: findDegree });
    server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
        server.start();
    });
    


    process.on('SIGTERM', () => {
        server.close();
        process.exit(0)
    });
})();
