import { listenToGamepads } from "./gamepads.js";

let serverIP;
let serverPORT;
await fetch('/loadconfig', {
    method: 'GET'
    })
    .then((response) => response.json())
    .then((data) => {
        serverIP = data.IP
        serverPORT = data.PORT
});
const socket = io(serverIP+":"+serverPORT , { transports : ['websocket'] });
let gameWinner = sessionStorage.getItem('gameWinner');
let p1Name = sessionStorage.getItem("P1Name");
let p2Name = sessionStorage.getItem("P2Name");
let winnerName;
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
} else gameWinner="Player 1";
let withdrawalURL = sessionStorage.getItem('LNURL');
if (withdrawalURL!=null){
    let qrcodeContainer = document.getElementById("qrCode1");
    qrcodeContainer.innerHTML = "";
    new QRious({
        element: qrcodeContainer,
        value: withdrawalURL
    });
    sessionStorage.removeItem("LNURL");
}
let totalPrize = sessionStorage.getItem('LNURLMAXW');
if (totalPrize!=null){
    document.getElementById("prize").innerText  = parseInt(totalPrize).toLocaleString()+" SATS";
}
let P1SatsDeposit = sessionStorage.getItem('P1Sats');
let P2SatsDeposit = sessionStorage.getItem('P2Sats');
if (P1SatsDeposit!=null && P2SatsDeposit!=null){
    let developerFee = Math.floor((parseInt(P1SatsDeposit)+parseInt(P2SatsDeposit))*0.02)
    let designerFee = Math.floor((parseInt(P1SatsDeposit)+parseInt(P2SatsDeposit))*0.01)
    document.getElementById("hostFee").innerText  = "2% ("+developerFee.toLocaleString()+" sats) for the host";
    document.getElementById("developerFee").innerText  = "2% ("+developerFee.toLocaleString()+" sats) for the developer";
    document.getElementById("designerFee").innerText  = "1% ("+designerFee.toLocaleString()+" sats) for the designer";
}
let menu = 1;
let activeButtonMenu1 = 0;
let activeButtonMenu3 = 0;
let qrRevealed = 0
let intervalStart = setInterval(listenToGamepads, 1000/10);

function pressLeft(){
    if(menu==3 && activeButtonMenu3==1){
        document.getElementById("claimbutton").style.animationDuration  = "2s";
        document.getElementById("startnewbutton").style.animationDuration  = "0s";
        activeButtonMenu3=0;
    }
}

function pressRight(){
    if(menu==3 && activeButtonMenu3==0){
        document.getElementById("startnewbutton").style.animationDuration  = "2s";
        document.getElementById("claimbutton").style.animationDuration  = "0s";
        activeButtonMenu3=1;
    }
}

function pressUp(){
    if(menu==1 && activeButtonMenu1==1){
        document.getElementById("doubleornotthingbutton").style.animationDuration  = "0s";
        document.getElementById("claimbutton").style.animationDuration  = "2s";
        activeButtonMenu1=0;
    }
}

function pressDown(){
    if(menu==1 && activeButtonMenu1==0){
        document.getElementById("doubleornotthingbutton").style.animationDuration  = "2s";
        document.getElementById("claimbutton").style.animationDuration  = "0s";
        activeButtonMenu1=1;
    }
}

function pressContinue(){
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
}

addEventListener("keydown", function(event) {
    switch (event.key) {
        case " ":
            if(gameWinner=="Player 1" && (menu==1 || menu==2)){
                pressContinue();
            }
            if(menu==3){
                pressContinue();
            }
            break;
        case "Enter":
            if(gameWinner=="Player 2" && (menu==1 || menu==2)){
                pressContinue();
            }
            if(menu==3){
                pressContinue();
            }
            break;
        case "s":
            if(gameWinner=="Player 1" && (menu==1 || menu==2)){
                pressDown()
            }
            break;
        case "ArrowDown":
            if(gameWinner=="Player 2" && (menu==1 || menu==2)){
                pressDown()
            }
            break;
        case "w":
            if(gameWinner=="Player 1" && (menu==1 || menu==2)){
                pressUp()
            }
            break;
        case "ArrowUp":
            if(gameWinner=="Player 2" && (menu==1 || menu==2)){
                pressUp()
            }
            break;
        case "d":
        case "ArrowRight":
            pressRight()
            break;
        case "a":
            pressLeft()
            break;
        case "ArrowLeft":
            pressLeft()
            break;
    }
});

function updateHSJson(){
    fetch('./files/highscores.json')
    .then((response) => response.json())
    .then((json) => {
        let highscores = json

        let orderedScores = highscores.sort((a, b) => {
            if (a.prize > b.prize) {
              return -1;
            }
          });

        let sizeHS = (orderedScores.length)-1
        if((orderedScores[sizeHS].p1sats + orderedScores[sizeHS].p2sats) < (parseInt(P1SatsDeposit) + parseInt(P2SatsDeposit))){
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
          fetch('/savejson', {
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

socket.on("connect", () => {
    console.log(`connected with id: ${socket.id}`)
})

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
    document.getElementById("buttonsDiv").style.justifyContent = "center";
    document.getElementById("buttonsDiv").style.gap = "21px";
    document.getElementById("claimbutton").style.marginRight = "0px";
    document.getElementById("claimbutton").style.marginLeft = "0px";
    document.getElementById("startnewbutton").style.marginRight = "0px";
    document.getElementById("startnewbutton").style.marginLeft = "0px";
    menu=3;
}
