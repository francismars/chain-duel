import { listenToGamepads } from "./gamepads.js";

let titleCanvas = document.getElementById("titleCanvas");
titleCanvas.width = window.innerWidth*(0.7);
titleCanvas.height = window.innerHeight*(0.1);
let larguraTitle = titleCanvas.width;
let alturaTitle = titleCanvas.height;
let ctxTitle = titleCanvas.getContext("2d");
let gameCols = 51;
let gameRows = 25;
let gameCanvas = document.getElementById("gameCanvas");
gameCanvas.width = window.innerWidth*(0.7);
gameCanvas.height = window.innerWidth*(0.35);
let larguraGame = gameCanvas.width;
let alturaGame = gameCanvas.height;
let ctxGame = gameCanvas.getContext("2d");
let colSize = larguraGame / gameCols;
let rowSize = alturaGame / gameRows;
let p1HeadPos = [6,12];
let p1BodyPos = [[5,12]];
let p1Dir = "";
let p1DirWanted = "Right";
let p2HeadPos = [44,12];
let p2BodyPos = [[45,12]];
let p2Dir = "";
let p2DirWanted = "Left";
let coinbasePos = [[25,12]];
let countdownStart = false;
let gameStarted = false;
let gameEnded = false;
let P1Name = sessionStorage.getItem("P1Name");
let gamePlayers = JSON.parse(sessionStorage.getItem("gamePlayers"));


if(gamePlayers!=null){
    P1Name=gamePlayers[0]
}
if (P1Name==null){
    P1Name="Player 1"
}
if (P1Name!="Player 1"){
    document.getElementById("player1name").innerText = P1Name;
}
let P2Name = sessionStorage.getItem("P2Name");
if(gamePlayers!=null){
    P2Name=gamePlayers[1]
}
if (P2Name==null){
    P2Name="Player 2"
}
if (P2Name!="Player 2"){
    document.getElementById("player2name").innerText = P2Name;
}
const payProtection = false;
let SatsP1 = sessionStorage.getItem('P1Sats');
if (SatsP1==null){
    if (payProtection==true){
        window.location.href = "/gamemenu";
    }
    SatsP1=1000
}
else { SatsP1 = parseInt(SatsP1) }
let SatsP2 = sessionStorage.getItem('P2Sats');
if (SatsP2==null){
    if (payProtection==true){
        window.location.href = "/gamemenu";
    }
    SatsP2=1000
}
else { SatsP2 = parseInt(SatsP2) }
let initialScoreDistribution = [SatsP1,SatsP2];
let totalPoints = initialScoreDistribution[0] + initialScoreDistribution[1]
let currentScoreDistribution = [SatsP1,SatsP2];
let percentageInitialP1 = ((initialScoreDistribution[0] * 100) / totalPoints)/100;
const gameSpeed = 1000/60
const stepSpeed = 1000/10
let counterStart = 0;
let winnerP = "";
let intervalStep = setInterval(step, stepSpeed);
const beepCD1 = new Audio("./sound/Beep1.m4a");
const beepCD2 = new Audio("./sound/Beep2.m4a");
let beep1Played = false;
let beep2Played = false;
let beep3Played = false;
let beep4Played = false;

const p1FC = new Audio("./sound/P1-FC.mp3");
const p2FC = new Audio("./sound/P2-FC.mp3");



const p1reset = new Audio("./sound/P1-HWAC.mp3");
const p2reset = new Audio("./sound/P2-HWAC.mp3");



/* P2P vs Tournament Game Name */
let playerListParsed = JSON.parse(sessionStorage.getItem("PlayerList"));
let winnersListStorage = JSON.parse(sessionStorage.getItem("WinnersList"));
let donRound = sessionStorage.getItem("donRound");
let donText = "";
console.log("donRound")
if(playerListParsed==null){
    console.log(donRound)
    if(donRound!=null){
      donText = "*"+(Math.pow(2,donRound))
    }else{
      donText = ""
    }
    document.getElementById("gameInfo").textContent = "P2P"+donText
}
else if(playerListParsed!=null){
  if(winnersListStorage==null){
    document.getElementById("gameInfo").textContent = "GAME 1 of "+(playerListParsed.length-1)
  }else{
    document.getElementById("gameInfo").textContent = "GAME " + (winnersListStorage.length+1)+" of "+(playerListParsed.length-1)
  }
}



