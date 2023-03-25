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

            const paragraphName = document.createElement("p");
            const nametext = document.createTextNode(highscores[i].name);
            paragraphName.appendChild(nametext);     
            paragraphName.classList.add("nameStyle");   
            document.getElementById("nameandsats").appendChild(paragraphName);

            const paragraphSats = document.createElement("p");
            const satsvalue = document.createTextNode(highscores[i].sats);
            paragraphSats.appendChild(satsvalue);
            paragraphSats.classList.add("satsStyle");  
            document.getElementById("nameandsats").appendChild(paragraphSats);

            var hrElement = document.createElement('hr');
            document.getElementById("nameandsats").appendChild(hrElement);
            hrElement.classList.add("satsStyle");  
        }
    });

addEventListener("keydown", function(event) {
    if (event.key === "Enter") {
        window.location.href = "/";
    }
});