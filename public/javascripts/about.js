import { listenToGamepads } from "./gamepads.js";

addEventListener("keydown", function(event) {
    if (event.key === "Enter" || event.key === " ") {
        window.location.href = "/";
    }
});

let intervalStart = setInterval(listenToGamepads, 1000/10);