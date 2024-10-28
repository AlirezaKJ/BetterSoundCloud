const { log } = require('console');
const { ipcRenderer } = require('electron')
const fs = require('fs')
const packagefile = require("../package.json")
// const packagefile = require("../package.json")



let appdirectory;
ipcRenderer.on("apppath", function (evt, message) {
  console.log(message)
  appdirectory = message
})

let webview = document.querySelector("#webview");
webview.setAttribute("src", "https://soundcloud.com/discover")
console.log(webview);



// READ CONSOLE MESSAGES
webview.addEventListener('console-message', (e) => {
  console.log('view logged:', e.message)
  // console.log(e)
  if (e.message == "BSCReceive|MouseClicked") {
    rclickmenu.classList.add("fademctx")
  }
})


// READ FILES
function readfile(src) {
  data = fs.readFileSync(src, 'utf8');
  loadingscreentxt.innerHTML = "Readed File: " + src
  return data
}

// FOR LOADING PLUGINS
function addscript(src) {
  let code = readfile(appdirectory + src)
  loadingscreentxt.innerHTML = "Added Script: " + src
  webview.executeJavaScript(code)
}
// FOR LOADING THEMES
function addstyle(src) {
  var code = readfile(appdirectory + src)
  loadingscreentxt.innerHTML = "Added Style: " + src
  webview.insertCSS(code)
}


// Customised rightclick menu
let rclickmenu = document.querySelector(".mousectx")
webview.addEventListener('context-menu', (e) => {
  console.log("Right Clicked")
  e.preventDefault()
  e.stopPropagation()
  console.log(e)
  rclickmenu.style.top = e.params.y + "px"
  rclickmenu.style.left = e.params.x + "px"
  rclickmenu.classList.remove("fademctx")
})

function cururl() {
  navigator.clipboard.writeText(webview.getURL())
  rclickmenu.classList.add("fademctx")
}

function gotourl() { // TODO: ADD GOTO PAGE FUNCTIONALITY
  rclickmenu.classList.add("fademctx")
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

// document.addEventListener('contextmenu', function(e) {
//   alert("You've tried to open context menu"); //here you draw your own menu
//   e.preventDefault();
// }, false);




// Handle Custom Media keys functionality
ipcRenderer.on("appReqMediaPlayPause", function (evt, message) {
  addscript(`playpausebtn.click()`)
  console.log("MediaPlayPause is pressed");
})
ipcRenderer.on("appReqMediaNextTrack", function (evt, message) {
  addscript(`nextsongbtn.click()`)
  console.log("MediaNextTrack is pressed");
})
ipcRenderer.on("appReqMediaPreviousTrack", function (evt, message) {
  addscript(`previoussongbtn.click()`)
  console.log("MediaPreviousTrack is pressed");
})