/*
let intervalDraw = setInterval(draw, gameSpeed);
let intervalCountdown = setInterval(counterStartFunc, 100);
function counterStartFunc(){
    if(countdownStart == true){
        counterStart++;
        if (counterStart > 50){
            clearInterval(intervalCountdown);
        }
    }

}
*/

function draw(){
    //clear();
    listenToGamepads();
    updateScore();
    displayTitle();
    displayGame();
    window.requestAnimationFrame(draw);
}

window.requestAnimationFrame(draw);

function step(){
    if(gameStarted && !gameEnded){
        movePlayers()
        checkCollisions()
        captureCoinbase()
    }
    else if(countdownStart){
        counterStart++;
        if (counterStart > 50){
            countdownStart = false;
        }
    }
}

// Not necessary since there's a loop on titleCanvas.width\height
function clear(){
    ctxTitle.clearRect(0, 0, larguraTitle, alturaTitle);
    ctxGame.clearRect(0, 0, larguraGame, alturaGame);
}

function updateScore(){
    document.getElementById('p1Points').innerText = currentScoreDistribution[0].toLocaleString()
    document.getElementById('p2Points').innerText = currentScoreDistribution[1].toLocaleString()
}

function resetP1(){
    p1HeadPos = [6,12];
    p1BodyPos = [[5,12]];
    p1Dir = "";
    p1DirWanted = "Right";
    p1reset.pause();
    p1reset.currentTime = 0;
    p1reset.play();
}

function resetP2(){
    p2HeadPos = [44,12];
    p2BodyPos = [[45,12]];
    p2Dir = "";
    p2DirWanted = "Left";
    p2reset.pause();
    p2reset.currentTime = 0;
    p2reset.play();
}

function createNewCoinbase(){
    let newValueAccepted = false;
    while(newValueAccepted==false){
        let foundCollision = false;
        let maxX = gameCols;
        let maxY = gameRows;
        let newX = Math.floor(Math.random() * maxX);
        let newY = Math.floor(Math.random() * maxY);
        for(let i=0;i<p1BodyPos.length;i++){
            if(p1BodyPos[i][0]==newX && p1BodyPos[i][1]==newY){
                foundCollision = true;
            }
        }
        if(p1HeadPos[0]==newX && p1HeadPos[1]==newY){
            foundCollision = true;
        }
        for(let i=0;i<p2BodyPos.length;i++){
            if(p2BodyPos[i][0]==newX && p2BodyPos[i][1]==newY){
                foundCollision = true;
            }
        }
        if(p2HeadPos[0]==newX && p2HeadPos[1]==newY){
            foundCollision = true;
        }
        if(foundCollision==false){
            newValueAccepted = true;
            coinbasePos.push([newX,newY]);
        }
    }
}

function changeScore(playerID){
    let changeInPoints = 0;
    let bodySnake;
    if(playerID=="P1"){ bodySnake = p1BodyPos }
    if(playerID=="P2"){ bodySnake = p2BodyPos }
    if(bodySnake.length==1){
        changeInPoints=Math.floor(totalPoints*0.02);
    }
    else if(bodySnake.length==2){
        changeInPoints=Math.floor(totalPoints*0.04);
    }
    else if(bodySnake.length>=3 && bodySnake.length<=6){
        changeInPoints=Math.floor(totalPoints*0.08);
    }
    else if(bodySnake.length>=7 && bodySnake.length<=14){
        changeInPoints=Math.floor(totalPoints*0.16);
    }
    else if(bodySnake.length>=15){
        changeInPoints=Math.floor(totalPoints*0.32);
    }
    if(changeInPoints<1){ changeInPoints=1; }
    pushToTakenValuesArray(playerID, changeInPoints, p1HeadPos, p2HeadPos);
    if(playerID=="P1"){
        currentScoreDistribution[0]+=changeInPoints;
        currentScoreDistribution[1]-=changeInPoints;
        if(currentScoreDistribution[1]<0){ currentScoreDistribution[1]=0; }
        if(currentScoreDistribution[0]>totalPoints){ currentScoreDistribution[0]=totalPoints; }
    }
    else if(playerID=="P2"){
        currentScoreDistribution[1]+=changeInPoints;
        currentScoreDistribution[0]-=changeInPoints;
        if(currentScoreDistribution[0]<0){ currentScoreDistribution[0]=0; }
        if(currentScoreDistribution[1]>totalPoints){ currentScoreDistribution[1]=totalPoints; }
    }
}

