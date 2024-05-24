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
let controllersActive = false;
let gameType
let player1image
let player2image
let gameMenu = "P2P"

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

initiatenostrqr()

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
            if (selected=="cancelGameConfirmButton" && controllersActive){
                document.getElementById("cancelGameAbort").style.animationDuration  = "2s";
                document.getElementById("cancelGameConfirm").style.animationDuration  = "0s";
                selected="cancelGameAbortButton";
            }
            else if(selected=="nostrGameConfirm"){
              selected="nostrGameAbort";
              document.getElementById("nostrGameAbort").style.animationDuration  = "2s";
              document.getElementById("nostrGameConfirm").style.animationDuration  = "0s";
            }
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
            if (selected=="cancelGameAbortButton" && playersSats[0]==0 && playersSats[1]==0){
                document.getElementById("cancelGameAbort").style.animationDuration  = "0s";
                document.getElementById("cancelGameConfirm").style.animationDuration  = "2s";
                selected="cancelGameConfirmButton";
            }
            else if (selected=="nostrGameAbort"){
                selected="nostrGameConfirm";
                document.getElementById("nostrGameAbort").style.animationDuration  = "0s";
                document.getElementById("nostrGameConfirm").style.animationDuration  = "2s";
            }
            break;
        case " ":
        case "Enter":
                if (selected=="StartGame"){
                    if(playersSats[0]!=0&&playersSats[1]!=0){
                        redirectToGame();
                    }
                }
                else if (controllersActive && selected=="MainMenuButton"){
                    if(playersSats[0]==0&&playersSats[1]==0){
                      document.getElementById("cancelGame").classList.remove('hide');
                      document.getElementById("cancelGameAbort").style.animationDuration  = "2s";
                      document.getElementById("mainmenubutton").style.animationDuration  = "0s";
                      document.getElementById("qrcode1").classList.add('blur');
                      document.getElementById("qrcode2").classList.add('blur');
                      selected="cancelGameAbortButton";
                      //window.location.href = "/";
                    }
                }
                else if (selected=="cancelGameAbortButton"){
                    document.getElementById("cancelGame").classList.add('hide');
                    document.getElementById("cancelGameAbort").style.animationDuration  = "0s";
                    document.getElementById("mainmenubutton").style.animationDuration  = "2s";
                    document.getElementById("qrcode1").classList.remove('blur');
                    document.getElementById("qrcode2").classList.remove('blur');
                    selected="MainMenuButton"
                }
                else if (selected=="cancelGameConfirmButton" && playersSats[0]==0 && playersSats[1]==0 && controllersActive){
                    if(playersSats[0]==0&&playersSats[1]==0){
                        controllersActive = false;
                        socket.emit("cancelp2p");
                        window.location.href = "/";
                    }
                }
                else if (selected=="nostrGameAbort"){
                    document.getElementById("nostrIntro").classList.add('hide');
                    selected="MainMenuButton";
                }
                else if (selected=="nostrGameConfirm"){
                    document.getElementById("nostrIntro").classList.add('hide');
                    nostrInit()
                    selected="MainMenuButton"
                }
          break;
        case "x":
          document.getElementById("nostrIntro").classList.remove('hide');
          document.getElementById("nostrGameAbort").style.animationDuration  = "2s";
          selected="nostrGameAbort";
          break;
    }
    switch (event.code) {
        case "ControlLeft":
            if(controllersActive) document.getElementById("player1card").classList.add("expanded");
            if(controllersActive) document.getElementById("qrcodeContainerNostr").classList.add("expanded");
            break;
        case "ControlRight":
            if(controllersActive) document.getElementById("player2card").classList.add("expanded");
            if(controllersActive) document.getElementById("qrcodeContainerNostr").classList.add("expanded");
            break;
    }
});

