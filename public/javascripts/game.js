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


var SatsP1 = parseInt(sessionStorage.getItem('P1Sats'));
var SatsP2 = parseInt(sessionStorage.getItem('P2Sats'));
let initialScoreDistribution = [SatsP1,SatsP2];
let totalPoints = initialScoreDistribution[0] + initialScoreDistribution[1]
let currentScoreDistribution = [SatsP1,SatsP2];
let percentageInitialP1 = ((initialScoreDistribution[0] * 100) / totalPoints)/100;


intervalStart = setInterval(draw, 1000/10);

let counterStart = 0;
function counterStartFunc(){
    counterStart++;
    if (counterStart == 5){
        clearInterval(counterStartFunc);
    }
}

function draw(){
    clear();
    updateScore();
    update();
}

function clear(){
    ctxTitle.clearRect(0, 0, larguraTitle, alturaTitle);
    ctxGame.clearRect(0, 0, larguraGame, alturaGame);
}

function updateScore(){
    //console.log(currentScoreDistribution[0])

    document.getElementById('p1Points').innerText = currentScoreDistribution[0].toLocaleString()
    document.getElementById('p2Points').innerText = currentScoreDistribution[1].toLocaleString()
}

function update(){
    displayTitle();
    displayGame();
}


function resetP1(){
    p1HeadPos = [6,12];
    p1BodyPos = [[5,12]];
    p1Dir = "";
    p1DirWanted = "";
}

function resetP2(){
    p2HeadPos = [43,12];
    p2BodyPos = [[44,12]];
    p2Dir = "";
    p2DirWanted = "";
}


let gameCols = 50;
let gameRows = 24;

let p1HeadPos = [6,12];
let p1BodyPos = [[5,12]];


let p1Dir = "";
let p1DirWanted = "";

let p2HeadPos = [43,12];
let p2BodyPos = [[44,12]];

let p2Dir = "";
let p2DirWanted = "";

let foodPos = [[25,12]];


var countdownStart = false;
var gameStarted = false;
var gameEnded = false;

