import { listenToGamepads } from "./gamepads.js";

let selected = "MainMenuButton"

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

let playersSats = [0,0]
let numberofCreates = 0
let p1Name = "Player 1"
let p2Name = "Player 2"

var donPlayer = sessionStorage.getItem('donPlayer');
var donPrize = sessionStorage.getItem("donPrize");
var donName = sessionStorage.getItem("donName");

if (donPlayer!=null){
    if (donPrize!=null){
        if(donPlayer=="Player 1"){
            playersSats[0]+=parseInt(donPrize);
            if (donName!=null){
                p1Name=donName;
            }
        }
        else if(donPlayer=="Player 2"){
            playersSats[1]+=parseInt(donPrize);
            if (donName!=null){
                p2Name=donName;   
            }
        }
    }
    changeTextAfterPayment(); 
}

addEventListener("keydown", function(event) {
    switch (event.key) {
        case "ArrowLeft":
            if (selected=="StartGame"){
                document.getElementById("startgame").style.animationDuration  = "0s";
                document.getElementById("mainmenubutton").style.animationDuration  = "2s";
                selected="MainMenuButton";
            }
            break;
        case "ArrowRight":
            if (selected=="MainMenuButton" && playersSats[0]!=0 && playersSats[1]!=0){
                document.getElementById("startgame").style.animationDuration  = "2s";
                document.getElementById("mainmenubutton").style.animationDuration  = "0s";
                selected="StartGame";
            }
            break;
        case "Enter":
                if (selected=="StartGame"){
                    if(playersSats[0]!=0&&playersSats[1]!=0){
                        if(numberofCreates==0){
                            sessionStorage.setItem("P1Sats", playersSats[0]);
                            sessionStorage.setItem("P2Sats", playersSats[1]);
                            sessionStorage.setItem("P1Name", p1Name);
                            sessionStorage.setItem("P2Name", p2Name);
                            socket.emit('createWithdrawal', Math.floor((playersSats[0]+playersSats[1])*0.975));
                            numberofCreates=1;
                        }
                    }  
                }                  
                else if (selected=="MainMenuButton"){
                    if(playersSats[0]==0&&playersSats[1]==0){
                        window.location.href = "/";
                    }
                }      
            break;
    }
  });


let payLinks;

const socket = io(serverIP+":"+serverPORT , { transports : ['websocket'] });
socket.on("connect", () => {
    console.log(`connected with id: ${socket.id}`)
})
//socket.onAny((event, ...args) => {
//    console.log(event, args);
//});
socket.emit('message', "getLinks");

socket.on('rescreateWithdrawal', (data) => {
    sessionStorage.setItem("LNURLID", data.id);
    sessionStorage.setItem("LNURL", data.lnurl);
    sessionStorage.setItem("LNURLMAXW", data.max_withdrawable);

    window.location.href = "/game";
})

socket.on("resPayLinks", body => {
    payLinks = body;
    console.log(payLinks)
    if(payLinks[1].id=="fu96V2" && payLinks[1].description=="Player1"){
        let qrcodeContainer = document.getElementById("qrcode1");
        qrcodeContainer.innerHTML = "";
        new QRious({
            element: qrcodeContainer,
            size: 120,
            value: payLinks[1].lnurl
          });
    };   
    if(payLinks[0].id=="Y7rifi" && payLinks[0].description=="Player2"){
        let qrcodeContainer = document.getElementById("qrcode2");
        qrcodeContainer.innerHTML = "";
        new QRious({
            element: qrcodeContainer,
            size: 120,
            value: payLinks[0].lnurl
          });
    } 
});

socket.on("invoicePaid", body => {
    if(body.lnurlp=="fu96V2"){
        console.log(`Chegou pagamento de P1: ${(body.amount)/1000} sats`);
        if(body.comment!=null && body.comment!=""){
            console.log("Player1 Name: " + body.comment)
            p1Name=body.comment.trim()           
        }
        playersSats[0] += body.amount/1000
    }
    if(body.lnurlp=="Y7rifi"){
        console.log(`Chegou pagamento de P2: ${(body.amount)/1000} sats`);
        if(body.comment!=null && body.comment!=""){
            console.log("Player2 Name: " + body.comment)
            p2Name=body.comment.trim()            
        }
        playersSats[1] += body.amount/1000
    }
    changeTextAfterPayment()
});

function changeTextAfterPayment(){
    document.getElementById("player2sats").innerText = playersSats[1]
    document.getElementById("player1sats").innerText = playersSats[0]
    totalPrize = playersSats[0] + playersSats[1]
    document.getElementById("prizevaluesats").innerText = totalPrize
    document.getElementById("rules1").innerText = "1% ("+Math.floor(totalPrize*0.01)+" sats) to the host"
    document.getElementById("rules2").innerText =  "1% ("+Math.floor(totalPrize*0.01)+" sats) to the developer"
    document.getElementById("rules3").innerText =  "0.5% ("+Math.floor(totalPrize*0.005)+" sats) to the designer"
    document.getElementById("player1info").innerText = p1Name
    document.getElementById("player2info").innerText = p2Name
    /* if (menu=="GameModes" && playersSats[1]!=0 && playersSats[0]!=0){
        document.getElementById("centerSection").style.display  = "none";
        document.getElementById("gameButtons").style.display  = "flex";
        menu="Buttons";
    } */
}

let intervalStart = setInterval(listenToGamepads, 1000/10);