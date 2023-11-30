import { listenToGamepads } from "./gamepads.js";

let selected = "MainMenuButton"
let serverIP;
let serverPORT;
let playersSats = [0,0]
let numberofCreates = 0
let p1Name = "Player 1"
let p2Name = "Player 2"
let payLinks = [];
let intervalStart = setInterval(listenToGamepads, 1000/10);
let sessionID = sessionStorage.getItem("sessionID");

await fetch('/loadconfig', {
    method: 'GET'
    })
    .then((response) => response.json())
    .then((data) => {
        serverIP = data.IP
        serverPORT = data.PORT
});
const socket = io(serverIP+":"+serverPORT , { transports : ['websocket'], autoConnect: false });
if(sessionID){
    console.log("Found sessionID on sessionStorage "+ sessionID)
    socket.auth = { sessionID };
}
socket.connect();

addEventListener("keydown", function(event) {
    switch (event.key) {
        case "a":
        case "ArrowLeft":
            /*
            if (selected=="StartGame"){
                document.getElementById("startgame").style.animationDuration  = "0s";
                document.getElementById("mainmenubutton").style.animationDuration  = "2s";
                selected="MainMenuButton";
            }
            */
            break;
        case "d":
        case "ArrowRight":
            /*
            if (selected=="MainMenuButton" && playersSats[0]!=0 && playersSats[1]!=0){
                document.getElementById("startgame").style.animationDuration  = "2s";
                document.getElementById("mainmenubutton").style.animationDuration  = "0s";
                selected="StartGame";
            }
            */
            break;
        case " ":
        case "Enter":
                if (selected=="StartGame"){
                    if(playersSats[0]!=0&&playersSats[1]!=0){
                        if(numberofCreates==0){
                            numberofCreates=1;
                            document.getElementById("loading").style.display  = "flex";
                            redirectToGame();
                        }
                    }
                }
                else if (selected=="MainMenuButton"){
                    if(playersSats[0]==0&&playersSats[1]==0){
                        socket.emit('cancelgame')
                        window.location.href = "/";
                    }
                }
          break;
    }
});

addEventListener("keydown", function(event) {
    switch (event.code) {
        case "ControlLeft":
          document.getElementById("player1card").classList.add("expanded");
          break;
        case "ControlRight":
          document.getElementById("player2card").classList.add("expanded");
          break;
    }
});

addEventListener("keyup", function(event) {
    switch (event.code) {
      case "ControlLeft":
        document.getElementById("player1card").classList.remove("expanded");
        break;
      case "ControlRight":
        document.getElementById("player2card").classList.remove("expanded");
        break;
    }
});


socket.on("connect", () => {
    console.log(`connected with id ${socket.id}`)
})
//socket.onAny((event, ...args) => {
//    console.log(event, args);
//});

socket.on("session", ({ sessionID, userID }) => {
    // attach the session ID to the next reconnection attempts
    socket.auth = { sessionID };
    // store it in the localStorage
    sessionStorage.setItem("sessionID", sessionID);
  });

function redirectToGame(){
    window.location.href = "/game";
}

socket.emit("getGameMenuInfos");

socket.on("resGetGameMenuInfos", body => {
    //console.log(body)
    payLinks = body
    for(let payLink of body){        
        if(payLink.description=="Player1"){
            document.getElementById("mindepP1").innerText = payLink.min
            let qrcodeContainer = document.getElementById("qrcode1");
            qrcodeContainer.innerHTML = "";
            new QRious({
                element: qrcodeContainer,
                size: 800,
                value: payLink.lnurlp
              });
        };
        if(payLink.description=="Player2"){
            document.getElementById("mindepP2").innerText = payLink.min
            let qrcodeContainer = document.getElementById("qrcode2");
            qrcodeContainer.innerHTML = "";
            new QRious({
                element: qrcodeContainer,
                size: 800,
                value: payLink.lnurlp
              });
        }
    }
})

socket.on("updatePayments", body => {
    console.log(body)
    let playersData = body
    for(let key in playersData){
        let playerData = playersData[key]
        console.log(playerData)
        if(key == "Player1"){
            console.log(`P1 has ${(playerData.value)} sats`);
            if(playerData.name!=null && playerData.name!=""){
                console.log("Player1 Name: " + playerData.name)
                p1Name=(playerData.name).trim()
            }
            playersSats[0] = playerData.value
        }
        if(key == "Player2"){
            console.log(`P2 has ${(playerData.value)} sats`);
            if(playerData.name!=null && playerData.name!=""){
                console.log("Player2 Name: " + playerData.name)
                p2Name=(playerData.name).trim()
            }
            playersSats[1] = playerData.value
        }
        if(key == "winners"){
            console.log(`This is DoN number ${playerData.length}. Previous winner was ${(playerData.slice(-1))}`);
            if(playerData.length!=null){
                donText = "*"+(Math.pow(2,playerData.length))
                document.getElementById("gameMenuTitle").textContent = "Stake your sats"+donText
              }
        }
        changeTextAfterPayment()
    }
});

function changeTextAfterPayment(){
    document.getElementById("player2sats").innerText = playersSats[1].toLocaleString()
    document.getElementById("player1sats").innerText = playersSats[0].toLocaleString()
    let totalPrize = playersSats[0] + playersSats[1]
    document.getElementById("prizevaluesats").innerText = totalPrize.toLocaleString()
    document.getElementById("rules1").innerText = "host 2% ("+Math.floor(totalPrize*0.02).toLocaleString()+" sats)"
    document.getElementById("rules2").innerText = "developer 2% ("+Math.floor(totalPrize*0.02).toLocaleString()+" sats)"
    document.getElementById("rules3").innerText = "designer 1% ("+Math.floor(totalPrize*0.01).toLocaleString()+" sats)"
    document.getElementById("player1info").innerText = p1Name
    document.getElementById("player2info").innerText = p2Name
    if(playersSats[0]!=0 || playersSats[1]!=0){
        document.getElementById("mainmenubutton").classList.add("disabled");
        document.getElementById("mainmenubutton").style.animationDuration  = "0s";
    }
    if(playersSats[0]!=0 && playersSats[1]!=0){
        document.getElementById("startgame").classList.remove("disabled");
        document.getElementById("startgame").style.animationDuration  = "2s";
        selected="StartGame";
    }
    /* if (menu=="GameModes" && playersSats[1]!=0 && playersSats[0]!=0){
        document.getElementById("centerSection").style.display  = "none";
        document.getElementById("gameButtons").style.display  = "flex";
        menu="Buttons";
    } */
}

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
        let lastHighscore = (orderedScores[sizeHS].p1sats + orderedScores[sizeHS].p2sats)
        updateLastHighscoreValue(lastHighscore);
        }
    );

function updateLastHighscoreValue(lastHighscore){
    document.getElementById("leaderboardSats").innerText = (lastHighscore+1).toLocaleString();
}
