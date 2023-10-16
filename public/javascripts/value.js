
// Global Sponsorship
if (document.getElementsByClassName("sponsorship").length != 0){
  console.log(document.getElementsByClassName("sponsorship"));
  const sponsorship = document.getElementsByClassName("sponsorship");
  sponsorship[0].style.display = 'block';
  sponsorship[0].style.display = 'none';
}

// Overides
/*
if (document.getElementById("sponsorship-index").length != 0){
  const sponsorshipBraket = document.getElementById("sponsorship-index");
  sponsorshipBraket.style.display = 'none';
}

if (document.getElementById("sponsorship-prefs").length != 0){
  const sponsorshipBraket = document.getElementById("sponsorship-prefs");
  sponsorshipBraket.style.display = 'none';
}

if (document.getElementById("sponsorship-braket").length != 0){
  const sponsorshipBraket = document.getElementById("sponsorship-braket");
  sponsorshipBraket.style.display = 'none';
}
*/




if (document.getElementsByClassName("sponsored-by-label").length != 0){
  const sponsoredLabel = document.getElementsByClassName("sponsored-by-label");
  sponsoredLabel[0].innerHTML = "Supported by";
  //sponsoredLabel[0].innerHTML = "50,000 sats * 16 BUY IN MATCH <span id='sponsorship-amount'>800,000</span> sats prize donated by";
}

let sponsorImage = "";

sponsorImage = "/images/sponsors/bitcoin_magazine.svg";
sponsorImage = "/images/sponsors/piratehash.png";
sponsorImage = "/images/sponsors/bitbox.png";

sponsorImage = "/images/sponsors/relai_bg.png";
sponsorImage = "/images/sponsors/build_the_builders.png";
sponsorImage = "/images/sponsors/bitcoin_amsterdam.png";

if (document.getElementsByClassName("sponsored-img").length != 0){
  const sponsoredImg = document.getElementsByClassName("sponsored-img");
  sponsoredImg[0].src = sponsorImage;
}


//sponsorImage = "/images/sponsors/stack_sats_relai.png";
if (document.getElementsByClassName("sponsored-img").length == 2){
  const sponsoredImg = document.getElementsByClassName("sponsored-img");
  sponsoredImg[1].src = sponsorImage;
  sponsoredImg[1].style.display = 'none';
}




if (document.getElementById("split1").length != 0){
  const split1 = document.getElementById("split1");
  split1.innerHTML = "<b>2%</b> <span id='hostFee'></span> to the host (@thebitcoinconf)";
}


if (document.getElementById("split2").length != 0){
  const split2 = document.getElementById("split2");
  split2.innerHTML = "<b>2%</b> <span id='developerFee'></span> to the developer (@francismars)";
}


if (document.getElementById("split3").length != 0){
  const split3 = document.getElementById("split3");
  split3.innerHTML = "<b>1%</b> <span id='designerFee'></span> to the designer (@bitcoinanatomy)";
}
