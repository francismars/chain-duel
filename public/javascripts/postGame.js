
var gameWinner = sessionStorage.getItem('gameWinner');
if (gameWinner!=null){
    document.getElementById("winner").innerText  = gameWinner.toUpperCase()+" WINS";
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
    }
})

function menu1CSS(){
    document.getElementById("gameOver").style.display = "none";
    document.getElementById("claimText").style.display = "none";
    document.getElementById("claimReq1").style.display = "none";
    document.getElementById("winner").style.fontSize = "5cqw";
    document.getElementById("hostFee").style.fontSize = "1.5cqw";
    document.getElementById("developerFee").style.fontSize = "1.5cqw";
    document.getElementById("prize").style.fontSize = "6cqw"; 
    document.getElementById("claimbutton").innerText = "BACK"; 
    document.getElementById("qrCode1").style.display = "block";
    menu=2;
}

function menu2CSS(){
    document.getElementById("gameOver").style.display = "block";
    document.getElementById("claimText").style.display = "block";
    document.getElementById("claimReq1").style.display = "block";
    document.getElementById("winner").style.fontSize = "6cqw";
    document.getElementById("hostFee").style.fontSize = "2cqw";
    document.getElementById("developerFee").style.fontSize = "2cqw";
    document.getElementById("prize").style.fontSize = "7cqw"; 
    document.getElementById("claimbutton").innerText = "SWEEP VIA LNURL"; 
    document.getElementById("qrCode1").style.display = "none";
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
    menu=3;
}