import { listenToGamepads } from "./gamepads.js";

let serverIP;
let serverPORT;
await fetch('./files/config.json')
    .then((response) => response.json())
    .then((json) => {
        serverIP = json.serverIP
        serverPORT = json.serverPort
    });

var gameWinner = sessionStorage.getItem('gameWinner');
var p1Name = sessionStorage.getItem("P1Name");
var p2Name = sessionStorage.getItem("P2Name");
var winnerName;
if (gameWinner!=null){
    if(gameWinner=="Player 1" && p1Name!=null){
        winnerName = p1Name
    }
    else if(gameWinner=="Player 2" && p2Name!=null){
        winnerName = p2Name
    }
    if(winnerName!=null){
        document.getElementById("winner").innerText  = winnerName.toUpperCase()+" WINS";
    }
}
var withdrawalURL = sessionStorage.getItem('LNURL');
if (withdrawalURL!=null){
    let qrcodeContainer = document.getElementById("qrCode1");
    qrcodeContainer.innerHTML = "";
    new QRious({
        element: qrcodeContainer,
        value: withdrawalURL
    });
}
var totalPrize = sessionStorage.getItem('LNURLMAXW');
if (totalPrize!=null){
    document.getElementById("prize").innerText  = parseInt(totalPrize).toLocaleString()+" SATS";
}
var P1SatsDeposit = sessionStorage.getItem('P1Sats');
var P2SatsDeposit = sessionStorage.getItem('P2Sats');
if (P1SatsDeposit!=null && P2SatsDeposit!=null){
    var developerFee = Math.floor((parseInt(P1SatsDeposit)+parseInt(P2SatsDeposit))*0.01)
    var designerFee = Math.floor((parseInt(P1SatsDeposit)+parseInt(P2SatsDeposit))*0.005)
    document.getElementById("hostFee").innerText  = "1% ("+developerFee.toLocaleString()+" sats) for the host";
    document.getElementById("developerFee").innerText  = "1% ("+developerFee.toLocaleString()+" sats) for the developer";
    document.getElementById("designerFee").innerText  = "1% ("+designerFee.toLocaleString()+" sats) for the developer";
}


let menu = 1;
let activeButtonMenu1 = 0;
let activeButtonMenu3 = 0;
let qrRevealed = 0
addEventListener("keydown", function(event) {
    switch (event.key) {
        case "Enter":
            if(menu==1 && activeButtonMenu1==0){
                menu2CSS();
                qrRevealed = 1;
            }
            else if(menu==1 && activeButtonMenu1==1 && qrRevealed==0){
                sessionStorage.clear();
                if (gameWinner!=null && totalPrize!=null && winnerName!=undefined){
                    sessionStorage.setItem("donPlayer", gameWinner);
                    sessionStorage.setItem("donName", winnerName);
                    sessionStorage.setItem("donPrize", totalPrize);
                }
                window.location.href = "/gamemenu";
            }
            else if(menu==2){
                menu1CSS();
            }
            else if(menu==3){
                if(activeButtonMenu3==0){
                    sessionStorage.clear();
                    window.location.href = "/highscores";
                }
                else if(activeButtonMenu3==1){
                    sessionStorage.clear();
                    window.location.href = "/";
                }
            }
            break;
        case "ArrowDown":
            if(menu==1 && activeButtonMenu1==0){
                document.getElementById("doubleornotthingbutton").style.animationDuration  = "2s";
                document.getElementById("claimbutton").style.animationDuration  = "0s";
                activeButtonMenu1=1;
            }
            break;
        case "ArrowUp":
            if(menu==1 && activeButtonMenu1==1){
                document.getElementById("doubleornotthingbutton").style.animationDuration  = "0s";
                document.getElementById("claimbutton").style.animationDuration  = "2s";
                activeButtonMenu1=0;
            }
            break;    
        case "ArrowRight":
            if(menu==3 && activeButtonMenu3==0){
                document.getElementById("startnewbutton").style.animationDuration  = "2s";
                document.getElementById("claimbutton").style.animationDuration  = "0s";
                activeButtonMenu3=1;
            }
            break;
        case "ArrowLeft":
            if(menu==3 && activeButtonMenu3==1){
                document.getElementById("claimbutton").style.animationDuration  = "2s";
                document.getElementById("startnewbutton").style.animationDuration  = "0s";
                activeButtonMenu3=0;
            }
            break;
    }
});

function updateHSJson(){
    fetch('./files/highscores.json')
    .then((response) => response.json())
    .then((json) => {
        highscores = json

        orderedScores = highscores.sort((a, b) => {
            if (a.prize > b.prize) {
              return -1;
            }
          });

        sizeHS = (orderedScores.length)-1
        if(orderedScores[sizeHS].prize<totalPrize){
          // {"p1Name":"SELLIX5","p1sats":100,"p2Name":"Pedro5","p2sats":100,"winner":"Player1","prize":196}
          console.log("Mudar hs file")
          console.log(orderedScores[sizeHS].prize)
          console.log(totalPrize)
          orderedScores[sizeHS].p1Name = p1Name
          orderedScores[sizeHS].p1sats = parseInt(P1SatsDeposit)
          orderedScores[sizeHS].p2Name = p2Name
          orderedScores[sizeHS].p2sats = parseInt(P2SatsDeposit)
          orderedScores[sizeHS].winner = gameWinner;
          orderedScores[sizeHS].prize = parseInt(totalPrize);       
          
          const data = JSON.stringify(orderedScores)
          // write JSON string to a file  
          fetch('http://127.0.0.1:3000/savejson', {
              method: 'POST',
              headers: {
                "Content-Type": "application/json"
              },
              body: data,
          })
          .then(response => response.json())
          .then(data => {
              console.log(data);
          })
        }
    })
}



const socket = io(serverIP+":"+serverPORT , { transports : ['websocket'] });
socket.on("connect", () => {
    console.log(`connected with id: ${socket.id}`)
})
//socket.onAny((event, ...args) => {
//    console.log(event, args);
//});

socket.on('prizeWithdrawn', (data) => {
    if(data.lnurlw==sessionStorage.getItem('LNURLID')){
        menu3CSS();
        updateHSJson();
    }
})

function menu1CSS(){
    document.getElementById("gameOver").style.display = "block";
    document.getElementById("claimbutton").innerText = "SWEEP VIA LNURL";
    document.getElementById("qrCode1").classList.add('blur');
    menu=1;
}

function menu2CSS(){
    document.getElementById("claimbutton").innerText = "BLUR QR CODE";
    document.getElementById("qrCode1").classList.remove('blur');
    menu=2;
}

function menu3CSS(){
    if(menu==1){
        menu1CSS()
    }
    document.getElementById("prize").innerText += " CLAIMED"
    document.getElementById("qrCode1").style.display = "none";
    document.getElementById("claimbutton").innerText = "HIGHSCORES";
    document.getElementById("claimbutton").style.marginRight = "1%";
    document.getElementById("startnewbutton").style.display = "block";
    document.getElementById("buttonsDiv").style.marginTop = "16cqw";
    document.getElementById("claimReq1").style.display = "none"
    document.getElementById("claimText").style.display = "none"
    document.getElementById("buttonsDiv").style.flexDirection = "unset"
    document.getElementById("doubleornotthingbutton").style.display = "none";
    menu=3;
}

let intervalStart = setInterval(listenToGamepads, 1000/10);