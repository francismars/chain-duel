import { listenToGamepads } from "./gamepads.js";

// Variables for Tournament Specifics
let tournamentSponsorImageUrl = "/images/sponsors/bitbox.png";
let tournamentPlaceName = "Bitcoin Atlantis 2024";

let serverIP;
let serverPORT;
await fetch("/loadconfig", {
  method: "GET",
})
  .then((response) => response.json())
  .then((data) => {
    serverIP = data.IP;
    serverPORT = data.PORT;
  });

const socket = io(serverIP + ":" + serverPORT, {
  transports: ["websocket"],
  autoConnect: false,
});
let sessionID = sessionStorage.getItem("sessionID");
if (sessionID) {
  console.log("Found sessionID on sessionStorage " + sessionID);
  socket.auth = { sessionID };
}
socket.connect();

socket.emit("postGameInfoRequest");

function buildWinnerNamesList(playersList, winnersList) {
  let playersListCopy = [...playersList];
  for (let i = 0; i < winnersList.length; i++) {
    let winner = winnersList[i];
    winner == "Player 1"
      ? playersListCopy.push(playersListCopy[2 * i])
      : playersListCopy.push(playersListCopy[2 * i + 1]);
  }
  return playersListCopy;
}

let gameWinner;
let p1Name;
let p2Name;
let winnerName;
let P1SatsDeposit;
let P2SatsDeposit;
let totalDeposit;
let maxWithdrawable;
let totalPrize;
let playersList;
let tournamentMode;
let lnurlw;
socket.on("resPostGameInfoRequest", (postgameInfos) => {
  // { "Player2": { "value": 100, "name": "bnm" }, "Player1": { "value": 100, "name": "xcv" }, "winners": ["Player 1"] }
  console.log(postgameInfos);
  if (postgameInfos.winners) {
    let winnerP = String(postgameInfos.winners.slice(-1));
    if (winnerP == "Player 1" || winnerP == "Player 2") gameWinner = winnerP;
  }
  if (postgameInfos.mode == "TOURNAMENT") {
    tournamentMode = true;
    if (postgameInfos.players) {
      playersList = Array(postgameInfos.numbeOfPlayers).fill("");
      const assignedPlayers = postgameInfos.players;
      for (const key of Object.keys(assignedPlayers)) {
        const id = parseInt(key.replace("Player ", "")) - 1;
        const name = assignedPlayers[key].name;
        playersList[id] = name;
      }
    }
    let winnersList = [...postgameInfos.winners];
    let playersListNames = buildWinnerNamesList(playersList, winnersList);
    winnerName = String(playersListNames.slice(-1));
    P1SatsDeposit = postgameInfos.players["Player 1"].value;
    P2SatsDeposit = P1SatsDeposit;
    totalDeposit = parseInt(P1SatsDeposit) * playersList.length;
    totalPrize = Math.floor(totalDeposit) * 0.95;
    document.getElementById("doubleornotthingbutton").style.display = "none";
    if (gameWinner != null) {
      if (gameWinner == "Player 1" && winnerName != null) {
        p1Name = winnerName;
        p2Name = String(playersListNames.slice(-2));
      } else if (gameWinner == "Player 2" && winnerName != null) {
        p1Name = String(playersListNames.slice(-2));
        p2Name = winnerName;
      }
    } else gameWinner = "Player 1";
  }
  if (
    postgameInfos.mode == "PRACTICE" ||
    postgameInfos.mode == "P2P" ||
    postgameInfos.mode == "P2PNOSTR"
  ) {
    tournamentMode = false;
    p1Name = postgameInfos.players["Player 1"].name;
    P1SatsDeposit = postgameInfos.players["Player 1"].value;
    if (postgameInfos.mode == "P2P" || postgameInfos.mode == "P2PNOSTR") {
      // P2P
      p2Name = postgameInfos.players["Player 2"].name;
      P2SatsDeposit = postgameInfos.players["Player 2"].value;
      totalDeposit = parseInt(P1SatsDeposit) + parseInt(P2SatsDeposit);
    } else if (postgameInfos.mode == "PRACTICE") {
      // PRACTICE
      p2Name = "BigToshi 🌊";
      totalDeposit = parseInt(P1SatsDeposit);
      document.getElementById("fees").style.display = "none";
      document.getElementById("winner").style.display = "none";
      document.getElementById("claimText").style.display = "none";
      document.getElementById("claimbutton").innerText = "END PRACTICE";
      document.getElementById("doubleornotthingbutton").innerText =
        "PRACTICE AGAIN";
    }
    totalPrize = Math.floor(totalDeposit);
    if (gameWinner != null) {
      if (gameWinner == "Player 1" && p1Name != null) {
        winnerName = p1Name;
        if (postgameInfos.players["Player 1"].picture != null) {
          document.getElementById("playerImg").src =
            postgameInfos.players["Player 1"].picture;
          document.getElementById("playerImg").classList.remove("hide");
        }
      } else if (gameWinner == "Player 2" && p2Name != null) {
        winnerName = p2Name;
        if (
          postgameInfos.players["Player 2"] &&
          postgameInfos.players["Player 2"].picture
        ) {
          document.getElementById("playerImg").src =
            postgameInfos.players["Player 2"].picture;
          document.getElementById("playerImg").classList.remove("hide");
        }
      }
      if (winnerName != null) {
        document.getElementById("winner").innerText =
          winnerName.toUpperCase() + " WINS";
      }
    } else gameWinner = "Player 1";
  }
  lnurlw = postgameInfos.lnurlw;
  if (lnurlw) {
    menu2CSS();
    qrRevealed = 1;
    handleLNURLW(postgameInfos.lnurlw);
  }

  if (winnerName != null) {
    document.getElementById("winner").innerText =
      winnerName.toUpperCase() + " WINS";
  }

  if (P1SatsDeposit != null && P2SatsDeposit != null) {
    let developerFee = Math.floor(totalDeposit * 0.02);
    let designerFee = Math.floor(totalDeposit * 0.01);
    document.getElementById("hostFee").innerText =
      "(" + developerFee.toLocaleString() + " sats)";
    document.getElementById("developerFee").innerText =
      "(" + developerFee.toLocaleString() + " sats)";
    document.getElementById("designerFee").innerText =
      "(" + designerFee.toLocaleString() + " sats)";
  }

  if (totalPrize != null) {
    document.getElementById("prize").innerText =
      parseInt(totalPrize).toLocaleString() + " SATS";
  }
  document.getElementById("postGame").classList.remove("empty");
  document.getElementById("loading").classList.add("hide");
  controllersActive = true;
});

