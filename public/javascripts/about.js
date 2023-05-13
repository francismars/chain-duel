import { listenToGamepads } from "./gamepads.js";

let buttonSelected="mainMenuButton";
let pageSelected=1;

function displayPage(){
    switch(pageSelected){
        case 1:
            document.getElementById("page-5").style.display = "none";
            document.getElementById("page-1").style.display = "block";            
            document.getElementById("page-2").style.display = "none";
        break;
        case 2:
            document.getElementById("page-1").style.display = "none";
            document.getElementById("page-2").style.display = "block";
            document.getElementById("page-3").style.display = "none";
        break;
        case 3:
            document.getElementById("page-2").style.display = "none";
            document.getElementById("page-3").style.display = "block";
            document.getElementById("page-4").style.display = "none";
        break;
        case 4:
            document.getElementById("page-3").style.display = "none";
            document.getElementById("page-4").style.display = "block";
            document.getElementById("page-5").style.display = "none";
        break;
        case 5:
            document.getElementById("page-4").style.display = "none";
            document.getElementById("page-5").style.display = "block";
            document.getElementById("page-1").style.display = "none";
        break;
    }
}

addEventListener("keydown", function(event) {
    if (event.key === "Enter" || event.key === " ") {
        if(buttonSelected=="mainMenuButton"){
            window.location.href = "/"; 
        }  
        if(buttonSelected=="nextButton"){
            pageSelected=(pageSelected+1)
            if (pageSelected==6){ pageSelected=1 }
            displayPage(); 
        } 
        if(buttonSelected=="prevButton"){
            pageSelected-=1
            if (pageSelected==0){ pageSelected=5 }
            displayPage(); 
        }             
    }    
    if (event.key === "ArrowUp" || event.key === "w") {
        if(buttonSelected=="mainMenuButton"){
            document.getElementById("mainmenubutton").style.animationDuration  = "0s";
            document.getElementById("nextButton").style.animationDuration  = "2s";
            buttonSelected="nextButton";
        } 
    }
    if (event.key === "ArrowDown" || event.key === "s") {
        if(buttonSelected=="nextButton" || buttonSelected=="prevButton"){
            document.getElementById("mainmenubutton").style.animationDuration  = "2s";
            document.getElementById("nextButton").style.animationDuration  = "0s";
            document.getElementById("prevButton").style.animationDuration  = "0s";
            buttonSelected="mainMenuButton";
        } 
    }
    if (event.key === "ArrowLeft" || event.key === "a") {
        if(buttonSelected=="nextButton"){
            document.getElementById("nextButton").style.animationDuration  = "0s";
            document.getElementById("prevButton").style.animationDuration  = "2s";
            buttonSelected="prevButton";
        } 
    }
    if (event.key === "ArrowRight" || event.key === "d") {
        if(buttonSelected=="prevButton"){
            document.getElementById("prevButton").style.animationDuration  = "0s";
            document.getElementById("nextButton").style.animationDuration  = "2s";
            buttonSelected="nextButton";
        } 
    }
});

let intervalStart = setInterval(listenToGamepads, 1000/10);