function createNewFood(){
    newValueAccepted = false;
    while(newValueAccepted==false){
        foundCollision = false;
        maxX = Math.floor(gameCols);
        maxY = Math.floor(gameRows);
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
    if(Math.floor(totalPoints*0.05)>1){
        changeInPoints=Math.floor(totalPoints*0.05);
    }
    else{
        changeInPoints=1;
    }
    if(playerID=="P1"){
        currentScoreDistribution[0]+=changeInPoints;
        currentScoreDistribution[1]-=changeInPoints;
    }
    if(playerID=="P2"){
        currentScoreDistribution[1]+=changeInPoints;
        currentScoreDistribution[0]-=changeInPoints;
    }
}

function increaseBody(playerID){
    if(playerID=="P1"){
        lastBodyPart = p1BodyPos[p1BodyPos.length-1];
        nextToLastBodyPart = [];
        if(p1BodyPos.length>1){
            nextToLastBodyPart = p1BodyPos[p1BodyPos.length-2];
        }
        else if(p1BodyPos.length==1){
            nextToLastBodyPart = p1HeadPos;
        }
        if(lastBodyPart[0]<nextToLastBodyPart[0]){
            p1BodyPos.push([lastBodyPart[0]-1,lastBodyPart[1]])
        }
        else if(lastBodyPart[0]>nextToLastBodyPart[0]){
            p1BodyPos.push([lastBodyPart[0]+1,lastBodyPart[1]])
        }
        else if(lastBodyPart[1]<nextToLastBodyPart[1]){
            p1BodyPos.push([lastBodyPart[0],lastBodyPart[1]-1])
        }
        else if(lastBodyPart[1]>nextToLastBodyPart[1]){
            p1BodyPos.push([lastBodyPart[0],lastBodyPart[1]+1])
        }
    }
    else if(playerID=="P2"){
        lastBodyPart = p2BodyPos[p2BodyPos.length-1];
        if(p2BodyPos.length>1){
            nextToLastBodyPart = p2BodyPos[p2BodyPos.length-2];
        }
        else if(p2BodyPos.length==1){
            nextToLastBodyPart = p2HeadPos;
        }
        if(lastBodyPart[0]<nextToLastBodyPart[0]){
            p2BodyPos.push([lastBodyPart[0]-1,lastBodyPart[1]])
        }
        else if(lastBodyPart[0]>nextToLastBodyPart[0]){
            p2BodyPos.push([lastBodyPart[0]+1,lastBodyPart[1]])
        }
        else if(lastBodyPart[1]<nextToLastBodyPart[1]){
            p2BodyPos.push([lastBodyPart[0],lastBodyPart[1]-1])
        }
        else if(lastBodyPart[1]>nextToLastBodyPart[1]){
            p2BodyPos.push([lastBodyPart[0],lastBodyPart[1]+1])
        }
    }
}

function displayGame(){
    gameCanvas.width = window.innerWidth*(0.7);
    gameCanvas.height = window.innerWidth*(0.35);
    var larguraGame = gameCanvas.width;
    var alturaGame = gameCanvas.height;
    colSize = larguraGame / gameCols;
    rowSize = alturaGame / gameRows;


    /*
    ctxGame.beginPath();
    ctxGame.moveTo(0, alturaGame/2);
    ctxGame.lineTo(larguraGame, alturaGame/2);
    ctxGame.moveTo(larguraGame/2, 0);
    ctxGame.lineTo(larguraGame/2, alturaGame);
    ctxGame.stroke();
    for (i=0;i<=gameCols;i++){
        for (j=0;j<=gameRows;j++){
            ctxGame.beginPath();
            ctxGame.strokeStyle = "gray";
            ctxGame.rect(i*colSize, j*rowSize, colSize, rowSize);
            ctxGame.fillText((i+j), i*colSize, j*rowSize);
            ctxGame.stroke();
        }
    }
    */

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

    if(!gameStarted && !gameEnded){
        ctxGame.font = "30px Arial";
        ctxGame.fontWeight = "50%";
        ctxGame.fillStyle = "white";
        ctxGame.textAlign = "center";
        ctxGame.textBaseline = "middle";
        ctxGame.strokeStyle = "white";
        if(!countdownStart){
            ctxGame.fillText("Press Enter to Start", (larguraGame/2), alturaGame/2);
        }
        if(countdownStart){
            alturaNumbers = (alturaGame*0.50).toString();
            ctxGame.font = alturaNumbers.concat("px Arial");
            if(counterStart==0){
                ctxGame.fillText("3", (larguraGame*0.15), alturaGame/2);
                ctxGame.strokeText("2", (larguraGame*0.30), alturaGame/2);
                ctxGame.strokeText("1", (larguraGame*0.45), alturaGame/2);
                ctxGame.strokeText("LFG", (larguraGame*0.75), alturaGame/2);
            }
            else if (counterStart==1){
                ctxGame.fillText("3", (larguraGame*0.15), alturaGame/2);
                ctxGame.fillText("2", (larguraGame*0.30), alturaGame/2);
                ctxGame.strokeText("1", (larguraGame*0.45), alturaGame/2);
                ctxGame.strokeText("LFG", (larguraGame*0.75), alturaGame/2);
            }
            else if (counterStart==2){
                ctxGame.fillText("3", (larguraGame*0.15), alturaGame/2);
                ctxGame.fillText("2", (larguraGame*0.30), alturaGame/2);
                ctxGame.fillText("1", (larguraGame*0.45), alturaGame/2);
                ctxGame.strokeText("LFG", (larguraGame*0.75), alturaGame/2);
            }
            else if (counterStart==3){
                ctxGame.fillText("3", (larguraGame*0.15), alturaGame/2);
                ctxGame.fillText("2", (larguraGame*0.30), alturaGame/2);
                ctxGame.fillText("1", (larguraGame*0.45), alturaGame/2);
                ctxGame.fillText("LFG", (larguraGame*0.75), alturaGame/2);
            }
            else if (counterStart==4){
                gameStarted = true;
            }
        }
    }
    else if(gameStarted && !gameEnded){
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
        if(p1HeadPos[0]>gameCols-1 || p1HeadPos[1]<0 || p1HeadPos[1]>gameRows-1 || p1HeadPos[0]<0 || (p1HeadPos[0]==p2HeadPos[0] && p1HeadPos[1]==p2HeadPos[1])){
            resetP1();
        }
        for(i=0;i<(p1BodyPos.length);i++){
            if(p1HeadPos[0]===p1BodyPos[i][0] && p1HeadPos[1]===p1BodyPos[i][1]){
                resetP1();
            }
        }
        for(i=0;i<p2BodyPos.length;i++){
            if(p1HeadPos[0]===p2BodyPos[i][0] && p1HeadPos[1]===p2BodyPos[i][1]){
                resetP1();
            }
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
        if(p2HeadPos[0]>gameCols-1 || p2HeadPos[1]<0 || p2HeadPos[1]>gameRows-1 || p2HeadPos[0]<0 || (p2HeadPos[0]==p1HeadPos[0] && p2HeadPos[1]==p1HeadPos[1])){
            resetP2();
        }
        for(i=0;i<(p2BodyPos.length);i++){
            if(p2HeadPos[0]===p2BodyPos[i][0] && p2HeadPos[1]===p2BodyPos[i][1]){
                resetP2();
            }
        }
        for(i=0;i<p1BodyPos.length;i++){
            if(p2HeadPos[0]===p1BodyPos[i][0] && p2HeadPos[1]===p1BodyPos[i][1]){
                resetP2();
            }
        }
        for(i=0;i<foodPos.length;i++){
            ctxGame.beginPath();
            ctxGame.arc(colSize*foodPos[i][0]+colSize/2, rowSize*foodPos[i][1]+rowSize/2, (rowSize/2)-5, 0, 2 * Math.PI, false);
            ctxGame.fillStyle = "white";
            ctxGame.shadowColor='white';
            ctxGame.shadowOffsetX=0;
            ctxGame.shadowOffsetY=0;
            ctxGame.shadowBlur=20;
            ctxGame.fill();
            ctxGame.shadowColor = "transparent";
        }
        for(i=0;i<foodPos.length;i++){
            if(p1HeadPos[0]==foodPos[i][0] && p1HeadPos[1]==foodPos[i][1]){
                foodPos.splice(i, 1);
                changeScore("P1");
                increaseBody("P1");
                createNewFood();
            }
            else if(p2HeadPos[0]==foodPos[i][0] && p2HeadPos[1]==foodPos[i][1]){
                foodPos.splice(i, 1);
                changeScore("P2");
                increaseBody("P2");
                createNewFood();
            }
        }
        if(currentScoreDistribution[0]<=0 || currentScoreDistribution[1]<=0){
            gameEnded = true;
        }
    }
    if(gameEnded){
        ctxGame.font = "30px Arial";
        ctxGame.fontWeight = "50%";
        ctxGame.fillStyle = "white";
        ctxGame.textAlign = "center";
        ctxGame.textBaseline = "middle";
        ctxGame.strokeStyle = "white";
        let winner = "";
        if(currentScoreDistribution[0]<=0){
            winner="Player 2"
        }
        else if(currentScoreDistribution[1]<=0){
            winner="Player 1"
        }
        ctxGame.fillText(winner+" WINS!", (larguraGame/2), alturaGame/2);
    }
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

function displayTitle(){
    let percentageCurrentP1 = ((currentScoreDistribution[0] * 100) / totalPoints)/100;

    titleCanvas.width = window.innerWidth*(0.7);
    titleCanvas.height = window.innerHeight*(0.1);
    var larguraTitle = titleCanvas.width;
    var alturaTitle = titleCanvas.height;

    ctxTitle.font = "30px Arial";
    ctxTitle.fillStyle = "white";
    ctxTitle.textAlign = "center";
    ctxTitle.fillText("PLAYER 1", (larguraTitle*0.08), 30);
    ctxTitle.fillText("PLAYER 2", (larguraTitle*0.92), 30);

    ctxTitle.fillStyle = "white";
    ctxTitle.beginPath();
    ctxTitle.fillRect(0, 5, 30, 30);
    ctxTitle.stroke();
    ctxTitle.fillStyle = "gray";
    ctxTitle.beginPath();
    ctxTitle.fillRect(larguraTitle-30, 5, 30, 30);
    ctxTitle.stroke();

    ctxTitle.fillStyle = "DimGray";
    ctxTitle.beginPath();
    ctxTitle.fillRect(0, 50, larguraTitle, 5);
    ctxTitle.stroke();
    ctxTitle.fillStyle = "LightGray";
    ctxTitle.beginPath();
    ctxTitle.fillRect(0, 50, larguraTitle*percentageInitialP1, 5);
    ctxTitle.stroke();

    ctxTitle.font = "25px Arial";
    ctxTitle.fillStyle = "silver";
    ctxTitle.fillText("INITIAL DISTRIBUTION", larguraTitle*0.5, 40);

    ctxTitle.fillStyle = "DimGray";
    ctxTitle.beginPath();
    ctxTitle.fillRect(0, 65, larguraTitle, 30);
    ctxTitle.stroke();
    ctxTitle.fillStyle = "white";
    ctxTitle.beginPath();
    ctxTitle.fillRect(0, 65, larguraTitle*percentageCurrentP1, 30);
    ctxTitle.stroke();

    ctxTitle.font = "25px Arial";
    ctxTitle.fillStyle = "LightGray";
    ctxTitle.fillText("CURRENT DISTRIBUTION", larguraTitle*0.5, 89);
}
