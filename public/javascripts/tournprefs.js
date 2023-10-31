import { listenToGamepads } from "./gamepads.js";
let intervalStart = setInterval(listenToGamepads, 1000/10);

let playersNumber = 4;
let deposit = 10000;
let buttonSelected = "mainMenuButton";

function increasePlayers(){
    if (playersNumber<16){
        playersNumber=playersNumber*2;
        document.getElementById("numberOfPlayers").innerText = playersNumber;
    }
}

function decreasePlayers(){
    if (playersNumber>4){
        playersNumber=playersNumber/2;
        document.getElementById("numberOfPlayers").innerText = playersNumber;
    }
}

function decreaseDeposit(){
    if (deposit>10000){
        deposit-=10000;
        document.getElementById("depositValue").innerText = deposit.toLocaleString();
    }
}

function increaseDeposit(){
    if (deposit<100000){
        deposit+=10000;
        document.getElementById("depositValue").innerText = deposit.toLocaleString();
    }
}

function continueTournament(){
    window.location.href = "/tournbracket?players="+playersNumber+"&deposit="+deposit
    
}

addEventListener("keydown", function(event) {
    if (event.key === "Enter" || event.key === " ") {
        if(buttonSelected=="mainMenuButton"){
            window.location.href = "/"; 
        }         
        else if(buttonSelected=="decreaseDepositButton"){
            decreaseDeposit();
        }
        else if(buttonSelected=="increaseDepositButton"){
            increaseDeposit();
        }
        else if(buttonSelected=="decreasePlayersButton"){
            decreasePlayers();
        }
        else if(buttonSelected=="increasePlayersButton"){
            increasePlayers();
        }
        else if(buttonSelected=="continueButton"){
            continueTournament();
        }
    }    
    if (event.key === "ArrowUp" || event.key === "w") {
        if(buttonSelected=="mainMenuButton"){
            document.getElementById("mainmenubutton").style.animationDuration  = "0s";
            document.getElementById("continueButton").style.animationDuration  = "2s";
            buttonSelected="continueButton";
        } 
        else if(buttonSelected=="continueButton"){
            document.getElementById("continueButton").style.animationDuration  = "0s";
            document.getElementById("increaseDepositButton").style.animationDuration  = "2s";
            buttonSelected="increaseDepositButton";
        } 
        else if(buttonSelected=="increaseDepositButton"){
            document.getElementById("increaseDepositButton").style.animationDuration  = "0s";
            document.getElementById("increasePlayersButton").style.animationDuration  = "2s";
            buttonSelected="increasePlayersButton";
        }
        else if(buttonSelected=="decreaseDepositButton"){
            document.getElementById("decreaseDepositButton").style.animationDuration  = "0s";
            document.getElementById("decreasePlayersButton").style.animationDuration  = "2s";
            buttonSelected="decreasePlayersButton";
        }
    }
    if (event.key === "ArrowDown" || event.key === "s") {
        if(buttonSelected=="increaseDepositButton"){            
            document.getElementById("increaseDepositButton").style.animationDuration  = "0s";
            document.getElementById("continueButton").style.animationDuration  = "2s";
            buttonSelected = "continueButton";
        } 
        else if(buttonSelected=="continueButton"){
            document.getElementById("continueButton").style.animationDuration  = "0s";
            document.getElementById("mainmenubutton").style.animationDuration  = "2s";
            buttonSelected="mainMenuButton";
        } 
        else if(buttonSelected=="increasePlayersButton"){            
            document.getElementById("increasePlayersButton").style.animationDuration  = "0s";
            document.getElementById("increaseDepositButton").style.animationDuration  = "2s";
            buttonSelected = "increaseDepositButton";
        } 
        else if(buttonSelected=="decreasePlayersButton"){            
            document.getElementById("decreasePlayersButton").style.animationDuration  = "0s";
            document.getElementById("decreaseDepositButton").style.animationDuration  = "2s";
            buttonSelected = "decreaseDepositButton";
        } 
        else if(buttonSelected=="decreaseDepositButton"){            
            document.getElementById("decreaseDepositButton").style.animationDuration  = "0s";
            document.getElementById("continueButton").style.animationDuration  = "2s";
            buttonSelected = "continueButton";
        } 
    }
    if (event.key === "ArrowLeft" || event.key === "a") {
        if(buttonSelected=="increaseDepositButton"){            
            document.getElementById("increaseDepositButton").style.animationDuration  = "0s";
            document.getElementById("decreaseDepositButton").style.animationDuration  = "2s";
            buttonSelected = "decreaseDepositButton";
        }  
        else if(buttonSelected=="increasePlayersButton"){            
            document.getElementById("increasePlayersButton").style.animationDuration  = "0s";
            document.getElementById("decreasePlayersButton").style.animationDuration  = "2s";
            buttonSelected = "decreasePlayersButton";
        }  
    }
    if (event.key === "ArrowRight" || event.key === "d") {
        if(buttonSelected=="decreaseDepositButton"){            
            document.getElementById("decreaseDepositButton").style.animationDuration  = "0s";
            document.getElementById("increaseDepositButton").style.animationDuration  = "2s";
            buttonSelected = "increaseDepositButton";
        } 
        else if(buttonSelected=="decreasePlayersButton"){            
            document.getElementById("decreasePlayersButton").style.animationDuration  = "0s";
            document.getElementById("increasePlayersButton").style.animationDuration  = "2s";
            buttonSelected = "increasePlayersButton";
        } 
    }
});