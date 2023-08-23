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

let playersList;
let numberOfPlayers;
let deposit;
let playerListParsed = JSON.parse(sessionStorage.getItem("PlayerList"));
let previousWinner = sessionStorage.getItem("gameWinner");
let winnersListStorage = JSON.parse(sessionStorage.getItem("WinnersList"));
let winnersList;
if(winnersListStorage==null){
    winnersList = []
}
else if(winnersListStorage!=null){
    winnersList = winnersListStorage
}
if(previousWinner!=null){
    sessionStorage.removeItem('gameWinner');
    winnersList.push(previousWinner)
}

if(playerListParsed!=null){
    playersList = playerListParsed;
    numberOfPlayers = playersList.length;
    deposit = JSON.parse(sessionStorage.getItem("P1Sats"));
}
else if(playerListParsed==null){
    playersList = []
    playersList = ["Pedro","Joao","Player 3","Player 4","Player 5","Player 6","Player 7","Player 8"] //,"Player 9","Player 10","Player 11","Player 12","Player 13","Player 14","Player 15","Player 16"]
    let urlToParse = location.search;
    const params = new URLSearchParams(urlToParse);
    numberOfPlayers = parseInt(params.get("players"));
    deposit = parseInt(params.get("deposit"));
    socket.emit('createPaylink', {"description":"tournament","buyIn":deposit});
}

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
elementSVG.addEventListener("load",function(){
        svgDoc = elementSVG.contentDocument;
        changeHTMLAfterPayment()
});

document.getElementById("numberOfPlayers").innerText = numberOfPlayers;
document.getElementById("buyinvalue").innerText = deposit.toLocaleString();
document.getElementById("bracketFinalPrize").innerText = (deposit*numberOfPlayers).toLocaleString();
document.getElementById("buyinvalue2").innerText = deposit.toLocaleString();



