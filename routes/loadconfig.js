var express = require('express');
var router = express.Router();
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

/* GET home page. */


router.get('/', function(req, res, next) {
    res.setHeader("Content-Type", "application/json");
    data = {"IP":process.env.IP_SOCKET, "PORT":process.env.PORT_SOCKET}
    res.send(data);
});

module.exports = router;
