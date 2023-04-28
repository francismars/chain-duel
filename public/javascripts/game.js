var titleCanvas = document.getElementById("titleCanvas");
titleCanvas.width = window.innerWidth*(0.7);
titleCanvas.height = window.innerHeight*(0.1);
var larguraTitle = titleCanvas.width;
var alturaTitle = titleCanvas.height;
var ctxTitle = titleCanvas.getContext("2d");

var gameCanvas = document.getElementById("gameCanvas");
gameCanvas.width = window.innerWidth*(0.7);
gameCanvas.height = window.innerWidth*(0.35);
var larguraGame = gameCanvas.width;
var alturaGame = gameCanvas.height;
var ctxGame = gameCanvas.getContext("2d");

var P1Name = sessionStorage.getItem("P1Name");
if (P1Name==null){
    P1Name="Player 1"
}
var P2Name = sessionStorage.getItem("P2Name");
if (P2Name==null){
    P2Name="Player 2"
}

var SatsP1 = sessionStorage.getItem('P1Sats');
if (SatsP1==null){
    SatsP1=1000
}
else { SatsP1 = parseInt(SatsP1) }

var SatsP2 = sessionStorage.getItem('P2Sats');
if (SatsP2==null){
    SatsP2=1000
}
else { SatsP2 = parseInt(SatsP2) }

let initialScoreDistribution = [SatsP1,SatsP2];
let totalPoints = initialScoreDistribution[0] + initialScoreDistribution[1]
let currentScoreDistribution = [SatsP1,SatsP2];
let percentageInitialP1 = ((initialScoreDistribution[0] * 100) / totalPoints)/100;

let gamepad1 = null;
let gamepad2 = null;

const gameSpeed = 100
let intervalStart = setInterval(draw, gameSpeed);

let counterStart = 0;
function counterStartFunc(){
    counterStart++;
    if (counterStart == 5){
        clearInterval(intervalMain);
    }
}

function draw(){
    //clear();
    listenToGamepads()
    updateScore();
    displayTitle();
    displayGame();
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
}

function resetP2(){
    p2HeadPos = [44,12];
    p2BodyPos = [[45,12]];
    p2Dir = "";
    p2DirWanted = "Left";
}

let gameCols = 51;
let gameRows = 25;

let p1HeadPos = [6,12];
let p1BodyPos = [[5,12]];
let p1Dir = "";
let p1DirWanted = "Right";

let p2HeadPos = [44,12];
let p2BodyPos = [[45,12]];
let p2Dir = "";
let p2DirWanted = "Left";

let foodPos = [[25,12]];

var countdownStart = false;
var gameStarted = false;
var gameEnded = false;

