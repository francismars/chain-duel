function editHostName() {
  const hostNameDiv = document.getElementById("hostName");
  const currentHostName = hostNameDiv.textContent.trim();
  hostNameDiv.innerHTML = `<input type="text" id="hostNameInput" value="${currentHostName}" class="${hostNameDiv.className}">`;
  const button = document.getElementById("hostNameChange");
  button.textContent = "Save";
  button.onclick = () => saveHostName();
  document.addEventListener("click", cancelHostNameEdit);
  const hostNameInput = document.getElementById("hostNameInput");
  hostNameInput.focus();
  hostNameInput.setSelectionRange(
    currentHostName.length,
    currentHostName.length
  );
  hostNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      saveHostName();
    }
  });
}

function saveHostName() {
  const hostNameInput = document.getElementById("hostNameInput");
  const newHostName = hostNameInput.value.trim();
  localStorage.setItem("hostName", newHostName);
  const hostNameDiv = document.getElementById("hostName");
  hostNameDiv.textContent = newHostName || "default";
  const button = document.getElementById("hostNameChange");
  button.textContent = "Change";
  button.onclick = () => editHostName();
  if (newHostName == "default" || newHostName == "") {
    localStorage.removeItem("hostName");
    hostNameInput.textContent = "default";
    return;
  }
  document.removeEventListener("click", cancelHostNameEdit);
}

function cancelHostNameEdit(event) {
  const hostNameInput = document.getElementById("hostNameInput");
  if (
    hostNameInput &&
    !hostNameInput.contains(event.target) &&
    event.target.id !== "hostNameChange"
  ) {
    const hostNameDiv = document.getElementById("hostName");
    const savedHostName = localStorage.getItem("hostName") || "default";
    hostNameDiv.textContent = savedHostName;
    const button = document.getElementById("hostNameChange");
    button.textContent = "Change";
    button.onclick = () => editHostName();
    document.removeEventListener("click", cancelHostNameEdit);
  }
}

function editHostLNAddress() {
  const hostLNAddressDiv = document.getElementById("hostLNAddress");
  const currentHostLNAddress = hostLNAddressDiv.textContent.trim();
  hostLNAddressDiv.innerHTML = `<input type="text" id="hostLNAddressInput" value="${currentHostLNAddress}">`;
  const button = document.getElementById("hostLNAddressChange");
  button.textContent = "Save";
  button.onclick = () => saveHostLNAddress();
  document.addEventListener("click", cancelHostLNAddressEdit);
  const hostLNAddressInput = document.getElementById("hostLNAddressInput");
  hostLNAddressInput.focus();
  hostLNAddressInput.setSelectionRange(
    currentHostLNAddress.length,
    currentHostLNAddress.length
  );
  hostLNAddressInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      saveHostLNAddress();
    }
  });
}

function saveHostLNAddress() {
  const hostLNAddressInput = document.getElementById("hostLNAddressInput");
  const newHostLNAddress = hostLNAddressInput.value.trim();
  localStorage.setItem("hostLNAddress", newHostLNAddress);
  const hostLNAddressDiv = document.getElementById("hostLNAddress");
  hostLNAddressDiv.textContent = newHostLNAddress || "default";
  const button = document.getElementById("hostLNAddressChange");
  button.textContent = "Change";
  button.onclick = () => editHostLNAddress();
  if (newHostLNAddress == "default" || newHostLNAddress == "") {
    localStorage.removeItem("hostLNAddress");
    newHostLNAddress.textContent = "default";
    return;
  }
  document.removeEventListener("click", cancelHostLNAddressEdit);
}

function cancelHostLNAddressEdit(event) {
  const hostLNAddressInput = document.getElementById("hostLNAddressInput");
  if (
    hostLNAddressInput &&
    !hostLNAddressInput.contains(event.target) &&
    event.target.id !== "hostLNAddressChange"
  ) {
    const hostLNAddressDiv = document.getElementById("hostLNAddress");
    const savedHostLNAddress =
      localStorage.getItem("hostLNAddress") || "default";
    hostLNAddressDiv.textContent = savedHostLNAddress;
    const button = document.getElementById("hostLNAddressChange");
    button.textContent = "Change";
    button.onclick = () => editHostLNAddress();
    document.removeEventListener("click", cancelHostLNAddressEdit);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const savedHostName = localStorage.getItem("hostName") || "default";
  const savedHostLNAddress = localStorage.getItem("hostLNAddress") || "default";
  document.getElementById("hostName").textContent = savedHostName;
  document.getElementById("hostLNAddress").textContent = savedHostLNAddress;
});

function resetConfig() {
  localStorage.removeItem("hostName");
  localStorage.removeItem("hostLNAddress");
  document.getElementById("hostName").textContent = "default";
  document.getElementById("hostLNAddress").textContent = "default";
  console.log("Configuration has been reset.");
}