let listTakenValues = []
function pushToTakenValuesArray(player, value, posP1, posP2){
    let alpha = 1.0;
    let xP1 = (posP1[0]*colSize)+colSize/2
    let yP1 = (posP1[1]*rowSize)+rowSize/2
    let xP2 = (posP2[0]*colSize)+colSize/2
    let yP2 = (posP2[1]*rowSize)+rowSize/2
    listTakenValues.push({"player": player, "value": value, "P1x": xP1, "P1y": yP1, "P2x": xP2, "P2y" : yP2, "alpha": alpha})
}

function drawPointChange(){
    for(let i=0;i<listTakenValues.length;i++){
        let alpha = listTakenValues[i].alpha;
        let xP1 = listTakenValues[i].P1x
        let yP1 = listTakenValues[i].P1y
        let xP2 = listTakenValues[i].P2x
        let yP2 = listTakenValues[i].P2y
        let player = listTakenValues[i].player
        let value = listTakenValues[i].value
        ctxGame.font = gameCanvas.width/111+"pt Inter";
        ctxGame.textAlign = "center";
        ctxGame.textBaseline = "middle";
        if(player=="P1"){
            ctxGame.fillStyle  = "rgba(66, 163, 69, " + alpha + ")";
            ctxGame.fillText("+"+value, xP1, yP1);
            ctxGame.fillStyle  = "rgba(241, 56, 56, " + alpha + ")";
            ctxGame.fillText("-"+value, xP2, yP2);
        }
        else if(player=="P2"){
            ctxGame.fillStyle  = "rgba(241, 56, 56, " + alpha + ")";
            ctxGame.fillText("-"+value, xP1, yP1);
            ctxGame.fillStyle  = "rgba(66, 163, 69, " + alpha + ")";
            ctxGame.fillText("+"+value, xP2, yP2);
        }
        listTakenValues[i].P1y = yP1 - 1
        listTakenValues[i].P2y = yP2 - 1
        listTakenValues[i].alpha = alpha - 0.1/6;
        if (listTakenValues[i].alpha < 0) {
            listTakenValues.splice(i, 1)
        }
    }
}

function increaseBody(playerID){
    let lastBodyPart;
    let nextToLastBodyPart;
    let bodyToIncrease;
    if(playerID=="P1"){
        lastBodyPart = p1BodyPos[p1BodyPos.length-1];
        if(p1BodyPos.length>1){
            nextToLastBodyPart = p1BodyPos[p1BodyPos.length-2];
        }
        else if(p1BodyPos.length==1){
            nextToLastBodyPart = p1HeadPos;
        }
        bodyToIncrease = p1BodyPos;
    }
    else if(playerID=="P2"){
        lastBodyPart = p2BodyPos[p2BodyPos.length-1];
        if(p2BodyPos.length>1){
            nextToLastBodyPart = p2BodyPos[p2BodyPos.length-2];
        }
        else if(p2BodyPos.length==1){
            nextToLastBodyPart = p2HeadPos;
        }
        bodyToIncrease = p2BodyPos;
    }
    if(lastBodyPart[0]<nextToLastBodyPart[0]){
        bodyToIncrease.push([lastBodyPart[0]-1,lastBodyPart[1]])
    }
    else if(lastBodyPart[0]>nextToLastBodyPart[0]){
        bodyToIncrease.push([lastBodyPart[0]+1,lastBodyPart[1]])
    }
    else if(lastBodyPart[1]<nextToLastBodyPart[1]){
        bodyToIncrease.push([lastBodyPart[0],lastBodyPart[1]-1])
    }
    else if(lastBodyPart[1]>nextToLastBodyPart[1]){
        bodyToIncrease.push([lastBodyPart[0],lastBodyPart[1]+1])
    }
}

