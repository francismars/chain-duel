
menu = 1;
addEventListener("keydown", function(event) {
    if (event.key === "Enter") {
      if(menu==1){
        window.location.href = "/gamemenu";
      }
      else if(menu==2){
        window.location.href = "/about";
      }
      else if(menu==3){
        window.location.href = "/highscores";
      }
    }
    if (event.key === "ArrowDown"){
      if(menu==1){
        menu = 2;
        document.getElementById("startgame").style.animationDuration  = "0s";
        document.getElementById("aboutbutton").style.animationDuration  = "2s";
      }
      else if(menu==2){
        menu = 3;
        document.getElementById("highscoresbutton").style.animationDuration  = "2s";
        document.getElementById("aboutbutton").style.animationDuration  = "0s";
      }
    }
    if (event.key === "ArrowUp"){
      if(menu==2){
        menu = 1;
        document.getElementById("startgame").style.animationDuration  = "2s";
        document.getElementById("aboutbutton").style.animationDuration  = "0s";
      }
      else if(menu==3){
        menu = 2;
        document.getElementById("aboutbutton").style.animationDuration  = "2s";
        document.getElementById("highscoresbutton").style.animationDuration  = "0s";
      }
    }
  });


  intervalStart = setInterval(updateGamepads, 1000/10);

  // Define the two gamepads
  let gamepad1 = null;
  let gamepad2 = null;

  function updateGamepads() {
    // Check for gamepad connection
    if (navigator.getGamepads()[0]) {
      if(gamepad1==null){
          console.log("Gamepad 1 connected")
      }
      gamepad1 = navigator.getGamepads()[0];
      if(gamepad1.buttons[0].pressed==true || gamepad1.buttons[1].pressed==true || gamepad1.buttons[2].pressed==true || gamepad1.buttons[3].pressed==true){
          window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'Enter'}));
      }
      if(gamepad1.buttons[12].pressed==true){
          window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowUp'}));
      }
      if(gamepad1.buttons[13].pressed==true){
          window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowDown'}));
      }
    }
    if (navigator.getGamepads()[1]) {
      if(gamepad2==null){
          console.log("Gamepad 2 connected")
      }
      gamepad2 = navigator.getGamepads()[1];
      if(gamepad2.buttons[0].pressed==true || gamepad2.buttons[1].pressed==true || gamepad2.buttons[2].pressed==true || gamepad2.buttons[3].pressed==true){
          window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'Enter'}));
      }
      if(gamepad2.buttons[12].pressed==true){
          window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowUp'}));
      }
      if(gamepad2.buttons[13].pressed==true){
          window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowDown'}));
      }
    }
  }
  