//let withdrawalURL = sessionStorage.getItem('LNURL');
let withdrawalURL =
  "MARSURL1DP68GURN8GHJ7MRWVF5HGUEWV3HK5MEWWP6Z7AMFW35XGUNPWUHKZURF9AMRZTMVDE6HYMP0V438Y7NKXUE5S5TFG9X9GE2509N5VMN0G46S0WQJQ4";
if (withdrawalURL != null) {
  let qrcodeContainer = document.getElementById("qrCode1");
  qrcodeContainer.innerHTML = "";
  new QRious({
    size: 800,
    element: qrcodeContainer,
    value: withdrawalURL,
  });
}

let menu = 1;
let activeButtonMenu1 = 0;
let activeButtonMenu3 = 0;
let qrRevealed = 0;
let intervalStart = setInterval(listenToGamepads, 1000 / 10);
let controllersActive = false;

function pressLeft() {
  if (menu == 3 && activeButtonMenu3 == 1) {
    document.getElementById("claimbutton").style.animationDuration = "2s";
    document.getElementById("startnewbutton").style.animationDuration = "0s";
    activeButtonMenu3 = 0;
  }
}

function pressRight() {
  if (menu == 3 && activeButtonMenu3 == 0) {
    document.getElementById("startnewbutton").style.animationDuration = "2s";
    document.getElementById("claimbutton").style.animationDuration = "0s";
    activeButtonMenu3 = 1;
  }
}