function displayGame(){
    gameSettings()
    drawGameSquares()
    drawPlayers()
    drawPointChange()
    if(!gameStarted && !gameEnded){

        if(!countdownStart){
            initialText()
            //drawControllerTest()
        }
        if(countdownStart){ drawCountdown() }
    }
    if(gameStarted && !gameEnded){
        if(currentScoreDistribution[0]<=0 || currentScoreDistribution[1]<=0){
            gameEnded = true;
        }
        else {
            drawCoinbase()
        }
    }
    if(gameEnded){
        let winner = "";
        if(currentScoreDistribution[0]<=0){ winner=P2Name }
        else if(currentScoreDistribution[1]<=0){ winner=P1Name }
        if(currentScoreDistribution[0]<=0){
            winnerP="Player 2"
        }
        else if(currentScoreDistribution[1]<=0){
            winnerP="Player 1"
        }
        sessionStorage.setItem("gameWinner", winnerP);
        finalText(winner)
    }
}

function drawControllerTest(){
    ctxGame.beginPath();
    ctxGame.arc(gameCanvas.width/4, gameCanvas.height/1.5, gameCanvas.height/10, 0, 2 * Math.PI)
    ctxGame.fillStyle = "orange";
    ctxGame.fill();
    let p1testText = ""
    if(p2DirWanted=="UP") p1testText=="UP"
    ctxGame.fillText(controllerTestP1Direction, gameCanvas.width/4, gameCanvas.height/1.5);
}

function gameSettings(){
    gameCanvas.width = window.innerWidth*(0.7);
    gameCanvas.height = window.innerWidth*(0.35);
    larguraGame = gameCanvas.width;
    alturaGame = gameCanvas.height;
    colSize = larguraGame / gameCols;
    rowSize = alturaGame / gameRows;
}

function finalText(winner){
    ctxGame.font = gameCanvas.width/17+"px BureauGrotesque";
    ctxGame.fontWeight = "50%";
    ctxGame.fillStyle = "white";
    ctxGame.textAlign = "center";
    ctxGame.textBaseline = "middle";
    ctxGame.strokeStyle = "black";
    ctxGame.shadowColor = "rgba(0,0,0,0.9)";
    ctxGame.shadowOffsetX = 0;
    ctxGame.shadowOffsetY = 0;
    ctxGame.shadowBlur = 30;
    ctxGame.fillText(winner.toUpperCase()+" WINS!", (larguraGame/2), (alturaGame/2)-15);
    ctxGame.font = gameCanvas.width/39+"px BureauGrotesque";
    ctxGame.fillText("PRESS ANY BUTTON TO CONTINUE", (larguraGame/2), (alturaGame/2)+35);
}

function drawGameSquares(){
  // Desenhar quadrados para game debug
  for (let i=0;i<=gameCols;i++){
     for (let j=0;j<=gameRows;j++){
         ctxGame.beginPath();
         ctxGame.strokeStyle =  "rgba(255, 255, 255, 0.05)";
         ctxGame.lineWidth = 1;
         ctxGame.rect(i*colSize, j*rowSize, colSize, rowSize);
         ctxGame.stroke();
     }
  }
}

function initialText(){
    ctxGame.font = gameCanvas.width/17+"px BureauGrotesque";
    ctxGame.fontWeight = "50%";
    ctxGame.fillStyle = "white";
    ctxGame.textAlign = "center";
    ctxGame.textBaseline = "middle";
    ctxGame.strokeStyle = "black";
    ctxGame.shadowColor = "rgba(0,0,0,0.9)";
    ctxGame.shadowOffsetX = 0;
    ctxGame.shadowOffsetY = 0;
    ctxGame.shadowBlur = 30;
    ctxGame.fillText("PRESS BUTTON TO START", (larguraGame/2), alturaGame/2);
}