function createNewFood(){
    newValueAccepted = false;
    while(newValueAccepted==false){
        foundCollision = false;
        maxX = gameCols;
        maxY = gameRows;
        newX = Math.floor(Math.random() * maxX);
        newY = Math.floor(Math.random() * maxY);
        for(i=0;i<p1BodyPos.length;i++){
            if(p1BodyPos[i][0]==newX && p1BodyPos[i][1]==newY){
                foundCollision = true;
            }
        }
        if(p1HeadPos[0]==newX && p1HeadPos[1]==newY){
            foundCollision = true;
        }
        for(i=0;i<p2BodyPos.length;i++){
            if(p2BodyPos[i][0]==newX && p2BodyPos[i][1]==newY){
                foundCollision = true;
            }
        }
        if(p2HeadPos[0]==newX && p2HeadPos[1]==newY){
            foundCollision = true;
        }
        if(foundCollision==false){
            newValueAccepted = true;
            foodPos.push([newX,newY]);
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
    for(i=0;i<listTakenValues.length;i++){
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
            ctxGame.fillStyle  = "rgba(0, 0, 0, " + alpha + ")";
            ctxGame.fillText("+"+value, xP1, yP1);
            ctxGame.fillStyle  = "rgba(255, 255, 255, " + alpha + ")";
            ctxGame.fillText("-"+value, xP2, yP2);
        }
        else if(player=="P2"){
            ctxGame.fillStyle  = "rgba(0, 0, 0, " + alpha + ")";
            ctxGame.fillText("-"+value, xP1, yP1);
            ctxGame.fillStyle  = "rgba(255, 255, 255, " + alpha + ")";
            ctxGame.fillText("+"+value, xP2, yP2);
        }       
        listTakenValues[i].P1y = yP1 - 1
        listTakenValues[i].P2y = yP2 - 1
        listTakenValues[i].alpha = alpha - 0.1;
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
        if(!countdownStart){ initialText() }
        if(countdownStart){ drawCountdown() }
    }
    else if(gameStarted && !gameEnded){
        movePlayers()
        checkCollisions()
        drawFood()
        eatingFood()
        if(currentScoreDistribution[0]<=0 || currentScoreDistribution[1]<=0){
            gameEnded = true;
        }
    }
    if(gameEnded){
        let winner = "";
        if(currentScoreDistribution[0]<=0){ winner=P2Name }
        else if(currentScoreDistribution[1]<=0){ winner=P1Name }
        finalText(winner)
    }
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
  for (i=0;i<=gameCols;i++){
     for (j=0;j<=gameRows;j++){
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
    ctxGame.fillStyle = "white";
    ctxGame.beginPath();
    ctxGame.fillRect(colSize*p1HeadPos[0], rowSize*p1HeadPos[1], colSize, rowSize);
    ctxGame.stroke();
    for (i=0;i<p1BodyPos.length;i++){
        bodyPart = p1BodyPos[i];
        ctxGame.globalAlpha = 0.6;
        ctxGame.beginPath();
        ctxGame.fillRect(colSize*bodyPart[0], rowSize*bodyPart[1], colSize, rowSize);
        ctxGame.stroke();
        ctxGame.globalAlpha = 1;
    }
    ctxGame.fillStyle = "black";
    ctxGame.beginPath();
    ctxGame.fillRect(colSize*p2HeadPos[0], rowSize*p2HeadPos[1], colSize, rowSize);
    ctxGame.stroke();
    for (i=0;i<p2BodyPos.length;i++){
        bodyPart = p2BodyPos[i];
        ctxGame.globalAlpha = 0.6;
        ctxGame.beginPath();
        ctxGame.fillRect(colSize*bodyPart[0], rowSize*bodyPart[1], colSize, rowSize);
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
    alturaNumbers = (alturaGame*0.50).toString();
    ctxGame.font = alturaNumbers.concat("px BureauGrotesque");
    if(counterStart==0){
        ctxGame.fillText("3", (larguraGame*0.24), alturaGame/2);
        ctxGame.strokeText("2", (larguraGame*0.36), alturaGame/2);
        ctxGame.strokeText("1", (larguraGame*0.47), alturaGame/2);
        ctxGame.strokeText("LFG", (larguraGame*0.675), alturaGame/2);
    }
    else if (counterStart==1){
        ctxGame.fillText("3", (larguraGame*0.24), alturaGame/2);
        ctxGame.fillText("2", (larguraGame*0.36), alturaGame/2);
        ctxGame.strokeText("1", (larguraGame*0.47), alturaGame/2);
        ctxGame.strokeText("LFG", (larguraGame*0.675), alturaGame/2);
    }
    else if (counterStart==2){
        ctxGame.fillText("3", (larguraGame*0.24), alturaGame/2);
        ctxGame.fillText("2", (larguraGame*0.36), alturaGame/2);
        ctxGame.fillText("1", (larguraGame*0.47), alturaGame/2);
        ctxGame.strokeText("LFG", (larguraGame*0.675), alturaGame/2);
    }
    else if (counterStart==3){
        ctxGame.fillText("3", (larguraGame*0.24), alturaGame/2);
        ctxGame.fillText("2", (larguraGame*0.36), alturaGame/2);
        ctxGame.fillText("1", (larguraGame*0.47), alturaGame/2);
        ctxGame.fillText("LFG", (larguraGame*0.675), alturaGame/2);
    }
    else if (counterStart==4){
        gameStarted = true;
    }
}

function eatingFood(){
    for(i=0;i<foodPos.length;i++){
        if(p1HeadPos[0]==foodPos[i][0] && p1HeadPos[1]==foodPos[i][1]){
            changeScore("P1");
            increaseBody("P1");
            foodPos.splice(i, 1);
            createNewFood();
        }
        else if(p2HeadPos[0]==foodPos[i][0] && p2HeadPos[1]==foodPos[i][1]){      
            changeScore("P2");
            increaseBody("P2");
            foodPos.splice(i, 1);
            createNewFood();
        }
    }
}

function drawFood(){
    for(i=0;i<foodPos.length;i++){
        ctxGame.beginPath();
        ctxGame.arc((colSize*foodPos[i][0])+colSize/2, (rowSize*foodPos[i][1])+rowSize/2, (rowSize/2)-rowSize/5.4, 0, 2 * Math.PI, false);
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
    for(i=0;i<p1BodyPos.length;i++){
        // P1 touching own body
        if(p1HeadPos[0]===p1BodyPos[i][0] && p1HeadPos[1]===p1BodyPos[i][1]){
            resetP1();
        }
        // P2 touching P1 Body
        if(p2HeadPos[0]===p1BodyPos[i][0] && p2HeadPos[1]===p1BodyPos[i][1]){
            resetP2();
        }
    }
    for(i=0;i<p2BodyPos.length;i++){
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
    titleCanvas.height = 100;
    larguraTitle = titleCanvas.width;
    alturaTitle = titleCanvas.height;

    ctxTitle.font = "30px BureauGrotesque";
    ctxTitle.fillStyle = "white";
    ctxTitle.textAlign = "center";
    ctxTitle.fillText(P1Name.toUpperCase(), 80, 32);
    ctxTitle.fillText(P2Name.toUpperCase(), (larguraTitle-80), 32);

    var p1capturing
    if (p1BodyPos.length == 1) p1capturing = "2%";
    else if (p1BodyPos.length == 2) p1capturing = "4%";
    else if (p1BodyPos.length >= 3 && p1BodyPos.length < 8) p1capturing = "8%";
    else if (p1BodyPos.length >= 8 && p1BodyPos.length < 16) p1capturing = "16%";
    else if (p1BodyPos.length >= 16) p1capturing = "32%";
    ctxTitle.textAlign = "left";
    ctxTitle.font = titleCanvas.width/90 +"px Inter";
    ctxTitle.fillText(("Capturing "+ p1capturing), 150, 32);

    var p2capturing
    if (p2BodyPos.length == 1) p2capturing = "2%";
    else if (p2BodyPos.length == 2) p2capturing = "4%";
    else if (p2BodyPos.length >= 3 && p2BodyPos.length < 8) p2capturing = "8%";
    else if (p2BodyPos.length >= 8 && p2BodyPos.length < 16) p2capturing = "16%";
    else if (p2BodyPos.length >= 16) p2capturing = "32%";
    ctxTitle.textAlign = "right";
    ctxTitle.fillText(("Capturing "+ p2capturing), larguraTitle-150, 32);

    ctxTitle.fillStyle = "white";
    ctxTitle.beginPath();
    ctxTitle.fillRect(0, 5, 30, 30);
    ctxTitle.stroke();
    ctxTitle.fillStyle = "black";
    ctxTitle.beginPath();
    ctxTitle.fillRect(larguraTitle-30, 5, 30, 30);
    ctxTitle.stroke();

    ctxTitle.fillStyle = "black";
    ctxTitle.beginPath();
    ctxTitle.fillRect(0, 50, larguraTitle, 5);
    ctxTitle.stroke();
    ctxTitle.fillStyle = "white";
    ctxTitle.beginPath();
    ctxTitle.fillRect(0, 50, larguraTitle*percentageInitialP1, 5);
    ctxTitle.stroke();

    ctxTitle.textAlign = "center";
    ctxTitle.font = "12px Inter";
    ctxTitle.fillStyle = "silver";
    ctxTitle.fillText("INITIAL DISTRIBUTION", larguraTitle*0.5, 40);

    ctxTitle.fillStyle = "black";
    ctxTitle.beginPath();
    ctxTitle.fillRect(0, 65, larguraTitle, 30);
    ctxTitle.stroke();
    ctxTitle.fillStyle = "white";
    ctxTitle.beginPath();
    ctxTitle.fillRect(0, 65, larguraTitle*percentageCurrentP1, 30);
    ctxTitle.stroke();

    ctxTitle.font = "16px Inter";
    ctxTitle.fillStyle = "LightGray";
    ctxTitle.fillText("CURRENT DISTRIBUTION", larguraTitle*0.5, 85);
}

addEventListener("keydown", function(event) {
    switch (event.key.toUpperCase()) {
        case "ENTER":
            if(gameStarted==false){
                countdownStart = true;
                intervalMain = setInterval(counterStartFunc, 1000);
            }
            if(gameEnded==true){
                let winner = "";
                if(currentScoreDistribution[0]<=0){
                    winner="Player 2"
                }
                else if(currentScoreDistribution[1]<=0){
                    winner="Player 1"
                }
                sessionStorage.setItem("gameWinner", winner);
                window.location.href = "/postgame";
            }
            break;
        case "ARROWLEFT":
            if(p2Dir == "Up" || p2Dir == "Down" || p2Dir == ""){
                p2DirWanted = "Left"
            }
            break;
        case "ARROWRIGHT":
            if(p2Dir == "Up" || p2Dir == "Down"){
                p2DirWanted = "Right"
            }
            break;
        case "ARROWUP":
            if(p2Dir == "Left" || p2Dir == "Right"){
                p2DirWanted = "Up"
            }
            break;
        case "ARROWDOWN":
            if(p2Dir == "Left" || p2Dir == "Right"){
                p2DirWanted = "Down"
            }
            break;
        case "A":
            if(p1Dir == "Up" || p1Dir == "Down"){
                p1DirWanted = "Left"
            }
            break;
        case "D":
            if(p1Dir == "Up" || p1Dir == "Down" || p1Dir == ""){
                p1DirWanted = "Right"
            }
            break;
        case "W":
            if(p1Dir == "Left" || p1Dir == "Right"){
                p1DirWanted = "Up"
            }
            break;
        case "S":
            if(p1Dir == "Left" || p1Dir == "Right"){
                p1DirWanted = "Down"
            }
            break;
    }
});

function listenToGamepads() {
    if(gamepad1==null){
        if (navigator.getGamepads()[0]) {
            console.log("Gamepad 1 connected")
            gamepad1 = navigator.getGamepads()[0];
        }
    }
    if(gamepad1!=null){
        gamepad1 = navigator.getGamepads()[0];
        if(gamepad1.buttons[0].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'Enter'}));
        }

        /*
        // Code for GAMEPAD
        if(gamepad1.buttons[12].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'w'}));
        }
        if(gamepad1.buttons[13].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'s'}));
        }
        if(gamepad1.buttons[14].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'a'}));
        }
        if(gamepad1.buttons[15].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'d'}));
        }
        */

        // CODE FOR ARCADE CONTROLLER
        //console.log("PLAYER 1")
        //console.log("0 == "+ gamepad1.axes[0]) // Left = -1 || Right = 1
        //console.log("1 == "+ gamepad1.axes[1]) // Up = -1 || Down = 1
        if(gamepad1.axes[1]<-0.5){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'w'}));
        }
        if(gamepad1.axes[1]>0.5){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'s'}));
        }
        if(gamepad1.axes[0]<-0.5){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'a'}));
        }
        if(gamepad1.axes[0]>0.5){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'d'}));
        }
    }
    if(gamepad2==null){
        if(navigator.getGamepads()[1]) {
            console.log("Gamepad 2 connected")
            gamepad2 = navigator.getGamepads()[1];
        }
    }
    else if(gamepad2!=null){
        gamepad2 = navigator.getGamepads()[1];
        if(gamepad2.buttons[0].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'Enter'}));
        }

        /*
        // Code for GAMEPAD
        if(gamepad2.buttons[12].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowUp'}));
        }
        if(gamepad2.buttons[13].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowDown'}));
        }
        if(gamepad2.buttons[14].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowLeft'}));
        }
        if(gamepad2.buttons[15].pressed==true){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowRight'}));
        }
        */

        // CODE FOR ARCADE CONTROLLER
        //console.log("PLAYER 2")
        //console.log("0 == "+ gamepad2.axes[0]) // Left = -1 || Right = 1
        //console.log("1 == "+ gamepad2.axes[1]) // Up = -1 || Down = 1
        if(gamepad2.axes[1]<-0.5){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowUp'}));
        }
        if(gamepad2.axes[1]>0.5){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowDown'}));
        }
        if(gamepad2.axes[0]<-0.5){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowLeft'}));
        }
        if(gamepad2.axes[0]>0.5){
            window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'ArrowRight'}));
        }
    }
}
