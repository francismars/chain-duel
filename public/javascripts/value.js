
// Global Sponsorship
if (document.getElementsByClassName("sponsorship")){
  const sponsorship = document.getElementsByClassName("sponsorship");
  sponsorship[0].style.display = 'block';
}

// Overides
/*
if (document.getElementById("sponsorship-index")){
  const sponsorshipBraket = document.getElementById("sponsorship-index");
  sponsorshipBraket.style.display = 'none';
}

if (document.getElementById("sponsorship-prefs")){
  const sponsorshipBraket = document.getElementById("sponsorship-prefs");
  sponsorshipBraket.style.display = 'none';
}

if (document.getElementById("sponsorship-braket")){
  const sponsorshipBraket = document.getElementById("sponsorship-braket");
  sponsorshipBraket.style.display = 'none';
}
*/




if (document.getElementsByClassName("sponsored-by-label")){
  const sponsoredLabel = document.getElementsByClassName("sponsored-by-label");
  sponsoredLabel[0].innerHTML = "Sponsored by";
  //sponsoredLabel[0].innerHTML = "50,000 sats * 16 BUY IN MATCH <span id='sponsorship-amount'>800,000</span> sats prize donated by";
}


if (document.getElementsByClassName("sponsored-img")){
  const sponsoredImg = document.getElementsByClassName("sponsored-img");
  sponsoredImg[0].src = "/images/sponsors/piratehash.png";
  //sponsoredImg[0].src = "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fschweizer-minimalist.ch%2Fwp-content%2Fuploads%2F2022%2F07%2FRelai.png&f=1&nofb=1&ipt=6c0ad501df9b8c0d6bdc861722c8382494a4aa521af99704b67f7510fc1274a3&ipo=images";
}
