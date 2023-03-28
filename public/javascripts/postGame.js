var gameWinner = sessionStorage.getItem('gameWinner');
var winnerName
if(gameWinner=="Player 1"){
    winnerName = sessionStorage.getItem("P1Name");
}
else if(gameWinner=="Player 2"){
    winnerName = sessionStorage.getItem("P2Name");
}
if (gameWinner!=null){
    document.getElementById("winner").innerText  = winnerName.toUpperCase()+" WINS";
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
    document.getElementById("prize").innerText  = totalPrize.toLocaleString()+" SATS";
}
var P1SatsDeposit = sessionStorage.getItem('P1Sats');
var P2SatsDeposit = sessionStorage.getItem('P2Sats');
if (P1SatsDeposit!=null && P2SatsDeposit!=null){
    var developerFee = Math.floor((parseInt(P1SatsDeposit)+parseInt(P2SatsDeposit))*0.01)
    document.getElementById("hostFee").innerText  = "1% ("+developerFee.toLocaleString()+" sats) for the host";
    document.getElementById("developerFee").innerText  = "1% ("+developerFee.toLocaleString()+" sats) for the developer";
}


menu=1;
activeButton=0;
addEventListener("keydown", function(event) {
    switch (event.key) {
        case "Enter":
            if(menu==1){
                menu1CSS();
            }
            else if(menu==2){
                menu2CSS();
            }
            else if(menu==3){
                if(activeButton==0){
                    sessionStorage.clear();
                    window.location.href = "/highscores";
                }
                else if(activeButton==1){
                    sessionStorage.clear();
                    window.location.href = "/";
                }
            }
            break;
        case "ArrowRight":
            if(menu==3 && activeButton==0){
                document.getElementById("startnewbutton").style.animationDuration  = "2s";
                document.getElementById("claimbutton").style.animationDuration  = "0s";
                activeButton=1;
            }
            break;
        case "ArrowLeft":
            if(menu==3 && activeButton==1){
                document.getElementById("claimbutton").style.animationDuration  = "2s";
                document.getElementById("startnewbutton").style.animationDuration  = "0s";
                activeButton=0;
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
            if (a.sats > b.sats) {
              return -1;
            }
          });

        sizeHS = (orderedScores.length)-1
        if(orderedScores[sizeHS].sats<totalPrize){
          console.log("Mudar hs file")
          console.log(orderedScores[sizeHS].sats)
          console.log(totalPrize)
          orderedScores[sizeHS].sats = parseInt(totalPrize);
          orderedScores[sizeHS].name = winnerName;
        }

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
    })
}



const socket = io("170.75.172.55:3001" , { transports : ['websocket'] });
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
    document.getElementById("claimbutton").innerText = "BACK";
    document.getElementById("qrCode1").classList.remove('blur');
    menu=2;
}

function menu2CSS(){
    document.getElementById("gameOver").style.display = "block";
    document.getElementById("claimbutton").innerText = "SWEEP VIA LNURL";
    document.getElementById("qrCode1").classList.add('blur');
    menu=1;
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
    menu=3;
}

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
    if(gameWinner=="Player 1"){
        if(gamepad1.buttons[0].pressed==true || gamepad1.buttons[1].pressed==true || gamepad1.buttons[2].pressed==true || gamepad1.buttons[3].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'Enter'}));
        }
        if(gamepad1.buttons[14].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowLeft'}));
        }
        if(gamepad1.buttons[15].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowRight'}));
        }
    }
  }
  if (navigator.getGamepads()[1]) {
    if(gamepad2==null){
        console.log("Gamepad 2 connected")
    }
    gamepad2 = navigator.getGamepads()[1];
    if(gameWinner=="Player 2"){
        if(gamepad2.buttons[0].pressed==true || gamepad2.buttons[1].pressed==true || gamepad2.buttons[2].pressed==true || gamepad2.buttons[3].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'Enter'}));
        }
        if(gamepad2.buttons[14].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowLeft'}));
        }
        if(gamepad2.buttons[15].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowRight'}));
        }
    }
  }
}