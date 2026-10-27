var express = require('express');
var router = express.Router();
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

/* GET home page. */


router.get('/', function(req, res, next) {
  
  console.log(`Your IP: ${process.env.IP}`);

  res.sendFile(path.join(__dirname+'/../views/gamemenu.html'), `{"IP":${process.env.IP}}`);
});

module.exports = router;
