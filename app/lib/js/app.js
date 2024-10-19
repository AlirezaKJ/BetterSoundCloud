const { log } = require('console');
const { ipcRenderer } = require('electron')
const fs = require('fs')
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
  console.log(e)
})


// READ FILES
function readfile(src) {
  data = fs.readFileSync(src, 'utf8');
  return data
}


// FOR LOADING PLUGINS
function addscript(src) {
  let code = readfile(appdirectory + src)
  webview.executeJavaScript(code)
}

// FOR LOADING THEMES
function addstyle(src) {
  var code = readfile(appdirectory + src)
  webview.insertCSS(code)
}


// Customised rightclick menu
document.addEventListener('contextmenu', function(e) {
  alert("You've tried to open context menu"); //here you draw your own menu
  e.preventDefault();
}, false);






// Handle Custom Media keys functionality
ipcRenderer.on("appReqMediaPlayPause", function (evt, message) {
  execJS(`playpausebtn.click()`)
  console.log("MediaPlayPause is pressed");
})
ipcRenderer.on("appReqMediaNextTrack", function (evt, message) {
  execJS(`nextsongbtn.click()`)
  console.log("MediaNextTrack is pressed");
})
ipcRenderer.on("appReqMediaPreviousTrack", function (evt, message) {
  execJS(`previoussongbtn.click()`)
  console.log("MediaPreviousTrack is pressed");
})