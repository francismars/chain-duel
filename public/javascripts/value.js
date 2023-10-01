
// Global Sponsorship
if (document.getElementsByClassName("sponsorship").length != 0){
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




if (document.getElementsByClassName("sponsored-by-label").length != 0){
  const sponsoredLabel = document.getElementsByClassName("sponsored-by-label");
  sponsoredLabel[0].innerHTML = "Sponsored by";
  //sponsoredLabel[0].innerHTML = "50,000 sats * 16 BUY IN MATCH <span id='sponsorship-amount'>800,000</span> sats prize donated by";
}


if (document.getElementsByClassName("sponsored-img").length != 0){
  const sponsoredImg = document.getElementsByClassName("sponsored-img");
  sponsoredImg[0].src = "/images/sponsors/piratehash.png";
  sponsoredImg[0].src = "/images/sponsors/relai.png";
  //sponsoredImg[0].src = "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fschweizer-minimalist.ch%2Fwp-content%2Fuploads%2F2022%2F07%2FRelai.png&f=1&nofb=1&ipt=6c0ad501df9b8c0d6bdc861722c8382494a4aa521af99704b67f7510fc1274a3&ipo=images";
}




if (document.getElementById("split1").length != 0){
  const split1 = document.getElementById("split1");
  split1.innerHTML = "<b>2%</b> <span id='hostFee'></span> to the Sponsor (@piratehash)";
}


if (document.getElementById("split2").length != 0){
  const split2 = document.getElementById("split2");
  split2.innerHTML = "<b>2%</b> <span id='devFee'></span> to the developer (@francismars)";
}


if (document.getElementById("split3").length != 0){
  const split3 = document.getElementById("split3");
  split3.innerHTML = "<b>1%</b> <span id='designerFee'></span> to the designer (@bitcoinanatomy)";
}