function pressUp() {
  if (menu == 1 && activeButtonMenu1 == 1) {
    document.getElementById("doubleornotthingbutton").style.animationDuration =
      "0s";
    document.getElementById("claimbutton").style.animationDuration = "2s";
    activeButtonMenu1 = 0;
  }
}

function pressDown() {
  if (
    menu == 1 &&
    activeButtonMenu1 == 0 &&
    controllersActive &&
    qrRevealed == 0
  ) {
    document.getElementById("doubleornotthingbutton").style.animationDuration =
      "2s";
    document.getElementById("claimbutton").style.animationDuration = "0s";
    activeButtonMenu1 = 1;
  }
}

function pressContinue() {
  if (controllersActive) {
    if (menu == 1 && activeButtonMenu1 == 0) {
      menu2CSS();
      qrRevealed = 1;
    } else if (menu == 1 && activeButtonMenu1 == 1 && qrRevealed == 0) {
      socket.emit("doubleornothing");
      let nextLocation;
      P2SatsDeposit != null
        ? (nextLocation = "/gamemenu")
        : (nextLocation = "/practicemenu");
      window.location.href = nextLocation;
    } else if (menu == 2) {
      menu1CSS();
    } else if (menu == 3) {
      if (activeButtonMenu3 == 0) {
        window.location.href = "/highscores";
      } else if (activeButtonMenu3 == 1) {
        window.location.href = "/";
      }
    }
  }
}

addEventListener("keydown", function (event) {
  switch (event.key) {
    case " ":
      if (
        (gameWinner == "Player 1" || P2SatsDeposit == null) &&
        (menu == 1 || menu == 2)
      ) {
        pressContinue();
      }
      if (menu == 3) {
        pressContinue();
      }
      break;
    case "Enter":
      if (
        (gameWinner == "Player 2" || P2SatsDeposit == null) &&
        (menu == 1 || menu == 2)
      ) {
        pressContinue();
      }
      if (menu == 3) {
        pressContinue();
      }
      break;
    case "s":
      if (
        (gameWinner == "Player 1" || P2SatsDeposit == null) &&
        (menu == 1 || menu == 2) &&
        tournamentMode == false
      ) {
        pressDown();
      }
      break;
    case "ArrowDown":
      if (
        (gameWinner == "Player 2" || P2SatsDeposit == null) &&
        (menu == 1 || menu == 2) &&
        tournamentMode == false
      ) {
        pressDown();
      }
      break;
    case "w":
      if (
        (gameWinner == "Player 1" || P2SatsDeposit == null) &&
        (menu == 1 || menu == 2)
      ) {
        pressUp();
      }
      break;
    case "ArrowUp":
      if (
        (gameWinner == "Player 2" || P2SatsDeposit == null) &&
        (menu == 1 || menu == 2)
      ) {
        pressUp();
      }
      break;
    case "d":
    case "ArrowRight":
      pressRight();
      break;
    case "a":
      pressLeft();
      break;
    case "ArrowLeft":
      pressLeft();
      break;
  }
});

function updateHSJson() {
  fetch("./files/highscores.json")
    .then((response) => response.json())
    .then((json) => {
      let highscores = json;

      let orderedScores = highscores.sort((a, b) => {
        if (a.prize > b.prize) {
          return -1;
        }
      });

      let sizeHS = orderedScores.length - 1;
      if (orderedScores[sizeHS].prize < parseInt(totalPrize)) {
        // {"p1Name":"SELLIX5","p1sats":100,"p2Name":"Pedro5","p2sats":100,"winner":"Player1","prize":196}
        console.log("Mudar hs file");
        console.log(orderedScores[sizeHS].prize);
        console.log(totalPrize);
        console.log("tournament mode :" + playersList != null);
        if (playersList != null) {
          orderedScores[sizeHS].tournament = true;
          orderedScores[sizeHS].tournamentSponsor = tournamentSponsorImageUrl;
          orderedScores[sizeHS].tournamentName = tournamentPlaceName;
          orderedScores[sizeHS].tournamentPlayers = playersList.length;
        } else {
          orderedScores[sizeHS].tournament = false;
        }
        orderedScores[sizeHS].p1Name = p1Name;
        orderedScores[sizeHS].p1sats = parseInt(P1SatsDeposit);
        orderedScores[sizeHS].p2Name = p2Name;
        orderedScores[sizeHS].p2sats = parseInt(P2SatsDeposit);
        orderedScores[sizeHS].winner = gameWinner;
        orderedScores[sizeHS].prize = parseInt(totalPrize);

        const data = JSON.stringify(orderedScores);
        // write JSON string to a file
        fetch("/savejson", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: data,
        })
          .then((response) => response.json())
          .then((data) => {
            console.log(data);
          });
      }
    });
}

