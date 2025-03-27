// Customised rightclick menu handler
webview.addEventListener('context-menu', (e) => {
  console.log("Right Clicked")
  e.preventDefault()
  e.stopPropagation()
  console.log(e)
  rclickmenu.style.top = e.params.y + "px"
  rclickmenu.style.left = e.params.x + "px"
  rclickmenu.classList.remove("fademctx")
  mouseinf.selection = e.params.selectionText
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
  navigator.clipboard.writeText(mouseinf.selection)
  console.log(mouseinf.selection)
  rclickmenu.classList.add("fademctx")
}


// SETTINGS SLIDE UI RESPONSIBILITY
let togglebuttons = document.querySelectorAll(".mainbar .settingitem .toggle input")
let zoomfactorinp = document.querySelector(".mainbar .settingitem .manualinp input[name='zoomfactorperc']")
let reloadbindsinp = document.querySelectorAll(".mainbar .settingitem .manualinp select")
let startuppageinp = document.querySelector(".mainbar .settingitem .manualinp input[type='url']")
let themeitemsdiv = document.querySelectorAll(".mainbar .selectthemes .themeitem")
// Custom CSS and JS editors handling 
let customcssbox = document.querySelector("#customcssbox")
let customjsbox = document.querySelector("#customjsbox")

let customcsseditor = ace.edit("customcssbox");
let customcssvalue = settings.customcss
if (customcssvalue == undefined) {customcssvalue = "/* Make sure to use !important if your style doesn't applied */\n/* Dont do anything if you dont know anything ;) */"}
customcsseditor.setTheme("ace/theme/monokai");
customcsseditor.session.setMode("ace/mode/css");
customcsseditor.setValue(customcssvalue, 1)
customcsseditor.setOptions({
    enableBasicAutocompletion: true,
    enableSnippets: true,
    enableLiveAutocompletion: true,
});

let customjseditor = ace.edit("customjsbox");
let customjsvalue = settings.customjs
if (customjsvalue == undefined) {customjsvalue = "// Dont do anything if you dont know anything ;)"}
customjseditor.setTheme("ace/theme/monokai");
customjseditor.session.setMode("ace/mode/javascript");
customjseditor.setValue(customjsvalue, 1)
customjseditor.setOptions({
    enableBasicAutocompletion: true,
    enableSnippets: true,
    enableLiveAutocompletion: true,
});


function syncsettingsui() {
  togglebuttons.forEach(function(tglbtn) {
    if (settings[tglbtn.name]) {
      tglbtn.click();
    }
  })
  
  zoomfactorinp.value = settings["zoomfactorperc"]
  
  reloadbindsinp.forEach(function (selectel) {
    if (settings[selectel.name]) {
      selectel.value = settings[selectel.name]
    }
  })

  if (settings["startupurl"] != false) {
    startuppageinp.value = settings["startupurl"]
  }

  switch (settings.theme) {
    case "darkcloud":
      themeitemsdiv[1].classList.add("active")
      break;
    case "nocturnal":
      themeitemsdiv[2].classList.add("active")
      break;
    case "postmorphic":
      themeitemsdiv[3].classList.add("active")
      break;
    default:
      themeitemsdiv[0].classList.add("active")
      break;
  }

  if (settings.customcss != undefined) {
    customcsseditor.setValue(settings.customcss)
  }
  if (settings.customjs != undefined) {
    customjseditor.setValue(settings.customjs)
  }
}
syncsettingsui()

// EACH TOGGLEBUTTON ON CHANGE EVENT
togglebuttons.forEach(function (tglbtn) {
  tglbtn.addEventListener("change", function () {
    changeSettings(this.name, this.checked)
    if (this.name == "custombg") {
      webview.reload()
    } else if (this.name == "scrollerbtn") {
      if (this.checked) {
        scrollerbtn.classList.add("scrlbtnvis")
      } else {
        scrollerbtn.classList.remove("scrlbtnvis")
        clearInterval(btnscrlinterval)
      }
    }
  })
})

// EACH BIND ACTION CHANGE EVENT
reloadbindsinp.forEach(bindinp => {
  bindinp.addEventListener("change", function() {
    changeSettings(this.name, this.value)
  })
});

// ZOOMFACTOR INPUT ON VALUE EVENT
zoomfactorinp.addEventListener("change", function () {
  if (9 < parseInt(this.value) && parseInt(this.value) < 501) {
    console.log(this.name)
    changeSettings(this.name, parseInt(this.value))
    webview.setZoomFactor(settings.zoomfactorperc / 100)
  } else {
    this.value = settings[this.name]
  }
})

// STARTUPPAGE INPUT ON VALUE EVENT
startuppageinp.addEventListener("change", function () {
  if (this.value === "") {
    changeSettings(this.name, false)
  } else {
    changeSettings(this.name, this.value)
  }
})

// SELECT THEME IN SETTINGS PAGE
function selecttheme(index) {
  switch (index) {
    case 0:
      changeSettings("theme", "vanilla")
      break;
    case 1:
      changeSettings("theme", "darkcloud")
      break;
    case 2:
      changeSettings("theme", "nocturnal")
      break;
    case 3:
      changeSettings("theme", "postmorphic")
      break;
  }
  themeitemsdiv.forEach(function (themeitem) {
    themeitem.classList.remove("active")
  })
  themeitemsdiv[index].classList.add("active")
  webview.reload()
}

// HANDLE CUSTOM CSS AND JS SAVE BUTTON
function applyCustomCSS() {
  var customcss = customcsseditor.getValue()
  changeSettings("customcss", customcss)
  webview.reload()
}

function applyCustomJS() {
  var customjs = customjseditor.getValue()
  changeSettings("customjs",customjs)
  webview.reload()
}