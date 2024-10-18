const { ipcRenderer } = require('electron')
const fs = require('fs')
// const packagefile = require("../package.json")



let appdirectory;
ipcRenderer.on("apppath", function (evt, message) {
  console.log(message)
  appdirectory = message
})
console.log(appdirectory)

let webview = document.querySelector("#webview");
console.log(webview);


webview.setAttribute("src", "https://soundcloud.com/discover")

function readfile(src) {
  data = fs.readFileSync(src, 'utf8');
  return data
}


// LOAD PLUGINS
function addscript(src) {
  let code = readfile(appdirectory + src)
  console.log(code);
  webview.executeJavaScript(code)
}

// LOAD THEMES
function addstyle(src) {
  var code = readfile(appdirectory + src)
  webview.insertCSS(code)
}


// Customised rightclick menu
document.addEventListener('contextmenu', function(e) {
  alert("You've tried to open context menu"); //here you draw your own menu
  e.preventDefault();
}, false);