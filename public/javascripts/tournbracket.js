import { listenToGamepads } from "./gamepads.js";
let intervalStart = setInterval(listenToGamepads, 1000/10);
let sessionID = sessionStorage.getItem("sessionID");

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

const socket = io(serverIP+":"+serverPORT , { transports : ['websocket'], autoConnect: false });
if(sessionID){
    console.log("Found sessionID on sessionStorage "+ sessionID)
    socket.auth = { sessionID };
}
socket.connect();

let initialPositions = ["G1_P1", "G1_P2", "G2_P1", "G2_P2", "G3_P1", "G3_P2", "G4_P1", "G4_P2", "G5_P1", "G5_P2", "G6_P1", "G6_P2", "G7_P1", "G7_P2", "G8_P1", "G8_P2", "G9_P1", "G9_P2", "G10_P1", "G10_P2", "G11_P1", "G11_P2", "G12_P1", "G12_P2", "G13_P1", "G13_P2", "G14_P1", "G14_P2", "G15_P1", "G15_P2", "G16_P1", "G16_P2", "G17_P1", "G17_P2", "G18_P1", "G18_P2", "G19_P1", "G19_P2", "G20_P1", "G20_P2", "G21_P1", "G21_P2", "G22_P1", "G22_P2", "G23_P1", "G23_P2", "G24_P1", "G24_P2", "G25_P1", "G25_P2", "G26_P1", "G26_P2", "G27_P1", "G27_P2", "G28_P1", "G28_P2", "G29_P1", "G29_P2", "G30_P1", "G30_P2", "G31_P1", "G31_P2"]

let playersList;
let numberOfPlayers;
let numberOfDeposits;
let deposit;
let playerListParsed = JSON.parse(sessionStorage.getItem("PlayerList"));
let previousWinner = sessionStorage.getItem("gameWinner");
let winnersListStorage = JSON.parse(sessionStorage.getItem("WinnersList"));
let winnersList;
let playerListSequencial;
if(winnersListStorage==null){
    winnersList = []
}
else if(winnersListStorage!=null){
    winnersList = winnersListStorage
}
if(previousWinner!=null){
    //sessionStorage.removeItem('gameWinner');
    winnersList.push(previousWinner)
}

