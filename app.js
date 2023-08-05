var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
var aboutRouter = require('./routes/about');
var highscoresRouter = require('./routes/highscores');
var usersRouter = require('./routes/users');
var gameMenuRouter = require('./routes/gamemenu');
var gameRouter = require('./routes/game');
var postGameRouter = require('./routes/postgame');
var saveJsonRouter = require('./routes/savejson');
var loadConfigRouter = require('./routes/loadconfig');
var tournPrefsRouter = require('./routes/tournprefs');
var tournLobbyRouter = require('./routes/tournlobby');
var tournBracketRouter = require('./routes/tournbracket');
var demoRouter = require('./routes/demo');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/about', aboutRouter);
app.use('/highscores', highscoresRouter);
app.use('/users', usersRouter);
app.use('/gamemenu', gameMenuRouter);
app.use('/game', gameRouter);
app.use('/postgame', postGameRouter);
app.use('/savejson', saveJsonRouter);
app.use('/loadconfig', loadConfigRouter);
app.use('/tournprefs', tournPrefsRouter);
app.use('/tournlobby', tournLobbyRouter);
app.use('/tournbracket', tournBracketRouter);
app.use('/demo', demoRouter);


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