function drawPlayers(){
    let p1height = rowSize
    let p2height = rowSize
    let displacementP1 = 0
    let displacementP2 = 0
    if(!gameStarted && controllerTestP1Direction!=""){
        displacementP1 = 2
        p1height = p1height + displacementP1*2
    }
    if(!gameStarted && controllerTestP2Direction!=""){
        displacementP2 = 2
        p2height = p2height + displacementP2*2
    }
    ctxGame.fillStyle = "white";
    ctxGame.beginPath();
    ctxGame.fillRect(colSize*p1HeadPos[0], rowSize*p1HeadPos[1]-displacementP1, colSize, p1height);
    ctxGame.stroke();
    let bodyPart;
    for (let i=0;i<p1BodyPos.length;i++){
        bodyPart = p1BodyPos[i];
        ctxGame.globalAlpha = 0.6;
        ctxGame.beginPath();
        ctxGame.fillRect(colSize*bodyPart[0], rowSize*bodyPart[1]-displacementP1, colSize, p1height);
        ctxGame.stroke();
        ctxGame.globalAlpha = 1;
    }
    ctxGame.fillStyle = "black";
    ctxGame.beginPath();
    ctxGame.fillRect(colSize*p2HeadPos[0], rowSize*p2HeadPos[1]-displacementP2, colSize, p2height);
    ctxGame.stroke();
    for (let i=0;i<p2BodyPos.length;i++){
        bodyPart = p2BodyPos[i];
        ctxGame.globalAlpha = 0.6;
        ctxGame.beginPath();
        ctxGame.fillRect(colSize*bodyPart[0], rowSize*bodyPart[1]-displacementP2, colSize, p2height);
        ctxGame.stroke();
        ctxGame.globalAlpha = 1;
    }
}

function drawCountdown(){
    ctxGame.font = "30px BureauGrotesque";
    ctxGame.fontWeight = "50%";
    ctxGame.fillStyle = "white";
    ctxGame.textAlign = "center";
    ctxGame.textBaseline = "middle";
    ctxGame.strokeStyle = "white";
    let alturaNumbers = (alturaGame*0.50).toString();
    ctxGame.font = alturaNumbers.concat("px BureauGrotesque");
    if(counterStart>0 && counterStart<=10){
        if(!beep1Played){
            beepCD1.play();
            beep1Played = true;
        }
        ctxGame.fillText("3", (larguraGame*0.24), alturaGame/2);
        ctxGame.strokeText("2", (larguraGame*0.36), alturaGame/2);
        ctxGame.strokeText("1", (larguraGame*0.47), alturaGame/2);
        ctxGame.strokeText("LFG", (larguraGame*0.675), alturaGame/2);
    }
    else if (counterStart>10 && counterStart<=20){
        if(!beep2Played){
            beepCD1.play();
            beep2Played = true;
        }
        ctxGame.fillText("3", (larguraGame*0.24), alturaGame/2);
        ctxGame.fillText("2", (larguraGame*0.36), alturaGame/2);
        ctxGame.strokeText("1", (larguraGame*0.47), alturaGame/2);
        ctxGame.strokeText("LFG", (larguraGame*0.675), alturaGame/2);
    }
    else if (counterStart>20 && counterStart<=30){
        if(!beep3Played){
            beepCD1.play();
            beep3Played = true;
        }
        ctxGame.fillText("3", (larguraGame*0.24), alturaGame/2);
        ctxGame.fillText("2", (larguraGame*0.36), alturaGame/2);
        ctxGame.fillText("1", (larguraGame*0.47), alturaGame/2);
        ctxGame.strokeText("LFG", (larguraGame*0.675), alturaGame/2);
    }
    else if (counterStart>30 && counterStart<=40){
        if(!beep4Played){
            beepCD2.play();
            beep4Played = true;
        }
        ctxGame.fillText("3", (larguraGame*0.24), alturaGame/2);
        ctxGame.fillText("2", (larguraGame*0.36), alturaGame/2);
        ctxGame.fillText("1", (larguraGame*0.47), alturaGame/2);
        ctxGame.fillText("LFG", (larguraGame*0.675), alturaGame/2);
    }
    else if (counterStart>40){
        gameStarted = true;
    }
}

