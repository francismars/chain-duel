const hideSponsorInfo = false;
const sponsorshipSwitch = true;

const sponsorText = "Sponsored by"; //"50,000 sats * 16 BUY IN MATCH <span id='sponsorship-amount'>800,000</span> sats prize donated by";
const storedHostName = localStorage.getItem("hostName");
const sponsorName = storedHostName || "@chainduel";
const imageList = [
  "bitcoin_magazine.svg",
  "piratehash.png",
  "bitbox.png",
  "relai_bg.png",
  "build_the_builders.png",
  "bitcoin_amsterdam.png",
  "amityage_color.png",
  "piratehash_animated.png",
];
const sponsorImage = "/images/sponsors/" + imageList[2];

// Global Sponsorship
if (document.getElementsByClassName("sponsorship") != null) {
  if (document.getElementsByClassName("sponsorship").length != 0) {
    const sponsorship = document.getElementsByClassName("sponsorship");
    for (var i = 0; i < sponsorship.length; i++) {
      sponsorship[i].style.display = sponsorshipSwitch ? "block" : "none";
    }
  }
}
// Overides
if (hideSponsorInfo == true) {
  if (document.getElementById("sponsorship-index").length != 0) {
    const sponsorshipBraket = document.getElementById("sponsorship-index");
    sponsorshipBraket.style.display = "none";
  }

  if (document.getElementById("sponsorship-prefs").length != 0) {
    const sponsorshipBraket = document.getElementById("sponsorship-prefs");
    sponsorshipBraket.style.display = "none";
  }

  if (document.getElementById("sponsorship-braket").length != 0) {
    const sponsorshipBraket = document.getElementById("sponsorship-braket");
    sponsorshipBraket.style.display = "none";
  }

  if (document.getElementById("sponsorshipGameMenu").length != 0) {
    const sponsorshipBraket = document.getElementById("sponsorshipGameMenu");
    sponsorshipBraket.style.display = "none";
  }

  if (document.getElementById("sponsorshipGame").length != 0) {
    const sponsorshipBraket = document.getElementById("sponsorshipGame");
    sponsorshipBraket.style.display = "none";
  }
}

if (document.getElementsByClassName("sponsored-by-label") != null) {
  if (document.getElementsByClassName("sponsored-by-label").length != 0) {
    const sponsoredLabel =
      document.getElementsByClassName("sponsored-by-label");
    sponsoredLabel[0].innerHTML = sponsorText;
  }
}

if (document.getElementsByClassName("sponsored-img") != null) {
  if (document.getElementsByClassName("sponsored-img").length != 0) {
    const sponsoredImg = document.getElementsByClassName("sponsored-img");
    sponsoredImg[0].src = sponsorImage;
  }
  if (document.getElementsByClassName("sponsored-img").length == 2) {
    const sponsoredImg = document.getElementsByClassName("sponsored-img");
    sponsoredImg[1].src = sponsorImage;
  }
}

if (document.getElementById("split1") != null) {
  if (document.getElementById("split1").length != 0) {
    const split1 = document.getElementById("split1");
    split1.innerHTML = `<b>2%</b> <span id='hostFee'></span> to the host (${sponsorName})`;
  }
}
if (document.getElementById("split2") != null) {
  if (document.getElementById("split2").length != 0) {
    const split2 = document.getElementById("split2");
    split2.innerHTML =
      "<b>2%</b> <span id='developerFee'></span> to the developer (@BTCfrancis)";
  }
}
if (document.getElementById("split3") != null) {
  if (document.getElementById("split3").length != 0) {
    const split3 = document.getElementById("split3");
    split3.innerHTML =
      "<b>1%</b> <span id='designerFee'></span> to the designer (@bitcoinanatomy)";
  }
}
