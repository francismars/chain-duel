
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
  sponsoredImg[0].src = "/images/sponsors/bitbox.png";
  sponsoredImg[0].src = "/images/sponsors/relai.png";
}




if (document.getElementById("split1")){
  const split1 = document.getElementById("split1");
  split1.innerHTML = "<b>2%</b> <span id='hostFee'></span> to the Sponsor (@piratehash)";
}


if (document.getElementById("split2")){
  const split2 = document.getElementById("split2");
  split2.innerHTML = "<b>2%</b> <span id='devFee'></span> to the developer (@francismars)";
}


if (document.getElementById("split3")){
  const split3 = document.getElementById("split3");
  split3.innerHTML = "<b>1%</b> <span id='designerFee'></span> to the designer (@bitcoinanatomy)";
}