function captureCoinbase(){

    for(let i=0;i<coinbasePos.length;i++){
        if(p1HeadPos[0]==coinbasePos[i][0] && p1HeadPos[1]==coinbasePos[i][1]){
            changeScore("P1");
            increaseBody("P1");
            coinbasePos.splice(i, 1);
            createNewCoinbase();
            p1FC.pause();
            p1FC.currentTime = 0;
            p1FC.play();
        }
        else if(p2HeadPos[0]==coinbasePos[i][0] && p2HeadPos[1]==coinbasePos[i][1]){
            changeScore("P2");
            increaseBody("P2");
            coinbasePos.splice(i, 1);
            createNewCoinbase();
            p2FC.pause();
            p2FC.currentTime = 0;
            p2FC.play();
        }
    }
}

function drawCoinbase(){
    for(let i=0;i<coinbasePos.length;i++){
        ctxGame.beginPath();
        ctxGame.arc((colSize*coinbasePos[i][0])+colSize/2, (rowSize*coinbasePos[i][1])+rowSize/2, (rowSize/2)-rowSize/5.4, 0, 2 * Math.PI, false);
        ctxGame.fillStyle = "white";
        ctxGame.shadowColor='white';
        ctxGame.shadowOffsetX=0;
        ctxGame.shadowOffsetY=0;
        ctxGame.shadowBlur=20;
        ctxGame.fill();
        ctxGame.shadowColor = "transparent";
    }
}

function movePlayers(){
    p1BodyPos.unshift([p1HeadPos[0],p1HeadPos[1]]);
    p1BodyPos.pop();
    p1Dir = p1DirWanted;
    switch(p1Dir){
        case "Up":
            p1HeadPos[1] = p1HeadPos[1]-1;
            break;
        case "Down":
            p1HeadPos[1] = p1HeadPos[1]+1;
            break;
        case "Left":
            p1HeadPos[0] = p1HeadPos[0]-1;
            break;
        case "Right":
            p1HeadPos[0] = p1HeadPos[0]+1;
            break;
    }
    p2BodyPos.unshift([p2HeadPos[0],p2HeadPos[1]]);
    p2BodyPos.pop();
    p2Dir = p2DirWanted;
    switch(p2Dir){
        case "Up":
            p2HeadPos[1] = p2HeadPos[1]-1
            break;
        case "Down":
            p2HeadPos[1] = p2HeadPos[1]+1
            break;
        case "Left":
            p2HeadPos[0] = p2HeadPos[0]-1
            break;
        case "Right":
            p2HeadPos[0] = p2HeadPos[0]+1
            break;
    }
}

function checkCollisions(){
    // Head with head
    if(p2HeadPos[0]==p1HeadPos[0] && p2HeadPos[1]==p1HeadPos[1]){
        resetP1();
        resetP2();
    }
    if(p1HeadPos[0]==p2HeadPos[0]+1 && p2HeadPos[1]==p1HeadPos[1] && p1Dir=="Right" && p2Dir=="Left" && p1DirWanted=="Right" && p2DirWanted=="Left"){
        resetP1();
        resetP2();
    }
    if(p1HeadPos[0]==p2HeadPos[0]-1 && p2HeadPos[1]==p1HeadPos[1] && p1Dir=="Left" && p2Dir=="Right" && p1DirWanted=="Left" && p2DirWanted=="Right"){
        resetP1();
        resetP2();
    }
    if(p1HeadPos[0]==p2HeadPos[0] && p1HeadPos[1]==p2HeadPos[1]-1 && p1Dir=="Up" && p2Dir=="Down" && p1DirWanted=="Up" && p2DirWanted=="Down"){
        resetP1();
        resetP2();
    }
    if(p1HeadPos[0]==p2HeadPos[0] && p1HeadPos[1]==p2HeadPos[1]+1 && p1Dir=="Down" && p2Dir=="Up" && p1DirWanted=="Down" && p2DirWanted=="Up"){
        resetP1();
        resetP2();
    }
    // Check for game borders
    if(p1HeadPos[0]>gameCols-1 || p1HeadPos[1]<0 || p1HeadPos[1]>gameRows-1 || p1HeadPos[0]<0){
        resetP1();
    }
    if(p2HeadPos[0]>gameCols-1 || p2HeadPos[1]<0 || p2HeadPos[1]>gameRows-1 || p2HeadPos[0]<0){
        resetP2();
    }
    for(let i=0;i<p1BodyPos.length;i++){
        // P1 touching own body
        if(p1HeadPos[0]===p1BodyPos[i][0] && p1HeadPos[1]===p1BodyPos[i][1]){
            resetP1();
        }
        // P2 touching P1 Body
        if(p2HeadPos[0]===p1BodyPos[i][0] && p2HeadPos[1]===p1BodyPos[i][1]){
            resetP2();
        }
    }
    for(let i=0;i<p2BodyPos.length;i++){
        // P1 touching P2 body
        if(p1HeadPos[0]===p2BodyPos[i][0] && p1HeadPos[1]===p2BodyPos[i][1]){
            resetP1();
        }
        // P2 touching own body
        if(p2HeadPos[0]===p2BodyPos[i][0] && p2HeadPos[1]===p2BodyPos[i][1]){
            resetP2();
        }
    }
}

