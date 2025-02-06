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
if (settings["startupurl"] != false) {
  webview.setAttribute("src", settings["startupurl"])
} else if (settings["startuplastpage"]) {
  webview.setAttribute("src", settings["lasturlvisited"])
} else {
  webview.setAttribute("src", "https://soundcloud.com/discover")
}
console.log(webview);

let rclickmenu = document.querySelector(".mousectx")
let interfaceel = document.querySelector(".interface")



// ! READ CONSOLE MESSAGES
// USED AS A CHANNEL FOR COMMUNICATION BETWEEN WEBVIEW AND RENDERER
webview.addEventListener('console-message', (e) => {
  console.log(e.message)
  if (e.message == "BSCReceive|MouseClicked") {
    rclickmenu.classList.add("fademctx")
  } else if (e.message == "BSCReceive|UISettingMaximizeApp") {
    console.log("sendmaximize req")
    ipcRenderer.send("appReqMaximizeApp")
  } else if (e.message == "BSCReceive|UISettingMinimizeApp") {
    console.log("sendminimize req")
    ipcRenderer.send("appReqMinimizeApp")
  } else if (e.message == "BSCReceive|UISettingCloseApp") {
    console.log("sendclose req")
    ipcRenderer.send("appReqCloseApp")
  } else if (e.message.split("|")[1] == ("UISettingShowRequest")) {
    opensettings()
    sidebtns = document.querySelectorAll(".interface .sidebar .side-btn")
    if (e.message.split("|")[2] == "1") {
      sidebtns[0].click()
    } else if (e.message.split("|")[2] == "2") {
      sidebtns[2].click()
    }
  }
})

webview.addEventListener('did-navigate', (e) => {
  console.log(e)
  console.log("salam")
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