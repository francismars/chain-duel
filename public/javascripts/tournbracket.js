import { listenToGamepads } from "./gamepads.js";

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

let initialPositions = ["G1_P1", "G1_P2", "G2_P1", "G2_P2", "G3_P1", "G3_P2", "G4_P1", "G4_P2", "G5_P1", "G5_P2", "G6_P1", "G6_P2", "G7_P1", "G7_P2", "G8_P1", "G8_P2", "G9_P1", "G9_P2", "G10_P1", "G10_P2", "G11_P1", "G11_P2", "G12_P1", "G12_P2", "G13_P1", "G13_P2", "G14_P1", "G14_P2", "G15_P1", "G15_P2"]

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
    //playersList = ["Pedro","Joao","Maria","Jose","Antonio","Leonardo","David","Carla","Ricardo","Tiago","Hebe","Zucco","Back","Todd","Satoshi","Nakamoto"]
    let urlToParse = location.search;
    const params = new URLSearchParams(urlToParse);
    numberOfPlayers = parseInt(params.get("players"));
    deposit = parseInt(params.get("deposit"));
    socket.emit('createPaylink', {"description":"tournament","buyInMin":deposit,"buyInMax":deposit});
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
let nextGamePlayers;
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
}

let WinnerNamesList = []
function updateBracketWinner(){
    if(previousWinner!=null){
        document.getElementById("bracketPayment").style.display = "none";
        document.getElementById("nextGameDiv").style.display = "block";
        let elapsedGames = winnersList.length;
        document.getElementById("nextGameID").textContent = winnersList.length+1
        buttonSelected="startGameButton"
        let subtractor1 = 0
        let subtractor2 = 0
        let subtractor3 = 0
        console.log(winnersList)
        for(let i=0;i<winnersList.length;i++){
            let winnerName
            if(i<(numberOfPlayers/2)){ // Primeira Ronda
                if(winnersList[i]=="Player 1"){
                    highLight(svgDoc,initialPositions[(i*2)])
                    winnerName = playersList[i*2]
                }
                else if(winnersList[i]=="Player 2"){
                    highLight(svgDoc,initialPositions[(i*2)+1])
                    winnerName = playersList[(i*2)+1]
                }
            }
            else if(i>=(numberOfPlayers/2) && i<(numberOfPlayers/2)+(numberOfPlayers/4)){ // Segunda Ronda
                let winnerPlayer = winnersList[i];
                let winnerPrevious;
                let winnerPreviousMultiplier;
                if(winnerPlayer=="Player 1"){
                    highLight(svgDoc,initialPositions[(i*2)])
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
                console.log(subtractor1)
            }
            else if(i>=(numberOfPlayers/2)+(numberOfPlayers/4)){ // Terceira Ronda
                console.log("i: " + i)
                let winnerPreviousMultiplier;

                if(winnersList[i]=="Player 1"){ // WINNER = Primeira Metade
                    highLight(svgDoc,initialPositions[(i*2)])
                    let winnerPreviousIndex = i - (numberOfPlayers/4) + subtractor2
                    console.log("winnerPreviousIndex: " + winnerPreviousIndex)

                    if(winnersList[winnerPreviousIndex] == "Player 1"){ // Primeiro Quarto
                        let winnerPreviousPreviousIndex = winnerPreviousIndex - (numberOfPlayers/2) + subtractor3
                        console.log("winnerPreviousPreviousIndex: " + winnerPreviousPreviousIndex)

                        if(winnersList[winnerPreviousPreviousIndex] == "Player 1"){ // Primeiro Oitavo
                            winnerPreviousMultiplier = 0
                        }
                        else if(winnersList[winnerPreviousPreviousIndex] == "Player 2"){ // Segundo Oitavo
                            winnerPreviousMultiplier = 1
                        }
                    }

                    else if(winnersList[winnerPreviousIndex] == "Player 2"){ // Segundo Quarto
                        let winnerPreviousPreviousIndex = winnerPreviousIndex - (numberOfPlayers/2) + 1 + subtractor3
                        console.log("winnerPreviousPreviousIndex: " + winnerPreviousPreviousIndex)

                        if(winnersList[winnerPreviousPreviousIndex] == "Player 1"){ // Terceiro Oitavo
                            winnerPreviousMultiplier = 2
                        }
                        else if(winnersList[winnerPreviousPreviousIndex] == "Player 2"){ // Quarto Oitavo
                            winnerPreviousMultiplier = 3
                        }
                    }
                }

                else if(winnersList[i]=="Player 2"){ // WINNER = SEGUNDA METADE
                    highLight(svgDoc,initialPositions[(i*2)+1])
                    let winnerPreviousIndex = i - (numberOfPlayers/4) + 1 + subtractor2
                    subtractor3++
                    console.log("winnerPreviousIndex: " + winnerPreviousIndex)

                    if(winnersList[winnerPreviousIndex] == "Player 1"){ // Terceiro Quarto
                        let winnerPreviousPreviousIndex = winnerPreviousIndex - (numberOfPlayers/2) + subtractor3
                        console.log("winnerPreviousPreviousIndex: " + winnerPreviousPreviousIndex)

                        if(winnersList[winnerPreviousPreviousIndex] == "Player 1"){ // Quinto Oitavo
                            winnerPreviousMultiplier = 4
                        }
                        else if(winnersList[winnerPreviousPreviousIndex] == "Player 2"){ // Sexto Oitavo
                            winnerPreviousMultiplier = 5
                        }
                    }

                    else if(winnersList[winnerPreviousIndex] == "Player 2"){ // Quarto Quarto
                        let winnerPreviousPreviousIndex = winnerPreviousIndex - (numberOfPlayers/2) + 1 + subtractor3
                        console.log("winnerPreviousPreviousIndex: " + winnerPreviousPreviousIndex)

                        if(winnersList[winnerPreviousPreviousIndex] == "Player 1"){ // Setimo Oitavo
                            winnerPreviousMultiplier = 6
                        }
                        else if(winnersList[winnerPreviousPreviousIndex] == "Player 2"){ // Nono Oitavo
                            winnerPreviousMultiplier = 7
                        }
                    }
                }
                let winnerId = (8*(i-(numberOfPlayers/2)-(numberOfPlayers/4)))+winnerPreviousMultiplier
                winnerName = playersList[winnerId]
                subtractor2++
                subtractor3++
            }
            let domPosition
            if((i+1)==(numberOfPlayers-1)){
                highLightWinnerSquare(svgDoc,"Winner")
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
        }
        else if(winnersList[winnersList.length-1]=="Player 2"){
            sessionStorage.setItem("P2Name", WinnerNamesList[(WinnerNamesList.length-1)]);
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
            if(playersList.length>0){
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
            else if(playersList.length==0){
                for(var key in paymentsDict) {
                    let value = paymentsDict[key];
                    console.log("Trying to delete paylink "+value);
                    socket.emit('deletepaylink', value);
                }
                if(playersList.length==0){
                    window.location.href = "/tournprefs";
                }
            }
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
                nextGameP1 = playersList[0]
                nextGameP2 = playersList[1]
            }
            nextGamePlayers = [nextGameP1, nextGameP2]
            sessionStorage.setItem("gamePlayers", JSON.stringify(nextGamePlayers));
            if(previousWinner==null){
                nextGameP1 = playersList[0]
                nextGameP2 = playersList[1]
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
        else if(buttonSelected=="claimButton"){
            sessionStorage.setItem("P1Sats", (deposit*numberOfPlayers));
            sessionStorage.setItem("P2Sats", 0);
            sessionStorage.removeItem("WinnersList");
            sessionStorage.removeItem("PlayerList");
            window.location.href = "/postgame";
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
        sessionStorage.setItem("LNURLID", data.id);
        sessionStorage.setItem("LNURL", data.lnurl);
        sessionStorage.setItem("LNURLMAXW", data.max_withdrawable);
        window.location.href = "/game";
    }
});

socket.on('prizeWithdrawn', (data) => {
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

function highLightWinnerSquare(svgDoc,id){
    svgDoc.getElementById(id+'_name').style.fill = "black";
    svgDoc.getElementById(id+'_rect').style.fill = "#fff";
}

function changeNameText(svgDoc,id, name){
    svgDoc.getElementById(id+'_name').textContent = name;
    svgDoc.getElementById(id+'_name').style.opacity = "1";
}
