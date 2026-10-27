var express = require('express');
var router = express.Router();
const path = require('path');
const fs = require('fs');

/* GET home page. */


router.post('/', function(req, res, next) {
    console.log("Preparing to save Highscores JSON")
    console.log(req.body)

    const data = JSON.stringify(req.body)

    // write JSON string to a file
    fs.writeFile('./public/files/highscores.json', data, err => {
    if (err) {
        throw err
    }
    console.log('JSON data is saved.')
    res.send({ "body": "Success" })  
    })
});

module.exports = router;
