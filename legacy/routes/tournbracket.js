var express = require('express');
var router = express.Router();
const path = require('path');

/* GET home page. */


router.get('/', function(req, res, next) {
  res.sendFile(path.join(__dirname+'/../views/tournbracket.html'));
});

module.exports = router;