if(playerListParsed!=null){
    playersList = playerListParsed;
    numberOfPlayers = playersList.length;
    deposit = JSON.parse(sessionStorage.getItem("P1Sats"));
}
else if(playerListParsed==null){
    playersList = []
    //playersList = ["Big Toshi","XORNOTHING","Nakamotor","256octans"]
    playerListSequencial = []
    let urlToParse = location.search;
    const params = new URLSearchParams(urlToParse);
    numberOfPlayers = parseInt(params.get("players"));
    numberOfDeposits = playersList.length
    for(let i=0;i<numberOfPlayers;i++){
        playersList.push("")
    }
    console.log(playersList)
    deposit = parseInt(params.get("deposit"));
    socket.emit('createPaylink', {"description":"Chain Duel Tournament","buyInMin":deposit,"buyInMax":deposit});
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
else if(numberOfPlayers==32){
    elementSVG = document.getElementById("bracket32players");
}
elementSVG.style.display = "block";

let svgDoc;
elementSVG.addEventListener("load",function(){
        svgDoc = elementSVG.contentDocument;
        changeHTMLAfterPayment()
        updateBracketWinner()
        updateNextGameText()
});

document.getElementById("numberOfPlayers").innerText = numberOfPlayers;
document.getElementById("buyinvalue").innerText = deposit.toLocaleString();
document.getElementById("bracketFinalPrize").innerText = (deposit*numberOfPlayers*0.95).toLocaleString();
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

socket.on("session", ({ sessionID, userID }) => {
    // attach the session ID to the next reconnection attempts
    socket.auth = { sessionID };
    // store it in the localStorage
    sessionStorage.setItem("sessionID", sessionID);
});

socket.on("invoicePaid", body => {
    let pName
    if(body.comment!=null && body.comment!=""){
        pName=(body.comment)[0].trim()
    }
    else{
        pName="Player "+(numberOfDeposits+1)
    }
    let playerPosition = Math.floor(Math.random() * (numberOfPlayers-numberOfDeposits));
    //console.log("playerPosition before loop: " + playerPosition)
    //let playerPositionFinal = playerPosition
    for(let i=0;i<=playerPosition;i++){
        if(playersList[i]!="" && i<numberOfPlayers){
            playerPosition++
        }
    }
    // 16-3 = 13
    // ["","","","","Pedro","","","","Raquel","","","","","","","Andrade"]
    //console.log(playersList)
    //console.log("playerPosition: " + playerPosition)
    //console.log("playerPositionFinal :" + playerPositionFinal)
    playerListSequencial.push(pName)
    playersList[playerPosition]=pName
    numberOfDeposits++
    changeHTMLAfterPayment()
});

let nextGameP1;
let nextGameP2;
let nextGamePlayers;
function changeHTMLAfterPayment(){
    for(let i=0;i<numberOfPlayers;i++){
        changeNameText(svgDoc,initialPositions[i], playersList[i])
    }
    document.getElementById("depositedvalue").textContent = (deposit*numberOfDeposits).toLocaleString();

    if(previousWinner==null){
        if(numberOfDeposits>=numberOfPlayers){
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
}

let WinnerNamesList = []
function updateBracketWinner(){
    if(previousWinner!=null){
        document.getElementById("bracketPayment").style.display = "none";
        document.getElementById("nextGameDiv").style.display = "block";
        let elapsedGames = winnersList.length;
        document.getElementById("nextGameID").textContent = winnersList.length+1
        buttonSelected="startGameButton"
        if(winnersList.length+1<numberOfPlayers){
            highLightCurrentGameRect(svgDoc,initialPositions[2*winnersList.length])
            highLightCurrentGameRect(svgDoc,initialPositions[2*winnersList.length+1])
            highLightCurrentGameName(svgDoc,winnersList.length+1)
        }
        let subtractor1 = 0
        let subtractor2 = 0
        let subtractor3 = 0
        let subtractor4 = 0
        console.log("Winners List: ")
        console.log(winnersList)
        for(let i=0;i<winnersList.length;i++){
            if(i==numberOfPlayers-1) break;
            let winnerName
            //console.log(i)
            if(i<(numberOfPlayers/2)){ // Primeira Ronda
                if(winnersList[i]=="Player 1"){
                    highLight(svgDoc,initialPositions[(i*2)])
                    dimLoser(svgDoc,initialPositions[(i*2)+1])

                    winnerName = playersList[i*2]
                }
                else if(winnersList[i]=="Player 2"){
                    highLight(svgDoc,initialPositions[(i*2)+1])
                    dimLoser(svgDoc,initialPositions[(i*2)])
                    winnerName = playersList[(i*2)+1]
                }
            }
            else if(i>=(numberOfPlayers/2) && i<(numberOfPlayers/2)+(numberOfPlayers/4)){ // Segunda Ronda

                let winnerPlayer = winnersList[i];
                let winnerPrevious;
                let winnerPreviousMultiplier;
                if(winnerPlayer=="Player 1"){
                    highLight(svgDoc,initialPositions[(i*2)])
                    dimLoser(svgDoc,initialPositions[(i*2)+1])
                    let winnerPreviousIndex = (i - ((numberOfPlayers/2)) + subtractor1)
                    winnerPrevious = winnersList[winnerPreviousIndex]
                    if(winnerPrevious=="Player 1"){
                        winnerPreviousMultiplier = 0
                    }
                    if(winnerPrevious=="Player 2"){
                        winnerPreviousMultiplier = 1
                    }
                }
                if(winnerPlayer=="Player 2"){
                    highLight(svgDoc,initialPositions[(i*2)+1])
                    dimLoser(svgDoc,initialPositions[(i*2)])
                    let winnerPreviousIndex = (i - ((numberOfPlayers/2)) + subtractor1 + 1)
                    winnerPrevious = winnersList[winnerPreviousIndex]
                    if(winnerPrevious=="Player 1"){
                        winnerPreviousMultiplier = 2
                    }
                    if(winnerPrevious=="Player 2"){
                        winnerPreviousMultiplier = 3
                    }
                }
                winnerName = playersList[(4*(i-numberOfPlayers/2))+winnerPreviousMultiplier]
                subtractor1++;
                //console.log(subtractor1)
            }
            else if(i>=(numberOfPlayers/2)+(numberOfPlayers/4) && i<(numberOfPlayers/2)+(numberOfPlayers/4)+(numberOfPlayers/8)){ // Terceira Ronda
                //console.log("i: " + i)
                //console.log("subtractor2: " + subtractor2)
                let winnerPreviousMultiplier;

                if(winnersList[i]=="Player 1"){ // Primeiro e Terceiro Quarto
                    highLight(svgDoc,initialPositions[(i*2)])
                    dimLoser(svgDoc,initialPositions[(i*2)+1])

                    let winnerPreviousIndex = i - ((numberOfPlayers/4)-subtractor2)
                    //console.log("winnerPreviousIndex: " + winnerPreviousIndex)
                    if(subtractor2==0) subtractor3=0;
                    if(subtractor2==1) subtractor3=2;
                    if(winnersList[winnerPreviousIndex] == "Player 1"){ // Primeiro Oitavo e Quinto Oitavo
                        let winnerPreviousPreviousIndex = winnerPreviousIndex - ((numberOfPlayers/2) - subtractor3)
                        //console.log("winnerPreviousPreviousIndex: " + winnerPreviousPreviousIndex)

                        if(winnersList[winnerPreviousPreviousIndex] == "Player 1"){ // Winner = 1 ou 9
                            winnerPreviousMultiplier = 0
                        }
                        else if(winnersList[winnerPreviousPreviousIndex] == "Player 2"){ // Winner = 2 ou 10
                            winnerPreviousMultiplier = 1
                        }
                    }

                    else if(winnersList[winnerPreviousIndex] == "Player 2"){ // Segundo Oitavo e Sexto Oitavo
                        let winnerPreviousPreviousIndex = winnerPreviousIndex - ((numberOfPlayers/2) - subtractor3) + 1

                        //console.log("winnerPreviousPreviousIndex: " + winnerPreviousPreviousIndex)

                        if(winnersList[winnerPreviousPreviousIndex] == "Player 1"){ // Winner = 3 ou 11
                            winnerPreviousMultiplier = 2
                        }
                        else if(winnersList[winnerPreviousPreviousIndex] == "Player 2"){ // Winner = 4 ou 12
                            winnerPreviousMultiplier = 3
                        }
                    }
                }

                else if(winnersList[i]=="Player 2"){ // Segundo e Quarto Quarto
                    highLight(svgDoc,initialPositions[(i*2)+1])
                    dimLoser(svgDoc,initialPositions[(i*2)])
                    let winnerPreviousIndex = i - ((numberOfPlayers/4)-subtractor2) + 1
                    //console.log("winnerPreviousIndex: " + winnerPreviousIndex)
                    if(subtractor2==0) subtractor3=1;
                    if(subtractor2==1) subtractor3=3;
                    if(winnersList[winnerPreviousIndex] == "Player 1"){ // Terceiro Oitavo e Setimo Oitavo

                        let winnerPreviousPreviousIndex = winnerPreviousIndex - ((numberOfPlayers/2)-subtractor3)
                        //console.log("winnerPreviousPreviousIndex: " + winnerPreviousPreviousIndex)

                        if(winnersList[winnerPreviousPreviousIndex] == "Player 1"){ // Winner = 5 ou 13
                            winnerPreviousMultiplier = 4
                        }
                        else if(winnersList[winnerPreviousPreviousIndex] == "Player 2"){ // Winner = 6 ou 14
                            winnerPreviousMultiplier = 5
                        }
                    }

                    else if(winnersList[winnerPreviousIndex] == "Player 2"){  // Quarto Oitavo e Oitavo Oitavo
                        let winnerPreviousPreviousIndex = winnerPreviousIndex - ((numberOfPlayers/2)-subtractor3) + 1
                        //console.log("winnerPreviousPreviousIndex: " + winnerPreviousPreviousIndex)

                        if(winnersList[winnerPreviousPreviousIndex] == "Player 1"){ // Winner = 7 ou 15
                            winnerPreviousMultiplier = 6
                        }
                        else if(winnersList[winnerPreviousPreviousIndex] == "Player 2"){ // Winner = 8 ou 16
                            winnerPreviousMultiplier = 7
                        }
                    }
                }
                let winnerId = (8*(i-(numberOfPlayers/2)-(numberOfPlayers/4)))+winnerPreviousMultiplier
                winnerName = playersList[winnerId]
                subtractor2++
            }
            // Quarta Ronda
            else if(i>=(numberOfPlayers/2)+(numberOfPlayers/4)+(numberOfPlayers/8)
                                && i<((numberOfPlayers/2)+(numberOfPlayers/4)+(numberOfPlayers/8)+(numberOfPlayers/16))){ // 8 + 4 + 2 + 1 = 15
                let winnerPreviousIndex = (i - (numberOfPlayers/16) + subtractor4 + 1)
                console.log("----------------------")
                console.log("i: " + i)
                console.log("winnerPreviousIndex: " + winnerPreviousIndex)
                console.log("initial positions p1: " + initialPositions[(i*2)])
                console.log("initial positions p2: " + initialPositions[(i*2)+1])
                if(winnersList[winnerPreviousIndex] == "Player 1"){
                    highLight(svgDoc,initialPositions[(i*2)])
                    dimLoser(svgDoc,initialPositions[(i*2)+1])
                    winnerName = WinnerNamesList[WinnerNamesList.length-playersList.length/8+subtractor4]
                }
                if(winnersList[winnerPreviousIndex] == "Player 2"){
                    highLight(svgDoc,initialPositions[(i*2)+1])
                    dimLoser(svgDoc,initialPositions[(i*2)])
                    winnerName = WinnerNamesList[WinnerNamesList.length-playersList.length/8+1+subtractor4]
                }
                subtractor4++;
            }

            let domPosition
            if((i+1)==(numberOfPlayers-1)){
                //console.log(i)
                //console.log(initialPositions[(i*2)])
                //console.log(initialPositions[(i*2)+1])
                highLightWinnerSquare(svgDoc,"Winner")

                if(winnersList[winnersList.length-1] == "Player 1"){
                    highLight(svgDoc,initialPositions[(i*2)])
                    dimLoser(svgDoc,initialPositions[(i*2)+1])
                }
                else if(winnersList[winnersList.length-1] == "Player 2"){
                    highLight(svgDoc,initialPositions[(i*2)+1])
                    dimLoser(svgDoc,initialPositions[(i*2)])
                }

                domPosition = "Winner"
                winnersList[i]=="Player 1" ? winnerName = WinnerNamesList[i-2] : winnerName = WinnerNamesList[i-1]
            }
            else{
                domPosition = initialPositions[(numberOfPlayers)+i]
            }
            changeNameText(svgDoc, domPosition, winnerName)
            WinnerNamesList.push(winnerName)
        }
        if(winnersList.length + 1 < numberOfPlayers){
            if(winnersList.length>=numberOfPlayers/2){
                nextGameP1 = WinnerNamesList[((winnersList.length)-numberOfPlayers/2 + subtractor1 + subtractor2)]
                nextGameP2 = WinnerNamesList[(winnersList.length)-numberOfPlayers/2 + 1 + subtractor1 + subtractor2]
            }
        }

    }
}

function updateNextGameText(){
    if(winnersList.length + 1 < numberOfPlayers){
        if(winnersList.length<numberOfPlayers/2){
            nextGameP1 = playersList[(2*winnersList.length)]
            nextGameP2 = playersList[(2*winnersList.length)+1]
        }
        nextGamePlayers = [nextGameP1, nextGameP2]
        document.getElementById("nextGame_P1").textContent = nextGameP1;
        document.getElementById("nextGame_P2").textContent = nextGameP2;
    }
    else if(winnersList.length + 1 >= numberOfPlayers){
        document.getElementById("nextGameDiv").style.display = "none";
        buttonSelected = "claimButton"
        document.getElementById("winnerName").textContent = WinnerNamesList[(WinnerNamesList.length-1)];
        document.getElementById("tournFinishedDiv").style.display = "block";

        if(winnersList[winnersList.length-1]=="Player 1"){
            sessionStorage.setItem("P1Name", WinnerNamesList[(WinnerNamesList.length-1)]);
            sessionStorage.setItem("P2Name", WinnerNamesList[(WinnerNamesList.length-2)]);
        }
        else if(winnersList[winnersList.length-1]=="Player 2"){
            sessionStorage.setItem("P2Name", WinnerNamesList[(WinnerNamesList.length-1)]);
            sessionStorage.setItem("P1Name", WinnerNamesList[(WinnerNamesList.length-2)]);
        }
    }
}

let numberofCreates = 0;
let buttonSelected = "cancelButton"
addEventListener("keydown", function(event) {
    if (event.key === "ArrowRight" || event.key === "d") {
        if(numberOfDeposits>=numberOfPlayers && buttonSelected== "cancelButton"){
            document.getElementById("proceedButton").style.animationDuration  = "2s";
            document.getElementById("backButton").style.animationDuration  = "0s";
            buttonSelected="proceedButton";
        }
        else if(buttonSelected=="backButton"){
            document.getElementById("proceedButton").style.animationDuration  = "2s";
            document.getElementById("backButton").style.animationDuration  = "0s";
            buttonSelected="confirmButton";
        }
    }
    if (event.key === "ArrowLeft" || event.key === "a") {
        if(numberOfDeposits>=numberOfPlayers && buttonSelected== "proceedButton"){
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
            if(numberOfDeposits>0){
                document.getElementById("withdrawableuses").textContent = numberOfDeposits;
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
            else if(numberOfDeposits==0){
                console.log("Trying to delete paylink "+paymentsDict[key]);
                socket.emit('cancelgame')
                window.location.href = "/tournprefs";
            }
        }
        else if(buttonSelected=="backButton"){
            document.getElementById("buyintext").style.display = "block";
            document.getElementById("qrCodeDiv").style.display = "block";
            document.getElementById("satsdeposited").style.display = "block";
            document.getElementById("issuerefundsdiv").style.display = "none";
            document.getElementById("backButton").textContent = "CANCEL";
            document.getElementById("proceedButton").textContent = "START";
            if(numberOfDeposits!=numberOfPlayers){
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
            //playersList = shuffleList(playersList)
            //changeHTMLAfterPayment()
            document.getElementById("bracketPayment").style.display = "none";
            document.getElementById("nextGameDiv").style.display = "block";
            highLightCurrentGameRect(svgDoc,initialPositions[0])
            highLightCurrentGameRect(svgDoc,initialPositions[1])
            highLightCurrentGameName(svgDoc,1)
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
            if(numberOfDeposits==0){
                window.location.href = "/tournprefs";
            }
            else if(numberOfDeposits>0){
                buttonSelected="none";
                console.log("Trying to create LNURLw");
                socket.emit('createWithdrawal', {"amount": Math.floor((deposit)*0.95), "maxWithdrawals": numberOfDeposits});
                document.getElementById("issuerefundsfirst").style.display = "none";
                document.getElementById("issuerefundssecond").style.display = "block";
                document.getElementById("backButton").style.display = "none";
                document.getElementById("proceedButton").style.display = "none";
                document.getElementById("sponsoredImgBraket").style.display = "none";
            }
        }
        else if(buttonSelected=="startGameButton"){
            if(previousWinner==null){
                nextGameP1 = playersList[0]
                nextGameP2 = playersList[1]
            }
            nextGamePlayers = [nextGameP1, nextGameP2]
            sessionStorage.setItem("gamePlayers", JSON.stringify(nextGamePlayers));
            if(previousWinner==null){
                nextGameP1 = playersList[0]
                nextGameP2 = playersList[1]
                if(numberofCreates==0){
                    let stringplayersList = JSON.stringify(playersList.slice(0, numberOfPlayers))
                    sessionStorage.setItem("PlayerList", stringplayersList);
                    sessionStorage.setItem("P1Sats", deposit);
                    sessionStorage.setItem("P2Sats", deposit);
                    //console.log("Trying to create LNURLw");
                    //socket.emit('createWithdrawal', {"amount": Math.floor((deposit*numberOfDeposits)*0.95), "maxWithdrawals": 1});
                    numberofCreates=1;
                    window.location.href = "/game";
                }
            }
            else if(previousWinner!=null){
                let stringWinnersList = JSON.stringify(winnersList)
                sessionStorage.setItem("WinnersList", stringWinnersList);
                window.location.href = "/game";
            }
        }
        else if(buttonSelected=="claimButton"){
            sessionStorage.setItem("P1Sats", deposit);
            sessionStorage.setItem("P2Sats", deposit);
            window.location.href = "/postgame";
        }
    }

})

let timesWithdrawed = 0;
socket.on('rescreateWithdrawal', (data) => { // data.id data.lnurl data.max_withdrawable
    if(buttonSelected=="none"){
        document.getElementById("currentWithdrawalPlayer").textContent = playerListSequencial[0];
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
        sessionStorage.setItem("LNURLID", data.id);
        sessionStorage.setItem("LNURL", data.lnurl);
        sessionStorage.setItem("LNURLMAXW", data.max_withdrawable);
        //window.location.href = "/game";
    }
});

socket.on('prizeWithdrawn', (data) => {
    let playerToRemove = playerListSequencial[timesWithdrawed]
    let counter = 0
    while(playersList[counter]!=playerToRemove && counter<numberOfPlayers){
        counter++
    }
    changeNameText(svgDoc,initialPositions[counter], "")
    timesWithdrawed++;
    document.getElementById("currentWithdrawalPlayer").textContent = playerListSequencial[timesWithdrawed];
    if(timesWithdrawed==numberOfDeposits){
        window.location.href = "/tournprefs";
    }
});

function highLightCurrentGameRect(svgDoc,id){
    svgDoc.getElementById(id+'_rect').style.strokeWidth = 6;
}

function highLightCurrentGameName(svgDoc,gameNumber){
    svgDoc.getElementById("G"+gameNumber).style.opacity = 1;
    svgDoc.getElementById("G"+gameNumber).style.fontWeight = "900";
}

function dimLoser(svgDoc,id){
    svgDoc.getElementById(id+'_name').style.opacity = 0.5;
    svgDoc.getElementById(id+'_rect').style.opacity = 0.7;
}

function highLight(svgDoc,id){
    svgDoc.getElementById(id+'_name').style.fill = "black";
    svgDoc.getElementById(id+'_rect').style.fill = "#fff";
    svgDoc.getElementById(id+'_path').style.opacity = 1;
    svgDoc.getElementById(id+'_path').style.strokeWidth = 5;
  }

function highLightWinnerSquare(svgDoc,id){
    svgDoc.getElementById(id+'_name').style.fill = "black";
    svgDoc.getElementById(id+'_rect').style.fill = "#fff";
}

function changeNameText(svgDoc,id, name){
    svgDoc.getElementById(id+'_name').textContent = name;
    svgDoc.getElementById(id+'_name').style.opacity = "1";
}

function shuffleList(array) {
    let m = array.length;
    let t, i;
    while (m) {
      i = Math.floor(Math.random() * m--);
      t = array[m];
      array[m] = array[i];
      array[i] = t;
    }
    return array;
  }
