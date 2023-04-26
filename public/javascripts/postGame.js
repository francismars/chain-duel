var gameWinner = sessionStorage.getItem('gameWinner');
var p1Name = sessionStorage.getItem("P1Name");
var p2Name = sessionStorage.getItem("P2Name");
var winnerName
if(gameWinner=="Player 1"){
    winnerName = p1Name
}
else if(gameWinner=="Player 2"){
    winnerName = p2Name
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
                sessionStorage.setItem("donPlayer", gameWinner);
                sessionStorage.setItem("donName", winnerName);
                sessionStorage.setItem("donPrize", totalPrize);
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
    if(gameWinner=="Player 1" || menu==3){
        if(gamepad1.buttons[0].pressed==true || gamepad1.buttons[1].pressed==true || gamepad1.buttons[2].pressed==true || gamepad1.buttons[3].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'Enter'}));
        }
        /*
        // Code for GAMEPAD
        if(gamepad1.buttons[14].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowLeft'}));
        }
        if(gamepad1.buttons[15].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowRight'}));
        }
        */
        // CODE FOR ARCADE CONTROLLER
        // console.log("0 == "+ gamepad1.axes[0]) // Left = -1 || Right = 1
        // console.log("1 == "+ gamepad1.axes[1]) // Up = -1 || Down = 1
        if(gamepad1.axes[0]==-1){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowLeft'}));
        }
        if(gamepad1.axes[0]==1){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowRight'}));
        }
    }
  }
  if (navigator.getGamepads()[1]) {
    if(gamepad2==null){
        console.log("Gamepad 2 connected")
    }
    gamepad2 = navigator.getGamepads()[1];
    if(gameWinner=="Player 2" || menu==3){
        if(gamepad2.buttons[0].pressed==true || gamepad2.buttons[1].pressed==true || gamepad2.buttons[2].pressed==true || gamepad2.buttons[3].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'Enter'}));
        }
        /*
        // Code for GAMEPAD
        if(gamepad2.buttons[14].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowLeft'}));
        }
        if(gamepad2.buttons[15].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowRight'}));
        }
        */
        // CODE FOR ARCADE CONTROLLER
        if(gamepad2.axes[0]==-1){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowLeft'}));
        }
        if(gamepad2.axes[0]==1){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowRight'}));
        }
    }
  }
}