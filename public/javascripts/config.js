function editHostName() {
  const hostNameDiv = document.getElementById("hostName");
  const currentHostName = hostNameDiv.textContent.trim();
  hostNameDiv.innerHTML = `<input type="text" id="hostNameInput" value="${currentHostName}" class="${hostNameDiv.className}">`;
  const button = document.getElementById("hostNameChange");
  button.textContent = "Save";
  button.onclick = () => saveHostName();
  // Add event listener to cancel editing when clicking outside
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
  hostNameDiv.textContent = newHostName || "empty";
  const button = document.getElementById("hostNameChange");
  button.textContent = "Change";
  button.onclick = () => editHostName();

  // Remove the event listener after saving
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
    const savedHostName = localStorage.getItem("hostName") || "empty";
    hostNameDiv.textContent = savedHostName;
    const button = document.getElementById("hostNameChange");
    button.textContent = "Change";
    button.onclick = () => editHostName();

    // Remove the event listener after canceling
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
  hostLNAddressDiv.textContent = newHostLNAddress || "empty";
  const button = document.getElementById("hostLNAddressChange");
  button.textContent = "Change";
  button.onclick = () => editHostLNAddress();

  // Remove the event listener after saving
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
    const savedHostLNAddress = localStorage.getItem("hostLNAddress") || "empty";
    hostLNAddressDiv.textContent = savedHostLNAddress;
    const button = document.getElementById("hostLNAddressChange");
    button.textContent = "Change";
    button.onclick = () => editHostLNAddress();

    // Remove the event listener after canceling
    document.removeEventListener("click", cancelHostLNAddressEdit);
  }
}

// Load saved values on page load
document.addEventListener("DOMContentLoaded", () => {
  const savedHostName = localStorage.getItem("hostName") || "empty";
  const savedHostLNAddress = localStorage.getItem("hostLNAddress") || "empty";
  document.getElementById("hostName").textContent = savedHostName;
  document.getElementById("hostLNAddress").textContent = savedHostLNAddress;
});

function resetConfig() {
  localStorage.removeItem("hostName");
  localStorage.removeItem("hostLNAddress");
  document.getElementById("hostName").textContent = "empty";
  document.getElementById("hostLNAddress").textContent = "empty";
  console.log("Configuration has been reset.");
}
