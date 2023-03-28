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

            console.log(highscores[i])

            const elName = document.createElement("h2");
            const nametext = document.createTextNode(highscores[i].name);
            elName.appendChild(nametext);
            elName.classList.add("nameStyle");
            //document.getElementById("nameandsats").appendChild(paragraphName);

            const elSats = document.createElement("h2");
            const satsvalue = document.createTextNode(highscores[i].sats);
            elSats.appendChild(satsvalue);


            const elSatsLabel = document.createElement("span");
            elSatsLabel.textContent="sats";
            elSats.appendChild(elSatsLabel);

            elSats.classList.add("satsLabelStyle");
            //document.getElementById("nameandsats").appendChild(paragraphSats);

            var divElement = document.createElement('div');
            divElement.classList.add("score-row");
            document.getElementById("nameandsats").appendChild(divElement);

            divElement.appendChild(elName);
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