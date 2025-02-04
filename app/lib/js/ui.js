// Customised rightclick menu handler
webview.addEventListener('context-menu', (e) => {
  console.log("Right Clicked")
  e.preventDefault()
  e.stopPropagation()
  console.log(e)
  rclickmenu.style.top = e.params.y + "px"
  rclickmenu.style.left = e.params.x + "px"
  rclickmenu.classList.remove("fademctx")
})

// functions related rclickmenu btns
function cururl() {
  navigator.clipboard.writeText(webview.getURL())
  rclickmenu.classList.add("fademctx")
}


var gotourlslide = document.getElementById("gotourlslide")
var gotourlinp = document.getElementById("gotourli")
function gotourl() { // TODO: ADD GOTO PAGE FUNCTIONALITY
  gotourlslide.classList.remove("gotourlfade")
  rclickmenu.classList.add("fademctx")
}
function gotourlcls() {
  gotourlslide.classList.add("gotourlfade")
}
function gotourlenter() {
  url = gotourlinp.value
  webview.loadURL(url)
  console.log(url)
  gotourlcls()
}


function forwardwv() {
  webview.goForward()
  rclickmenu.classList.add("fademctx")
}

function backwardwv() {
  webview.goBack()
  rclickmenu.classList.add("fademctx")
}

function reloadwv() {
  webview.reload()
  rclickmenu.classList.add("fademctx")
}

function opensettings() { // TODO: ADD SETTINGS PAGE FUNCTIONALITY
  rclickmenu.classList.add("fademctx")
  interfaceel.classList.remove("fadeui")
}

// * USED IN INTERFACE SIDEBAR
function closesettings() {
  rclickmenu.classList.add("fademctx")
  interfaceel.classList.add("fadeui")
}

function signoutwv() {
  webview.loadURL("https://soundcloud.com/logout")
  rclickmenu.classList.add("fademctx")
}

function copywv() { // TODO: ADD COPY FUNCTIONALITY
  // navigator.clipboard.writeText(webview.getURL())
  rclickmenu.classList.add("fademctx")
}

function pastewv() { // TODO: ADD COPY FUNCTIONALITY
  rclickmenu.classList.add("fademctx")
}


// SETTINGS SLIDE UI RESPONSIBILITY
function syncsettingsui() {
  
}
let togglebuttons = document.querySelectorAll(".mainbar .settingitem .toggle input")