let paymentsDict = {}
socket.on("rescreatePaylink", body => {
    let payLink = body;
    paymentsDict[payLink.description] = payLink.id;
    let qrcodeContainer = document.getElementById("qrTournament");
    qrcodeContainer.innerHTML = "";
    new QRious({
        element: qrcodeContainer,
        size: 800,
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
    changeHTMLAfterPayment()
});

let nextGameP1;
let nextGameP2;
function changeHTMLAfterPayment(){
    for(let i=0;i<playersList.length;i++){
        changeNameText(svgDoc,initialPositions[i], playersList[i])
    }
    document.getElementById("depositedvalue").textContent = (deposit*playersList.length).toLocaleString();

    if(previousWinner==null){
        if(playersList.length==numberOfPlayers){
            document.getElementById("bracketPayment").classList.add("paymentComplete");
            document.getElementById("proceedButton").classList.remove("disabled");
            document.getElementById("buyinvalue").textContent = "LET'S GO";
            document.getElementById("satsLabel").style.display = "none";
            // CHANGES QR CODE TO CHECKMARK
            document.getElementById("buyinvalue").style.padding = "none";
            document.getElementById("qrTournament").style.display = "none";
            document.getElementById("qrTournamentCheck").style.display = "block";
        }
    }
    else if(previousWinner!=null){
        document.getElementById("bracketPayment").style.display = "none";
        document.getElementById("nextGameDiv").style.display = "block";
        let elapsedGames = winnersList.length;
        if(winnersList.length<numberOfPlayers/2){
            nextGameP1 = playersList[(2*winnersList.length)]
            nextGameP2 = playersList[(2*winnersList.length)+1]
            document.getElementById("nextGame_P1").textContent = nextGameP1;
            document.getElementById("nextGame_P2").textContent = nextGameP2;
        }
        else if(winnersList.length>=numberOfPlayers/2){
            let winnerP1 = winnersList[winnersList.length - (numberOfPlayers/2)]
            let winnerP2 = winnersList[winnersList.length - (numberOfPlayers/2) + 1]
            console.log(winnerP1)
            console.log(winnerP2)
            if (winnerP1=="Player 1") {
                nextGameP1 = playersList[winnersList.length - (numberOfPlayers/2)]
            }
            else if(winnerP1=="Player 2") {
                nextGameP1 = playersList[winnersList.length - (numberOfPlayers/2) + 1]
            }
            if (winnerP2=="Player 1") {
                nextGameP2 = playersList[winnersList.length - (numberOfPlayers/2) + 2]
            }
            else if(winnerP2=="Player 2") {
                nextGameP2 = playersList[winnersList.length - (numberOfPlayers/2) + 1 + 2]
            }
            console.log(nextGameP1)
            console.log(nextGameP2)
            document.getElementById("nextGame_P1").textContent = nextGameP1;
            document.getElementById("nextGame_P2").textContent = nextGameP2;

        }
        document.getElementById("nextGameID").textContent = winnersList.length+1
        buttonSelected="startGameButton"

        console.log(winnersList)
        for(let i=0;i<winnersList.length;i++){
            let winnerName
            console.log(i)
            if(i<(numberOfPlayers/2)){
                if(winnersList[i]=="Player 1"){
                    highLight(svgDoc,initialPositions[(i*2)])
                    winnerName = playersList[i*2]
                }
                else if(winnersList[i]=="Player 2"){
                    highLight(svgDoc,initialPositions[(i*2)+1])
                    winnerName = playersList[(i*2)+1]
                }
            }
            else if(i>=(numberOfPlayers/2)){
                let winnerPlayer = winnersList[i]
                let winnerPrevious
                console.log(winnerPlayer)
                if(winnerPlayer=="Player 1"){
                    highLight(svgDoc,initialPositions[(i*2)])
                    winnerPrevious = winnersList[(i - numberOfPlayers/2)]
                    if(winnerPrevious=="Player 1"){
                        winnerName = playersList[(i - numberOfPlayers/2)]
                    }
                    else if(winnerPrevious=="Player 2"){
                        winnerName = playersList[(i - numberOfPlayers/2) + 1]
                    }
                }
                if(winnerPlayer=="Player 2"){
                    highLight(svgDoc,initialPositions[(i*2)+1])
                    winnerPrevious = winnersList[(i - numberOfPlayers/2) + 1]
                    if(winnerPrevious=="Player 1"){
                        winnerName = playersList[((i) - numberOfPlayers/2) + 1]
                    }
                    else if(winnerPrevious=="Player 2"){
                        winnerName = playersList[((i) - numberOfPlayers/2)]
                    }
                }
                console.log(winnerPrevious)
            }
            console.log(winnerName)
            changeNameText(svgDoc, initialPositions[(numberOfPlayers)+i], winnerName)
        }
    }
}

let numberofCreates = 0;
let buttonSelected = "cancelButton"
addEventListener("keydown", function(event) {
    if (event.key === "ArrowRight" || event.key === "d") {
        if(playersList.length==numberOfPlayers && buttonSelected== "cancelButton"){
            document.getElementById("proceedButton").style.animationDuration  = "2s";
            document.getElementById("backButton").style.animationDuration  = "0s";
            buttonSelected="proceedButton";
        }
        else if(buttonSelected== "backButton"){
            document.getElementById("proceedButton").style.animationDuration  = "2s";
            document.getElementById("backButton").style.animationDuration  = "0s";
            buttonSelected="confirmButton";
        }
    }
    if (event.key === "ArrowLeft" || event.key === "a") {
        if(playersList.length==numberOfPlayers && buttonSelected== "proceedButton"){
            document.getElementById("proceedButton").style.animationDuration  = "0s";
            document.getElementById("backButton").style.animationDuration  = "2s";
            buttonSelected="cancelButton";
        }
        else if(buttonSelected=="confirmButton"){
            document.getElementById("proceedButton").style.animationDuration  = "0s";
            document.getElementById("backButton").style.animationDuration  = "2s";
            buttonSelected="backButton";
        }
    }
    if (event.key === "Enter" || event.key === " ") {
        if(buttonSelected=="cancelButton"){
            document.getElementById("withdrawableuses").textContent = playersList.length;
            document.getElementById("withdrawablevaluefirst").textContent = deposit.toLocaleString();
            document.getElementById("buyintext").style.display = "none";
            document.getElementById("qrCodeDiv").style.display = "none";
            document.getElementById("satsdeposited").style.display = "none";
            document.getElementById("issuerefundsdiv").style.display = "block";
            document.getElementById("backButton").textContent = "BACK";
            document.getElementById("proceedButton").textContent = "CONFIRM";
            document.getElementById("proceedButton").classList.remove("disabled");
            buttonSelected="backButton"
        }
        else if(buttonSelected=="backButton"){
            document.getElementById("buyintext").style.display = "block";
            document.getElementById("qrCodeDiv").style.display = "block";
            document.getElementById("satsdeposited").style.display = "block";
            document.getElementById("issuerefundsdiv").style.display = "none";
            document.getElementById("backButton").textContent = "CANCEL";
            document.getElementById("proceedButton").textContent = "START";
            if(playersList.length!=numberOfPlayers){
                document.getElementById("proceedButton").classList.add("disabled");
            }

            buttonSelected="cancelButton"
        }
        else if(buttonSelected=="proceedButton"){
            for(var key in paymentsDict) {
                let value = paymentsDict[key];
                console.log("Trying to delete paylink "+value);
                socket.emit('deletepaylink', value);
            }
            document.getElementById("bracketPayment").style.display = "none";
            document.getElementById("nextGameDiv").style.display = "block";
            document.getElementById("nextGame_P1").textContent = playersList[0]
            document.getElementById("nextGame_P2").textContent = playersList[1]
            buttonSelected="startGameButton"
        }
        else if(buttonSelected=="confirmButton"){
            for(var key in paymentsDict) {
                let value = paymentsDict[key];
                console.log("Trying to delete paylink "+value);
                socket.emit('deletepaylink', value);
            }
            if(playersList.length==0){
                window.location.href = "/tournprefs";
            }
            else if(playersList.length>0){
                buttonSelected="none";
                console.log("Trying to create LNURLw");
                socket.emit('createWithdrawal', {"amount": Math.floor((deposit)*0.95), "maxWithdrawals": playersList.length});
                document.getElementById("issuerefundsfirst").style.display = "none";
                document.getElementById("issuerefundssecond").style.display = "block";
                document.getElementById("backButton").style.display = "none";
                document.getElementById("proceedButton").style.display = "none";
            }
        }
        else if(buttonSelected=="startGameButton"){
            if(previousWinner==null){
                if(numberofCreates==0){
                    let stringplayersList = JSON.stringify(playersList)
                    sessionStorage.setItem("PlayerList", stringplayersList);
                    sessionStorage.setItem("P1Sats", deposit);
                    sessionStorage.setItem("P2Sats", deposit);
                    console.log("Trying to create LNURLw");
                    socket.emit('createWithdrawal', {"amount": Math.floor((deposit*playersList.length)*0.95), "maxWithdrawals": 1});
                    numberofCreates=1;
                }
            }
            else if(previousWinner!=null){
                let stringWinnersList = JSON.stringify(winnersList)
                sessionStorage.setItem("WinnersList", stringWinnersList);
                window.location.href = "/game";
            }
        }
    }

})

let timesWithdrawed = 0;
socket.on('rescreateWithdrawal', (data) => { // data.id data.lnurl data.max_withdrawable
    if(buttonSelected=="none"){
        document.getElementById("currentWithdrawalPlayer").textContent = playersList[0];
        document.getElementById("withdrawablevalue").textContent = data.max_withdrawable;
        let qrcodeContainer = document.getElementById("qrWithdrawal");
        qrcodeContainer.innerHTML = "";
        new QRious({
            element: qrcodeContainer,
            size: 800,
            value: data.lnurl
            });
    }
    else if(buttonSelected=="startGameButton"){
        sessionStorage.setItem("LNURL", data.lnurl);
        sessionStorage.setItem("LNURLMAXW", data.max_withdrawable);
        window.location.href = "/game";
    }
});

socket.on('prizeWithdrawn', (data) => {
    //console.log(data)
    changeNameText(svgDoc,initialPositions[timesWithdrawed], initialPositions[timesWithdrawed])
    timesWithdrawed++;
    document.getElementById("currentWithdrawalPlayer").textContent = playersList[timesWithdrawed];
    if(timesWithdrawed==playersList.length){
        window.location.href = "/tournprefs";
    }
});

function highLight(svgDoc,id){
    svgDoc.getElementById(id+'_name').style.fill = "black";
    svgDoc.getElementById(id+'_rect').style.fill = "#fff";
    svgDoc.getElementById(id+'_path').style.opacity = 1;
    svgDoc.getElementById(id+'_path').style.strokeWidth = 2;
  }

function changeNameText(svgDoc,id, name){
    svgDoc.getElementById(id+'_name').textContent = name;
    svgDoc.getElementById(id+'_name').style.opacity = "1";
}



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
  svgDoc.getElementById(id+'_rect').style.fill = "#fff";
  console.log(id);
  svgDoc.getElementById(id+'_path').style.opacity = 1;
  svgDoc.getElementById(id+'_path').style.strokeWidth = 2;
}




*/