function displayTitle(){
    let percentageCurrentP1 = ((currentScoreDistribution[0] * 100) / totalPoints)/100;

    titleCanvas.width = window.innerWidth*(0.7);
    titleCanvas.height = 70;
    larguraTitle = titleCanvas.width;
    alturaTitle = titleCanvas.height;

    /*
    ctxTitle.font = "30px BureauGrotesque";
    ctxTitle.textAlign = "left";
    ctxTitle.fillText(P1Name.toUpperCase(), 40, 26);
    ctxTitle.textAlign = "right";
    ctxTitle.fillText(P2Name.toUpperCase(), (larguraTitle-40), 26);
    */

    let p1capturing;
    ctxTitle.fillStyle = "white";
    if (p1BodyPos.length == 1) p1capturing = "2%";
    else if (p1BodyPos.length == 2) p1capturing = "4%";
    else if (p1BodyPos.length >= 3 && p1BodyPos.length < 8) p1capturing = "8%";
    else if (p1BodyPos.length >= 8 && p1BodyPos.length < 16) p1capturing = "16%";
    else if (p1BodyPos.length >= 16) p1capturing = "32%";
    ctxTitle.textAlign = "left";
    ctxTitle.font = titleCanvas.width/90 +"px Inter";
    ctxTitle.fillText(("Capturing "+ p1capturing), 0, 15);

    let p2capturing;
    if (p2BodyPos.length == 1) p2capturing = "2%";
    else if (p2BodyPos.length == 2) p2capturing = "4%";
    else if (p2BodyPos.length >= 3 && p2BodyPos.length < 8) p2capturing = "8%";
    else if (p2BodyPos.length >= 8 && p2BodyPos.length < 16) p2capturing = "16%";
    else if (p2BodyPos.length >= 16) p2capturing = "32%";
    ctxTitle.textAlign = "right";
    ctxTitle.fillText(("Capturing "+ p2capturing), larguraTitle, 15);

    /*
    ctxTitle.fillStyle = "white";
    ctxTitle.beginPath();
    ctxTitle.fillRect(0, 0, 30, 30);
    ctxTitle.stroke();
    ctxTitle.fillStyle = "black";
    ctxTitle.beginPath();
    ctxTitle.fillRect(larguraTitle-30, 0, 30, 30);
    ctxTitle.stroke();
    */

    ctxTitle.fillStyle = "black";
    ctxTitle.beginPath();
    ctxTitle.fillRect(0, 25, larguraTitle, 5);
    ctxTitle.stroke();
    ctxTitle.fillStyle = "white";
    ctxTitle.beginPath();
    ctxTitle.fillRect(0, 25, larguraTitle*percentageInitialP1, 5);
    ctxTitle.stroke();


    ctxTitle.textAlign = "center";
    ctxTitle.font = "12px Inter";
    ctxTitle.fillStyle = "silver";
    ctxTitle.fillText("INITIAL DISTRIBUTION", larguraTitle*0.5, 15);

    ctxTitle.fillStyle = "black";
    ctxTitle.beginPath();
    ctxTitle.fillRect(0, 40, larguraTitle, 30);
    ctxTitle.stroke();
    ctxTitle.fillStyle = "white";
    ctxTitle.beginPath();
    ctxTitle.fillRect(0, 40, larguraTitle*percentageCurrentP1, 30);
    ctxTitle.stroke();

    ctxTitle.font = "16px Inter";
    ctxTitle.fillStyle = "LightGray";
    ctxTitle.fillText("CURRENT DISTRIBUTION", larguraTitle*0.5, 61);
}

