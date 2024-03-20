import { createNewCoinbase } from "./game.js";
const blockFound = new Audio("./sound/MAINNET_BLOCK.aac");

// Get latest block hash
const { bitcoin: { blocks } } = mempoolJS({
  hostname: 'mempool.space'
});
const blocksTipHash = await blocks.getBlocksTipHash();

// Get latest block data
const response = await fetch("https://mempool.space/api/v1/block/"+blocksTipHash);
const blockData = await response.json();
let timestamp = blockData.timestamp;

//console.log(blockData);
document.getElementById("bitcoinblockHeight").textContent = JSON.stringify(blockData.height, undefined, 2);
document.getElementById("bitcoinblockSize").textContent = convertSize(blockData.size);
document.getElementById("bitcoinblockTXcount").textContent = blockData.tx_count;
document.getElementById("bitcoinblockMiner").textContent = blockData.extras.pool.name;
document.getElementById("bitcoinAvgFee").textContent = Math.round(blockData.extras.medianFee)+" sat/vb";
document.getElementById("bitcoinblockTimeAgo").textContent = covertTimeAgo(timestamp);
setInterval(function() {
    document.getElementById("bitcoinblockTimeAgo").textContent = covertTimeAgo(timestamp);
  }, 1000);

// Listen for new blocks
const { bitcoin: { websocket } } = mempoolJS({
  hostname: 'mempool.space'
});
const ws = websocket.initClient({
  options: ['blocks','stats', 'mempool-blocks', 'live-2h-chart'],
});
ws.addEventListener('message', function incoming(data) {
    //console.log(data)
    const res = data;
    if (res.block) {
        //console.log("NEW BLOCK");
        //console.log(res.block);
        newBlockTriggered(res.block)
    }
});

let dummyBlockData={
    "id": "00000000000000000000ee187396d132521e87d813805e127a7ac1794d785c00",
    "height": 831844,
    "version": 734633984,
    "timestamp": 1708797337,
    "bits": 386101681,
    "nonce": 3843970878,
    "difficulty": 81725299822043.22,
    "merkle_root": "faca9cb4c9b53a6da8da7f99dae4b91b11849b9c387bc77b233422b384dec0ba",
    "tx_count": 4248,
    "size": 1706207,
    "weight": 3992960,
    "previousblockhash": "0000000000000000000328a1f07c0d3723e935fe839cd9399400891f05fc29b8",
    "mediantime": 1708795023,
    "stale": false,
    "extras": {
        "reward": 650927479,
        "coinbaseRaw": "0364b10c04992dda652f466f756e6472792055534120506f6f6c202364726f70676f6c642f12a7206a000027baadc10000",
        "orphans": [],
        "medianFee": 22.07812515451895,
        "feeRange": [
            20.639269406392692,
            21,
            21.10994764397906,
            22,
            26.040268456375838,
            29.74576271186441,
            511.3438045375218
        ],
        "totalFees": 25927479,
        "avgFee": 6104,
        "avgFeeRate": 25,
        "utxoSetChange": 3701,
        "avgTxSize": 401.58,
        "totalInputs": 7031,
        "totalOutputs": 10732,
        "totalOutputAmt": 334804631797,
        "segwitTotalTxs": 4077,
        "segwitTotalSize": 1647450,
        "segwitTotalWeight": 3758040,
        "feePercentiles": null,
        "virtualSize": 998240,
        "coinbaseAddress": "bc1qxhmdufsvnuaaaer4ynz88fspdsxq2h9e9cetdj",
        "coinbaseSignature": "OP_0 OP_PUSHBYTES_20 35f6de260c9f3bdee47524c473a6016c0c055cb9",
        "coinbaseSignatureAscii": "\u0003d±\f\u0004-Úe/Foundry USA Pool #dropgold/\u0012§ j\u0000\u0000'º­Á\u0000\u0000",
        "header": "00a0c92bb829fc051f89009439d99c83fe35e923370d7cf0a12803000000000000000000bac0de84b32234237bc77b389c9b84111bb9e4da997fdaa86d3ab5c9b49ccafa992dda65b17103173e571ee5",
        "utxoSetSize": null,
        "totalInputAmt": null,
        "pool": {
            "id": 111,
            "name": "Foundry USA",
            "slug": "foundryusa"
        },
        "matchRate": 100,
        "expectedFees": 25946432,
        "expectedWeight": 3991775,
        "similarity": 0.9956611395851696
    }
}

/*
dummyBlockData.extras.medianFee = 10;
setTimeout(() => {
    setInterval(() => {
        newBlockTriggered(dummyBlockData);
        dummyBlockData.extras.medianFee = dummyBlockData.extras.medianFee + 15;
    }, 5000)
}, 5000)
*/


function newBlockTriggered(blockData){
    highlightCanvaS()
    blockData.extras.medianFee ? createNewCoinbase(blockData.extras.medianFee) : console.log("Mempool didn't send blockData.extras.medianFee")
    playBlockFoundSounds()
    updateDOM(blockData) 
    highlightFooter()
}

function highlightCanvaS(){
    document.getElementById("gameCanvas").classList.add('highlight');
    setTimeout(function() {
        document.getElementById("gameCanvas").classList.remove('highlight');
    }, 1000);
}

function playBlockFoundSounds(){
  if(blockFound.readyState == 4){
    blockFound.pause();
    blockFound.currentTime = 0;
    blockFound.play();
  }
}

function updateDOM(blockInfo){
  blockInfo.timestamp ? timestamp = blockInfo.timestamp : console.log("Mempool didn't send blockInfo.timestamp")
  blockInfo.height ? document.getElementById("bitcoinblockHeight").textContent = blockInfo.height : console.log("Mempool didn't send blockInfo.height")
  blockInfo.size ? document.getElementById("bitcoinblockSize").textContent = convertSize(blockInfo.size) : console.log("Mempool didn't send blockInfo.size")
  blockInfo.tx_count ? document.getElementById("bitcoinblockTXcount").textContent = blockInfo.tx_count : console.log("Mempool didn't send blockInfo.tx_count")
  blockInfo.extras.medianFee ? document.getElementById("bitcoinAvgFee").textContent = Math.round(blockInfo.extras.medianFee)+" sat/vb" : console.log("Mempool didn't send blockInfo.extras.medianFee")
  //document.getElementById("bitcoinblockMiner").textContent = blockInfo.extras.pool.name;
  //document.getElementById("capture").textContent = Math.round((blockInfo.extras.medianFee/2)) + "%";
  document.getElementById("bitcoinblockTimeAgo").textContent = covertTimeAgo(timestamp);
}

function highlightFooter(){
    // Highlight data display on new block
    document.getElementById("bitcoinDetails").classList.add('highlight');
    setTimeout(function() {
        document.getElementById("bitcoinDetails").classList.remove('highlight');
    }, 2000);
}

// Format size
function convertSize(x){
  const units = ['bytes', 'Kb', 'Mb'];
  let l = 0, n = parseInt(x, 10) || 0;
  while(n >= 1000 && ++l){
      n = n/1000;
  }
  return(n.toFixed(n < 10 && l > 0 ? 2 : 0) + " " + units[l]);
}

// Format time
function covertTimeAgo(dateIn) {
  const date = new Date(dateIn * 1000);
  const seconds = Math.floor((new Date() - date) / 1000);
  let interval = Math.floor(seconds / 3600);
  if (interval > 1) {
    return interval + ' hours ago';
  }
  interval = Math.floor(seconds / 60);
  if (interval > 1) {
    return interval + ' mins ago';
  }
  if (interval == 1) {
    return interval + ' min ago';
  }
  return 'just now';
};