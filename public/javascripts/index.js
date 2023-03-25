
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