function redirectWindowAfterGame(){
    if(gamePlayers==null){
        window.location.href = "/postgame";
    }
    else if(gamePlayers!=null){
        window.location.href = "/tournbracket";
    }
}

let controllerTestP1Direction = ""
let controllerTestP2Direction = ""
addEventListener("keydown", function(event) {
    switch (event.key.toUpperCase()) {
        case " ":
            if(gameEnded==true && winnerP=="Player 1"){
                redirectWindowAfterGame();
            }
        case "ENTER":
            if(gameStarted==false){
                countdownStart = true;

            }
            if(gameEnded==true && winnerP == "Player 2"){
                redirectWindowAfterGame();
            }
            break;
        case "ARROWLEFT":
            if(gameStarted==true){
                if(p2Dir == "Up" || p2Dir == "Down" || p2Dir == ""){
                    p2DirWanted = "Left"
                }
            }
            else if(gameStarted==false){
                controllerTestP2Direction = "Left"
            }
            break;
        case "ARROWRIGHT":
            if(gameStarted==true){
                if(p2Dir == "Up" || p2Dir == "Down"){
                    p2DirWanted = "Right"
                }
            }
            else if(gameStarted==false){
                controllerTestP2Direction = "Right"
            }
            break;
        case "ARROWUP":
            if(gameStarted==true){
                if(p2Dir == "Left" || p2Dir == "Right"){
                    p2DirWanted = "Up"
                }
            }
            else if(gameStarted==false){
                controllerTestP2Direction = "Up"
            }
            break;
        case "ARROWDOWN":
            if(gameStarted==true){
                if(p2Dir == "Left" || p2Dir == "Right"){
                    p2DirWanted = "Down"
                }
            }
            else if(gameStarted==false){
                controllerTestP2Direction = "Down"
            }
            break;
        case "A":
            if(gameStarted==true){
                if(p1Dir == "Up" || p1Dir == "Down"){
                    p1DirWanted = "Left"
                }
            }
            else if(gameStarted==false){
                controllerTestP1Direction = "Down"
            }
            break;
        case "D":
            if(gameStarted==true){
                if(p1Dir == "Up" || p1Dir == "Down" || p1Dir == ""){
                    p1DirWanted = "Right"
                }
            }
            else if(gameStarted==false){
                controllerTestP1Direction = "Right"
            }
            break;
        case "W":
            if(gameStarted==true){
                if(p1Dir == "Left" || p1Dir == "Right"){
                    p1DirWanted = "Up"
                }
            }
            else if(gameStarted==false){
                controllerTestP1Direction = "Up"
            }
            break;
        case "S":
            if(gameStarted==true){
                if(p1Dir == "Left" || p1Dir == "Right"){
                    p1DirWanted = "Down"
                }
            }
            else if(gameStarted==false){
                controllerTestP1Direction = "Down"
            }
            break;
    }
});

addEventListener("keyup", function(event) {
    switch (event.key.toUpperCase()) {
        case "ARROWLEFT":
            if(gameStarted==false){
                controllerTestP2Direction = ""
            }
            break;
        case "ARROWRIGHT":
            if(gameStarted==false){
                controllerTestP2Direction = ""
            }
            break;
        case "ARROWDOWN":
            if(gameStarted==false){
                controllerTestP2Direction = ""
            }
            break;
        case "ARROWUP":
            if(gameStarted==false){
                controllerTestP2Direction = ""
            }
            break;
        case "A":
            if(gameStarted==false){
                controllerTestP1Direction = ""
            }
            break;
        case "S":
            if(gameStarted==false){
                controllerTestP1Direction = ""
            }
            break;
        case "D":
            if(gameStarted==false){
                controllerTestP1Direction = ""
            }
            break;
        case "W":
            if(gameStarted==false){
                controllerTestP1Direction = ""
            }
            break;
    }
});
