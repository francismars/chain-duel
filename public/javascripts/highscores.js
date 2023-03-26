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
