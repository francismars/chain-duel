let serverIP;
let serverPORT;
await fetch('/loadconfig', {
    method: 'GET'
    })
    .then((response) => response.json())
    .then((data) => {
        serverIP = data.IP
        serverPORT = data.PORT
});

const socket = io(serverIP+":"+serverPORT , { transports : ['websocket'] });


let urlToParse = location.search;

const params = new URLSearchParams(urlToParse);
const players = parseInt(params.get("players"));
const deposit = parseInt(params.get("deposit"));

console.log(players)
console.log(deposit)
document.getElementById("numberOfPlayers").innerText = players;
document.getElementById("buyIn").innerText = deposit.toLocaleString();

let rowPlayersDiv = document.createElement('div');
rowPlayersDiv.classList.add("rowPlayers");
for(let i=0;i<players;i++){
    let playerNumber = i+1;
    let rowPlayers = Math.floor(i / 4);
    let colPlayers = i % 4;

    const colPlayersDiv = document.createElement('div');
    colPlayersDiv.classList.add("colPlayer");
    rowPlayersDiv.appendChild(colPlayersDiv);

    socket.emit('createPaylink', {"playerNumber":playerNumber,"buyIn":deposit});

    const colPlayersQR = document.createElement('img');
    colPlayersQR.textContent="QR CODE";
    colPlayersQR.setAttribute("id","qrPlayer"+playerNumber);
    colPlayersDiv.appendChild(colPlayersQR);

    const colPlayersName = document.createElement('p');
    colPlayersName.textContent="Player "+playerNumber;
    colPlayersName.setAttribute("id","namePlayer"+playerNumber);
    colPlayersDiv.appendChild(colPlayersName);

    if(colPlayers==3 || i == players-1){
        document.getElementById("pageinner").appendChild(rowPlayersDiv);
        rowPlayersDiv = document.createElement('div');
        rowPlayersDiv.classList.add("rowPlayers");
    }
}

let paymentsDict = {}
socket.on("rescreatePaylink", body => {
    let payLink = body;
    paymentsDict[payLink.description] = payLink.id;
    let qrcodeContainer = document.getElementById("qr"+payLink.description);
    qrcodeContainer.innerHTML = "";
    new QRious({
        element: qrcodeContainer,
        size: 120,
        value: payLink.lnurl
        }); 
});

let playersDict = {}
socket.on("invoicePaid", body => {
    for(let key in paymentsDict) {
        let value = paymentsDict[key];
        if(value==body.lnurlp){
            console.log(`Chegou pagamento de "${key} : ${(body.amount)/1000} sats`);
            console.log(`${key} Name: ` + body.comment)
            document.getElementById(`qr${key}`).setAttribute("class","tintedQR");
            if(body.comment!=null && body.comment!=""){
                let pName=(body.comment)[0].trim()
                document.getElementById(`name${key}`).innerText = pName;
                playersDict[key] = pName;
            }
            else {
                playersDict[key] = key;
            }         
        }
    }
    let playersPaid = Object.keys(playersDict).length;
    if(playersPaid>1 && buttonSelected!="none"){
        buttonSelected = "none"
        document.getElementById("backButton").classList.add("disabled");
        document.getElementById("backButton").style.animationDuration  = "0s";        
    }
    if(playersPaid==players){
        document.getElementById("proceedButton").classList.remove("disabled");
        document.getElementById("proceedButton").style.animationDuration  = "2s";
        buttonSelected="proceedButton";
    }
});

let totalOfDeletes = 0;
let redirect = "";
socket.on("resdelpaylinks", body => {
    //console.log(body)
    if(body.success==true){
        totalOfDeletes++;
    }
    if (totalOfDeletes==players){
        if(redirect=="back"){
            window.location.href = "/tournprefs";
        }
        if(redirect=="proceed"){
            socket.emit('createWithdrawal', Math.floor((deposit*players)*0.95));
            
        }
         
    }
})

socket.on('rescreateWithdrawal', (data) => {
    sessionStorage.setItem("LNURLID", data.id);
    sessionStorage.setItem("LNURL", data.lnurl);
    sessionStorage.setItem("LNURLMAXW", data.max_withdrawable);

    window.location.href = "/tournmain";
})

let buttonSelected = "backButton"
addEventListener("keydown", function(event) {
    if (event.key === "Enter" || event.key === " ") {
        if(buttonSelected=="backButton"){
            redirect="back";
            for(var key in paymentsDict) {
                let value = paymentsDict[key];
                console.log("Trying to delete paylink "+value);
                socket.emit('deletepaylink', value);
            }     
        }      
        if(buttonSelected=="proceedButton"){
            console.log("Let's proceed")
            let string = JSON.stringify(playersDict)
            localStorage.setItem("Players", string)
            for(var key in paymentsDict) {
                let value = paymentsDict[key];
                console.log("Trying to delete paylink "+value);
                socket.emit('deletepaylink', value);
            }     
        }
    }
    /*
    if (event.key === "ArrowUp" || event.key === "w") {
        if(buttonSelected=="backButton"){
            document.getElementById("proceedButton").style.animationDuration  = "2000s";
            document.getElementById("backButton").style.animationDuration  = "0s";
            buttonSelected = "proceedButton"
        }     
    }
    if (event.key === "ArrowDown" || event.key === "s") {
        if(buttonSelected=="proceedButton"){
            document.getElementById("proceedButton").style.animationDuration  = "0s";
            document.getElementById("backButton").style.animationDuration  = "2000s";
            buttonSelected = "backButton"
        }     
    }
    */
});   