addEventListener("keyup", function(event) {
    switch (event.code) {
      case "ControlLeft":
        if(controllersActive) document.getElementById("player1card").classList.remove("expanded");
        if(controllersActive) document.getElementById("qrcodeContainerNostr").classList.remove("expanded");
        break;
      case "ControlRight":
        if(controllersActive) document.getElementById("player2card").classList.remove("expanded");
        if(controllersActive) document.getElementById("qrcodeContainerNostr").classList.remove("expanded");
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
    console.log(body)
    if(body[0] && body[0].mode){
        gameType = body[0].mode
        console.log(gameType)
    }
    if(body.lnurlw){
        window.location.href = "/postgame";
    }
    else{
        payLinks = body
        if(gameType=="P2P"){
            for(let payLink of body){
                document.getElementById("nostrmin").innerText = parseInt(payLink.min).toLocaleString()
                if(payLink.description=="Player1"){
                    document.getElementById("mindepP1").innerText = parseInt(payLink.min).toLocaleString()
                    let qrcodeContainer = document.getElementById("qrcode1");
                    qrcodeContainer.innerHTML = "";
                    new QRious({
                        element: qrcodeContainer,
                        size: 800,
                        value: payLink.lnurlp
                      });
                    document.getElementById("qrcode1Link").href = "lightning:"+payLink.lnurlp

                };
                if(payLink.description=="Player2"){
                    document.getElementById("mindepP2").innerText = parseInt(payLink.min).toLocaleString()
                    let qrcodeContainer = document.getElementById("qrcode2");
                    qrcodeContainer.innerHTML = "";
                    new QRious({
                        element: qrcodeContainer,
                        size: 800,
                        value: payLink.lnurlp
                      });
                    document.getElementById("qrcode2Link").href = "lightning:"+payLink.lnurlp
                }
            }
        }
        else if(gameType=="P2P Nostr"){
            let nostrinfo = body[0]
            document.getElementById("nostrmindepP1").innerText = parseInt(parseInt(nostrinfo.min).toLocaleString()).toLocaleString();
            document.getElementById("nostrmindepP2").innerText = parseInt(parseInt(nostrinfo.min).toLocaleString()).toLocaleString();
            let qrcodeContainer = document.getElementById("qrcodeNostr");
            qrcodeContainer.innerHTML = "";
            new QRious({
                element: qrcodeContainer,
                size: 800,
                value: "nostr:"+nostrinfo.note1
              });
            document.getElementById("qrcodeLinkNostr").href = "nostr:"+nostrinfo.note1
        }
        document.getElementById("loading").classList.add('hide');
        controllersActive = true;
    }
})

socket.on("updatePayments", body => {
    console.log(body)
    if(body.gamemode){
        gameType = body.gamemode
        if(gameMenu == "P2P" && gameType=="P2P Nostr"){
            nostrInit()
        }
    }
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
            if(playersSats[0]!=playerData.value){
                playersSats[0] = playerData.value;
                document.getElementById("qrcode1Decoration").classList.remove('hide');
                document.getElementById("player1satsContainer").classList.add('highlight');
                document.getElementById("player1info").classList.add('highlight');
                document.getElementById("qrcodeNostrDecoration").classList.remove('hide');
                setTimeout(function() {
                    document.getElementById("qrcode1Decoration").classList.add('hide');
                    document.getElementById("player1satsContainer").classList.remove('highlight');
                    document.getElementById("player1info").classList.remove('highlight');
                    document.getElementById("qrcodeNostrDecoration").classList.add('hide');
                }, 1200);
            }
            if(playerData.image){
                player1image = playerData.image
            }
        }
        if(key == "Player2"){
            console.log(`P2 has ${(playerData.value)} sats`);
            if(playerData.name!=null && playerData.name!=""){
                console.log("Player2 Name: " + playerData.name)
                p2Name=(playerData.name).trim()
            }
            if(playersSats[1]!=playerData.value){
                playersSats[1] = playerData.value;
                document.getElementById("qrcode2Decoration").classList.remove('hide');
                document.getElementById("player2satsContainer").classList.add('highlight');
                document.getElementById("player2info").classList.add('highlight');
                document.getElementById("qrcodeNostrDecoration").classList.remove('hide');
                setTimeout(function() {
                    document.getElementById("qrcode2Decoration").classList.add('hide');
                    document.getElementById("player2satsContainer").classList.remove('highlight');
                    document.getElementById("player2info").classList.remove('highlight');
                    document.getElementById("qrcodeNostrDecoration").classList.add('hide');
                }, 1200);
            }
            if(playerData.image){
                player2image = playerData.image
            }
        }
        if(key == "winners"){
            console.log(`This is DoN number ${playerData.length}. Previous winner was ${(playerData.slice(-1))}`);
            if(playerData.length!=null){
                let donMultiple = Math.pow(2,playerData.length);
                document.getElementById("gameMenuTitle").textContent = "P2P*"+donMultiple
              }
        }
        changeTextAfterPayment(gameType)
    }
});

function changeTextAfterPayment(type){
    let p1SatsId, p2SatsId, p1InfoId, p2InfoId
    if(type=="P2P"){
        p1SatsId = "player1sats"
        p2SatsId = "player2sats"
        p1InfoId = "player1info"
        p2InfoId = "player2info"
    }
    else if(type=="P2P Nostr"){
        p1SatsId = "nostrPlayer1sats"
        p2SatsId = "nostrPlayer2sats"
        p1InfoId = "nostrPlayer1info"
        p2InfoId = "nostrPlayer2info"
        if(player1image!=null) document.getElementById("player1Img").src = player1image
        if(player2image!=null) document.getElementById("player2Img").src = player2image
    }
    document.getElementById(p1SatsId).innerText = playersSats[0].toLocaleString()
    document.getElementById(p2SatsId).innerText = playersSats[1].toLocaleString()
    let totalPrize = playersSats[0] + playersSats[1]
    document.getElementById("prizevaluesats").innerText = totalPrize.toLocaleString()
    document.getElementById("rules1").innerText = "host 2% ("+Math.floor(totalPrize*0.02).toLocaleString()+" sats)"
    document.getElementById("rules2").innerText = "developer 2% ("+Math.floor(totalPrize*0.02).toLocaleString()+" sats)"
    document.getElementById("rules3").innerText = "designer 1% ("+Math.floor(totalPrize*0.01).toLocaleString()+" sats)"
    document.getElementById(p1InfoId).innerText = p1Name
    document.getElementById(p2InfoId).innerText = p2Name
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


function nostrInit(){
    document.getElementById("loading").classList.remove('hide');
    controllersActive = false;
    document.getElementById("lnurlPanel").classList.add('hide');
    document.getElementById("nostrPanel").classList.remove('hide');
    gameMenu = "P2P Nostr"
    socket.emit("getGameMenuInfosNostr");
}

function initiatenostrqr(){
    let qrcodeContainer = document.getElementById("qrcodeNostr");
    qrcodeContainer.innerHTML = "";
    new QRious({
        element: qrcodeContainer,
        size: 800,
        value: "#"
    });
    document.getElementById("qrcodeLinkNostr").href = "#"
}
