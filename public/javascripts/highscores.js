fetch('./files/highscores.json')
    .then((response) => response.json())
    .then((json) => {
        highscores = json

        orderedScores = highscores.sort((a, b) => {
            if (a.sats > b.sats) {
              return -1;
            }
          });

        for(i=0;i<orderedScores.length;i++){
            // "p1Name":"SELLIX","p1sats":1000000,"p2Name":"Pedro","p2sats":1000000,"winner":"Player 1","prize":1960000

            // P1 Name
            const elP1Name = document.createElement("h2");
            const nameP1text = document.createTextNode(highscores[i].p1Name);
            elP1Name.appendChild(nameP1text);
            elP1Name.classList.add("p1NameStyle");

            // P1 Sats
            const elP1Sats = document.createElement("h2");
            const p1Satstext = document.createTextNode(highscores[i].p1sats);
            elP1Sats.appendChild(p1Satstext);
            elP1Sats.classList.add("p1SatsStyle");
            
            // P2 Name
            const elP2Name = document.createElement("h2");
            const nameP2text = document.createTextNode(highscores[i].p2Name);
            elP2Name.appendChild(nameP2text);
            elP2Name.classList.add("p2NameStyle");

            // P2 Sats
            const elP2Sats = document.createElement("h2");
            const p2Satstext = document.createTextNode(highscores[i].p2sats);
            elP2Sats.appendChild(p2Satstext);
            elP2Sats.classList.add("p2SatsStyle");

            // Total Prize
            const elSats = document.createElement("h2");
            const satsvalue = document.createTextNode(highscores[i].prize);
            elSats.appendChild(satsvalue);

            const elSatsLabel = document.createElement("span");
            elSatsLabel.textContent="sats";
            elSats.appendChild(elSatsLabel);
            elSats.classList.add("satsLabelStyle");

            var divElement = document.createElement('div');
            divElement.classList.add("score-row");
            document.getElementById("nameandsats").appendChild(divElement);

            divElement.appendChild(elP1Name);
            divElement.appendChild(elP1Sats);
            divElement.appendChild(elP2Name);
            divElement.appendChild(elP2Sats);
            divElement.appendChild(elSats);


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