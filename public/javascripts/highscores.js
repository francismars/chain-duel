fetch('./files/highscores.json')
    .then((response) => response.json())
    .then((json) => {
        highscores = json

        orderedScores = highscores.sort((a, b) => {
            if (a.prize > b.prize) {
              return -1;
            }
          });

        for(i=0;i<orderedScores.length;i++){
            // "p1Name":"SELLIX","p1sats":1000000,"p2Name":"Pedro","p2sats":1000000,"winner":"Player 1","prize":1960000
                        
            // Highscore Rank
            const elRank = document.createElement("h2");
            const ranktext = document.createTextNode(i+1);
            elRank.appendChild(ranktext);
            elRank.classList.add("rankStyle");

            var winnerName, winnerSats, loserName, loserSats;
            if(highscores[i].winner=="Player 1"){
              winnerName = highscores[i].p1Name
              winnerSats = highscores[i].p1sats
              loserName = highscores[i].p2Name
              loserSats = highscores[i].p2sats
            }
            else if(highscores[i].winner=="Player 2"){
              loserName = highscores[i].p1Name
              loserSats = highscores[i].p1sats
              winnerName = highscores[i].p2Name
              winnerSats = highscores[i].p2sats              
            }

            // Winner Name
            const elWinnerName = document.createElement("h2");
            const winnerP1text = document.createTextNode(winnerName);
            elWinnerName.appendChild(winnerP1text);
            elWinnerName.classList.add("winnerNameStyle");
            
            // Winner Sats
            const elWinnerSats = document.createElement("h2");
            const winnerSatstext = document.createTextNode(winnerSats.toLocaleString());
            elWinnerSats.appendChild(winnerSatstext);
            elWinnerSats.classList.add("winnerSatsStyle");

            // Winner Sats Text
            const elSatsWinnerLabel = document.createElement("span");
            elSatsWinnerLabel.textContent="sats";
            elWinnerSats.appendChild(elSatsWinnerLabel);
            elSatsWinnerLabel.classList.add("satsWinnerLabelStyle");

            // Winner Infos Div
            const winnerDivElement = document.createElement('div');
            winnerDivElement.classList.add("winnerInfo");
            winnerDivElement.appendChild(elWinnerName);
            winnerDivElement.appendChild(elWinnerSats);

            // VS Text
            const elVSLabel = document.createElement("h2");
            elVSLabel.textContent="VS";
            elVSLabel.classList.add("VSLabelStyle");
            
            // Loser Name
            const elLoserName = document.createElement("h2");
            const nameLosertext = document.createTextNode(loserName);
            elLoserName.appendChild(nameLosertext);
            elLoserName.classList.add("loserNameStyle");

            // Loser Sats
            const elLoserSats = document.createElement("h2");
            const loserSatstext = document.createTextNode(loserSats.toLocaleString());
            elLoserSats.appendChild(loserSatstext);
            elLoserSats.classList.add("loserSatsStyle");

            // Loser Sats Text
            const elSatsLoserLabel = document.createElement("span");
            elSatsLoserLabel.textContent="sats";
            elLoserSats.appendChild(elSatsLoserLabel);
            elSatsLoserLabel.classList.add("satsLoserLabelStyle");
 
            // Loser Infos Div
            const loserdivElement = document.createElement('div');
            loserdivElement.classList.add("loserinfo");
            loserdivElement.appendChild(elLoserName);
            loserdivElement.appendChild(elLoserSats);

            // Total Prize
            const elPrize = document.createElement("h2");
            const satsvalue = document.createTextNode(highscores[i].prize.toLocaleString());
            elPrize.classList.add("prizeSatsStyle");
            elPrize.appendChild(satsvalue);

            // Prize Sats
            const elPrizeSatsLabel = document.createElement("span");
            elPrizeSatsLabel.textContent="sats";
            elPrizeSatsLabel.classList.add("satsLabelStyle");

            // Prize Infos Div
            const prizedivElement = document.createElement('div');
            prizedivElement.classList.add("prizeinfo");
            prizedivElement.appendChild(elPrize);
            prizedivElement.appendChild(elPrizeSatsLabel);

            // Rows
            var divElement = document.createElement('div');
            divElement.classList.add("score-row");
            if(i==4){
              divElement.classList.add("score-row-last");
            }
            document.getElementById("highscoresList").appendChild(divElement);

            divElement.appendChild(elRank);
            divElement.appendChild(winnerDivElement);
            divElement.appendChild(elVSLabel);
            divElement.appendChild(loserdivElement);
            divElement.appendChild(prizedivElement);
        }
    });

addEventListener("keydown", function(event) {
    if (event.key === "Enter") {
        window.location.href = "/";
    }
});

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
    if(gamepad1.buttons[0].pressed==true || gamepad1.buttons[1].pressed==true || gamepad1.buttons[2].pressed==true || gamepad1.buttons[3].pressed==true){
        window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'Enter'}));
    }
  }
  if (navigator.getGamepads()[1]) {
    if(gamepad2==null){
        console.log("Gamepad 2 connected")
    }
    gamepad2 = navigator.getGamepads()[1];
    if(gamepad2.buttons[0].pressed==true || gamepad2.buttons[1].pressed==true || gamepad2.buttons[2].pressed==true || gamepad2.buttons[3].pressed==true){
        window.dispatchEvent(new KeyboardEvent('keydown',  {'key':'Enter'}));
    }
  }
}