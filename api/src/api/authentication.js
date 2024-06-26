const config = require('../config');

function authentication(req, res, next) {
    const auth = req.headers.authorization;

    //ตรวจสอบว่ามี Authorization header หรือไม่
    if (!auth) {
        return res.status(401).json({message: "Unauthorized"});
    }
    const get_token = auth.split(" ");

    //ตรวจสอบว่า Authorization header มีรูปแบบ Bearer <token> หรือไม่
    if (get_token[0] != "Bearer" || get_token.length != 2 || !get_token[1]) {
        return res.status(401).json({message: "Unauthorized Authentication header format is Bearer <token>"});
    }

    //ตรวจสอบว่า Authorization header ตรงกับ login token หรือไม่
    if (get_token[1] == config.authentication) {
        next();
    } else {
        return res.status(401).json({message: "Unauthorized"});
    }
}

module.exports = authentication;