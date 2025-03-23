let adsdiv = document.querySelector(".playControlsPanel")

setInterval(() => {
    if (adsdiv.classList.contains("is-active")) {
        console.log("BSCReceive|AdIsOn")
    } else {
        console.log("BSCReceive|AdIsOff")
    }
},10)

let playbtn = document.querySelector(".playControls__play")
playbtn.click()