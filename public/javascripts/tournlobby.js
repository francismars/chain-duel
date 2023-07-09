


let urlToParse = location.search;

const params = new URLSearchParams(urlToParse);
const players = parseInt(params.get("players"));
const deposit = parseInt(params.get("deposit"));

console.log(players)
console.log(deposit)