// Audio Bar Showcase Btn Injection
let openshowcasebtn = document.createElement("div")
openshowcasebtn.classList.add("playControls__showcasebtn")
openshowcasebtn.setAttribute("onclick","console.log('BSCReceive|UIActivateShowCase')")

playControls__elements.appendChild(openshowcasebtn)