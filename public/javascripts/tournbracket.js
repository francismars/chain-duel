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

let initialPositions = ["G1_P1", "G1_P2", "G2_P1", "G2_P2", "G3_P1", "G3_P2", "G4_P1", "G4_P2", "G5_P1", "G5_P2", "G6_P1", "G6_P2", "G7_P1", "G7_P2", "G8_P1", "G8_P2"]

let urlToParse = location.search;

const params = new URLSearchParams(urlToParse);
const numberOfPlayers = parseInt(params.get("players"));
const deposit = parseInt(params.get("deposit"));

let elementSVG;
if(numberOfPlayers==4){
    elementSVG = document.getElementById("bracket4players");
}
else if(numberOfPlayers==8){
    elementSVG = document.getElementById("bracket8players");
}
else if(numberOfPlayers==16){
    elementSVG = document.getElementById("bracket16players");
}
elementSVG.style.display = "block";

let svgDoc;
let playersList = []

//playersList = ["Player 1","Player 2","Player 3","Player 4","Player 5","Player 6","Player 7","Player 8","Player 9","Player 10","Player 11","Player 12","Player 13","Player 14","Player 15","Player 16"]

elementSVG.addEventListener("load",function(){
        svgDoc = elementSVG.contentDocument;
        //changePlayerListHTML()
});

document.getElementById("numberOfPlayers").innerText = numberOfPlayers;
document.getElementById("buyinvalue").innerText = deposit.toLocaleString();
document.getElementById("bracketFinalPrize").innerText = (deposit*numberOfPlayers).toLocaleString();
document.getElementById("buyinvalue2").innerText = deposit.toLocaleString();

socket.emit('createPaylink', {"description":"tournament","buyIn":deposit});

let paymentsDict = {}
socket.on("rescreatePaylink", body => {
    let payLink = body;
    paymentsDict[payLink.description] = payLink.id;
    let qrcodeContainer = document.getElementById("qrTournament");
    qrcodeContainer.innerHTML = "";
    new QRious({
        element: qrcodeContainer,
        size: 120,
        value: payLink.lnurl
        }); 
});






socket.on("invoicePaid", body => {
    if(body.comment!=null && body.comment!=""){
        let pName=(body.comment)[0].trim()
        playersList.push(pName)

    }
    else{
        let pName="Player "+(playersList.length+1)
        playersList.push(pName)
    }    
    changePlayerListHTML()
});

function changePlayerListHTML(){
    for(let i=0;i<playersList.length;i++){
        changeNameText(svgDoc,initialPositions[i], playersList[i])
    }
    document.getElementById("depositedvalue").textContent = (deposit*playersList.length).toLocaleString();

    if(playersList.length==numberOfPlayers){

        document.getElementById("bracketPayment").classList.add("paymentComplete");
        document.getElementById("proceedButton").classList.remove("disabled");
        document.getElementById("buyinvalue").textContent = "LET'S GO";
        document.getElementById("satsLabel").style.display = "none";
        // TO DO:
        // CHANGE QR CODE TO CHECKMARK
        document.getElementById("buyinvalue").style.padding = "none";
        document.getElementById("qrTournament").style.display = "none";
        document.getElementById("qrTournamentCheck").style.display = "block";

    }
}

let buttonSelected = "backButton"
addEventListener("keydown", function(event) {
    if (event.key === "ArrowRight" || event.key === "d") {
        if(playersList.length==numberOfPlayers && buttonSelected== "backButton"){
            document.getElementById("proceedButton").style.animationDuration  = "2s";
            document.getElementById("backButton").style.animationDuration  = "0s";
            buttonSelected="proceedButton";
        }
    }
    if (event.key === "ArrowLeft" || event.key === "a") {
        if(playersList.length==numberOfPlayers && buttonSelected== "proceedButton"){
            document.getElementById("proceedButton").style.animationDuration  = "0s";
            document.getElementById("backButton").style.animationDuration  = "2s";
            buttonSelected="backButton";
        }  
    }

    if (event.key === "Enter" || event.key === " ") {
        if(buttonSelected=="backButton"){
            for(var key in paymentsDict) {
                let value = paymentsDict[key];
                console.log("Trying to delete paylink "+value);
                socket.emit('deletepaylink', value);
            }   
            // GENERATE WITHDRAWAL LINK
            // AFTER MONEY RETURNED: GO BACK TO TOURNPREFS

        }
        if(buttonSelected=="proceedButton"){
            // DESTROY QR CODE
            // GENERATE WITHDRAWAL LINK
            document.getElementById("bracketPayment").style.display = "none";
            document.getElementById("nextGameDiv").style.display = "block";
            document.getElementById("nextGame_P1").textContent = playersList[0]
            document.getElementById("nextGame_P2").textContent = playersList[1]
        }
    }

})


/*

var players = ["Francis","Pedro","Hal","Nakamoto","John","Mark","Jamie","Milton"];

// It's important to add an load event listener to the object,
// as it will load the svg doc asynchronously
a.addEventListener("load",function(){
  // get the inner DOM of alpha.svg
  var svgDoc = a.contentDocument;


  // GAME LOGIC 4 /

 
  name(svgDoc,"G1_P1", players[0]);
  name(svgDoc,"G1_P2", players[1]);
    highLight(svgDoc,"G1_P1", players[0]);
  name(svgDoc,"G2_P1", players[2]);
  name(svgDoc,"G2_P2", players[3]);
    highLight(svgDoc,"G2_P2", players[3]);

  name(svgDoc,"G3_P1", players[0]);
  name(svgDoc,"G3_P2", players[3]);
      highLight(svgDoc,"G3_P2", players[3]);
      highLight(svgDoc,"Winner", players[3]);

  // GAME LOGIC 8 
 
  name(svgDoc,"G1_P1", players[0]);
  name(svgDoc,"G1_P2", players[1]);
    highLight(svgDoc,"G1_P1", players[0]);
  name(svgDoc,"G2_P1", players[2]);
  name(svgDoc,"G2_P2", players[3]);
    highLight(svgDoc,"G2_P2", players[3]);

    name(svgDoc,"G5_P1", players[0]);
    name(svgDoc,"G5_P2", players[3]);
      highLight(svgDoc,"G5_P2", players[3]);


  name(svgDoc,"G3_P1", players[4]);
  name(svgDoc,"G3_P2", players[5]);
      highLight(svgDoc,"G3_P2", players[5]);
  name(svgDoc,"G4_P1", players[6]);
  name(svgDoc,"G4_P2", players[7]);
    highLight(svgDoc,"G4_P1", players[6]);

    name(svgDoc,"G6_P1", players[5]);
    name(svgDoc,"G6_P2", players[6]);
      highLight(svgDoc,"G6_P2", players[6]);


      name(svgDoc,"G7_P1", players[3]);
      name(svgDoc,"G7_P2", players[6]);
        highLight(svgDoc,"G7_P1", players[3]);

          highLight(svgDoc,"Winner", players[3]);



}, false);


function highLight(svgDoc,id, name){
  svgDoc.getElementById(id+'_name').textContent = name;
  svgDoc.getElementById(id+'_name').style.fill = "#000";
  svgDoc.getElementById(id+'_rect').style.fill = "#fff";
  console.log(id);
  svgDoc.getElementById(id+'_path').style.opacity = 1;
  svgDoc.getElementById(id+'_path').style.strokeWidth = 2;
}




*/

function changeNameText(svgDoc,id, name){
    svgDoc.getElementById(id+'_name').textContent = name;
    svgDoc.getElementById(id+'_name').style.opacity = "1";
}
