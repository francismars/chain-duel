import { listenToGamepads } from "./gamepads.js";
sessionStorage.clear();
let menu = 1;
addEventListener("keydown", function(event) {
    if (event.key === "Enter" || event.key === " ") {
      if(menu==1){
        window.location.href = "/gamemenu";
      }
      else if(menu==2){
        window.location.href = "/tournprefs";
      }
      else if(menu==3){
        window.location.href = "/about";
      }
      else if(menu==4){
        window.location.href = "/highscores";
      }
    }
    if (event.key === "ArrowDown" || event.key === "s"){
      if(menu==1){
        menu = 2;
        document.getElementById("startgame").style.animationDuration  = "0s";
        document.getElementById("starttourn").style.animationDuration  = "2s";
      }
      else if(menu==2){
        menu = 3;
        document.getElementById("starttourn").style.animationDuration  = "0s";
        document.getElementById("aboutbutton").style.animationDuration  = "2s";
      }
    }
    if (event.key === "ArrowUp" || event.key === "w"){
      if(menu==2){
        menu = 1;
        document.getElementById("startgame").style.animationDuration  = "2s";
        document.getElementById("starttourn").style.animationDuration  = "0s";
      }
      else if(menu==3){
        menu = 2;
        document.getElementById("aboutbutton").style.animationDuration  = "0s";
        document.getElementById("starttourn").style.animationDuration  = "2s";
      }
      else if(menu==4){
        menu = 2;
        document.getElementById("highscoresbutton").style.animationDuration  = "0s";
        document.getElementById("starttourn").style.animationDuration  = "2s";
      }
    }
    if (event.key === "ArrowRight" || event.key === "d"){
      if(menu==3){
        menu = 4;
        document.getElementById("aboutbutton").style.animationDuration  = "0s";
        document.getElementById("highscoresbutton").style.animationDuration  = "2s"; 
      }
    }
    if (event.key === "ArrowLeft" || event.key === "a"){
      if(menu==4){
        menu = 3;
        document.getElementById("aboutbutton").style.animationDuration  = "2s";
        document.getElementById("highscoresbutton").style.animationDuration  = "0s"; 
      }
    }
  });

let intervalStart = setInterval(listenToGamepads, 1000/10);
