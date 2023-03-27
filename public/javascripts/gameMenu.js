let selected = "MainMenuButton"

let playersSats = [0,0]
let numberofCreates = 0
let p1Name = "Player 1"
let p2Name = "Player 2"

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
                            socket.emit('createWithdrawal', Math.floor((playersSats[0]+playersSats[1])*0.98));
                            numberofCreates=1;
                        }
                    }  
                }                  
                else if (selected=="MainMenuButton"){
                    window.location.href = "/";
                }      
            break;
    }
  });


let payLinks = ""

const socket = io("170.75.172.55:3001" , { transports : ['websocket'] });
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
    if(payLinks[0].id=="LyjSsd" && payLinks[0].description=="Player2"){
        let qrcodeContainer = document.getElementById("qrcode2");
        qrcodeContainer.innerHTML = "";
        new QRious({
            element: qrcodeContainer,
            value: payLinks[0].lnurl
          });
    }
    if(payLinks[1].id=="jk3tA3" && payLinks[1].description=="Player1"){
        let qrcodeContainer = document.getElementById("qrcode1");
        qrcodeContainer.innerHTML = "";
        new QRious({
            element: qrcodeContainer,
            value: payLinks[1].lnurl
          });
    };    
});

socket.on("invoicePaid", body => {
    if(body.lnurlp=="jk3tA3"){
        console.log(`Chegou pagamento de P1: ${(body.amount)/1000} sats`);
        if(body.comment!=null){
            console.log(body.comment)
            p1Name=body.comment[0]            
        }
        playersSats[0] += body.amount/1000
    }
    if(body.lnurlp=="LyjSsd"){
        console.log(`Chegou pagamento de P2: ${(body.amount)/1000} sats`);
        if(body.comment!=null){
            console.log(body.comment)
            p2Name=body.comment[0]            
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
    document.getElementById("player1info").innerText = p1Name
    document.getElementById("player2info").innerText = p2Name
    if (menu=="GameModes" && playersSats[1]!=0 && playersSats[0]!=0){
        document.getElementById("centerSection").style.display  = "none";
        document.getElementById("gameButtons").style.display  = "flex"; 
        menu="Buttons";
    }
}