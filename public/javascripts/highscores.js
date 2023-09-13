import { listenToGamepads } from "./gamepads.js";

let pageHS = 0
let divElement;
let highscores

async function loadJson(){
  let response = await fetch('./files/highscores.json')
  let data = await response.json();
  return data;
}

function loadHSHtml(highscores){
      for(let i=((pageHS+1)-1)*7;i<((pageHS+1)*7);i++){
          // "p1Name":"SELLIX","p1sats":1000000,"p2Name":"Pedro","p2sats":1000000,"winner":"Player 1","prize":1960000

          // Highscore Rank
          const elRank = document.createElement("h2");
          const ranktext = document.createTextNode(i+1);
          elRank.appendChild(ranktext);
          elRank.classList.add("rankStyle");

          // Tournament icon
          const elTourn = document.createElement("h2");
          let tourntext;
          if(highscores[i].tournament == true){
            tourntext = document.createTextNode("🏆");
          }else{
            tourntext = document.createTextNode("👥")
          }
          elTourn.appendChild(tourntext);
          elTourn.classList.add("tournStyle");


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
          let nameLosertext;
          if(highscores[i].tournament == true){
            nameLosertext = document.createTextNode(highscores[i].tournamentPlayers-1 + " Players");
          }else{
            nameLosertext = document.createTextNode(loserName);
          }
          elLoserName.appendChild(nameLosertext);
          elLoserName.classList.add("loserNameStyle");

          // Loser Sats
          const elLoserSats = document.createElement("h2");
          let loserSatstext;
          if(highscores[i].tournament == true){
            loserSatstext = document.createTextNode(highscores[i].tournamentName);
            elLoserSats.classList.add("tournNameStyle");
          }else{
            loserSatstext = document.createTextNode(loserSats.toLocaleString());
            elLoserSats.classList.add("loserSatsStyle");
          }
          elLoserSats.appendChild(loserSatstext);


          // Loser Sats Text
          const elSatsLoserLabel = document.createElement("span");
          elSatsLoserLabel.textContent="sats";
          if(highscores[i].tournament == false){
            elLoserSats.appendChild(elSatsLoserLabel);
          }
          elSatsLoserLabel.classList.add("satsLoserLabelStyle");

          // Loser Infos Div
          const loserdivElement = document.createElement('div');
          loserdivElement.classList.add("loserinfo");
          loserdivElement.appendChild(elLoserName);
          loserdivElement.appendChild(elLoserSats);



          // Tournament sponsors
          const elSponsor = document.createElement("div");
          const elSponsorLabel = document.createElement("span");
          const elSponsorLogo = document.createElement("img");
          let elSponsorLabelText;
          if(highscores[i].tournament == true){
            if(highscores[i].tournamentSponsor != null && highscores[i].tournamentSponsor != ""){
              elSponsorLabelText = document.createTextNode("sponsored by");
              elSponsorLogo.src = highscores[i].tournamentSponsor;

              elSponsorLabel.appendChild(elSponsorLabelText);
            }
          }
          elSponsor.classList.add("sponsor");
          elSponsor.appendChild(elSponsorLabel);
          elSponsor.appendChild(elSponsorLogo);


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
          divElement = document.createElement('div');
          divElement.classList.add("score-row");
          if(i==((pageHS+1)*7)-1){
            divElement.classList.add("score-row-last");
          }
          document.getElementById("highscoresList").appendChild(divElement);

          divElement.appendChild(elRank);
          divElement.appendChild(elTourn);
          divElement.appendChild(winnerDivElement);
          divElement.appendChild(elVSLabel);
          divElement.appendChild(loserdivElement);
          divElement.appendChild(elSponsor);
          divElement.appendChild(prizedivElement);
      }
}

loadJson()
  .then((data) => {
    highscores = data
    highscores.sort((a, b) => {
        if (a.prize > b.prize) {
          return -1;
        }
      });
    loadHSHtml(highscores)})

let buttonSelected="mainMenuButton";
addEventListener("keydown", function(event) {
    if (event.key === "Enter" || event.key === " ") {
      if(buttonSelected=="mainMenuButton"){ 
        window.location.href = "/"; 
      }
      if(buttonSelected=="nextButton"){ 
        pageHS = ((pageHS+1)%3)
        while(highscoresList.firstElementChild) {
          highscoresList.firstElementChild.remove();
        }
        loadHSHtml(highscores)
      }
      if(buttonSelected=="prevButton"){ 
        pageHS = ((pageHS+3-1) % 3)
        while(highscoresList.firstElementChild) {
          highscoresList.firstElementChild.remove();
        }
        loadHSHtml(highscores)
      }
    }
    if (event.key === "ArrowUp" || event.key === "w") {
      if(buttonSelected=="mainMenuButton"){
          document.getElementById("mainmenubutton").style.animationDuration  = "0s";
          document.getElementById("nextButton").style.animationDuration  = "2s";
          buttonSelected="nextButton";
      } 
    }
    if (event.key === "ArrowDown" || event.key === "s") {
      if(buttonSelected=="nextButton" || buttonSelected=="prevButton"){
          document.getElementById("nextButton").style.animationDuration  = "0s";
          document.getElementById("prevButton").style.animationDuration  = "0s";
          document.getElementById("mainmenubutton").style.animationDuration  = "2s";
          buttonSelected="mainMenuButton";
      } 
    }
    if (event.key === "ArrowLeft" || event.key === "a") {
      if(buttonSelected=="nextButton"){
          document.getElementById("nextButton").style.animationDuration  = "0s";
          document.getElementById("prevButton").style.animationDuration  = "2s";
          buttonSelected="prevButton";
      } 
    }
    if (event.key === "ArrowRight" || event.key === "d") {
      if(buttonSelected=="prevButton"){
          document.getElementById("prevButton").style.animationDuration  = "0s";
          document.getElementById("nextButton").style.animationDuration  = "2s";
          buttonSelected="nextButton";
      } 
    }
});

let intervalStart = setInterval(listenToGamepads, 1000/10);