socket.on("connect", () => {
  console.log(`connected with id: ${socket.id}`);
});

socket.on("prizeWithdrawn", () => {
  sessionStorage.clear();
  menu3CSS();
  updateHSJson();
});

let resCreateWithdrawal = false;
socket.on("resCreateWithdrawalPostGame", (data) => {
  if (data == "pass") {
    window.location.href = "/";
  } else handleLNURLW(data);
});

function handleLNURLW(lnurlw) {
  if (resCreateWithdrawal == false) {
    let withdrawalURL = lnurlw;
    let qrcodeContainer = document.getElementById("qrCode1");
    qrcodeContainer.innerHTML = "";
    new QRious({
      size: 800,
      element: qrcodeContainer,
      value: withdrawalURL,
    });
    document.getElementById("qrcodeLink").href = "lightning:" + withdrawalURL;
    resCreateWithdrawal = true;
  }
  document.getElementById("claimbutton").innerText = "BLUR QR CODE";
  document.getElementById("qrCode1").classList.add("qrcode");
  menu = 2;
}

function menu1CSS() {
  document.getElementById("gameOver").style.display = "block";
  document.getElementById("claimbutton").innerText = "SWEEP VIA LNURL";
  document.getElementById("qrCode1").classList.add("blur");
  menu = 1;
}

function menu2CSS() {
  document.getElementById("doubleornotthingbutton").classList.add("disabled");
  if (resCreateWithdrawal == false) {
    //Update image source to loading gif
    document.getElementById("qrCode1").src = "";
    document.getElementById("qrCode1").src = "/images/loading.gif";
    document.getElementById("qrCode1").classList.remove("qrcode");
    document.getElementById("claimbutton").innerText = "CREATING CODE...";
    //Request LNURLw from server
    if (!lnurlw) socket.emit("createWithdrawalPostGame");
  } else {
    document.getElementById("claimbutton").innerText = "BLUR QR CODE";
    document.getElementById("qrCode1").classList.add("qrcode");
  }
  document.getElementById("qrCode1").classList.remove("blur");
  menu = 2;
}

function menu3CSS() {
  if (menu == 1) {
    menu1CSS();
  }
  document.getElementById("prize").innerText += " CLAIMED";
  document.getElementById("qrCode1").style.display = "none";
  document.getElementById("claimbutton").innerText = "HIGHSCORES";
  document.getElementById("claimbutton").style.marginRight = "1%";
  document.getElementById("startnewbutton").style.display = "block";
  document.getElementById("buttonsDiv").style.marginTop = "16cqw";
  document.getElementById("claimReq1").style.display = "none";
  document.getElementById("claimText").style.display = "none";
  document.getElementById("buttonsDiv").style.flexDirection = "unset";
  document.getElementById("doubleornotthingbutton").style.display = "none";
  document.getElementById("buttonsDiv").style.justifyContent = "center";
  document.getElementById("buttonsDiv").style.gap = "21px";
  document.getElementById("claimbutton").style.marginRight = "0px";
  document.getElementById("claimbutton").style.marginLeft = "0px";
  document.getElementById("startnewbutton").style.marginRight = "0px";
  document.getElementById("startnewbutton").style.marginLeft = "0px";
  menu = 3;
}
